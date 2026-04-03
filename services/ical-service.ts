import { collection, query, getDocs, orderBy } from 'firebase/firestore';
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
  subject?: string;
  eventType?: string;
  outstanding: boolean;
  cancelled: boolean;
}

export async function fetchCalendarEvents(courseId: string): Promise<CalendarEvent[]> {
  try {
    const q = query(collection(calendarDb, `HNC-LCH.${courseId}`), orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      // Use createdAt as fallback startDate if date format missing
      const startDateObj = data.createdAt ? data.createdAt.toDate() : new Date();

      return {
        id: doc.id,
        title: data.title || 'Sin título',
        startDate: startDateObj,
        endDate: new Date(startDateObj.getTime() + 60 * 60 * 1000), // Default 1hr
        description: data.description || 'No hay descripción disponible.',
        location: data.location,
        writer: data.authorName,
        verified: data.verified || false,
        verifier: data.verifier,
        subject: data.subject,
        eventType: data.type,
        outstanding: data.outstanding || false,
        cancelled: data.title?.toUpperCase().includes('CANCELADA') || false,
      };
    });
  } catch (error) {
    console.error('Error fetching Firebase events:', error);
    return [];
  }
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

export function getWeekDays(weekStartDate: Date): { dayName: string; date: number; fullDate: string; dateObj: Date }[] {
  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dCopy = new Date(d);
    dCopy.setHours(0, 0, 0, 0);

    let prefix = '';
    if (dCopy.getTime() === today.getTime()) prefix = 'Hoy, ';
    else if (dCopy.getTime() === today.getTime() + 86400000) prefix = 'Mañana, ';

    const fullDate = `${prefix}${d.getDate()} de ${monthNames[d.getMonth()]}, ${d.getFullYear()}`;

    days.push({
      dayName: dayNames[d.getDay()],
      date: d.getDate(),
      fullDate,
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
