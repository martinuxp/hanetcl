import type { User } from 'firebase/auth';
import { claimedCourse } from './auth-service';
import { syncExamReminders } from './exam-reminders';
import { fetchCalendarEvents, restoreCalendarEvents } from './ical-service';
import { getCourseSchedule, restoreCourseSchedule } from './schedule-service';
import { syncHomeWidget } from './widget-service';

// Opening HaNet (and coming back to it) brings the phone's own copies up to
// date: the evaluation reminders and the Live Activity from the course's
// Calendar, and the widget from the timetable. What the phone kept goes
// first, so a phone without signal still gets them right.

let lastRun = 0;
// Coming back to the app within a minute does not read everything again.
const MIN_GAP_MS = 60_000;

export async function refreshDayWidgets(user: User) {
  const now = Date.now();
  if (now - lastRun < MIN_GAP_MS) return;
  lastRun = now;
  try {
    const courseId = await claimedCourse(user);
    if (!courseId) return;
    const [keptEvents, keptSchedule] = await Promise.all([restoreCalendarEvents(courseId), restoreCourseSchedule()]);
    if (keptEvents) void syncExamReminders(keptEvents);
    if (keptSchedule) syncHomeWidget(keptSchedule.blocks);
    const [events, schedule] = await Promise.allSettled([fetchCalendarEvents(courseId), getCourseSchedule()]);
    if (events.status === 'fulfilled') void syncExamReminders(events.value);
    if (schedule.status === 'fulfilled') syncHomeWidget(schedule.value.blocks);
  } catch (error) {
    console.warn('refreshDayWidgets', error instanceof Error ? error.message : error);
  }
}
