import { useSyncExternalStore } from 'react';

// Whether the first screen has what it needs to be shown. The launch splash
// stays up until then (or until its time cap), so opening HaNet lands on a
// full Home instead of one that fills in piece by piece.

let ready = false;
const listeners = new Set<() => void>();

/** Home calls this once its content (and the photos in it) has loaded. */
export function markLaunchContentReady() {
  if (ready) return;
  ready = true;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLaunchContentReady() {
  return useSyncExternalStore(subscribe, () => ready, () => ready);
}
