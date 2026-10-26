import { httpsCallable } from 'firebase/functions';
import { cached, restoreCached } from './cache';
import { functions } from './firebase';

// The course's weekly timetable (functions/schedule.js). Plan común only;
// electivos and dominios are not in it yet.

export type ScheduleBlock = {
  id: string;
  /** 1 = lunes … 6 = sábado. */
  day: number;
  /** "08:00" */
  start: string;
  end: string;
  subject: string;
  room: string;
  /** A recreo or almuerzo between classes; a class when missing. */
  kind?: 'class' | 'break';
};

export type CourseSchedule = {
  courseId: string | null;
  blocks: ScheduleBlock[];
  updatedAt: number | null;
  canEdit: boolean;
  /** For the administration: the courses it can pick. */
  courses: string[];
};

export const SCHEDULE_DAYS = [
  { day: 1, short: 'L', name: 'Lunes' },
  { day: 2, short: 'M', name: 'Martes' },
  { day: 3, short: 'M', name: 'Miércoles' },
  { day: 4, short: 'J', name: 'Jueves' },
  { day: 5, short: 'V', name: 'Viernes' },
  { day: 6, short: 'S', name: 'Sábado' },
];

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

export const isBreak = (block: ScheduleBlock) => block.kind === 'break';

/** The block going on now (a recreo too) and the next class, today. */
export function nowAndNext(blocks: ScheduleBlock[], now = new Date()) {
  const today = blocksOn(blocks, scheduleDay(now));
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
