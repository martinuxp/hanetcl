import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { auth } from './firebase';

// The last answer of each list the app shows, per account: kept in memory
// and on the phone, so a screen opens with what it had last time and
// refreshes behind it instead of starting from a skeleton. It holds only what
// those screens already show the signed-in account, and is cleared when the
// session ends.

const PREFIX = 'hn-cache:';

type Entry = { uid: string; value: unknown };

const memory = new Map<string, Entry>();
const inflight = new Map<string, { uid: string; promise: Promise<unknown> }>();

function currentUid() {
  return auth.currentUser?.uid ?? null;
}

function storageKey(uid: string, key: string) {
  return `${PREFIX}${uid}:${key}`;
}

/** What is in memory for the signed-in account, without waiting. */
export function peekCached<T>(key: string): T | undefined {
  const uid = currentUid();
  const entry = memory.get(key);
  return uid && entry?.uid === uid ? entry.value as T : undefined;
}

/** What the phone kept from a previous session, if anything. */
export async function restoreCached<T>(key: string): Promise<T | undefined> {
  const uid = currentUid();
  if (!uid) return undefined;
  const inMemory = peekCached<T>(key);
  if (inMemory !== undefined) return inMemory;
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid, key));
    if (raw === null || currentUid() !== uid) return undefined;
    const value = JSON.parse(raw) as T;
    // A fresher answer may have arrived while the phone was read.
    if (peekCached(key) === undefined) memory.set(key, { uid, value });
    return peekCached<T>(key);
  } catch {
    return undefined;
  }
}

/**
 * Runs `fetcher` and keeps its answer under `key`. A call with the same key
 * already on its way is shared instead of repeated.
 */
export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const uid = currentUid();
  if (!uid) return fetcher();
  const running = inflight.get(key);
  if (running?.uid === uid) return running.promise as Promise<T>;

  const started = Date.now();
  const promise = fetcher().then(value => {
    if (__DEV__) console.log(`[carga] ${key}: ${Date.now() - started} ms`);
    if (currentUid() === uid) {
      memory.set(key, { uid, value });
      AsyncStorage.setItem(storageKey(uid, key), JSON.stringify(value)).catch(() => undefined);
    }
    return value;
  });
  inflight.set(key, { uid, promise });
  const clear = () => { if (inflight.get(key)?.promise === promise) inflight.delete(key); };
  promise.then(clear, clear);
  return promise;
}

/** Keeps an answer that a change returned, as if it had just been loaded. */
export function putCached<T>(key: string, value: T) {
  const uid = currentUid();
  if (!uid) return;
  memory.set(key, { uid, value });
  AsyncStorage.setItem(storageKey(uid, key), JSON.stringify(value)).catch(() => undefined);
}

/** Forgets an answer that a change made stale (a deleted Hall, for example). */
export function dropCached(key: string) {
  memory.delete(key);
  const uid = currentUid();
  if (uid) AsyncStorage.removeItem(storageKey(uid, key)).catch(() => undefined);
}

/** Everything kept, of every account: on signing out. */
export async function clearCache() {
  memory.clear();
  inflight.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing kept is worse than a stale list; it is replaced on next load anyway.
  }
}

/**
 * The value kept under `key` for the signed-in account: from memory on the
 * first render, else once the phone has been read. Screens show it until
 * their own load answers.
 */
export function useCached<T>(key: string | null): T | undefined {
  const [value, setValue] = useState<{ key: string; value: T } | null>(() => {
    if (!key) return null;
    const kept = peekCached<T>(key);
    return kept === undefined ? null : { key, value: kept };
  });

  useEffect(() => {
    if (!key) return;
    let active = true;
    void restoreCached<T>(key).then(kept => {
      if (active && kept !== undefined) setValue({ key, value: kept });
    });
    return () => { active = false; };
  }, [key]);

  return key && value?.key === key ? value.value : undefined;
}
