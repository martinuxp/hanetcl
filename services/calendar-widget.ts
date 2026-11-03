import { sameSubject } from '@/constants/subjects';
import type { CalendarWidgetProps } from '@/widgets/calendar-widget';
import { blocksOn, isBreak, minutesOf, scheduleDay } from './schedule-service';
import type { ScheduleBlock } from './schedule-service';

// What the Lock Screen widget "Calendar" (widgets/calendar-widget.tsx) shows
// at each moment, like Apple Calendar's "A continuación": the class going on
// or the next one, with what is due in it, and tomorrow's first class once
// the day is over. Same rules as the Calendar's day: Horario blocks with the
// course's events inside them, recreos and almuerzos left out, and an event
// that falls in no class as its own entry.

/** The part of a Calendar event the widget needs (kept ones come back with dates as text). */
export type WidgetEvent = {
  title: string;
  startDate: Date | string;
  endDate?: Date | string;
  subject?: string;
  eventType?: string;
  cancelled?: boolean;
};

type Entry = {
  start: Date;
  end: Date;
  title: string;
  /** "Prueba", "Tarea"... what is due in it; empty for a plain class. */
  tag: string;
};

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const clock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const startOfDay = (date: Date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};
const addDays = (date: Date, days: number) => {
  const day = new Date(date);
  day.setDate(day.getDate() + days);
  return day;
};
const at = (day: Date, time: string) => {
  const moment = new Date(day);
  moment.setHours(0, minutesOf(time), 0, 0);
  return moment;
};

function isTest(event: WidgetEvent) {
  return event.eventType?.toLocaleLowerCase('es').startsWith('evaluación') ?? false;
}

/** "Prueba" for an evaluation, else the first word of its type ("Tarea"). */
function tagOf(events: WidgetEvent[]) {
  if (events.some(isTest)) return 'Prueba';
  const type = events.find(event => event.eventType)?.eventType;
  return type ? type.split(/[.\s]/)[0] : events.length ? 'Evento' : '';
}

/** One day's entries in order: its classes, with the events due in them, and the loose events. */
function dayEntries(blocks: ScheduleBlock[], events: WidgetEvent[], day: Date): Entry[] {
  const classes = blocksOn(blocks, scheduleDay(day)).filter(block => !isBreak(block));
  const next = addDays(day, 1).getTime();
  const todays = events
    .map(event => ({ event, start: new Date(event.startDate), end: event.endDate ? new Date(event.endDate) : null }))
    .filter(({ event, start }) => !event.cancelled && start.getTime() >= day.getTime() && start.getTime() < next);

  const inside = new Map<string, WidgetEvent[]>();
  const loose: Entry[] = [];
  for (const { event, start, end } of todays) {
    const minute = start.getHours() * 60 + start.getMinutes();
    const same = event.subject ? classes.filter(block => sameSubject(block.subject, event.subject)) : [];
    // The block it falls in, or else the first class of that subject that day (as in the Calendar).
    const block = same.find(item => minutesOf(item.start) <= minute && minute < minutesOf(item.end)) ?? same[0];
    if (block) {
      inside.set(block.id, [...(inside.get(block.id) ?? []), event]);
      continue;
    }
    // An all-day event has no time to wait for: the widget leaves it to the app.
    if (minute === 0 && end && end.getTime() - start.getTime() >= 23 * 3_600_000) continue;
    loose.push({ start, end: end && end.getTime() > start.getTime() ? end : start, title: event.title, tag: isTest(event) ? 'Prueba' : '' });
  }

  return [
    ...classes.map(block => ({ start: at(day, block.start), end: at(day, block.end), title: block.subject, tag: tagOf(inside.get(block.id) ?? []) })),
    ...loose,
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
}

function timeText(entry: Entry) {
  return entry.end.getTime() > entry.start.getTime() ? `${clock(entry.start)}–${clock(entry.end)}` : clock(entry.start);
}

/** "Sáb, 31 oct." */
function dateText(date: Date) {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}.`;
}

function withEntry(base: Pick<CalendarWidgetProps, 'weekday' | 'day' | 'testToday'>, when: 'Ahora' | 'Hoy' | 'Mañana', entry: Entry): CalendarWidgetProps {
  const header = entry.tag ? `${when} · ${entry.tag}` : when;
  const inline = when === 'Ahora'
    ? `Hasta las ${clock(entry.end)} · ${entry.title}`
    : `${when === 'Mañana' ? 'Mañana ' : ''}${clock(entry.start)} ${entry.tag === 'Prueba' ? `Prueba de ${entry.title}` : entry.title}`;
  return { ...base, state: 'entry', header, time: timeText(entry), title: entry.title, note: '', inline, test: entry.tag === 'Prueba' };
}

/** What the widget shows at `now`. */
export function calendarWidgetAt(blocks: ScheduleBlock[], events: WidgetEvent[], now: Date): CalendarWidgetProps {
  const today = startOfDay(now);
  const todays = dayEntries(blocks, events, today);
  const base = {
    weekday: DAYS[now.getDay()].toLocaleUpperCase('es'),
    day: String(now.getDate()),
    testToday: todays.some(entry => entry.tag === 'Prueba' && entry.end.getTime() > now.getTime()),
  };

  const current = todays.find(entry => entry.start.getTime() <= now.getTime() && now.getTime() < entry.end.getTime());
  if (current) return withEntry(base, 'Ahora', current);
  const next = todays.find(entry => entry.start.getTime() > now.getTime());
  if (next) return withEntry(base, 'Hoy', next);
  const tomorrow = dayEntries(blocks, events, addDays(today, 1))[0];
  if (tomorrow) return withEntry(base, 'Mañana', tomorrow);

  const date = dateText(now);
  const empty = { ...base, header: date, time: '', test: false };
  if (!blocks.some(block => !isBreak(block)) && !todays.length) {
    return { ...empty, state: 'empty', title: 'Sin horario', note: 'Abre HaNet para cargarlo', inline: 'Sin horario' };
  }
  if (todays.length) {
    // The day is over and tomorrow is free: when classes come back.
    for (let offset = 2; offset <= 7; offset += 1) {
      const first = dayEntries(blocks, events, addDays(today, offset))[0];
      if (first) {
        return { ...empty, state: 'empty', title: 'Sin más clases hoy', note: `El ${DAY_NAMES[first.start.getDay()]} a las ${clock(first.start)}`, inline: 'Sin más clases hoy' };
      }
    }
    return { ...empty, state: 'empty', title: 'Sin más clases hoy', note: 'Tienes el resto del día libre', inline: 'Sin más clases hoy' };
  }
  return { ...empty, state: 'empty', title: 'Sin clases hoy', note: 'Tienes el día libre', inline: 'Sin clases hoy' };
}

/**
 * The widget's timeline: an entry now and at every start and end of a class
 * or event, plus each midnight, for the next week. Opening HaNet rewrites it.
 */
export function calendarWidgetTimeline(blocks: ScheduleBlock[], events: WidgetEvent[], now = new Date()) {
  const moments = new Set<number>([now.getTime()]);
  const today = startOfDay(now);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(today, offset);
    for (const entry of dayEntries(blocks, events, day)) {
      for (const moment of [entry.start, entry.end]) {
        if (moment.getTime() > now.getTime()) moments.add(moment.getTime());
      }
    }
    moments.add(addDays(day, 1).getTime());
  }
  return [...moments]
    .sort((a, b) => a - b)
    .map(time => ({ date: new Date(time), props: calendarWidgetAt(blocks, events, new Date(time)) }));
}
