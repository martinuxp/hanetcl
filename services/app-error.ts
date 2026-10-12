import { useSyncExternalStore } from 'react';

/**
 * Full-screen problems that stop the app: a blocked account, servers that do
 * not answer, no internet. Any part of the app can raise one; the root layer
 * (components/errors/AppErrorLayer.tsx) shows it over everything.
 */
export type AppErrorKind = 'blocked' | 'server' | 'offline';

let current: AppErrorKind | null = null;
// Opened from the HNT panel to look at it: its buttons only close it.
let preview = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

export function showAppError(kind: AppErrorKind, asPreview = false) {
  if (current === kind && preview === asPreview) return;
  current = kind;
  preview = asPreview;
  emit();
}

export function isAppErrorPreview() {
  return preview;
}

export function clearAppError() {
  if (current === null) return;
  current = null;
  preview = false;
  emit();
}

export function useAppError() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => current,
    () => current,
  );
}

/** The auth error that means the HaNet ID was blocked from the HNT panel. */
export function isBlockedError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && String(error.code) === 'auth/user-disabled';
}
