import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// The web app's service worker (public/sw.js): HaNet without internet, the
// "Hay una versión nueva" notice and web push. Only in the published web
// build: the development server and the phone apps never register it.
//
// A new build installs in the background and waits. `updateReady` turns on
// so the app can offer it, and `applyUpdate()` lets it take over and reloads
// the page, so the app on screen never mixes files of two builds.

const SCRIPT = '/sw.js';
// An app left open checks the server for a new build this often, and on coming back.
const CHECK_EVERY_MS = 30 * 60 * 1000;

let registration: Promise<ServiceWorkerRegistration | null> | null = null;
let updateReady = false;
let reloading = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

function markReady(worker: ServiceWorker | null) {
  // The first install has nothing to replace: there is no update to offer.
  if (!worker || !navigator.serviceWorker.controller || updateReady) return;
  updateReady = true;
  emit();
}

function watch(found: ServiceWorkerRegistration) {
  markReady(found.waiting);
  found.addEventListener('updatefound', () => {
    const worker = found.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') markReady(worker);
    });
  });
  let lastCheck = Date.now();
  const check = () => {
    if (Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    void found.update().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, CHECK_EVERY_MS);
}

// The worker keeps what the page loaded before it was there (fonts, images),
// so the first visit already works offline later.
function keepLoadedAssets(ready: ServiceWorkerRegistration) {
  const assets = `${window.location.origin}/assets/`;
  const urls = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.startsWith(assets));
  if (urls.length) ready.active?.postMessage({ type: 'keep', urls });
}

export function serviceWorkerSupported() {
  return Platform.OS === 'web' && !__DEV__ && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;
}

/** Registers the worker once; the same registration for whoever asks after. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (!serviceWorkerSupported()) {
    registration = Promise.resolve(null);
    return registration;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) return;
    window.location.reload();
  });
  registration = navigator.serviceWorker.register(SCRIPT, { scope: '/', updateViaCache: 'none' })
    .then(found => {
      watch(found);
      void navigator.serviceWorker.ready.then(keepLoadedAssets);
      return found;
    })
    .catch(error => {
      console.warn('serviceWorker', error instanceof Error ? error.message : error);
      return null;
    });
  return registration;
}

/** The new build takes over and the page reloads with it. */
export async function applyUpdate() {
  const found = await registerServiceWorker();
  if (!found?.waiting) {
    window.location.reload();
    return;
  }
  reloading = true;
  found.waiting.postMessage({ type: 'skip-waiting' });
}

/** Whether a new build is installed and waiting for the person to accept it. */
export function useUpdateReady() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => updateReady,
    () => false,
  );
}
