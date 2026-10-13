import * as DocumentPicker from 'expo-document-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { auth, functions, storage } from './firebase';
import type { HallPlan } from '@/constants/subjects';

export const HALL_CODE_LENGTH = 6;

export type Hall = {
  id: string;
  subject: string;
  courseId: string;
  teacherName: string;
  theme: string;
  /** Plan común (the whole course is in), electivo or dominio (joined with the code). */
  plan: HallPlan;
  isTeacher: boolean;
  /** Only present for whoever teaches the Hall. */
  code: string | null;
  memberCount: number | null;
  /** The teacher's blobatar seed (getHall only). */
  teacherAvatarSeed?: string | null;
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

/** One row of the specification table: points per skill column, in the table's order. */
export type HallEvaluationContent = {
  name: string;
  detail: string;
  points: number[];
};

/** A learning objective: its code ("OA 3") and, if the teacher wrote it, its text. */
export type HallObjective = { code: string; text: string };

/** The usual skill columns; each table can name its own. */
export const DEFAULT_SKILLS = ['Conocimiento', 'Aplicación', 'Comprensión'];

export type HallEvaluation = {
  id: string;
  title: string;
  /** Milliseconds since epoch. */
  date: number;
  /** Percentage required to pass, 1 to 100. */
  exigency: number | null;
  /** Names of the skill columns. */
  skills: string[];
  contents: HallEvaluationContent[];
  objectives: HallObjective[];
  /** "Cómo prepararse": notes, materials and pages to study. */
  prep: string;
  authorName: string;
  updatedAt: number | null;
};

/** An event of the course Calendar about the Hall's subject, written by the course. */
export type HallCourseEvent = {
  id: string;
  title: string;
  type: string;
  startDate: number;
  cancelled: boolean;
  authorName: string;
  verified?: boolean;
  verifier?: string | null;
  /** The directiva asked a teacher to confirm it. */
  verificationRequested?: boolean;
};

export type HallDocumentKind = 'pdf' | 'word' | 'powerpoint' | 'excel' | 'image' | 'file';

/** A file the teacher shared in the Hall; `url` opens it (only members get it). */
export type HallDocument = {
  id: string;
  name: string;
  kind: HallDocumentKind;
  size: number;
  url: string;
  authorName: string;
  /** Attached to this announcement. */
  announcementId: string | null;
  /** The specification table (T.E.) of this evaluation. */
  evaluationId: string | null;
  /** Material of this task. */
  taskId?: string | null;
  createdAt: number | null;
};

export type HallTask = {
  id: string;
  title: string;
  instructions: string;
  /** Milliseconds since epoch: until when it can be handed in. */
  dueAt: number;
  /** Still takes submissions after the due date, marked as late. */
  acceptLate: boolean;
  authorName: string;
  createdAt: number | null;
  updatedAt: number | null;
};

/** A task as the Hall lists it, with how it stands for whoever looks. */
export type HallTaskSummary = HallTask & {
  /** For the teacher: how many handed it in. */
  submittedCount?: number;
  /** For a student: their submission, or null if they have not handed it in. */
  mySubmission?: { submittedAt: number | null; late: boolean; reviewed: boolean } | null;
};

export type SubmissionItem =
  | { id: string; kind: 'link'; name: string; url: string }
  | { id: string; kind: 'file'; name: string; fileKind: HallDocumentKind; size: number; url: string };

export type HallSubmission = {
  uid: string;
  studentName: string;
  courseId: string;
  items: SubmissionItem[];
  note: string;
  submittedAt: number | null;
  late: boolean;
  reviewed: boolean;
  /** The teacher's comment. */
  feedback: string;
  reviewedAt: number | null;
  /** The student's blobatar seed (for the teacher). */
  avatarSeed?: string | null;
};

export type HallTaskDetail = {
  task: HallTask;
  attachment: HallDocument | null;
  subject: string;
  isTeacher: boolean;
  /** For a student. */
  mySubmission?: HallSubmission | null;
  /** For the teacher. */
  submissions?: HallSubmission[];
  expectedSubmissions?: number;
};

export type HallDetail = {
  hall: Hall;
  announcements: HallAnnouncement[];
  evaluations: HallEvaluation[];
  courseEvents?: HallCourseEvent[];
  documents?: HallDocument[];
  tasks?: HallTaskSummary[];
  /** For the teacher: students the Hall counts on. */
  expectedSubmissions?: number | null;
};

export type HallEvaluationInput = {
  hallId: string;
  evaluationId?: string;
  /** A course Calendar event this evaluation takes over (it replaces it there). */
  calendarEventId?: string;
  title: string;
  date: number;
  exigency: number | null;
  skills: string[];
  contents: HallEvaluationContent[];
  objectives: HallObjective[];
  prep: string;
};

export type HallPreview = {
  hallId: string;
  subject: string;
  courseId: string;
  plan?: HallPlan;
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

export async function createHall(subject: string, courseId: string, theme: HallTheme, plan: HallPlan) {
  const result = await httpsCallable<{ subject: string; courseId: string; theme: string; plan: HallPlan }, { hallId: string; code: string }>(functions, 'createHall')({ subject, courseId, theme, plan });
  return result.data;
}

export async function updateHall(hallId: string, subject: string, theme: HallTheme, plan: HallPlan) {
  const result = await httpsCallable<{ hallId: string; subject: string; theme: string; plan: HallPlan }, { hallId: string; subject: string; theme: string }>(functions, 'updateHall')({ hallId, subject, theme, plan });
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
  const result = await httpsCallable<{ hallId: string; body: string; announcementId?: string }, { announcementId: string }>(functions, 'saveHallAnnouncement')({ hallId, body, announcementId });
  return result.data.announcementId;
}

// What a Hall accepts: PDF, Word, PowerPoint, Excel and images, up to 10 MB.
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
const ACCEPTED_TYPES = [...new Set(Object.values(MIME_BY_EXTENSION))];

export type PickedDocument = { uri: string; name: string; mimeType: string; size: number; file?: File };

export class DocumentError extends Error {}

// What the T.E. scanner reads: PDF with text, Word (.docx) and photos.
const SCAN_TYPES = [MIME_BY_EXTENSION.pdf, MIME_BY_EXTENSION.docx, MIME_BY_EXTENSION.jpg, MIME_BY_EXTENSION.png];

/** Lets the teacher choose a file; null when they cancel. Throws DocumentError for a file the Hall (or the scanner) does not take. */
export async function pickHallDocument(purpose: 'document' | 'scan' = 'document'): Promise<PickedDocument | null> {
  const accepted = purpose === 'scan' ? SCAN_TYPES : ACCEPTED_TYPES;
  const result = await DocumentPicker.getDocumentAsync({ type: accepted, copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = accepted.includes(asset.mimeType ?? '') ? asset.mimeType as string : MIME_BY_EXTENSION[extension];
  if (!mimeType || !accepted.includes(mimeType)) {
    throw new DocumentError(purpose === 'scan'
      ? 'Para escanear, elige la tabla en PDF, Word (.docx) o una foto.'
      : 'Ese tipo de archivo no se puede subir. Usa PDF, Word, PowerPoint, Excel o una imagen.');
  }
  if ((asset.size ?? 0) > MAX_DOCUMENT_BYTES) throw new DocumentError('El archivo pesa más de 10 MB.');
  return { uri: asset.uri, name: asset.name, mimeType, size: asset.size ?? 0, file: asset.file };
}

type Attach = { announcementId?: string; evaluationId?: string; taskId?: string };

/** A file in the teacher's upload folder, not yet in any Hall. */
export type StagedDocument = { uploadPath: string; name: string };

async function stageDocument(picked: PickedDocument): Promise<StagedDocument> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new DocumentError('Inicia sesión para subir documentos.');
  const blob = picked.file ?? await (await fetch(picked.uri)).blob();
  const uploadPath = `classhall-uploads/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadBytes(ref(storage, uploadPath), blob, { contentType: picked.mimeType });
  return { uploadPath, name: picked.name };
}

/** Moves an uploaded file into the Hall, optionally attached to an announcement or as an evaluation's T.E. */
export async function attachStagedDocument(hallId: string, staged: StagedDocument, attach: Attach = {}) {
  const result = await httpsCallable<object, HallDocument>(functions, 'attachHallDocument')({ hallId, uploadPath: staged.uploadPath, name: staged.name, ...attach });
  return result.data;
}

/** Uploads a picked file and shares it in the Hall. */
export async function uploadHallDocument(hallId: string, picked: PickedDocument, attach: Attach = {}) {
  return attachStagedDocument(hallId, await stageDocument(picked), attach);
}

/** What the scanner read from a specification table; the teacher reviews it before saving. */
export type SpecTableDraft = {
  title: string;
  /** The day as "YYYY-MM-DD", or null when the table has no date. */
  date: string | null;
  exigency: number | null;
  objectives: HallObjective[];
  skills: string[];
  contents: HallEvaluationContent[];
  prep: string;
  /** What to check: rows whose points do not add up, missing date… */
  warnings: string[];
};

/** Lets the teacher choose a T.E. (PDF or photo) and reads it. The file stays uploaded to become the T.E. once saved. */
export async function scanSpecTable(hallId: string, picked: PickedDocument) {
  const staged = await stageDocument(picked);
  const result = await httpsCallable<{ hallId: string; uploadPath: string }, SpecTableDraft>(functions, 'scanSpecTable')({ hallId, uploadPath: staged.uploadPath });
  return { draft: result.data, staged };
}

// A scan read in the first sheet waits here for the form that opens next.
let pendingScan: { hallId: string; draft: SpecTableDraft; staged: StagedDocument } | null = null;

export function setPendingScan(hallId: string, draft: SpecTableDraft, staged: StagedDocument) {
  pendingScan = { hallId, draft, staged };
}

export function peekPendingScan(hallId: string) {
  return pendingScan?.hallId === hallId ? pendingScan : null;
}

export function clearPendingScan() {
  pendingScan = null;
}

export async function deleteHallDocument(hallId: string, documentId: string) {
  await httpsCallable(functions, 'deleteHallDocument')({ hallId, documentId });
}

/** Opens a document in the in-app browser (a new tab on the web). */
export async function openHallDocument(document: Pick<HallDocument, 'url'>) {
  await WebBrowser.openBrowserAsync(document.url);
}

// ---------------------------------------------------------------- tasks

export type HallTaskInput = {
  hallId: string;
  taskId?: string;
  title: string;
  instructions: string;
  dueAt: number;
  acceptLate: boolean;
};

export async function saveHallTask(input: HallTaskInput) {
  const result = await httpsCallable<HallTaskInput, { taskId: string }>(functions, 'saveHallTask')(input);
  return result.data.taskId;
}

export async function deleteHallTask(hallId: string, taskId: string) {
  await httpsCallable(functions, 'deleteHallTask')({ hallId, taskId });
}

// The last task opened, so the forms over it open without another read.
let lastTask: (HallTaskDetail & { hallId: string }) | null = null;

export function getLoadedTask(hallId: string, taskId: string) {
  return lastTask?.hallId === hallId && lastTask.task.id === taskId ? lastTask : null;
}

export async function getHallTask(hallId: string, taskId: string) {
  const result = await httpsCallable<{ hallId: string; taskId: string }, HallTaskDetail>(functions, 'getHallTask')({ hallId, taskId });
  lastTask = { ...result.data, hallId };
  return result.data;
}

/** A file or photo the student is about to hand in, not uploaded yet. */
export type PendingFile = PickedDocument & { photo?: boolean };

/** Takes a photo with the camera or picks one from the library, as a JPEG ready to upload. */
export async function pickSubmissionPhoto(source: 'camera' | 'library'): Promise<PendingFile | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new DocumentError('HaNet no tiene permiso para usar la cámara. Actívalo en los ajustes del teléfono.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  // Phone photos weigh several megabytes; a page stays legible at this size.
  const resized = await manipulateAsync(
    asset.uri,
    asset.width > 2000 || asset.height > 2000 ? [{ resize: asset.width >= asset.height ? { width: 2000 } : { height: 2000 } }] : [],
    { compress: 0.82, format: SaveFormat.JPEG },
  );
  const blob = await (await fetch(resized.uri)).blob();
  if (blob.size > MAX_DOCUMENT_BYTES) throw new DocumentError('La foto pesa más de 10 MB.');
  const stamp = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  const name = `Foto ${stamp.getFullYear()}-${two(stamp.getMonth() + 1)}-${two(stamp.getDate())} ${two(stamp.getHours())}.${two(stamp.getMinutes())}.${two(stamp.getSeconds())}.jpg`;
  return { uri: resized.uri, name, mimeType: 'image/jpeg', size: blob.size, photo: true };
}

/** Normalizes a link the student typed; null if it is not a web address. */
export function cleanSubmissionLink(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function stageSubmissionFile(file: PendingFile) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new DocumentError('Inicia sesión para entregar.');
  const blob = file.file ?? await (await fetch(file.uri)).blob();
  const uploadPath = `classhall-submissions/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadBytes(ref(storage, uploadPath), blob, { contentType: file.mimeType });
  return { uploadPath, name: file.name };
}

export type SubmitInput = {
  hallId: string;
  taskId: string;
  /** Items of the current submission that stay. */
  keep: string[];
  files: PendingFile[];
  links: { url: string; name?: string }[];
  note: string;
  /** Called before each upload, with how many are done. */
  onProgress?: (done: number, total: number) => void;
};

/** Uploads the new files and hands the task in (or replaces what was handed in). */
export async function submitHallTask({ hallId, taskId, keep, files, links, note, onProgress }: SubmitInput) {
  const uploads = [];
  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length);
    uploads.push(await stageSubmissionFile(file));
  }
  onProgress?.(files.length, files.length);
  const result = await httpsCallable<object, HallSubmission>(functions, 'submitHallTask')({ hallId, taskId, keep, uploads, links, note });
  if (lastTask?.hallId === hallId && lastTask.task.id === taskId) lastTask = { ...lastTask, mySubmission: result.data };
  return result.data;
}

export async function withdrawHallSubmission(hallId: string, taskId: string) {
  await httpsCallable(functions, 'withdrawHallSubmission')({ hallId, taskId });
  if (lastTask?.hallId === hallId && lastTask.task.id === taskId) lastTask = { ...lastTask, mySubmission: null };
}

export async function reviewHallSubmission(hallId: string, taskId: string, studentUid: string, reviewed: boolean, feedback: string) {
  const result = await httpsCallable<object, HallSubmission>(functions, 'reviewHallSubmission')({ hallId, taskId, studentUid, reviewed, feedback });
  if (lastTask?.hallId === hallId && lastTask.task.id === taskId) {
    lastTask = { ...lastTask, submissions: lastTask.submissions?.map(item => (item.uid === studentUid ? result.data : item)) };
  }
  return result.data;
}

/** "Entregada", "Atrasada"… for a student's task. */
export function taskStatus(task: Pick<HallTask, 'dueAt' | 'acceptLate'>, submission: { late: boolean; reviewed: boolean } | null | undefined, now: number) {
  if (submission?.reviewed) return { label: 'Revisada', tone: 'done' as const };
  if (submission) return { label: submission.late ? 'Entregada con atraso' : 'Entregada', tone: 'done' as const };
  if (now <= task.dueAt) return { label: 'Pendiente', tone: 'pending' as const };
  return task.acceptLate ? { label: 'Atrasada', tone: 'late' as const } : { label: 'No entregada', tone: 'closed' as const };
}

export const DOCUMENT_LABELS: Record<HallDocumentKind, string> = {
  pdf: 'Documento PDF',
  word: 'Documento Word',
  powerpoint: 'Presentación PowerPoint',
  excel: 'Planilla Excel',
  image: 'Imagen',
  file: 'Documento',
};

export async function deleteHallAnnouncement(hallId: string, announcementId: string) {
  await httpsCallable(functions, 'deleteHallAnnouncement')({ hallId, announcementId });
}

export async function saveHallEvaluation(input: HallEvaluationInput) {
  const result = await httpsCallable<HallEvaluationInput, { evaluationId: string }>(functions, 'saveHallEvaluation')(input);
  return result.data.evaluationId;
}

export async function deleteHallEvaluation(hallId: string, evaluationId: string) {
  await httpsCallable(functions, 'deleteHallEvaluation')({ hallId, evaluationId });
}

export async function verifyCalendarEvent(hallId: string, eventId: string) {
  const result = await httpsCallable<{ hallId: string; eventId: string }, { verified: boolean; verifier: string }>(functions, 'verifyCalendarEvent')({ hallId, eventId });
  return result.data;
}

export function evaluationTotal(evaluation: Pick<HallEvaluation, 'contents'>) {
  return evaluation.contents.reduce((sum, row) => sum + row.points.reduce((rowSum, value) => rowSum + value, 0), 0);
}

/** Short column header for a skill: "Conocimiento" → "CON.", "ASE" → "ASE". */
export function skillAbbreviation(skill: string) {
  const clean = skill.trim();
  if (clean.length <= 5) return clean.toLocaleUpperCase('es');
  return `${clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3).toLocaleUpperCase('es')}.`;
}

/** The callable's error code without its "functions/" prefix. */
export function hallErrorCode(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return code.replace(/^functions\//, '');
}
