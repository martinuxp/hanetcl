import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { claimedCourse, useSession } from '@/services/auth-service';
import { restoreCached } from '@/services/cache';
import { listEvents } from '@/services/events-service';
import type { EventList, HnEvent } from '@/services/events-service';
import { fetchCalendarEvents, restoreCalendarEvents } from '@/services/ical-service';
import type { CalendarEvent } from '@/services/ical-service';

// What the Home tiles point at (Figma "[home] beta", 10587:1792): the
// course's next evaluation on the Calendario tile and an event of the city
// on the Eventos one. Both come from real data; with nothing to show, the
// tile stays plain.

export type NextCalendarItem = { event: CalendarEvent; days: number; isEvaluation: boolean };

const DAY = 86_400_000;

function daysUntil(date: Date, now: Date) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date).setHours(0, 0, 0, 0) - today.getTime()) / DAY);
}

const isEvaluation = (event: CalendarEvent) => event.eventType?.toLocaleLowerCase('es').startsWith('evaluación') ?? false;

/** The next evaluation; without one, the next thing on the course's agenda. */
export function pickNextCalendarItem(events: CalendarEvent[], now = new Date()): NextCalendarItem | null {
  const upcoming = events.filter(event => !event.cancelled && event.endDate.getTime() >= now.getTime());
  const event = upcoming.find(isEvaluation) ?? upcoming[0];
  if (!event) return null;
  return { event, days: Math.max(0, daysUntil(event.startDate, now)), isEvaluation: isEvaluation(event) };
}

/** What sponsors pay for first; else what comes soonest. */
export function pickPromotedEvent(events: HnEvent[], now = Date.now()) {
  const upcoming = events.filter(event => (event.endsAt ?? event.startsAt) >= now);
  return upcoming.find(event => event.sponsored) ?? upcoming[0] ?? null;
}

export function useHomeHighlights() {
  const { user } = useSession();
  const [calendar, setCalendar] = useState<{ uid: string; item: NextCalendarItem | null } | null>(null);
  const [promo, setPromo] = useState<{ uid: string; event: HnEvent | null } | null>(null);
  // Which account each tile has finished loading for, failed or not: the
  // launch splash waits on both.
  const [settled, setSettled] = useState<{ calendar?: string; promo?: string }>({});

  // Reloaded on every visit; what was there stays while it loads, and a
  // failed read just leaves the tile plain. What the phone kept from last
  // time counts as loaded, so the splash does not wait on the network.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      const settle = (tile: 'calendar' | 'promo') => {
        if (active) setSettled(current => ({ ...current, [tile]: user.uid }));
      };

      claimedCourse(user)
        .then(courseId => {
          if (!courseId) return [];
          void restoreCalendarEvents(courseId).then(kept => {
            if (!active || !kept) return;
            setCalendar(current => current?.uid === user.uid ? current : { uid: user.uid, item: pickNextCalendarItem(kept) });
            settle('calendar');
          });
          return fetchCalendarEvents(courseId);
        })
        .then(events => { if (active) setCalendar({ uid: user.uid, item: pickNextCalendarItem(events) }); })
        .catch(() => undefined)
        .finally(() => settle('calendar'));

      void restoreCached<EventList>('events:regional').then(kept => {
        if (!active || !kept) return;
        setPromo(current => current?.uid === user.uid ? current : { uid: user.uid, event: pickPromotedEvent(kept.events) });
        settle('promo');
      });
      listEvents('regional')
        .then(list => { if (active) setPromo({ uid: user.uid, event: pickPromotedEvent(list.events) }); })
        .catch(() => undefined)
        .finally(() => settle('promo'));

      return () => { active = false; };
    }, [user])
  );

  return {
    nextCalendarItem: user && calendar?.uid === user.uid ? calendar.item : null,
    promotedEvent: user && promo?.uid === user.uid ? promo.event : null,
    loaded: !!user && settled.calendar === user.uid && settled.promo === user.uid,
  };
}
