export const REGIONAL_EVENT_CATEGORIES = [
  'music',
  'concert',
  'exhibition',
  'sports',
  'theatre',
  'family',
  'academic',
  'community',
  'other',
] as const;

export type RegionalEventCategory = (typeof REGIONAL_EVENT_CATEGORIES)[number];
export type RegionalEventStatus = 'draft' | 'pending_review' | 'published' | 'cancelled' | 'expired' | 'archived';
export type EventSourceType = 'official' | 'ticketing' | 'organizer' | 'community' | 'knowledge_base';
export type EventOfferType = 'student' | 'hanet' | 'general' | 'none';
export type EventOfferVerification = 'verified' | 'pending' | 'expired' | 'unverified';

export interface RegionalEventLocation {
  venueName: string;
  address?: string;
  city: string;
  region: string;
  country: 'CL';
  latitude?: number;
  longitude?: number;
}

export interface RegionalEventSource {
  type: EventSourceType;
  name: string;
  url: string;
  ingestion?: 'api' | 'feed' | 'scrape' | 'manual';
  lastCheckedAt?: Date;
  contentHash?: string;
}

export interface RegionalEventEditorialInfo {
  subject: string;
  summary?: string;
  source: RegionalEventSource;
  sourcePageUrl: string;
  wikidataId?: string;
  imageUrl?: string;
  license?: string;
  attribution?: string;
  fetchedAt?: Date;
}

export interface RegionalEventImage {
  /** Remote source from the catalog or a bundled Expo asset for development. */
  url: string | number;
  alt?: string;
  credit?: string;
}

export interface RegionalEventPrice {
  currency: 'CLP';
  min?: number;
  max?: number;
  isFree: boolean;
  label?: string;
}

export interface RegionalEventOffer {
  type: EventOfferType;
  label: string;
  verification: EventOfferVerification;
  value?: string;
  requirements?: string;
  redemptionUrl?: string;
  validUntil?: Date;
  source?: RegionalEventSource;
}

export interface RegionalEventModeration {
  status: RegionalEventStatus;
  needsReview: boolean;
  reviewReason?: 'new' | 'source_changed' | 'date_changed' | 'price_changed' | 'cancelled' | 'reported' | 'manual';
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  archivedAt?: Date;
  archivedBy?: string;
}

export interface RegionalEvent {
  id: string;
  title: string;
  slug?: string;
  category: RegionalEventCategory;
  summary?: string;
  description?: string;
  organizer?: string;
  editorial?: RegionalEventEditorialInfo;
  images: RegionalEventImage[];
  location: RegionalEventLocation;
  startsAt: Date;
  endsAt?: Date;
  timezone: 'America/Santiago';
  price?: RegionalEventPrice;
  ticketUrl?: string;
  source: RegionalEventSource;
  offers: RegionalEventOffer[];
  status: RegionalEventStatus;
  moderation?: RegionalEventModeration;
  featured: boolean;
  verifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NearbyEventsQuery {
  city: string;
  region?: string;
  category?: RegionalEventCategory | 'all';
  from?: Date;
  to?: Date;
  onlyFree?: boolean;
  onlyWithStudentOffer?: boolean;
  onlyWithHanetOffer?: boolean;
  limit?: number;
}

export interface RegionalEventsRepository {
  listNearby(query: NearbyEventsQuery): Promise<RegionalEvent[]>;
  getById(id: string): Promise<RegionalEvent | null>;
}
