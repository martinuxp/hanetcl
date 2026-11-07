import type { GradeBookSubject, MyGrade } from '@/services/classhall-service';
import { roundGrade } from '@/services/grades';

// Notas: the student's averages by semester, worked out on the phone from
// the grades the teachers published in HaNet. They are approximate: the
// liceo's own averages are the official ones.

export type Period = 1 | 2 | 'year';

/** When a grade counts: its evaluation's date, else when it was published. */
function gradeTime(grade: MyGrade) {
  return grade.date ?? grade.publishedAt ?? 0;
}

/** Chilean school year: March to the winter break is the first semester, August on the second. */
export function semesterOf(time: number): 1 | 2 {
  return new Date(time).getMonth() <= 6 ? 1 : 2;
}

export function currentSemester(now = Date.now()): 1 | 2 {
  return semesterOf(now);
}

/** Only this school year's grades count. */
export function thisYear(grades: MyGrade[], now = Date.now()) {
  const year = new Date(now).getFullYear();
  return grades.filter(grade => new Date(gradeTime(grade)).getFullYear() === year);
}

export function inSemester(grades: MyGrade[], semester: 1 | 2) {
  return grades.filter(grade => semesterOf(gradeTime(grade)) === semester);
}

/** Weighted when every grade has its weight, plain otherwise. */
export function approximateAverage(grades: MyGrade[]) {
  if (!grades.length) return null;
  const weighted = grades.every(grade => grade.weight);
  const total = weighted ? grades.reduce((sum, grade) => sum + (grade.weight ?? 0), 0) : grades.length;
  const sum = grades.reduce((acc, grade) => acc + grade.grade * (weighted ? grade.weight ?? 0 : 1), 0);
  return { value: roundGrade(sum / total), weighted };
}

/**
 * A subject's average for the period, from the grades already uncovered.
 * The year averages the two semesters, as the liceo does.
 */
export function subjectAverage(grades: MyGrade[], period: Period): number | null {
  const seen = thisYear(grades).filter(grade => grade.seen);
  if (period !== 'year') return approximateAverage(inSemester(seen, period))?.value ?? null;
  const halves = [1, 2]
    .map(semester => approximateAverage(inSemester(seen, semester as 1 | 2))?.value)
    .filter((value): value is number => value !== undefined);
  return halves.length ? roundGrade(halves.reduce((sum, value) => sum + value, 0) / halves.length) : null;
}

/** The grades of the period (all of this year for 'year'). */
export function gradesIn(grades: MyGrade[], period: Period) {
  const year = thisYear(grades);
  return period === 'year' ? year : inSemester(year, period);
}

/** The mean of the subjects' averages that have one. */
export function overallAverage(subjects: GradeBookSubject[], period: Period) {
  const averages = subjects
    .map(subject => subjectAverage(subject.grades, period))
    .filter((value): value is number => value !== null);
  return averages.length ? roundGrade(averages.reduce((sum, value) => sum + value, 0) / averages.length) : null;
}
