// A file shared to HaNet from another app through the system share sheet
// ("Compartir a HaNet", expo-share-intent). Only in native builds: Expo Go and
// the web have no share extension. The file waits here until the share
// screen (app/share.tsx) takes it.

export type SharedFile = { path: string; fileName: string | null; mimeType: string | null; size: number | null };

let pending: SharedFile | null = null;

export function setSharedFile(file: SharedFile) {
  pending = file;
}

export function peekSharedFile() {
  return pending;
}

export function clearSharedFile() {
  pending = null;
}
