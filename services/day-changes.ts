import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { DayChange } from './schedule-service';

// Suspensions of classes and early dismissals (functions/day-changes.js). Only
// the school's administration and HNT set them; the evaluations of the lost
// hours move by themselves to the next class of the same subject.

export type DayChangeInput = {
  kind: DayChange['kind'];
  from: string;
  to: string;
  endsAt: string | null;
  scope: DayChange['scope'];
  courses: string[];
  reason: string;
  notify: boolean;
};

export type DayChangePlan = {
  /** Evaluations that move, and where to (ms). */
  moves: { title: string; subject: string; from: number; to: number }[];
  /** Evaluations with no next class in the timetable: they stay where they are. */
  unmoved: { title: string; subject: string; at: number }[];
  /** Accounts it reaches. */
  reach: number;
};

export type ListedDayChange = DayChange & { moved: number; unmoved: number };

export async function listDayChanges() {
  const result = await httpsCallable<Record<string, never>, { changes: ListedDayChange[]; courses: string[] }>(functions, 'listDayChanges')({});
  return result.data;
}

/** What the change would move and whom it reaches, without saving it. */
export async function previewDayChange(input: DayChangeInput) {
  const result = await httpsCallable<DayChangeInput & { dryRun: true }, DayChangePlan>(functions, 'saveDayChange')({ ...input, dryRun: true });
  return result.data;
}

export async function saveDayChange(input: DayChangeInput) {
  const result = await httpsCallable<DayChangeInput, DayChangePlan & { id: string }>(functions, 'saveDayChange')(input);
  return result.data;
}

/** Takes a change back; the evaluations it moved go back to their date. */
export async function deleteDayChange(id: string, notify: boolean) {
  const result = await httpsCallable<{ id: string; notify: boolean }, { restored: number }>(functions, 'deleteDayChange')({ id, notify });
  return result.data;
}
