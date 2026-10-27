import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { cached, peekCached, putCached } from './cache';
import { functions } from './firebase';

// Aniversario (functions/anniversary.js): alianzas made of whole courses, the
// activities with their point tables, additions and deductions with their
// reason, deadlines and flash tests. Organized by the CEE, Admin and HNT;
// everyone else reads. The score is always the sum of the record of points.

export type AllianceColor = 'rosa' | 'rojo' | 'naranjo' | 'amarillo' | 'verde' | 'celeste' | 'azul' | 'morado' | 'blanco' | 'negro';
export type ActivityGroup = 'previas' | 'deportes' | 'velada' | 'show' | 'flash' | 'otras';
export type ActivityMode = 'podium' | 'manual';
export type Audience = 'leads' | 'all';

export type Alliance = {
  id: string;
  name: string;
  theme: string;
  color: AllianceColor;
  /** Its mascot: one emoji, or empty. */
  emoji: string;
  /** Its motto ("lema"), or empty. */
  motto: string;
  /** Instagram handle without the @, or empty. */
  instagram: string;
  courseIds: string[];
  leadCount: number;
  /** Only for organizers. */
  leadUids?: string[];
  /** Null while the CEE keeps the score hidden. */
  total: number | null;
};

export type AnniversaryActivity = {
  id: string;
  name: string;
  group: ActivityGroup;
  startsAt: number | null;
  place: string;
  mode: ActivityMode;
  /** Points by place, 1° first (podium). Empty while the score is hidden. */
  points: number[];
  flash: boolean;
  text: string;
  /** Podium: alliance ids in order. Manual: points per alliance. */
  result: string[] | Record<string, number> | null;
  resultAt: number | null;
};

export type AnniversaryDeadline = { id: string; title: string; dueAt: number; audience: Audience };

export type ScoreEntry = {
  id: string;
  kind: 'result' | 'adjust';
  activityId: string | null;
  allianceId: string;
  points: number;
  reason: string;
  createdAt: number | null;
};

export type Anniversary = {
  id: string;
  title: string;
  year: number;
  startsAt: number;
  endsAt: number;
  rulesUrl: string;
  scoreHidden: boolean;
  finished: boolean;
  alliances: Alliance[];
  activities: AnniversaryActivity[];
  deadlines: AnniversaryDeadline[];
  history: ScoreEntry[];
  myAllianceId: string | null;
  isLead: boolean;
};

export type AnniversaryState = { anniversary: Anniversary | null; canOrganize: boolean };

export const ACTIVITY_GROUPS: { value: ActivityGroup; label: string }[] = [
  { value: 'previas', label: 'Previas' },
  { value: 'deportes', label: 'Deportes' },
  { value: 'velada', label: 'Velada' },
  { value: 'show', label: 'Show' },
  { value: 'flash', label: 'Pruebas flash' },
  { value: 'otras', label: 'Otras' },
];

const KEY = 'anniversary';
const listeners = new Set<(state: AnniversaryState) => void>();

// Every answer replaces what the screens show, wherever it came from.
function publish(state: AnniversaryState) {
  putCached(KEY, state);
  for (const listener of listeners) listener(state);
  return state;
}

async function call<Input extends object>(name: string, input: Input) {
  const result = await httpsCallable<Input, AnniversaryState>(functions, name)(input);
  return publish(result.data);
}

export function getAnniversary() {
  return cached(KEY, async () => (await httpsCallable<void, AnniversaryState>(functions, 'getAnniversary')()).data)
    .then(state => {
      for (const listener of listeners) listener(state);
      return state;
    });
}

export function peekAnniversary() {
  return peekCached<AnniversaryState>(KEY);
}

/** The anniversary as last loaded, kept up to date by every change. */
export function useAnniversaryState(initial?: AnniversaryState) {
  const [state, setState] = useState<AnniversaryState | undefined>(() => initial ?? peekAnniversary());
  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}

export type AllianceInput = { id?: string; name: string; theme: string; color: AllianceColor; emoji: string; motto: string; instagram: string; courseIds: string[] };

export type AnniversaryInput = {
  title: string;
  startsAt: number;
  endsAt: number;
  rulesUrl: string;
  scoreHidden: boolean;
  finished: boolean;
  alliances: AllianceInput[];
};

export function saveAnniversary(input: AnniversaryInput) {
  return call('saveAnniversary', input);
}

export async function listAnniversaryCourses() {
  return (await httpsCallable<void, { courses: string[] }>(functions, 'listAnniversaryCourses')()).data.courses;
}

export type ActivityInput = {
  id?: string;
  name: string;
  group: ActivityGroup;
  startsAt: number | null;
  place: string;
  mode: ActivityMode;
  points: number[];
  text: string;
};

export function saveActivity(input: ActivityInput) {
  return call('saveAnniversaryActivity', input);
}

export function deleteActivity(id: string) {
  return call('saveAnniversaryActivity', { id, delete: true });
}

export function addPresetActivities() {
  return call('addAnniversaryPresets', {});
}

/** Podium: alliance ids, 1° first (an empty list clears it). Manual: points per alliance. */
export function setActivityResult(activityId: string, result: { order: string[] } | { points: Record<string, number> } | null) {
  return call('setAnniversaryResult', { activityId, ...(result ?? {}) });
}

export function addScoreEntry(allianceId: string, points: number, reason: string) {
  return call('saveAnniversaryEntry', { allianceId, points, reason });
}

export function deleteScoreEntry(id: string) {
  return call('saveAnniversaryEntry', { deleteId: id });
}

export function saveDeadline(input: { id?: string; title: string; dueAt: number; audience: Audience }) {
  return call('saveAnniversaryDeadline', input);
}

export function deleteDeadline(id: string) {
  return call('saveAnniversaryDeadline', { id, delete: true });
}

export async function launchFlashTest(input: { name: string; text: string; points: number[]; audience: Audience }) {
  const result = await httpsCallable<object, AnniversaryState & { sent: number }>(functions, 'launchFlashTest')({ ...input, mode: 'podium' });
  publish({ anniversary: result.data.anniversary, canOrganize: result.data.canOrganize });
  return result.data.sent;
}

export type LeadCandidate = { uid: string; name: string; courseId: string };

export async function listLeadCandidates(allianceId: string) {
  return (await httpsCallable<{ allianceId: string }, { people: LeadCandidate[] }>(functions, 'listAllianceCandidates')({ allianceId })).data.people;
}

export function setAllianceLeads(allianceId: string, uids: string[]) {
  return call('setAllianceLeads', { allianceId, uids });
}

// ─── Reading the score ───────────────────────────────────────────────────────

/** Alliances from first to last (by points; by name while hidden). */
export function ranking(anniversary: Anniversary) {
  return [...anniversary.alliances].sort((a, b) => (
    a.total !== null && b.total !== null ? b.total - a.total || a.name.localeCompare(b.name, 'es') : a.name.localeCompare(b.name, 'es')
  ));
}

export type Standing = Alliance & {
  place: number;
  /** Points added in the last 24 hours (from the visible history). */
  today: number;
  /** Places gained (+) or lost (−) in those 24 hours. */
  moved: number;
};

/**
 * The ranking with how it changed in the last day: the totals minus what the
 * history added since then give yesterday's order. Empty moves while hidden.
 */
export function standings(anniversary: Anniversary, now = Date.now()): Standing[] {
  const rows = ranking(anniversary);
  const hidden = rows.some(alliance => alliance.total === null);
  const today = new Map<string, number>();
  if (!hidden) {
    for (const entry of anniversary.history) {
      if (entry.createdAt && now - entry.createdAt < 86_400_000) today.set(entry.allianceId, (today.get(entry.allianceId) ?? 0) + entry.points);
    }
  }
  const before = [...rows]
    .map(alliance => ({ id: alliance.id, name: alliance.name, total: (alliance.total ?? 0) - (today.get(alliance.id) ?? 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
    .map(alliance => alliance.id);
  return rows.map((alliance, place) => ({
    ...alliance,
    place,
    today: today.get(alliance.id) ?? 0,
    moved: hidden || !today.size ? 0 : before.indexOf(alliance.id) - place,
  }));
}

/** "145.500" */
export function formatPoints(points: number) {
  return Math.round(points).toLocaleString('es-CL');
}

/** Whole days until a moment (0 = today, negative once it passed). */
export function daysTo(ms: number, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return Math.round((day.getTime() - start.getTime()) / 86_400_000);
}

export type AnniversaryPhase = 'before' | 'during' | 'after';

export function phaseOf(anniversary: Anniversary, now = Date.now()): AnniversaryPhase {
  if (anniversary.finished) return 'after';
  if (now < anniversary.startsAt) return 'before';
  return now > anniversary.endsAt ? 'after' : 'during';
}

/** Which day of the anniversary it is (1 on the first), and how many it lasts. */
export function anniversaryDay(anniversary: Anniversary, now = Date.now()) {
  const day = 1 - daysTo(anniversary.startsAt, now);
  const total = 1 + Math.round((new Date(anniversary.endsAt).setHours(0, 0, 0, 0) - new Date(anniversary.startsAt).setHours(0, 0, 0, 0)) / 86_400_000);
  return { day, total };
}

/** What happens today, sooner first (activities with a time). */
export function todaysActivities(anniversary: Anniversary, now = Date.now()) {
  return anniversary.activities
    .filter(activity => activity.startsAt !== null && daysTo(activity.startsAt, now) === 0)
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
}
