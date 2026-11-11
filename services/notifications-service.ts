import { httpsCallable } from 'firebase/functions';
import { useEffect, useSyncExternalStore } from 'react';
import { cached, peekCached, putCached, restoreCached } from './cache';
import { auth, functions } from './firebase';
import { dateLocale, t } from '@/i18n';

// The Home's notifications section (functions/inbox.js): every push the
// backend sent to this account, kept so it can be read again, newest first.
// The Home shows the latest one or two; pulling it down opens the rest.

export type NotificationKind =
  | 'announcement'
  | 'material'
  | 'task'
  | 'taskTomorrow'
  | 'reviewed'
  | 'grade'
  | 'gradeCorrected'
  | 'anniversary'
  | 'feed'
  | 'test';

export type HnNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  at: number;
};

export type NotificationsState = { items: HnNotification[]; seenAt: number; unread: number };

const KEY = 'notifications';

// Shared by the Home's preview and the section, for the account it belongs to.
let current: { uid: string; state: NotificationsState } | null = null;
const listeners = new Set<() => void>();

function uid() {
  return auth.currentUser?.uid ?? null;
}

function set(state: NotificationsState, owner = uid()) {
  if (!owner || owner !== uid()) return;
  current = { uid: owner, state };
  putCached(KEY, state);
  listeners.forEach(listener => listener());
}

function snapshot() {
  return current && current.uid === uid() ? current.state : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Loads the list again; what it had stays on screen meanwhile. */
export async function loadNotifications() {
  const owner = uid();
  const result = await cached(KEY, async () => (
    await httpsCallable<{ limit?: number }, NotificationsState>(functions, 'getMyNotifications')({})
  ).data);
  set(result, owner);
  return result;
}

/** Opening the section: everything up to now counts as seen. */
export async function markNotificationsSeen() {
  const state = snapshot();
  if (state) set({ ...state, seenAt: Date.now(), unread: 0 });
  try {
    await httpsCallable<void, { seenAt: number }>(functions, 'markNotificationsSeen')();
  } catch {
    // Seen on this phone anyway; the next load says what the server has.
  }
}

/** The list for this account: what the phone kept, then each fresh load. */
export function useNotifications(enabled: boolean) {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!enabled || snapshot()) return;
    const owner = uid();
    const kept = peekCached<NotificationsState>(KEY);
    if (kept) { set(kept, owner); return; }
    void restoreCached<NotificationsState>(KEY).then(value => {
      if (value && !snapshot()) set(value, owner);
    });
  }, [enabled]);
  return enabled ? state : null;
}

/** "Ahora", "Hace 5 min", "Hace 3 h", "Ayer", "Hace 4 días" or the date. */
export function notificationAge(at: number, now: number) {
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return t('common.ahora');
  if (minutes < 60) return t('services.feedService.haceMinutesMin', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('services.notificationsService.haceHoursH', { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('services.feedService.ayer');
  if (days < 7) return t('services.feedService.haceDaysDias', { days });
  return new Date(at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}
