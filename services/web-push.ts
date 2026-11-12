import { httpsCallable } from 'firebase/functions';
import app, { functions } from './firebase';
import { registerServiceWorker, serviceWorkerSupported } from './service-worker';

// Web push for the web app: the browser's Firebase Cloud Messaging token is
// registered with the same backend as the phones (registerPushToken, platform
// "web") and the service worker (public/sw.js) shows what arrives. Used by
// services/push-service.ts on the web; nothing here runs on the phones.
//
// On iPhone and iPad the web only gets push once HaNet is on the home screen
// (iOS 16.4 or newer): in a Safari tab `webPushSupport()` says 'install'.

// The public half of the project's Web Push certificate (Firebase console →
// Project settings → Cloud Messaging → Web configuration). Public on purpose:
// the private half stays with Firebase. Without one, Firebase's default key is
// used, which Safari and Firefox take but Chrome may not.
const VAPID_KEY = '';

export type WebPushSupport = 'supported' | 'install' | 'unsupported';
export type WebPermission = 'granted' | 'denied' | 'undetermined';

function isAppleMobile() {
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS says it is a Mac; the touch screen gives it away.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

function installed() {
  // i18n-ignore-next-line: a CSS media query
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function webPushSupport(): WebPushSupport {
  if (!serviceWorkerSupported()) return 'unsupported';
  const capable = 'PushManager' in window && 'Notification' in window;
  if (isAppleMobile() && !installed()) return 'install';
  return capable ? 'supported' : 'unsupported';
}

export function webPermission(): WebPermission {
  if (!('Notification' in window)) return 'denied';
  const { permission } = Notification;
  return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'undetermined';
}

let registeredToken: string | null = null;

/** Gets this browser's token and gives it to the backend; quietly does nothing without permission. */
export async function registerBrowser() {
  if (webPushSupport() !== 'supported' || webPermission() !== 'granted') return false;
  try {
    const registration = await registerServiceWorker();
    if (!registration) return false;
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;
    const token = await getToken(getMessaging(app), {
      serviceWorkerRegistration: registration,
      ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}),
    });
    if (!token) return false;
    await httpsCallable(functions, 'registerPushToken')({ token, platform: 'web' });
    registeredToken = token;
    return true;
  } catch (error) {
    console.warn('registerBrowser', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Asks the browser for permission and registers it. Safari only shows the
 * question during a tap, so it is the first thing this does.
 */
export async function enableWebPush(): Promise<WebPermission> {
  if (webPushSupport() !== 'supported') return webPermission();
  let answer: NotificationPermission;
  try {
    answer = await Notification.requestPermission();
  } catch {
    return webPermission();
  }
  if (answer === 'granted') await registerBrowser();
  return webPermission();
}

/** Before signing out: this browser stops getting the account's notifications. */
export async function unregisterBrowser() {
  if (!registeredToken) return;
  try {
    await httpsCallable(functions, 'unregisterPushToken')({ token: registeredToken });
  } catch {
    // Signing out goes ahead; the token moves to whoever signs in next.
  }
  registeredToken = null;
}

/** A tapped notification asks the open app to show its screen (public/sw.js). */
export function listenToWebNotificationTaps(open: (url: unknown) => void) {
  if (!serviceWorkerSupported()) return () => {};
  const handle = (event: MessageEvent) => {
    if (event.data?.type === 'open') open(event.data.url);
  };
  navigator.serviceWorker.addEventListener('message', handle);
  return () => navigator.serviceWorker.removeEventListener('message', handle);
}
