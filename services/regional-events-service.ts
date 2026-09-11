import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { eventsDb } from './firebase';
import { regionalEventFixtures } from './regional-events-fixtures';
import type {
  EventOfferType,
  NearbyEventsQuery,
  RegionalEvent,
  RegionalEventCategory,
  RegionalEventOffer,
  RegionalEventSource,
  RegionalEventsRepository,
} from '@/types/regional-events';

const REGIONAL_EVENTS_COLLECTION = 'regionalEvents';
const DEFAULT_TIMEZONE = 'America/Santiago' as const;

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function normalizeSource(value: unknown): RegionalEventSource {
  const source = (value || {}) as Record<string, unknown>;
  return {
    type: source.type === 'official' || source.type === 'ticketing' || source.type === 'organizer' || source.type === 'community' || source.type === 'knowledge_base'
      ? source.type
      : 'community',
    name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Fuente no especificada',
    url: typeof source.url === 'string' ? source.url : '',
    ingestion: source.ingestion === 'api' || source.ingestion === 'feed' || source.ingestion === 'scrape' || source.ingestion === 'manual'
      ? source.ingestion
      : undefined,
    lastCheckedAt: toDate(source.lastCheckedAt),
    contentHash: typeof source.contentHash === 'string' ? source.contentHash : undefined,
  };
}

function normalizeEditorial(value: unknown): RegionalEvent['editorial'] {
  if (!value || typeof value !== 'object') return undefined;
  const editorial = value as Record<string, unknown>;
  if (typeof editorial.subject !== 'string' || typeof editorial.sourcePageUrl !== 'string') return undefined;

  return {
    subject: editorial.subject,
    summary: typeof editorial.summary === 'string' ? editorial.summary : undefined,
    source: normalizeSource(editorial.source),
    sourcePageUrl: editorial.sourcePageUrl,
    wikidataId: typeof editorial.wikidataId === 'string' ? editorial.wikidataId : undefined,
    imageUrl: typeof editorial.imageUrl === 'string' ? editorial.imageUrl : undefined,
    license: typeof editorial.license === 'string' ? editorial.license : undefined,
    attribution: typeof editorial.attribution === 'string' ? editorial.attribution : undefined,
    fetchedAt: toDate(editorial.fetchedAt),
  };
}

function normalizeOffer(value: unknown): RegionalEventOffer | null {
  const offer = (value || {}) as Record<string, unknown>;
  const type: EventOfferType = offer.type === 'student' || offer.type === 'hanet' || offer.type === 'general' || offer.type === 'none'
    ? offer.type
    : 'none';
  if (type === 'none') return null;

  const verification = offer.verification === 'verified' || offer.verification === 'pending' || offer.verification === 'expired' || offer.verification === 'unverified'
    ? offer.verification
    : 'unverified';

  return {
    type,
    label: typeof offer.label === 'string' && offer.label.trim() ? offer.label : 'Beneficio informado',
    verification,
    value: typeof offer.value === 'string' ? offer.value : undefined,
    requirements: typeof offer.requirements === 'string' ? offer.requirements : undefined,
    redemptionUrl: typeof offer.redemptionUrl === 'string' ? offer.redemptionUrl : undefined,
    validUntil: toDate(offer.validUntil),
    source: offer.source ? normalizeSource(offer.source) : undefined,
  };
}

function normalizeCategory(value: unknown): RegionalEventCategory {
  const categories: RegionalEventCategory[] = ['music', 'concert', 'exhibition', 'sports', 'theatre', 'family', 'academic', 'community', 'other'];
  return typeof value === 'string' && categories.includes(value as RegionalEventCategory)
    ? value as RegionalEventCategory
    : 'other';
}

function normalizeEvent(id: string, value: Record<string, unknown>): RegionalEvent | null {
  const startsAt = toDate(value.startsAt || value.startDate);
  if (!startsAt || typeof value.title !== 'string' || !value.title.trim()) return null;

  const locationValue = (value.location || {}) as Record<string, unknown>;
  const images = Array.isArray(value.images)
    ? value.images.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map(item => ({
      url: typeof item.url === 'string' ? item.url : '',
      alt: typeof item.alt === 'string' ? item.alt : undefined,
      credit: typeof item.credit === 'string' ? item.credit : undefined,
    })).filter(image => image.url)
    : [];
  const offers = Array.isArray(value.offers)
    ? value.offers.map(normalizeOffer).filter((offer): offer is RegionalEventOffer => Boolean(offer))
    : [];
  const status = value.status === 'draft' || value.status === 'pending_review' || value.status === 'published' || value.status === 'cancelled' || value.status === 'expired' || value.status === 'archived'
    ? value.status
    : 'draft';

  return {
    id,
    title: value.title.trim(),
    slug: typeof value.slug === 'string' ? value.slug : undefined,
    category: normalizeCategory(value.category),
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    organizer: typeof value.organizer === 'string' ? value.organizer : undefined,
    editorial: normalizeEditorial(value.editorial),
    images,
    location: {
      venueName: typeof locationValue.venueName === 'string' ? locationValue.venueName : 'Ubicación por confirmar',
      address: typeof locationValue.address === 'string' ? locationValue.address : undefined,
      city: typeof locationValue.city === 'string' ? locationValue.city : '',
      region: typeof locationValue.region === 'string' ? locationValue.region : '',
      country: 'CL',
      latitude: typeof locationValue.latitude === 'number' ? locationValue.latitude : undefined,
      longitude: typeof locationValue.longitude === 'number' ? locationValue.longitude : undefined,
    },
    startsAt,
    endsAt: toDate(value.endsAt || value.endDate),
    timezone: DEFAULT_TIMEZONE,
    price: value.price && typeof value.price === 'object' ? value.price as RegionalEvent['price'] : undefined,
    ticketUrl: typeof value.ticketUrl === 'string' ? value.ticketUrl : undefined,
    source: normalizeSource(value.source),
    offers,
    status,
    moderation: value.moderation && typeof value.moderation === 'object'
      ? value.moderation as RegionalEvent['moderation']
      : undefined,
    featured: value.featured === true,
    verifiedAt: toDate(value.verifiedAt),
    createdAt: toDate(value.createdAt),
    updatedAt: toDate(value.updatedAt),
  };
}

function hasVerifiedOffer(event: RegionalEvent, type: EventOfferType): boolean {
  return event.offers.some(offer => offer.type === type && offer.verification === 'verified' && (!offer.validUntil || offer.validUntil >= new Date()));
}

function matchesQuery(event: RegionalEvent, query: NearbyEventsQuery): boolean {
  if (event.status !== 'published') return false;
  if (event.location.city.toLocaleLowerCase() !== query.city.toLocaleLowerCase()) return false;
  if (query.region && event.location.region.toLocaleLowerCase() !== query.region.toLocaleLowerCase()) return false;
  if (query.category && query.category !== 'all' && event.category !== query.category) return false;
  if (query.from && event.startsAt < query.from) return false;
  if (query.to && event.startsAt > query.to) return false;
  if (query.onlyFree && !event.price?.isFree) return false;
  if (query.onlyWithStudentOffer && !hasVerifiedOffer(event, 'student')) return false;
  if (query.onlyWithHanetOffer && !hasVerifiedOffer(event, 'hanet')) return false;
  return true;
}

export const regionalEventsRepository: RegionalEventsRepository = {
  async listNearby(query) {
    if (__DEV__) return sortAndLimit(regionalEventFixtures.filter(event => matchesQuery(event, query)), query.limit);

    const snapshot = await getDocs(collection(eventsDb, REGIONAL_EVENTS_COLLECTION));
    const remoteEvents = snapshot.docs
      .map(snapshotDoc => normalizeEvent(snapshotDoc.id, snapshotDoc.data()))
      .filter((event): event is RegionalEvent => Boolean(event && matchesQuery(event, query)));
    return sortAndLimit(remoteEvents, query.limit);
  },

  async getById(id) {
    if (__DEV__) return regionalEventFixtures.find(event => event.id === id) || null;

    const snapshot = await getDoc(doc(eventsDb, REGIONAL_EVENTS_COLLECTION, id));
    if (snapshot.exists()) return normalizeEvent(snapshot.id, snapshot.data());
    return null;
  },
};

function sortAndLimit(events: RegionalEvent[], limit?: number) {
  return events
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, limit ?? 50);
}

export function formatRegionalEventDate(date: Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DEFAULT_TIMEZONE,
  }).format(date).replace('.', '');
}

export function getEventOffer(event: RegionalEvent, type: EventOfferType): RegionalEventOffer | undefined {
  return event.offers.find(offer => offer.type === type && offer.verification === 'verified');
}
