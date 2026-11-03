import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { putCached, peekCached } from './cache';
import { t } from '@/i18n';

// HaNet Electividad (functions/electividad.js), in Herramientas: an interests
// test of 72 "which would you rather" questions over nine areas, to help 2°
// medio students choose their 3° medio electivos. The server keeps the
// questions' areas and scores the answers; each account answers once.

export type AreaId = 'bio' | 'qui' | 'mat' | 'fis' | 'soc' | 'len' | 'mus' | 'vis' | 'mov';
export type KnowledgeArea =
  | 'Salud' | 'Ciencias Básicas' | 'Tecnología' | 'Educación' | 'Arte y Arquitectura'
  | 'Ciencias Sociales' | 'Humanidades' | 'Derecho' | 'Administración y Comercio' | 'Agropecuaria';

export type Question = { id: string; a: string; b: string };

export type AreaScore = {
  id: AreaId;
  name: string;
  wins: number;
  of: number;
  percent: number;
  rank: number;
  group: 'alto' | 'medio' | 'bajo';
};

export type ElectividadResult = {
  areas: AreaScore[];
  fields: { id: 'ciencias' | 'humanidades' | 'artes'; name: string; percent: number; areas: string[] }[];
  consistency: { same: number; of: number; percent: number };
  profile: 'definido' | 'amplio';
  duels: { a: string; aId: AreaId; b: string; bId: AreaId; score: string; kind: 'clara' | 'pareja' }[];
  careers: { areaId: AreaId; areaName: string; careers: { name: string; knowledgeArea: KnowledgeArea }[] }[];
  durationSec: number;
  answeredAt: number | null;
};

export type ElectividadState = { result: ElectividadResult | null; questions: Question[] };

const CACHE_KEY = 'electividad';

export function peekElectividad() {
  return peekCached<ElectividadState>(CACHE_KEY);
}

export async function getElectividad(): Promise<ElectividadState> {
  const call = httpsCallable<void, ElectividadState>(functions, 'getElectividad');
  const { data } = await call();
  putCached(CACHE_KEY, data);
  return data;
}

export async function submitElectividad(answers: Record<string, 'a' | 'b'>, durationSec: number) {
  const call = httpsCallable<{ answers: Record<string, 'a' | 'b'>; durationSec: number }, { result: ElectividadResult }>(functions, 'submitElectividad');
  const { data } = await call({ answers, durationSec });
  putCached(CACHE_KEY, { result: data.result, questions: [] });
  await clearProgress();
  return data.result;
}

// Answers in progress stay on the phone until the test is sent, so it can be
// paused and picked up later. Nothing leaves the phone before that.
export type Progress = { answers: Record<string, 'a' | 'b'>; index: number; activeMs: number };

const progressKey = () => `hn-electividad:${auth.currentUser?.uid ?? 'anon'}`;

export async function loadProgress(): Promise<Progress | null> {
  try {
    const raw = await AsyncStorage.getItem(progressKey());
    return raw ? JSON.parse(raw) as Progress : null;
  } catch {
    return null;
  }
}

export function saveProgress(progress: Progress) {
  AsyncStorage.setItem(progressKey(), JSON.stringify(progress)).catch(() => undefined);
}

export async function clearProgress() {
  await AsyncStorage.removeItem(progressKey()).catch(() => undefined);
}

/** The result the reveal and result screens share, kept in memory. */
let lastResult: ElectividadResult | null = null;
export function rememberResult(result: ElectividadResult) {
  lastResult = result;
}
export function currentResult(): ElectividadResult | null {
  return lastResult ?? peekElectividad()?.result ?? null;
}

export function formatDuration(sec: number) {
  if (!sec) return '—';
  const minutes = Math.max(1, Math.round(sec / 60));
  return `${minutes} min`;
}

/**
 * The field the answers lean towards, if any. Fields have different numbers
 * of areas (Ciencias four, Artes three, Humanidades two), so each one is
 * measured against its share by chance: it leans when it gets a quarter more.
 */
export function leaningField(result: ElectividadResult) {
  const total = result.fields.reduce((acc, field) => acc + field.areas.length, 0) || 9;
  const lift = (field: ElectividadResult['fields'][number]) => field.percent / ((field.areas.length / total) * 100 || 1);
  const [best] = [...result.fields].sort((x, y) => lift(y) - lift(x));
  return best && lift(best) >= 1.25 ? best : null;
}

export function headline(result: ElectividadResult) {
  const field = leaningField(result);
  return field ? t('services.electividadService.tuPerfilSeInclinaHacia', { name: field.name }) : t('tools.electividad.reveal.tienesInteresesVariados');
}
