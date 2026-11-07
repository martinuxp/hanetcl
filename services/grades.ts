import AsyncStorage from '@react-native-async-storage/async-storage';

// Chilean grades for the Herramientas "Escala de notas" and "Calculadora de
// notas". Everything here runs on the phone: what someone types stays on
// their phone. The grades a docente publishes in a Hall (Notas,
// functions/grades.js) can be added to the calculator from there.
//
// Grades go from 1,0 to 7,0, with one decimal, and pass at 4,0. A scale
// ("escala de notas") turns points into a grade: below the passing points
// ("exigencia", usually 60 % of the maximum) it rises linearly from the
// minimum to 4,0; from there to the maximum, from 4,0 to 7,0.

export type ScaleSettings = {
  maxPoints: number;
  /** Share of the points needed for the passing grade, 0–1 (usually 0.6). */
  exigency: number;
  minGrade: number;
  maxGrade: number;
  passGrade: number;
  /** Points between rows of the table: 1 or 0.5. */
  step: number;
};

export const DEFAULT_SCALE: ScaleSettings = { maxPoints: 60, exigency: 0.6, minGrade: 1, maxGrade: 7, passGrade: 4, step: 1 };

/** Rounds to one decimal, half up, the way grades are rounded (3,95 → 4,0). */
export function roundGrade(value: number) {
  return Math.round(value * 10 + 1e-9) / 10;
}

export function passPoints(settings: ScaleSettings) {
  return settings.maxPoints * settings.exigency;
}

/** The grade for some points, rounded to one decimal. */
export function gradeFor(points: number, settings: ScaleSettings) {
  const { maxPoints, minGrade, maxGrade, passGrade } = settings;
  const pass = passPoints(settings);
  const clamped = Math.min(Math.max(points, 0), maxPoints);
  const raw = clamped < pass
    ? minGrade + ((passGrade - minGrade) * clamped) / (pass || 1)
    : passGrade + ((maxGrade - passGrade) * (clamped - pass)) / ((maxPoints - pass) || 1);
  return roundGrade(Math.min(Math.max(raw, minGrade), maxGrade));
}

/** The table, from 0 to the maximum, one row per step. */
export function scaleRows(settings: ScaleSettings) {
  const rows: { points: number; grade: number }[] = [];
  const step = settings.step > 0 ? settings.step : 1;
  const count = Math.floor(settings.maxPoints / step + 1e-9);
  for (let index = 0; index <= count; index += 1) {
    const points = Math.round(index * step * 10) / 10;
    rows.push({ points, grade: gradeFor(points, settings) });
  }
  if (rows[rows.length - 1]?.points !== settings.maxPoints) {
    rows.push({ points: settings.maxPoints, grade: gradeFor(settings.maxPoints, settings) });
  }
  return rows;
}

/** The fewest points (on the table's steps) that reach the passing grade. */
export function pointsToPass(settings: ScaleSettings) {
  return scaleRows(settings).find(row => row.grade >= settings.passGrade)?.points ?? settings.maxPoints;
}

/** "5,5" with a decimal comma. */
export function formatGrade(value: number) {
  return roundGrade(value).toFixed(1).replace('.', ',');
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace('.', ',');
}

/** A number typed with a comma or a dot; null when it isn't one. */
export function parseNumber(text: string) {
  const clean = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

/**
 * A grade as people type it: "5,5", "5.5", "55" (shorthand for 5,5) or "6".
 * Null when it isn't a grade between 1,0 and 7,0.
 */
export function parseGrade(text: string) {
  // "5," while typing (the comma comes on its own) already counts as 5,0.
  const clean = text.trim().replace(',', '.').replace(/\.$/, '');
  if (!clean) return null;
  let value: number;
  if (/^\d{2}$/.test(clean)) value = Number(clean) / 10;
  else if (/^\d(\.\d+)?$/.test(clean)) value = Number(clean);
  else return null;
  value = roundGrade(value);
  return value >= 1 && value <= 7 ? value : null;
}

/**
 * A grade field as it is typed: the comma comes on its own after the first
 * digit ("5" shows "5,", then "5,5"). Deleting goes back a digit at a time.
 */
export function typeGrade(text: string, previous: string) {
  const digits = text.replace(/\D/g, '').slice(0, 2);
  if (!digits) return '';
  if (digits.length === 2) return `${digits[0]},${digits[1]}`;
  return text.length < previous.length ? digits : `${digits},`;
}

// ---------------------------------------------------------------- average

export type GradeEntry = { id: string; grade: string; weight: string };

/** Whether the grades carry weights: then every one needs a weight. */
export function isWeighted(entries: GradeEntry[]) {
  return entries.some(entry => entry.weight.trim() !== '');
}

export type AverageResult = {
  /** Grades that count (typed and valid). */
  count: number;
  /** Unrounded average, null without grades. */
  raw: number | null;
  rounded: number | null;
  /** Weighted: the sum of the weights of the grades that count. */
  usedWeight: number;
  weighted: boolean;
  /** Typed but not valid (a grade outside 1,0–7,0, or a weight missing). */
  invalid: string[];
};

/** `weighted` defaults to whether any weight was typed. */
export function averageOf(entries: GradeEntry[], weighted = isWeighted(entries)): AverageResult {
  let sum = 0;
  let total = 0;
  let count = 0;
  const invalid: string[] = [];
  for (const entry of entries) {
    if (!entry.grade.trim() && (!weighted || !entry.weight.trim())) continue;
    const grade = parseGrade(entry.grade);
    const weight = weighted ? parseNumber(entry.weight) : 1;
    if (grade === null || weight === null || weight <= 0) {
      invalid.push(entry.id);
      continue;
    }
    sum += grade * weight;
    total += weight;
    count += 1;
  }
  const raw = total > 0 ? sum / total : null;
  return { count, raw, rounded: raw === null ? null : roundGrade(raw), usedWeight: weighted ? total : 0, weighted, invalid };
}

export type NeedResult =
  | { kind: 'empty' }
  | { kind: 'reached' }
  | { kind: 'impossible'; best: number }
  | { kind: 'needed'; grade: number };

/**
 * The grade still needed to finish with `goal` (after rounding: 3,95 counts as
 * 4,0). Weighted: the rest of the weight, up to 100 %, is still to come.
 * Without weights: `remaining` more grades of equal weight.
 */
export function neededGrade(entries: GradeEntry[], goal: number, remaining: number, weighted = isWeighted(entries)): NeedResult {
  const average = averageOf(entries, weighted);
  const threshold = goal - 0.05;
  if (average.weighted) {
    const left = 100 - average.usedWeight;
    if (left <= 0) {
      if (average.raw === null) return { kind: 'empty' };
      return average.raw >= threshold ? { kind: 'reached' } : { kind: 'impossible', best: average.raw };
    }
    const sum = (average.raw ?? 0) * average.usedWeight;
    const needed = (threshold * 100 - sum) / left;
    return verdict(needed, (sum + 7 * left) / 100);
  }
  if (remaining <= 0) {
    if (average.raw === null) return { kind: 'empty' };
    return average.raw >= threshold ? { kind: 'reached' } : { kind: 'impossible', best: average.raw };
  }
  const sum = (average.raw ?? 0) * average.count;
  const needed = (threshold * (average.count + remaining) - sum) / remaining;
  return verdict(needed, (sum + 7 * remaining) / (average.count + remaining));
}

function verdict(needed: number, best: number): NeedResult {
  if (needed <= 1) return { kind: 'reached' };
  if (needed > 7 + 1e-9) return { kind: 'impossible', best };
  // Up to the next tenth: a 5,31 needed is a 5,4 on the paper.
  return { kind: 'needed', grade: Math.min(7, Math.ceil(needed * 10 - 1e-9) / 10) };
}

// ---------------------------------------------------------------- storage

const CALCULATOR_KEY = 'hn-grade-calculator';
const SCALE_KEY = 'hn-grade-scale';

export type CalculatorState = { entries: GradeEntry[]; goal: string; remaining: number; weighted: boolean };

export async function loadScale(): Promise<ScaleSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(SCALE_KEY);
    const saved = raw ? JSON.parse(raw) as Partial<ScaleSettings> : null;
    return saved ? { ...DEFAULT_SCALE, ...saved } : null;
  } catch {
    return null;
  }
}

export function saveScale(settings: ScaleSettings) {
  AsyncStorage.setItem(SCALE_KEY, JSON.stringify(settings)).catch(() => undefined);
}

export async function loadCalculator(): Promise<CalculatorState | null> {
  try {
    const raw = await AsyncStorage.getItem(CALCULATOR_KEY);
    return raw ? JSON.parse(raw) as CalculatorState : null;
  } catch {
    return null;
  }
}

export function saveCalculator(state: CalculatorState) {
  AsyncStorage.setItem(CALCULATOR_KEY, JSON.stringify(state)).catch(() => undefined);
}

/** Adds a published grade to the calculator, in its first empty row or a new one. */
export async function addGradeToCalculator(grade: number, weight: number | null) {
  const saved = await loadCalculator();
  const entries = (saved?.entries ?? []).filter(entry => entry.grade.trim() || entry.weight.trim());
  const weighted = (saved?.weighted ?? false) || weight !== null;
  entries.push({
    id: `n${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
    grade: formatGrade(grade),
    weight: weight !== null ? String(weight) : '',
  });
  const next: CalculatorState = { entries, goal: saved?.goal ?? '4,0', remaining: saved?.remaining ?? 1, weighted };
  // Waits for it, so the calculator opened next reads it.
  await AsyncStorage.setItem(CALCULATOR_KEY, JSON.stringify(next)).catch(() => undefined);
}
