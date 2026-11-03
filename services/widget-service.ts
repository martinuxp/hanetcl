import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { blocksOn, isBreak, minutesOf, scheduleDay } from './schedule-service';
import type { ScheduleBlock } from './schedule-service';
import { calendarWidgetTimeline } from './calendar-widget';
import type { WidgetEvent } from './calendar-widget';
import type { CalendarWidgetProps } from '@/widgets/calendar-widget';
import type { HomeWidgetProps } from '@/widgets/home-widget';
import type { HomeWidgetAndroidProps } from '@/widgets/home-widget.android';
import type { ExamActivityProps } from '@/widgets/exam-activity';
import type { LiveActivityFactory, Widget } from 'expo-widgets';
import { t, weekdays } from '@/i18n';

// The iPhone's home screen widget and the evaluation's Live Activity, and the
// Android home screen widget (widgets/). They exist only in a native build
// with expo-widgets: in Expo Go and on the web these functions do nothing, and
// the app never loads the widget files there. On Android there is only "HaNet
// hoy" (widgets/home-widget.android.tsx, which Metro picks for the same import).

const widgetsModule = Platform.OS === 'ios' || Platform.OS === 'android'
  ? requireOptionalNativeModule<{ widgetsDirectory?: string | null }>('ExpoWidgets')
  : null;

/** The iPhone's widgets and Live Activity. */
export const widgetsAvailable = Platform.OS === 'ios' && !!widgetsModule;

/** The Android home screen widget. */
export const androidWidgetAvailable = Platform.OS === 'android' && !!widgetsModule;

/**
 * Whether the app reaches the App Group it shares with the widget. Without it
 * (a build re-signed with a certificate that has no App Groups) the widget
 * keeps its first layout and the Live Activity shows up empty.
 */
export const widgetsShareData = widgetsAvailable && !!widgetsModule?.widgetsDirectory;

let homeWidget: Widget<HomeWidgetProps> | null = null;
let androidHomeWidget: Widget<HomeWidgetAndroidProps> | null = null;
let calendarWidget: Widget<CalendarWidgetProps> | null = null;
let examActivity: LiveActivityFactory<ExamActivityProps> | null = null;

function home() {
  if (!widgetsAvailable) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where the native module exists
  homeWidget ??= require('@/widgets/home-widget').default as Widget<HomeWidgetProps>;
  return homeWidget;
}

function androidHome() {
  if (!androidWidgetAvailable) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves it to home-widget.android.tsx
  androidHomeWidget ??= require('@/widgets/home-widget').default as Widget<HomeWidgetAndroidProps>;
  return androidHomeWidget;
}

function calendar() {
  if (!widgetsAvailable) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where the native module exists
  calendarWidget ??= require('@/widgets/calendar-widget').default as Widget<CalendarWidgetProps>;
  return calendarWidget;
}

export function examActivities() {
  if (!widgetsAvailable) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where the native module exists
  examActivity ??= require('@/widgets/exam-activity').default as LiveActivityFactory<ExamActivityProps>;
  return examActivity;
}

// What the widget last got, so the timetable and the exam can arrive apart.
let lastBlocks: ScheduleBlock[] | null = null;
let lastExam: { subject: string; startsAt: number } | null = null;
let lastEvents: WidgetEvent[] | null = null;

const DAY_NAMES = weekdays();

function examLine(exam: { subject: string; startsAt: number } | null, at: Date) {
  if (!exam || exam.startsAt <= at.getTime()) return '';
  const start = new Date(exam.startsAt);
  const today = new Date(at);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  if (days === 0) return t('services.widgetService.pruebaDeSubjectHoyTime', { subject: exam.subject, time });
  if (days === 1) return t('services.widgetService.pruebaDeSubjectMananaTime', { subject: exam.subject, time });
  return t('services.widgetService.pruebaDeSubjectEnDays', { subject: exam.subject, days });
}

/** What the widget shows at a given moment. */
function propsAt(blocks: ScheduleBlock[], at: Date): HomeWidgetProps {
  const exam = examLine(lastExam, at);
  const today = blocksOn(blocks, scheduleDay(at));
  const minute = at.getHours() * 60 + at.getMinutes();
  const current = today.find(block => minutesOf(block.start) <= minute && minute < minutesOf(block.end));
  if (current) return { label: t('common.ahora'), subject: current.subject, detail: t('common.hastaLasEndValue', { end: current.end, value: current.room ? ` · ${current.room}` : '' }), exam };
  const next = today.find(block => !isBreak(block) && minutesOf(block.start) > minute);
  if (next) return { label: t('common.despues'), subject: next.subject, detail: `${next.start}${next.room ? ` · ${next.room}` : ''}`, exam };
  // The day is over: the first block of the next school day.
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(at);
    day.setDate(day.getDate() + offset);
    const first = blocksOn(blocks, scheduleDay(day)).find(block => !isBreak(block));
    if (first) {
      return { label: offset === 1 ? t('common.manana') : DAY_NAMES[day.getDay()].replace(/^./, letter => letter.toUpperCase()), subject: first.subject, detail: t('services.widgetService.entrasALasStart', { start: first.start }), exam };
    }
  }
  return { label: t('common.hoy2'), subject: blocks.some(block => !isBreak(block)) ? t('services.widgetService.sinClases') : t('services.widgetService.sinHorario'), detail: blocks.some(block => !isBreak(block)) ? t('services.widgetService.disfrutaElDia') : t('services.widgetService.tuCursoAunNoTiene'), exam };
}

function publish() {
  let widget: Widget<HomeWidgetProps> | null;
  let androidWidget: Widget<HomeWidgetAndroidProps> | null;
  try {
    widget = home();
    androidWidget = androidHome();
  } catch (error) {
    // The widget never stops the reminders that come right after it.
    console.warn('syncHomeWidget', error instanceof Error ? error.message : error);
    return;
  }
  if (!widget && !androidWidget) return;
  const blocks = lastBlocks ?? [];
  const now = new Date();
  // A change at every start and end of a block, today and tomorrow.
  const moments = new Set<number>([now.getTime()]);
  for (const offset of [0, 1]) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    for (const block of blocksOn(blocks, scheduleDay(day))) {
      for (const time of [block.start, block.end]) {
        const moment = new Date(day);
        const [hours, minutes] = time.split(':').map(Number);
        moment.setHours(hours, minutes, 0, 0);
        if (moment.getTime() > now.getTime()) moments.add(moment.getTime());
      }
    }
    const midnight = new Date(day);
    midnight.setHours(24, 0, 0, 0);
    moments.add(midnight.getTime());
  }
  const times = [...moments].sort((a, b) => a - b);
  try {
    widget?.updateTimeline(times.map(time => ({ date: new Date(time), props: propsAt(blocks, new Date(time)) })));
    // Android has no timeline: the widget gets every moment and picks the one
    // that applies whenever it redraws.
    androidWidget?.updateSnapshot({ entries: times.map(time => ({ at: time, ...propsAt(blocks, new Date(time)) })) });
  } catch (error) {
    console.warn('syncHomeWidget', error instanceof Error ? error.message : error);
  }
}

/** The Lock Screen "Calendar": the week's classes with the course's events inside them. */
function publishCalendar() {
  // Without the timetable it would say "Sin horario" for a moment: it waits for it.
  if (!lastBlocks) return;
  try {
    const widget = calendar();
    widget?.updateTimeline(calendarWidgetTimeline(lastBlocks, lastEvents ?? []));
  } catch (error) {
    console.warn('syncCalendarWidget', error instanceof Error ? error.message : error);
  }
}

/** The course's timetable changed or loaded. */
export function syncHomeWidget(blocks: ScheduleBlock[]) {
  lastBlocks = blocks;
  publish();
  publishCalendar();
}

/** The course's Calendar events loaded (all of them, not only the tests). */
export function syncCalendarWidget(events: WidgetEvent[]) {
  lastEvents = events;
  publishCalendar();
}

/** The next evaluation of the Calendar, or null when there is none. */
export function syncWidgetExam(exam: { subject: string; startsAt: number } | null) {
  lastExam = exam;
  publish();
}
