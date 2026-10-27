import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Whether this device already went through an anniversary's welcome
// (app/anniversary/welcome.tsx). Kept per anniversary, so next year's shows
// again. Until it is seen, the Home tile calls to open it.

const KEY = (id: string) => `hanet.anniversaryWelcome.${id}`;
const seen = new Map<string, boolean>();
const listeners = new Set<() => void>();

async function load(id: string) {
  if (seen.has(id)) return seen.get(id)!;
  let value = true;
  try {
    value = (await AsyncStorage.getItem(KEY(id))) === '1';
  } catch {
    // Storage unavailable: better not to insist on every visit.
  }
  seen.set(id, value);
  listeners.forEach(listener => listener());
  return value;
}

export function hasSeenWelcome(id: string) {
  return load(id);
}

export function markWelcomeSeen(id: string) {
  seen.set(id, true);
  listeners.forEach(listener => listener());
  AsyncStorage.setItem(KEY(id), '1').catch(() => undefined);
}

/** Null while it is read; true once this device saw the welcome of `id`. */
export function useWelcomeSeen(id: string | null | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(value => value + 1);
    listeners.add(listener);
    if (id) void load(id);
    return () => { listeners.delete(listener); };
  }, [id]);
  if (!id) return null;
  return seen.has(id) ? seen.get(id)! : null;
}
