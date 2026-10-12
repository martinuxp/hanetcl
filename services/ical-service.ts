import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { calendarDb } from './firebase';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  description: string;
  location?: string;
  // Metadata fields
  writer?: string;
  verified: boolean;
  verifier?: string;
  /** The directiva asked a teacher to confirm it. */
  verificationRequested?: boolean;
  subject?: string;
  eventType?: string;
  outstanding: boolean;
  cancelled: boolean;
  /** Set when a teacher published it from ClassHall; nobody edits it from the calendar. */
  hallId?: string;
  evaluationId?: string;
  /** A task of that Hall. */
  taskId?: string;
}

function toDate(value: unknown, fallback: Date) {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function toCalendarEvent(id: string, data: DocumentData): CalendarEvent {
  const createdAt = toDate(data.createdAt, new Date(0));
  const startDate = toDate(data.startDate, createdAt.getTime() ? createdAt : new Date());
  const endDate = toDate(data.endDate, new Date(startDate.getTime() + 90 * 60 * 1000));

  return {
    id,
    title: data.title || 'Sin título',
    startDate,
    endDate,
    description: data.description || 'No hay descripción disponible.',
    location: data.location,
    writer: data.authorName,
    verified: data.verified || false,
    verifier: data.verifier,
    verificationRequested: data.verificationRequested === true,
    subject: data.subject,
    eventType: data.type,
    outstanding: data.outstanding || false,
    // Older events were cancelled by renaming them.
    cancelled: data.cancelled === true || data.title?.toUpperCase().includes('CANCELADA') || false,
    hallId: data.source === 'classhall' && typeof data.hallId === 'string' ? data.hallId : undefined,
    evaluationId: typeof data.evaluationId === 'string' ? data.evaluationId : undefined,
    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
  };
}

// Events already loaded by the calendar, so the detail screen can open one by
// id without another read.
const loadedEvents = new Map<string, CalendarEvent>();

export function getLoadedCalendarEvent(id: string): CalendarEvent | undefined {
  return loadedEvents.get(id);
}

// Throws on failure: an empty list means the course really has no events.
export async function fetchCalendarEvents(courseId: string): Promise<CalendarEvent[]> {
  const snapshot = await getDocs(collection(calendarDb, `HNC-LCH.${courseId}`));
  const events = snapshot.docs
    .map(eventDoc => toCalendarEvent(eventDoc.id, eventDoc.data()))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  events.forEach(event => loadedEvents.set(event.id, event));
  return events;
}

export async function fetchCalendarEvent(courseId: string, eventId: string): Promise<CalendarEvent | null> {
  const snapshot = await getDoc(doc(calendarDb, `HNC-LCH.${courseId}`, eventId));
  if (!snapshot.exists()) return null;

  const event = toCalendarEvent(snapshot.id, snapshot.data());
  loadedEvents.set(event.id, event);
  return event;
}

/** Moves the event to a new start, keeping its duration. */
export async function rescheduleCalendarEvent(courseId: string, event: CalendarEvent, startDate: Date): Promise<CalendarEvent | null> {
  const duration = event.endDate.getTime() - event.startDate.getTime();
  await updateDoc(doc(calendarDb, `HNC-LCH.${courseId}`, event.id), {
    startDate,
    endDate: new Date(startDate.getTime() + duration),
    updatedAt: serverTimestamp(),
  });
  return fetchCalendarEvent(courseId, event.id);
}

export async function setCalendarEventCancelled(courseId: string, eventId: string, cancelled: boolean): Promise<CalendarEvent | null> {
  await updateDoc(doc(calendarDb, `HNC-LCH.${courseId}`, eventId), {
    cancelled,
    updatedAt: serverTimestamp(),
  });
  return fetchCalendarEvent(courseId, eventId);
}

export async function deleteCalendarEvent(courseId: string, eventId: string): Promise<void> {
  await deleteDoc(doc(calendarDb, `HNC-LCH.${courseId}`, eventId));
  loadedEvents.delete(eventId);
}

/**
 * Get events for a specific date.
 * cal-parser with TZID returns dates as local-times-as-UTC,
 * so we compare using UTC date components.
 */
export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth();
  const targetDay = date.getDate();

  return events.filter(event => {
    const s = new Date(event.startDate);
    return s.getFullYear() === targetYear &&
           s.getMonth() === targetMonth &&
           s.getDate() === targetDay;
  });
}

export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** "Hoy, 12 de Marzo, 2026" — the prefix only appears for today and tomorrow. */
export function formatLongDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);

  const prefix = diffDays === 0 ? 'Hoy, ' : diffDays === 1 ? 'Mañana, ' : '';
  return `${prefix}${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}, ${date.getFullYear()}`;
}

/** "1 hora y 30 minutos" */
export function formatDuration(start: Date, end: Date): string {
  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
  return parts.join(' y ');
}

export function getWeekDays(weekStartDate: Date): { dayName: string; date: number; fullDate: string; dateObj: Date }[] {
  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);


    days.push({
      dayName: dayNames[d.getDay()],
      date: d.getDate(),
      fullDate: formatLongDate(d),
      dateObj: d,
    });
  }
  return days;
}

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
