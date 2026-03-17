const ical = require('cal-parser');

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  description: string;
  location?: string;
  // Metadata from description variables
  writer?: string;
  verified: boolean;
  verifier?: string;
  subject?: string;
  eventType?: string;
  outstanding: boolean;
  cancelled: boolean;
}

const ICAL_URL = 'https://calendar.google.com/calendar/ical/087dacadb902e1f2f2102dd67c7a2f1190e0b9232daf98979ff2e4389469227a%40group.calendar.google.com/public/basic.ics';

/**
 * Parse metadata variables from the event description.
 * Format: {verified=0, verifier=, writer=Martín Ávila, subject=quimica, type=taller.evaluado, outstanding=1}
 * 
 * - verified: 1 = verified by teacher, 0 = not
 * - verifier: teacher name (empty if not verified)
 * - writer: who created the event (directiva member or teacher)
 * - subject: school subject (quimica, lenguaje, etc.)
 * - type: event type (evaluacion.sumativa, evaluacion.formativa, tarea, taller, taller.evaluado, etc.)
 * - outstanding: 1 = highlighted (green), 0 = normal (gray)
 * 
 * The entire {…} block is stripped from the displayed description.
 */
function parseDescriptionVariables(rawDescription: string): {
  cleanDescription: string;
  writer?: string;
  verified: boolean;
  verifier?: string;
  subject?: string;
  eventType?: string;
  outstanding: boolean;
} {
  let desc = rawDescription || '';
  let writer: string | undefined;
  let verified = false;
  let verifier: string | undefined;
  let subject: string | undefined;
  let eventType: string | undefined;
  let outstanding = false;

  // Strip ALL HTML tags first, before anything else
  desc = desc.replace(/<br\s*\/?>/gi, '\n');
  desc = desc.replace(/<[^>]*>/g, '');
  desc = desc.replace(/&amp;/g, '&');
  desc = desc.replace(/&lt;/g, '<');
  desc = desc.replace(/&gt;/g, '>');
  desc = desc.replace(/&quot;/g, '"');
  desc = desc.replace(/&#39;/g, "'");

  // Now match the {key=value, key=value, ...} block (HTML-free)
  const varsMatch = desc.match(/\{([^}]+)\}/);
  if (varsMatch) {
    const varsString = varsMatch[1];
    desc = desc.replace(varsMatch[0], '');

    const pairs = varsString.split(',');
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) continue;
      const key = pair.substring(0, eqIndex).trim().toLowerCase();
      const value = pair.substring(eqIndex + 1).trim();

      switch (key) {
        case 'verified':
          verified = value === '1';
          break;
        case 'verifier':
          verifier = value || undefined;
          break;
        case 'writer':
          writer = value || undefined;
          break;
        case 'subject':
          subject = value || undefined;
          break;
        case 'type':
          eventType = value || undefined;
          break;
        case 'outstanding':
          outstanding = value === '1';
          break;
      }
    }
  }

  // Clean up leftover whitespace
  desc = desc.replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanDescription: desc || 'No hay información disponible',
    writer,
    verified,
    verifier,
    subject,
    eventType,
    outstanding,
  };
}

export async function fetchCalendarEvents(url: string = ICAL_URL): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(url);
    const icsText = await response.text();
    const parsed = ical.parseString(icsText);

    if (!parsed.events || parsed.events.length === 0) {
      return [];
    }

    return parsed.events.map((event: any, index: number) => {
      const rawTitle = event.summary?.value || 'Sin título';
      const startDate = event.dtstart?.value ? new Date(event.dtstart.value) : new Date();
      const endDate = event.dtend?.value ? new Date(event.dtend.value) : startDate;
      const rawDescription = event.description?.value || '';
      const location = event.location?.value || undefined;
      const id = event.uid?.value || `event-${index}`;

      const vars = parseDescriptionVariables(rawDescription);

      const cancelled =
        rawTitle.toUpperCase().includes('SUSPENDIDO') ||
        rawTitle.toUpperCase().includes('[CANCELADA]') ||
        rawTitle.toUpperCase().includes('CANCELADA');

      return {
        id,
        title: rawTitle.replace(/\[CANCELADA\]/gi, '').trim(),
        startDate,
        endDate,
        description: vars.cleanDescription,
        location,
        writer: vars.writer,
        verified: vars.verified,
        verifier: vars.verifier,
        subject: vars.subject,
        eventType: vars.eventType,
        outstanding: vars.outstanding,
        cancelled,
      };
    }).sort((a: CalendarEvent, b: CalendarEvent) => a.startDate.getTime() - b.startDate.getTime());
  } catch (error) {
    console.error('Error fetching iCal events:', error);
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
    return s.getUTCFullYear() === targetYear &&
           s.getUTCMonth() === targetMonth &&
           s.getUTCDate() === targetDay;
  });
}

export function formatTime(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
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
