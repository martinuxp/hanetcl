import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { blocksOn, isBreak, minutesOf, scheduleDay } from './schedule-service';
import type { ScheduleBlock } from './schedule-service';
import type { HomeWidgetProps } from '@/widgets/home-widget';
import type { ExamActivityProps } from '@/widgets/exam-activity';
import type { LiveActivityFactory, Widget } from 'expo-widgets';

// The iPhone's home screen widget and the evaluation's Live Activity
// (widgets/). They exist only in a native build with expo-widgets: in Expo
// Go, on Android and on the web these functions do nothing, and the app
// never loads the widget files there.

export const widgetsAvailable = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoWidgets');

let homeWidget: Widget<HomeWidgetProps> | null = null;
let examActivity: LiveActivityFactory<ExamActivityProps> | null = null;

function home() {
  if (!widgetsAvailable) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where the native module exists
  homeWidget ??= require('@/widgets/home-widget').default as Widget<HomeWidgetProps>;
  return homeWidget;
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

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function examLine(exam: { subject: string; startsAt: number } | null, at: Date) {
  if (!exam || exam.startsAt <= at.getTime()) return '';
  const start = new Date(exam.startsAt);
  const today = new Date(at);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  if (days === 0) return `Prueba de ${exam.subject} hoy, ${time}`;
  if (days === 1) return `Prueba de ${exam.subject} mañana, ${time}`;
  return `Prueba de ${exam.subject} en ${days} días`;
}

/** What the widget shows at a given moment. */
function propsAt(blocks: ScheduleBlock[], at: Date): HomeWidgetProps {
  const exam = examLine(lastExam, at);
  const today = blocksOn(blocks, scheduleDay(at));
  const minute = at.getHours() * 60 + at.getMinutes();
  const current = today.find(block => minutesOf(block.start) <= minute && minute < minutesOf(block.end));
  if (current) return { label: 'Ahora', subject: current.subject, detail: `Hasta las ${current.end}${current.room ? ` · ${current.room}` : ''}`, exam };
  const next = today.find(block => !isBreak(block) && minutesOf(block.start) > minute);
  if (next) return { label: 'Después', subject: next.subject, detail: `${next.start}${next.room ? ` · ${next.room}` : ''}`, exam };
  // The day is over: the first block of the next school day.
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(at);
    day.setDate(day.getDate() + offset);
    const first = blocksOn(blocks, scheduleDay(day)).find(block => !isBreak(block));
    if (first) {
      return { label: offset === 1 ? 'Mañana' : DAY_NAMES[day.getDay()].replace(/^./, letter => letter.toUpperCase()), subject: first.subject, detail: `Entras a las ${first.start}`, exam };
    }
  }
  return { label: 'Hoy', subject: blocks.some(block => !isBreak(block)) ? 'Sin clases' : 'Sin horario', detail: blocks.some(block => !isBreak(block)) ? 'Disfruta el día' : 'Tu curso aún no carga su horario', exam };
}

function publish() {
  const widget = home();
  if (!widget) return;
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
  try {
    widget.updateTimeline([...moments].sort((a, b) => a - b).map(time => ({ date: new Date(time), props: propsAt(blocks, new Date(time)) })));
  } catch (error) {
    console.warn('syncHomeWidget', error instanceof Error ? error.message : error);
  }
}

/** The course's timetable changed or loaded. */
export function syncHomeWidget(blocks: ScheduleBlock[]) {
  lastBlocks = blocks;
  publish();
}

/** The next evaluation of the Calendar, or null when there is none. */
export function syncWidgetExam(exam: { subject: string; startsAt: number } | null) {
  lastExam = exam;
  publish();
}
