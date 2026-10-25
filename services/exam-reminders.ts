import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { AGENDA_CHANNEL, ensureChannel, notifications } from './push-service';
import type { CalendarEvent } from './ical-service';
import { examActivities, syncWidgetExam } from './widget-service';

// The course's evaluations, 24 and 4 hours before: on an iPhone with Live
// Activities a countdown on the Lock Screen and in the Dynamic Island (it is
// started when the app opens within those 24 hours, since iOS only lets an
// app start one while it is open), and everywhere a local notification at
// both moments, scheduled on the phone from the Calendar it already loaded.
// Turned off in Configuraciones (only on this phone).

const ENABLED_KEY = 'hanet.examReminders';
const PREFIX = 'exam-';
const AHEAD = [
  { hours: 24, tag: '24h' },
  { hours: 4, tag: '4h' },
];
// Only the next weeks: iOS keeps at most 64 scheduled notifications.
const HORIZON_MS = 21 * 86_400_000;
const LIVE_WINDOW_MS = 24 * 3_600_000;
// The countdown stays up a while after the test starts, then goes away.
const LIVE_LINGER_MS = 30 * 60_000;

export function isEvaluation(event: CalendarEvent) {
  return event.eventType?.toLocaleLowerCase('es').startsWith('evaluación') ?? false;
}

export async function examRemindersEnabled() {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function setExamRemindersEnabled(on: boolean, events?: CalendarEvent[]) {
  await AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0').catch(() => undefined);
  await syncExamReminders(on ? events ?? lastEvents : []);
}

function clock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function subjectOf(event: CalendarEvent) {
  return event.subject || event.title;
}

/** "Mañana, 10:15 · Sala 12" or "Hoy, 10:15". */
function whenText(event: CalendarEvent, now: Date) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(event.startDate).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const day = days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`;
  return `${day}, ${clock(event.startDate)}${event.location ? ` · ${event.location}` : ''}`;
}

let lastEvents: CalendarEvent[] = [];
let running: Promise<void> = Promise.resolve();

/** Reschedules everything from the course's events; safe to call on every load. */
export function syncExamReminders(events: CalendarEvent[]) {
  lastEvents = events;
  // One sync at a time, so two loads in a row do not duplicate notifications.
  running = running.then(() => sync(events)).catch(error => console.warn('syncExamReminders', error instanceof Error ? error.message : error));
  return running;
}

async function sync(events: CalendarEvent[]) {
  const now = new Date();
  const enabled = await examRemindersEnabled();
  const upcoming = enabled
    ? events
      .filter(event => isEvaluation(event) && !event.cancelled && event.startDate.getTime() > now.getTime() && event.startDate.getTime() < now.getTime() + HORIZON_MS)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    : [];

  const next = events.find(event => isEvaluation(event) && !event.cancelled && event.startDate.getTime() > now.getTime());
  syncWidgetExam(next && enabled ? { subject: subjectOf(next), startsAt: next.startDate.getTime() } : null);

  await syncLiveActivity(upcoming, now);
  await scheduleNotifications(upcoming, now);
}

async function scheduleNotifications(upcoming: CalendarEvent[], now: Date) {
  const module = notifications();
  if (!module) return;
  if ((await module.getPermissionsAsync()).status !== 'granted') return;
  await ensureChannel(module);

  const scheduled = await module.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter(request => request.identifier.startsWith(PREFIX))
    .map(request => module.cancelScheduledNotificationAsync(request.identifier)));

  for (const event of upcoming) {
    for (const { hours, tag } of AHEAD) {
      const at = new Date(event.startDate.getTime() - hours * 3_600_000);
      if (at.getTime() <= now.getTime() + 60_000) continue;
      await module.scheduleNotificationAsync({
        identifier: `${PREFIX}${event.id}-${tag}`,
        content: {
          title: hours === 24 ? `Mañana: prueba de ${subjectOf(event)}` : `En 4 horas: prueba de ${subjectOf(event)}`,
          body: `${event.title} · ${clock(event.startDate)}${event.location ? ` · ${event.location}` : ''}`,
          data: { url: `/event-info?id=${encodeURIComponent(event.id)}&canEdit=0` },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: AGENDA_CHANNEL } : {}),
        },
        trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: at, ...(Platform.OS === 'android' ? { channelId: AGENDA_CHANNEL } : {}) },
      });
    }
  }
}

async function syncLiveActivity(upcoming: CalendarEvent[], now: Date) {
  const factory = examActivities();
  if (!factory) return;
  try {
    const soon = upcoming.find(event => event.startDate.getTime() - now.getTime() <= LIVE_WINDOW_MS) ?? null;
    const known = await activityTests();
    const kept: Record<string, string> = {};
    let shown = false;
    for (const instance of factory.getInstances()) {
      // Each one is checked by the test it counts down to.
      const id = instance.getId();
      if (soon && known[id] === soon.id && !shown) {
        shown = true;
        kept[id] = soon.id;
        await instance.update(activityProps(soon, now), new Date(soon.startDate.getTime() + LIVE_LINGER_MS));
      } else {
        await instance.end('immediate');
      }
    }
    if (soon && !shown) {
      const instance = factory.start(activityProps(soon, now), `hanetcl://event-info?id=${encodeURIComponent(soon.id)}&canEdit=0`, new Date(soon.startDate.getTime() + LIVE_LINGER_MS));
      kept[instance.getId()] = soon.id;
    }
    await AsyncStorage.setItem(ACTIVITIES_KEY, JSON.stringify(kept)).catch(() => undefined);
  } catch (error) {
    // Live Activities turned off, or a phone without them: the notifications are enough.
    console.warn('syncLiveActivity', error instanceof Error ? error.message : error);
  }
}

// Which test each running Live Activity counts down to (activity id → event id).
const ACTIVITIES_KEY = 'hanet.examActivities';

async function activityTests(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(ACTIVITIES_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function activityProps(event: CalendarEvent, now: Date) {
  return { id: event.id, subject: subjectOf(event), title: event.title, startsAt: event.startDate.getTime(), when: whenText(event, now) };
}

// Sistema HaNet UI (Panel HNT): the same notification and Live Activity with
// an example test, to check how they look without waiting for a real one.

const PREVIEW_ID = 'preview-exam';

/** The 24 h or 4 h reminder, a few seconds from now. False without permission. */
export async function previewExamReminder(hours: 24 | 4) {
  const module = notifications();
  if (!module) return false;
  let { status } = await module.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await module.requestPermissionsAsync());
  if (status !== 'granted') return false;
  await ensureChannel(module);
  const startsAt = new Date(Date.now() + hours * 3_600_000);
  await module.scheduleNotificationAsync({
    identifier: `${PREVIEW_ID}-${hours}h`,
    content: {
      title: hours === 24 ? 'Mañana: prueba de Matemática' : 'En 4 horas: prueba de Matemática',
      body: `Ejemplo · Funciones cuadráticas · ${clock(startsAt)} · Sala 12`,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: AGENDA_CHANNEL } : {}),
    },
    trigger: { type: module.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, ...(Platform.OS === 'android' ? { channelId: AGENDA_CHANNEL } : {}) },
  });
  return true;
}

/** A Live Activity for an example test in 4 hours; null where they do not exist. */
export function previewExamActivity() {
  const factory = examActivities();
  if (!factory) return null;
  const startsAt = Date.now() + 4 * 3_600_000;
  const instance = factory.start(
    { id: PREVIEW_ID, subject: 'Matemática', title: 'Ejemplo · Funciones cuadráticas', startsAt, when: `Hoy, ${clock(new Date(startsAt))} · Sala 12` },
    undefined,
    new Date(startsAt + LIVE_LINGER_MS),
  );
  return () => void instance.end('immediate');
}

/** The 7:00 summary as it arrives, a few seconds from now (the real one comes from the server). */
export async function previewMorningSummary() {
  const module = notifications();
  if (!module) return false;
  let { status } = await module.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await module.requestPermissionsAsync());
  if (status !== 'granted') return false;
  await ensureChannel(module);
  await module.scheduleNotificationAsync({
    identifier: 'preview-morning',
    content: {
      title: 'Hoy tienes una prueba · lunes (ejemplo)',
      body: 'Prueba: Matemática a las 10:15 · Entras a las 08:00 con Lenguaje',
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: AGENDA_CHANNEL } : {}),
    },
    trigger: { type: module.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, ...(Platform.OS === 'android' ? { channelId: AGENDA_CHANNEL } : {}) },
  });
  return true;
}
