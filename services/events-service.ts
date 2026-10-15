import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { auth, functions, storage } from './firebase';

// HaNet Eventos (functions/events.js): city events loaded by the HaNet team
// and the institution's own, with sign-ups.

export type EventKind = 'regional' | 'institution';
export type Jornada = 'manana' | 'tarde';
export type EventJornada = Jornada | 'ambas';
export type SignupMode = 'list' | 'count' | 'none';

export const JORNADA_LABELS: Record<EventJornada, string> = { manana: 'Jornada mañana', tarde: 'Jornada tarde', ambas: 'Ambas jornadas' };

export const EVENT_CATEGORIES = [
  { value: 'concert', label: 'Concierto' },
  { value: 'music', label: 'Música' },
  { value: 'exhibition', label: 'Exposición' },
  { value: 'theatre', label: 'Teatro' },
  { value: 'sports', label: 'Deporte' },
  { value: 'family', label: 'Familiar' },
  { value: 'academic', label: 'Académico' },
  { value: 'community', label: 'Comunidad' },
  { value: 'other', label: 'Otro' },
] as const;

export type HnEvent = {
  id: string;
  kind: EventKind;
  status: 'published' | 'draft';
  title: string;
  category: string;
  description: string;
  imageUrl: string | null;
  /** Photos of the event or the venue, under the buy button. */
  gallery: string[];
  startsAt: number;
  endsAt: number | null;
  venueName: string;
  address: string;
  city: string;
  region: string;
  priceFrom: number | null;
  isFree: boolean;
  ticketUrl: string;
  sourceName: string;
  sourceUrl: string;
  sponsored: boolean;
  /** A perk the ticketing site itself offers ("Descuento estudiantil"). */
  perk: string;
  editorial: { subject: string; summary: string; sourceName: string; sourceUrl: string } | null;
  jornada: EventJornada;
  signupMode: SignupMode;
  capacity: number | null;
  authorName: string;
  signupCount?: number;
  signedUp?: boolean;
  canEdit?: boolean;
  /** Who signed up, for the organizers of an event with a list. */
  signups?: { name: string; courseId: string; createdAt: number | null }[];
};

/** Photos per event, as functions/events.js allows. */
export const MAX_EVENT_GALLERY = 6;

export type EventList = {
  events: HnEvent[];
  jornada: Jornada | null;
  institutionName: string | null;
  canPublish: boolean;
};

export async function listEvents(kind: EventKind) {
  const result = await httpsCallable<{ kind: EventKind }, EventList>(functions, 'listEvents')({ kind });
  return result.data;
}

// The last event opened, so its form opens without another read.
let lastEvent: HnEvent | null = null;

export function getLoadedEvent(id: string) {
  return lastEvent?.id === id ? lastEvent : null;
}

export async function getEvent(id: string) {
  const result = await httpsCallable<{ id: string }, HnEvent>(functions, 'getEvent')({ id });
  lastEvent = result.data;
  return result.data;
}

export type EventInput = Partial<Omit<HnEvent, 'signupCount' | 'signedUp' | 'canEdit' | 'signups'>> & {
  kind: EventKind;
  title: string;
  startsAt: number;
  /** A cover already uploaded to the staging folder. */
  uploadPath?: string;
  /** Gallery: photos kept (by address), new uploads and images of the ticketing page. */
  galleryKeep?: string[];
  galleryUploads?: string[];
  galleryUrls?: string[];
};

export async function saveEvent(input: EventInput) {
  const result = await httpsCallable<EventInput, { id: string }>(functions, 'saveEvent')(input);
  return result.data.id;
}

export async function deleteEvent(id: string) {
  await httpsCallable(functions, 'deleteEvent')({ id });
}

export async function toggleEventSignup(id: string) {
  const result = await httpsCallable<{ id: string }, { signedUp: boolean; signupCount: number }>(functions, 'toggleEventSignup')({ id });
  return result.data;
}

export type ImportedEvent = Pick<HnEvent, 'title' | 'description' | 'venueName' | 'address' | 'city' | 'priceFrom' | 'ticketUrl' | 'sourceName' | 'sourceUrl'> & {
  imageUrl: string;
  /** The page's other images, for the gallery. */
  images: string[];
  startsAt: number | null;
  endsAt: number | null;
  /** The kind of event as the page names it ("Música"). */
  typeLabel: string;
  /** What to check before publishing: not suitable for students, test-only source. */
  warnings: string[];
  /** Read from a site only allowed for testing (Vamoh), never for the beta. */
  testOnly: boolean;
};

/** Panel HNT: reads a ticketing page into a draft to review. */
export async function importEventFromUrl(url: string) {
  const result = await httpsCallable<{ url: string }, ImportedEvent>(functions, 'importEventFromUrl')({ url });
  return result.data;
}

/** Picks a cover (cropped wide) or a gallery photo and uploads it to the staging folder; null when cancelled. */
export async function pickEventCover(kind: 'cover' | 'gallery' = 'cover'): Promise<{ uploadPath: string; localUri: string } | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para subir imágenes.');
  const result = await ImagePicker.launchImageLibraryAsync(kind === 'cover'
    ? { mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 }
    : { mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const resized = await manipulateAsync(asset.uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
  const blob = await (await fetch(resized.uri)).blob();
  const uploadPath = `events-uploads/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadBytes(ref(storage, uploadPath), blob, { contentType: 'image/jpeg' });
  return { uploadPath, localUri: resized.uri };
}

export type WikipediaSummary = { title: string; summary: string; url: string };

/**
 * The opening of the Spanish Wikipedia article about an artist or a venue,
 * for "Sobre…". Wikipedia allows reusing it with attribution (CC BY-SA 4.0).
 * Null when there is no article with that name.
 */
export async function fetchWikipediaSummary(subject: string): Promise<WikipediaSummary | null> {
  const headers = { 'Api-User-Agent': 'HaNetEventos/1.0 (muxp@muxp.art)' };
  const search = await fetch(`https://es.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&origin=*&search=${encodeURIComponent(subject.trim())}`, { headers });
  if (!search.ok) throw new Error('Wikipedia no responde.');
  const [, titles] = await search.json() as [string, string[]];
  const title = titles?.[0];
  if (!title) return null;
  const page = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers });
  if (!page.ok) return null;
  const data = await page.json() as { title?: string; extract?: string; type?: string; content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } } };
  if (!data.extract || data.type === 'disambiguation') return null;
  return { title: data.title ?? title, summary: data.extract, url: data.content_urls?.mobile?.page ?? data.content_urls?.desktop?.page ?? '' };
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

function clock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "dom, 5 jul. 19:00", or "1 jun. al 30 ago." for events that last days. */
export function eventWhen(event: Pick<HnEvent, 'startsAt' | 'endsAt'>) {
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const day = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}.`;
  if (end && end.toDateString() !== start.toDateString()) return `${day(start)} al ${day(end)}`;
  return `${WEEKDAYS[start.getDay()]}, ${day(start)} ${clock(start)}`;
}

/** "Mañana, 19:00", "Hoy, 19:00" or null, for the featured card and the banner. */
export function eventSoon(startsAt: number, now: number) {
  const start = new Date(startsAt);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  if (days === 0) return `Hoy, ${clock(start)}`;
  if (days === 1) return `Mañana, ${clock(start)}`;
  return null;
}

export function formatClp(value: number) {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}
