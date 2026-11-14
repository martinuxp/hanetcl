import { httpsCallable } from 'firebase/functions';
import { cached, restoreCached } from './cache';
import { functions } from './firebase';
import { capitalize, weekdayLetters, weekdays } from '@/i18n';

// The course's weekly timetable (functions/schedule.js): the plan común,
// plus the blocks of the electivos and dominios each student is in, which
// every Hall keeps on its own.

export type ScheduleBlock = {
  id: string;
  /** 1 = lunes … 6 = sábado. */
  day: number;
  /** "08:00" */
  start: string;
  end: string;
  subject: string;
  room: string;
  /** A recreo or almuerzo between classes, or an electivo/dominio Hall; a class when missing. */
  kind?: 'class' | 'break' | 'hall';
  /** For a Hall's block. */
  hallId?: string;
  plan?: 'electivo' | 'dominio';
};

/**
 * A suspension of classes or an early dismissal (functions/day-changes.js),
 * on top of the weekly timetable for some dates. Dates are Chile's, "YYYY-MM-DD".
 */
export type DayChange = {
  id: string;
  kind: 'suspended' | 'early';
  from: string;
  to: string;
  /** "12:30", for an early dismissal. */
  endsAt: string | null;
  scope: 'school' | 'courses';
  courses: string[];
  reason: string;
  byName: string;
  at: number | null;
};

export type CourseSchedule = {
  courseId: string | null;
  blocks: ScheduleBlock[];
  /** On one's own timetable: blocks of the electivos and dominios one is in. */
  hallBlocks?: ScheduleBlock[];
  updatedAt: number | null;
  canEdit: boolean;
  /** For the administration: the courses it can pick. */
  courses: string[];
  /** The course's suspensions and early dismissals that have not ended. */
  changes?: DayChange[];
  /** Admin and HNT suspend classes and set early dismissals. */
  canChangeDays?: boolean;
};

// Monday to Saturday, with the letter and the name of each day.
export const SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6].map(day => ({ day, short: weekdayLetters()[day - 1], name: capitalize(weekdays()[day]) }));

const keyFor = (courseId?: string | null) => `schedule:${courseId ?? 'mine'}`;

export function getCourseSchedule(courseId?: string | null) {
  return cached(keyFor(courseId), async () => (
    await httpsCallable<{ courseId?: string }, CourseSchedule>(functions, 'getCourseSchedule')(courseId ? { courseId } : {})
  ).data);
}

/** The timetable as the phone last saw it, to show while it loads (and for the widget). */
export function restoreCourseSchedule(courseId?: string | null) {
  return restoreCached<CourseSchedule>(keyFor(courseId));
}

export async function saveCourseSchedule(courseId: string, blocks: ScheduleBlock[]) {
  const result = await httpsCallable<{ courseId: string; blocks: ScheduleBlock[] }, { courseId: string; blocks: ScheduleBlock[] }>(functions, 'saveCourseSchedule')({ courseId, blocks });
  return result.data.blocks;
}

export function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 510 → "08:30". */
export function timeOf(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "lunes" = 1 … "sábado" = 6, and 7 for Sunday (no classes). */
export function scheduleDay(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function blocksOn(blocks: ScheduleBlock[], day: number) {
  return blocks.filter(block => block.day === day).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

/** The week as a student lives it: the course's blocks and their Halls'. */
export function myWeek(schedule: Pick<CourseSchedule, 'blocks' | 'hallBlocks'> | null | undefined) {
  return [...(schedule?.blocks ?? []), ...(schedule?.hallBlocks ?? [])];
}

export async function saveHallSchedule(hallId: string, blocks: ScheduleBlock[]) {
  const result = await httpsCallable<{ hallId: string; blocks: ScheduleBlock[] }, { blocks: ScheduleBlock[] }>(functions, 'saveHallSchedule')({ hallId, blocks });
  return result.data.blocks;
}

export const isBreak = (block: ScheduleBlock) => block.kind === 'break';

/** A day as "YYYY-MM-DD", in the phone's time zone. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The change a date has: a suspension before an early dismissal, the earliest dismissal first. */
export function changeOn(changes: DayChange[] | null | undefined, date: Date) {
  const key = dateKey(date);
  const found = (changes ?? []).filter(change => change.from <= key && key <= change.to);
  return found.find(change => change.kind === 'suspended')
    ?? found.filter(change => change.kind === 'early' && change.endsAt).sort((a, b) => minutesOf(a.endsAt!) - minutesOf(b.endsAt!))[0]
    ?? null;
}

/** What happens to a block on a day with that change: it stays, ends earlier, or is lost. */
export function blockFate(block: ScheduleBlock, change: DayChange | null): 'normal' | 'cut' | 'lost' {
  if (!change) return 'normal';
  if (change.kind === 'suspended' || !change.endsAt) return 'lost';
  const cut = minutesOf(change.endsAt);
  if (minutesOf(block.start) >= cut) return 'lost';
  return minutesOf(block.end) > cut ? 'cut' : 'normal';
}

/** The blocks that do happen on a date, the last one ending at the dismissal. */
export function classesOn(blocks: ScheduleBlock[], changes: DayChange[] | null | undefined, date: Date) {
  const change = changeOn(changes, date);
  return blocksOn(blocks, scheduleDay(date)).flatMap(block => {
    const fate = blockFate(block, change);
    if (fate === 'lost') return [];
    return fate === 'cut' ? [{ ...block, end: change!.endsAt! }] : [block];
  });
}

/** The block going on now (a recreo too) and the next class, today. */
export function nowAndNext(blocks: ScheduleBlock[], now = new Date(), changes?: DayChange[] | null) {
  const today = classesOn(blocks, changes, now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const current = today.find(block => minutesOf(block.start) <= minute && minute < minutesOf(block.end)) ?? null;
  const next = today.find(block => !isBreak(block) && minutesOf(block.start) > minute) ?? null;
  return { current, next };
}

/** A date today at "HH:MM". */
export function atTime(time: string, day = new Date()) {
  const date = new Date(day);
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}
