import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export const HALL_CODE_LENGTH = 6;

export type Hall = {
  id: string;
  subject: string;
  courseId: string;
  teacherName: string;
  theme: string;
  isTeacher: boolean;
  /** Only present for whoever teaches the Hall. */
  code: string | null;
  memberCount: number | null;
  /** The next evaluation still to come, for the card's notice. */
  nextEvaluation?: { title: string; date: number } | null;
};

export type HallAnnouncement = {
  id: string;
  body: string;
  authorName: string;
  /** Milliseconds since epoch; null for a moment right after publishing. */
  createdAt: number | null;
  updatedAt: number | null;
};

/** One row of the specification table: points for knowledge, application and comprehension. */
export type HallEvaluationContent = {
  name: string;
  detail: string;
  con: number;
  apl: number;
  com: number;
};

export type HallEvaluation = {
  id: string;
  title: string;
  /** Milliseconds since epoch. */
  date: number;
  /** Learning objective code, such as "LE2M OA 08". */
  oa: string;
  /** Percentage required to pass, 1 to 100. */
  exigency: number | null;
  contents: HallEvaluationContent[];
  authorName: string;
  updatedAt: number | null;
};

export type HallDetail = {
  hall: Hall;
  announcements: HallAnnouncement[];
  evaluations: HallEvaluation[];
};

export type HallEvaluationInput = {
  hallId: string;
  evaluationId?: string;
  title: string;
  date: number;
  oa: string;
  exigency: number | null;
  contents: HallEvaluationContent[];
};

export type HallPreview = {
  hallId: string;
  subject: string;
  courseId: string;
  alreadyMember: boolean;
};

/** Illustrations a Hall can use as its card; the backend accepts these same ids. */
export const HALL_THEMES = {
  math: require('@/assets/images/ClassHall Themes/Math_thumb.jpg'),
  geometry: require('@/assets/images/ClassHall Themes/Geometry_thumb.jpg'),
  physics: require('@/assets/images/ClassHall Themes/Physics_thumb.jpg'),
  biology: require('@/assets/images/ClassHall Themes/Biology_thumb.jpg'),
  english: require('@/assets/images/ClassHall Themes/English_thumb.jpg'),
  languageArts: require('@/assets/images/ClassHall Themes/LanguageArts_thumb.jpg'),
  writing: require('@/assets/images/ClassHall Themes/Writing_thumb.jpg'),
  socialStudies: require('@/assets/images/ClassHall Themes/SocialStudies_thumb.jpg'),
  geography: require('@/assets/images/ClassHall Themes/Geography_thumb.jpg'),
  read: require('@/assets/images/ClassHall Themes/img_read_thumb.jpg'),
  backToSchool: require('@/assets/images/ClassHall Themes/img_backtoschool_thumb.jpg'),
  hobby: require('@/assets/images/ClassHall Themes/img_hobby_thumb.jpg'),
  gameNight: require('@/assets/images/ClassHall Themes/img_gamenight_thumb.jpg'),
  sailing: require('@/assets/images/ClassHall Themes/img_sailing_thumb.jpg'),
} as const;

export type HallTheme = keyof typeof HALL_THEMES;
export const HALL_THEME_IDS = Object.keys(HALL_THEMES) as HallTheme[];

export function hallThemeImage(theme: string) {
  return HALL_THEMES[theme as HallTheme] ?? HALL_THEMES.backToSchool;
}

export async function listMyHalls() {
  const result = await httpsCallable<void, { halls: Hall[]; canCreate: boolean }>(functions, 'listMyHalls')();
  return result.data;
}

export async function checkHallCode(code: string) {
  const result = await httpsCallable<{ code: string }, HallPreview>(functions, 'checkHallCode')({ code });
  return result.data;
}

export async function joinHall(code: string) {
  const result = await httpsCallable<{ code: string }, { hallId: string; subject: string }>(functions, 'joinHall')({ code });
  return result.data;
}

export async function createHall(subject: string, courseId: string, theme: HallTheme) {
  const result = await httpsCallable<{ subject: string; courseId: string; theme: string }, { hallId: string; code: string }>(functions, 'createHall')({ subject, courseId, theme });
  return result.data;
}

export async function listHallCourses() {
  const result = await httpsCallable<void, { courses: string[] }>(functions, 'listHallCourses')();
  return result.data.courses;
}

// The last Hall opened, so its evaluation and the forms open without another read.
let lastHall: HallDetail | null = null;

export function getLoadedHall(hallId: string) {
  return lastHall?.hall.id === hallId ? lastHall : null;
}

export async function getHall(hallId: string) {
  const result = await httpsCallable<{ hallId: string }, HallDetail>(functions, 'getHall')({ hallId });
  lastHall = result.data;
  return result.data;
}

export async function saveHallAnnouncement(hallId: string, body: string, announcementId?: string) {
  await httpsCallable(functions, 'saveHallAnnouncement')({ hallId, body, announcementId });
}

export async function deleteHallAnnouncement(hallId: string, announcementId: string) {
  await httpsCallable(functions, 'deleteHallAnnouncement')({ hallId, announcementId });
}

export async function saveHallEvaluation(input: HallEvaluationInput) {
  await httpsCallable(functions, 'saveHallEvaluation')(input);
}

export async function deleteHallEvaluation(hallId: string, evaluationId: string) {
  await httpsCallable(functions, 'deleteHallEvaluation')({ hallId, evaluationId });
}

export function evaluationTotal(evaluation: Pick<HallEvaluation, 'contents'>) {
  return evaluation.contents.reduce((sum, row) => sum + row.con + row.apl + row.com, 0);
}

/** The callable's error code without its "functions/" prefix. */
export function hallErrorCode(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return code.replace(/^functions\//, '');
}
