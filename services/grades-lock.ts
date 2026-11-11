import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

// Notas behind the phone's own lock (Face ID, fingerprint or its code), for
// whoever turns it on in Configuraciones. It is a setting of this phone, kept
// here only; the lock is the system's, HaNet never sees a face or a code.
// Once unlocked it stays open until the app goes to the background.

const KEY = 'hanet.gradesLock';

type State = { ready: boolean; enabled: boolean; unlocked: boolean };

let state: State = { ready: false, enabled: false, unlocked: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

function load() {
  loading ??= AsyncStorage.getItem(KEY)
    .then(value => set({ ready: true, enabled: value === '1' }))
    .catch(() => set({ ready: true }));
  return loading;
}

AppState.addEventListener('change', status => {
  if (status === 'background' && state.unlocked) set({ unlocked: false });
});

/** The native module, or null where the build does not carry it (web, an older build). */
async function native() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-local-authentication');
  } catch {
    return null;
  }
}

/** Whether this phone can lock Notas: it needs a screen lock of its own. */
export async function gradesLockAvailable() {
  const module = await native();
  if (!module) return false;
  try {
    return (await module.getEnrolledLevelAsync()) !== module.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Asks the phone to verify its owner. True when it did. */
async function verify(promptMessage: string) {
  const module = await native();
  if (!module) return false;
  try {
    return (await module.authenticateAsync({ promptMessage })).success;
  } catch {
    return false;
  }
}

export async function unlockGrades(promptMessage: string) {
  if (state.unlocked) return true;
  const ok = await verify(promptMessage);
  if (ok) set({ unlocked: true });
  return ok;
}

/** Turning it on or off asks the phone first, so nobody else can switch it off. */
export async function setGradesLock(on: boolean, promptMessage: string) {
  if (!(await verify(promptMessage))) return false;
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => undefined);
  set({ ready: true, enabled: on, unlocked: true });
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** `locked`: Notas must stay hidden. While the setting is being read it counts as locked. */
export function useGradesLock() {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { void load(); }, []);
  return { ready: current.ready, enabled: current.enabled, locked: !current.ready || (current.enabled && !current.unlocked) };
}
