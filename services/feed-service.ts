import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { cached } from './cache';
import { auth, functions, storage } from './firebase';

// Feed y Comunidad (functions/feed.js): announcements published by Espacios,
// never by a person. Students read and react; nothing else.

export type FeedSpace = {
  /** "school", "cee", "hanet" or "course:<courseId>". */
  key: string;
  name: string;
  initials: string;
  official: boolean;
  /** "Oficial", "Centro de estudiantes"… */
  kind: string;
};

export type FeedAudience =
  | { kind: 'all' }
  | { kind: 'jornada'; jornada: 'manana' | 'tarde' }
  | { kind: 'courses'; courseIds: string[] };

export type FeedReaction = { emoji: string; count: number; mine: boolean };

export type FeedPost = {
  id: string;
  space: FeedSpace;
  body: string;
  images: string[];
  tags: string[];
  pinned: boolean;
  audience: FeedAudience;
  createdAt: number | null;
  edited: boolean;
  reactions: FeedReaction[];
  canEdit: boolean;
  canPin: boolean;
};

export type Feed = {
  posts: FeedPost[];
  /** The Espacios this person sees, for the row on top. */
  spaces: FeedSpace[];
  /** The Espacios this person may publish in; empty for students. */
  publishAs: FeedSpace[];
  tags: string[];
  emojis: string[];
  institutionName: string;
};

/** Images per post and tags per post, as functions/feed.js allows. */
export const MAX_FEED_IMAGES = 6;
export const MAX_FEED_TAGS = 3;
export const MAX_FEED_BODY = 2000;

export const EMOJI_NAMES: Record<string, string> = {
  '👍': 'Me gusta',
  '❤️': 'Corazón',
  '😂': 'Risa',
  '🎉': 'Celebrar',
  '😮': 'Sorpresa',
  '🔥': 'Fuego',
  '👏': 'Aplausos',
};

export const REPORT_REASONS = [
  { value: 'inapropiado', label: 'Es inapropiado' },
  { value: 'falso', label: 'Es falso o engañoso' },
  { value: 'acoso', label: 'Molesta o expone a alguien' },
  { value: 'otro', label: 'Otro motivo' },
] as const;

// The last feed loaded, so the form opens without another read.
let lastFeed: Feed | null = null;

export function getLoadedFeed() {
  return lastFeed;
}

export async function listFeed() {
  const feed = await cached('feed', async () => (await httpsCallable<void, Feed>(functions, 'listFeed')()).data);
  lastFeed = feed;
  return feed;
}

/** The Espacio a post belongs to, as the row on top names it ("course:<id>" folds into "course"). */
export function spaceGroup(key: string) {
  return key.startsWith('course:') ? 'course' : key;
}

export type FeedPostInput = {
  id?: string;
  space?: string;
  body: string;
  tags: string[];
  /** Images already published that stay, by address. */
  keepImages?: string[];
  /** New images, already in the staging folder. */
  uploadPaths?: string[];
  audience?: FeedAudience;
  pinned?: boolean;
};

export async function saveFeedPost(input: FeedPostInput) {
  const result = await httpsCallable<FeedPostInput, { id: string }>(functions, 'saveFeedPost')(input);
  return result.data.id;
}

export async function deleteFeedPost(id: string) {
  await httpsCallable(functions, 'deleteFeedPost')({ id });
}

export async function toggleFeedReaction(id: string, emoji: string) {
  const result = await httpsCallable<{ id: string; emoji: string }, FeedReaction>(functions, 'toggleFeedReaction')({ id, emoji });
  return result.data;
}

export async function setFeedPostPinned(id: string, pinned: boolean) {
  await httpsCallable(functions, 'setFeedPostPinned')({ id, pinned });
}

export async function reportFeedPost(id: string, reason: string, detail = '') {
  await httpsCallable(functions, 'reportFeedPost')({ id, reason, detail });
}

export class FeedImageError extends Error {}

/** Photos picked for a post, resized but not uploaded yet. */
export async function pickFeedImages(source: 'camera' | 'library', limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new FeedImageError('HaNet no tiene permiso para usar la cámara. Actívalo en los ajustes del teléfono.');
  }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: limit > 1, selectionLimit: limit, orderedSelection: true });
  if (result.canceled) return [];
  const uris: string[] = [];
  for (const asset of result.assets.slice(0, limit)) {
    const resized = await manipulateAsync(
      asset.uri,
      asset.width > 1600 ? [{ resize: { width: 1600 } }] : [],
      { compress: 0.8, format: SaveFormat.JPEG },
    );
    uris.push(resized.uri);
  }
  return uris;
}

/** Uploads a picked photo to the staging folder; saveFeedPost moves it next to the post. */
export async function uploadFeedImage(localUri: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para subir imágenes.');
  const blob = await (await fetch(localUri)).blob();
  if (blob.size > 5 * 1024 * 1024) throw new FeedImageError('Una de las imágenes pesa más de 5 MB.');
  const uploadPath = `feed-uploads/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadBytes(ref(storage, uploadPath), blob, { contentType: 'image/jpeg' });
  return uploadPath;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** "Ahora", "Hace 2 h", "Hoy, 8:10", "Ayer" or "5 oct.". */
export function feedWhen(createdAt: number | null, now = Date.now()) {
  if (!createdAt) return 'Ahora';
  const minutes = Math.floor((now - createdAt) / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 6 * 60) return `Hace ${Math.floor(minutes / 60)} h`;
  const date = new Date(createdAt);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - new Date(createdAt).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Hoy, ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  const year = date.getFullYear() !== today.getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}.${year}`;
}

export const AUDIENCE_LABELS = {
  all: 'Todo el liceo',
  manana: 'Jornada mañana',
  tarde: 'Jornada tarde',
} as const;

export function audienceLabel(audience: FeedAudience) {
  if (audience.kind === 'jornada') return AUDIENCE_LABELS[audience.jornada];
  if (audience.kind === 'courses') return audience.courseIds.length === 1 ? audience.courseIds[0] : `${audience.courseIds.length} cursos`;
  return AUDIENCE_LABELS.all;
}
