import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// The HN-QR changes every 30 seconds (functions/hanet-id.js): the phone
// computes the code from a key the backend gave it once, so the QR keeps
// changing without internet. A screenshot of it stops working right away.

const STEP_MS = 30_000;
const keyName = (uid: string) => `hanet.idKey.${uid}`;

let memory: { uid: string; key: string } | null = null;

/** The account's key: from memory, from the phone, or asked once to the backend. */
export async function loadIdKey(uid: string): Promise<string | null> {
  if (memory?.uid === uid) return memory.key;
  let key: string | null = null;
  try {
    key = await AsyncStorage.getItem(keyName(uid));
  } catch {
    // Only a convenience: the backend gives it again.
  }
  if (!key) {
    try {
      key = (await httpsCallable<void, { key: string }>(functions, 'getMyIdKey')()).data.key;
      await AsyncStorage.setItem(keyName(uid), key).catch(() => undefined);
    } catch {
      return null;
    }
  }
  memory = { uid, key };
  return key;
}

/** How long until the code changes, in milliseconds. */
export function msToNextCode(now = Date.now()) {
  return STEP_MS - (now % STEP_MS);
}

/** The QR's value: "hanet://id/<handle>?c=<code>", or without the code when there is no key yet. */
export async function idQrValue(handle: string, key: string | null, now = Date.now()) {
  if (!key) return `hanet://id/${handle}`;
  const step = Math.floor(now / STEP_MS);
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${key}:${step}`);
  return `hanet://id/${handle}?c=${digest.slice(0, 10)}`;
}
