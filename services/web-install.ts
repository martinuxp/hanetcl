import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// "Agregar a inicio" for the web app: which browser this is, whether HaNet
// already runs from the home screen (or as an installed app on a computer),
// and the browser's own install prompt where it has one (Chrome, Edge and
// Samsung Internet fire `beforeinstallprompt`). The guide that uses it is
// components/web/install-guide.tsx.

export type InstallGuideKind =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'mac-safari'
  | 'unsupported';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const SEEN_KEY = 'hanet.installGuideSeen';

let deferred: InstallPromptEvent | null = null;
let listening = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

function onWeb() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

export function isAppleMobile() {
  if (!onWeb()) return false;
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS says it is a Mac; the touch screen gives it away.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Whether HaNet is running from the home screen, the Dock or as an installed app. */
export function isInstalled() {
  if (!onWeb()) return false;
  // i18n-ignore-next-line: a CSS media query
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Which steps fit this browser. */
export function installGuideKind(): InstallGuideKind {
  if (!onWeb()) return 'unsupported';
  const ua = navigator.userAgent;
  if (isAppleMobile()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'android-samsung';
    if (/Firefox/.test(ua)) return 'android-firefox';
    return 'android-chrome';
  }
  if (/Edg\//.test(ua)) return 'desktop-edge';
  if (/Firefox/.test(ua)) return 'unsupported';
  if (/Chrome|Chromium/.test(ua)) return 'desktop-chrome';
  // Safari on the Mac adds web apps to the Dock since Safari 17 (macOS Sonoma).
  const safari = /Macintosh/.test(ua) && /Version\/(\d+)/.exec(ua);
  if (safari && Number(safari[1]) >= 17) return 'mac-safari';
  return 'unsupported';
}

/** Starts listening for the browser's install prompt; called once, early (the root). */
export function listenForInstallPrompt() {
  if (!onWeb() || listening) return;
  listening = true;
  window.addEventListener('beforeinstallprompt', event => {
    // HaNet shows its own guide instead of the browser's mini bar.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    markInstallGuideSeen();
    emit();
  });
}

/** Whether the browser's own install button can be offered. */
export function useCanPromptInstall() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => deferred !== null,
    () => false,
  );
}

/** Opens the browser's install dialog; true when the person installed. */
export async function promptInstall() {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

export function installGuideSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInstallGuideSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Only a convenience: the guide shows once more next time.
  }
}

/** Whether the Home should open the guide by itself: on the web, not installed, never seen. */
export function shouldOfferInstallGuide() {
  return onWeb() && !isInstalled() && installGuideKind() !== 'unsupported' && !installGuideSeen();
}
