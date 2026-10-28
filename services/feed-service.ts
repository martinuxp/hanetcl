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

/** An event of HaNet Eventos shared in a post; `missing` once it was taken down. */
export type FeedEvent =
  | {
    id: string;
    kind: 'regional' | 'institution';
    title: string;
    startsAt: number;
    endsAt: number | null;
    imageUrl: string | null;
    venueName: string;
    city: string;
    palette: string[];
    missing?: undefined;
  }
  | { id: string; missing: true };

/** A poll as this person sees it: counts are null until they may see them. */
export type FeedPoll = {
  options: { id: string; text: string; count: number | null }[];
  total: number | null;
  closesAt: number | null;
  closed: boolean;
  /** "live": results show after voting; "closed": only when it closes. */
  results: 'live' | 'closed';
  voted: boolean;
};

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
  event: FeedEvent | null;
  poll: FeedPoll | null;
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
  /** The Espacios where this person may run a poll ("school", "cee", "hanet"). */
  pollSpaces: string[];
};

/** The tag of the Aniversario's avisos (functions/feed.js). */
export const ANNIVERSARY_TAG = 'Aniversario';

/** Images per post and tags per post, as functions/feed.js allows. */
export const MAX_FEED_IMAGES = 6;
export const MAX_FEED_TAGS = 3;
export const MAX_FEED_BODY = 2000;
/** Options per poll, as functions/feed.js allows. */
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_POLL_OPTION = 80;

/** Espacios whose posts can be shared as a story: the school's and the CEE's, not a course's. */
export function canShareAsStory(post: FeedPost) {
  return ['school', 'cee'].includes(spaceGroup(post.space.key));
}

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

// The last feed loaded, so the form opens without another read, and every
// post loaded (from the whole feed or a tag's), so it opens to be edited.
let lastFeed: Feed | null = null;
const loadedPosts = new Map<string, FeedPost>();

export function getLoadedFeed() {
  return lastFeed;
}

export function getLoadedPost(id: string) {
  return loadedPosts.get(id) ?? null;
}

/** The feed, or only the posts with `tag` (the Aniversario's avisos). */
export async function listFeed(tag?: string) {
  const feed = await cached(tag ? `feed:tag:${tag}` : 'feed', async () => (await httpsCallable<{ tag?: string }, Feed>(functions, 'listFeed')(tag ? { tag } : {})).data);
  if (!tag) lastFeed = feed;
  for (const post of feed.posts) loadedPosts.set(post.id, post);
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
  /** Only when creating: an event to share, or a poll. */
  eventId?: string;
  poll?: { options: string[]; closesAt: number; results: 'live' | 'closed' };
  /** Only when creating an #Aniversario post of the school or the CEE: a push to the alianzas. */
  notify?: boolean;
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

/** One anonymous vote; it cannot be changed afterwards. */
export async function voteFeedPoll(id: string, option: string) {
  const result = await httpsCallable<{ id: string; option: string }, FeedPoll>(functions, 'voteFeedPoll')({ id, option });
  return result.data;
}

/** "Cierra en 3 días", "Cierra hoy a las 18:00" or "Cerró". */
export function pollClosing(poll: FeedPoll, now = Date.now()) {
  if (poll.closed || !poll.closesAt || poll.closesAt <= now) return 'Votación cerrada';
  const hours = (poll.closesAt - now) / 3_600_000;
  const date = new Date(poll.closesAt);
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (hours < 1) return `Cierra en ${Math.max(1, Math.round(hours * 60))} min`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(poll.closesAt).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  if (days === 0) return `Cierra hoy a las ${time}`;
  if (days === 1) return `Cierra mañana a las ${time}`;
  return `Cierra en ${days} días`;
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
