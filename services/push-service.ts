import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { httpsCallable } from 'firebase/functions';
import { Linking, Platform } from 'react-native';
import { functions } from './firebase';

// ClassHall's push notifications (Expo's push service). The device's token is
// registered with the backend (registerPushToken) after the person allows
// notifications and again on each start; signing out takes it off.
//
// Expo Go on Android has no remote push since SDK 53, and the web is not
// supported: there `pushSupport()` says so and nothing here touches the
// notifications module, which only loads where it works.

type NotificationsModule = typeof import('expo-notifications');

export type PushSupport = 'supported' | 'expo-go-android' | 'web';
export type PushPermission = 'granted' | 'denied' | 'undetermined';

const ANDROID_CHANNEL = 'classhall';
// The day's summary at 7:00 and the reminders of evaluations (services/exam-reminders.ts).
export const AGENDA_CHANNEL = 'agenda';
const PROMPT_DISMISSED_KEY = 'hanet.pushPromptDismissed';

export function pushSupport(): PushSupport {
  if (Platform.OS === 'web') return 'web';
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'expo-go-android';
  return 'supported';
}

let notificationsModule: NotificationsModule | null = null;

/** The notifications module where it works; null in Expo Go on Android and on the web. */
export function notifications(): NotificationsModule | null {
  if (pushSupport() !== 'supported') return null;
  if (!notificationsModule) {
    // Loaded here and not at the top, so platforms without push never load it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a lazy load on purpose
    notificationsModule = require('expo-notifications') as NotificationsModule;
    // A notification that arrives while the app is open still shows.
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  }
  return notificationsModule;
}

// Android needs a channel before it asks for permission (Android 13) or hands out a token.
export async function ensureChannel(module: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await module.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'ClassHall',
    description: 'Anuncios, tareas, material nuevo y recordatorios de entrega.',
    importance: module.AndroidImportance.HIGH,
    lightColor: '#EF2274',
  });
  await module.setNotificationChannelAsync(AGENDA_CHANNEL, {
    name: 'Tu día y tus pruebas',
    description: 'El resumen de las 7:00 y los avisos 24 y 4 horas antes de cada prueba.',
    importance: module.AndroidImportance.HIGH,
    lightColor: '#EF2274',
  });
}

export async function pushPermission(): Promise<PushPermission> {
  const module = notifications();
  if (!module) return 'denied';
  const { status } = await module.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

let registeredToken: string | null = null;

/** Gets the device's token and gives it to the backend; quietly does nothing without permission. */
export async function registerDevice() {
  const module = notifications();
  if (!module) return false;
  try {
    await ensureChannel(module);
    if ((await module.getPermissionsAsync()).status !== 'granted') return false;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await module.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await httpsCallable(functions, 'registerPushToken')({ token, platform: Platform.OS });
    registeredToken = token;
    return true;
  } catch (error) {
    // A simulator or a device without Google Play services has no token.
    console.warn('registerDevice', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Asks for permission (the system dialog) and registers the device. */
export async function enablePush(): Promise<PushPermission> {
  const module = notifications();
  if (!module) return 'denied';
  await ensureChannel(module);
  const { status } = await module.requestPermissionsAsync();
  if (status === 'granted') await registerDevice();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Before signing out: the device stops getting this account's notifications. */
export async function unregisterDevice() {
  if (!registeredToken) return;
  try {
    await httpsCallable(functions, 'unregisterPushToken')({ token: registeredToken });
  } catch {
    // Signing out goes ahead; the token moves to whoever signs in next.
  }
  registeredToken = null;
}

/** Calls `open` with the screen a tapped notification points to, now and for the cold start. */
export function listenToNotificationTaps(open: (url: string) => void) {
  const module = notifications();
  if (!module) return () => {};
  const handle = (data: unknown) => {
    const url = (data as { url?: unknown } | undefined)?.url;
    // Only HaNet's own screens: ClassHall, the timetable and the Calendar's events.
    if (typeof url === 'string' && /^\/(classhall\/(hall|task)\?[A-Za-z0-9_=&-]+|schedule|calendar|event-info\?[A-Za-z0-9_=&%-]+)$/.test(url)) open(url);
  };
  void module.getLastNotificationResponseAsync().then(response => {
    if (response) handle(response.notification.request.content.data);
  });
  const subscription = module.addNotificationResponseReceivedListener(response => handle(response.notification.request.content.data));
  return () => subscription.remove();
}

export function openNotificationSettings() {
  void Linking.openSettings();
}

/** Whether the ClassHall card asking to turn notifications on was closed with "Ahora no". */
export async function wasPushPromptDismissed() {
  try {
    return (await AsyncStorage.getItem(PROMPT_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissPushPrompt() {
  try {
    await AsyncStorage.setItem(PROMPT_DISMISSED_KEY, '1');
  } catch {
    // Only a convenience: the card shows again next time.
  }
}

/** The 7:00 summary's switch, saved with the account. */
export async function saveMorningNotifications(on: boolean) {
  await httpsCallable(functions, 'updateMyProfile')({ morningNotifications: on });
}

/** The ClassHall notifications switch, saved with the account. */
export async function saveClasshallNotifications(on: boolean) {
  await httpsCallable(functions, 'updateMyProfile')({ classhallNotifications: on });
}
