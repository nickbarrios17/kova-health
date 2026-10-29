/**
 * Routine import from spreadsheets (xlsx/csv, already read into rows) and JSON. Pure: the apps read
 * the file, show the column mapping and the preview, and save with save_routine.
 *
 * Tolerant by design: headers are recognised by synonyms (Spanish and English), the header row may
 * be below a title, "4x8", "8-10", "1:30", "60 kg" or "135 lb" are understood, and a row with only a
 * title ("Día A", "Lunes") starts a new routine. Anything doubtful becomes an issue in the preview.
 */
import { findCatalogMatch } from './exerciseDetail.js';
import { KG_PER_LB } from './units.js';

export type Cell = string | number | boolean | Date | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

export type ImportField = 'routine' | 'days' | 'exercise' | 'sets' | 'reps' | 'setsReps' | 'rest' | 'weight' | 'notes';
/** Column index per field. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export interface SheetPlan {
  sheet: string;
  headerRow: number;
  headers: string[];
  mapping: ColumnMapping;
  /** Weight column unit, from its header ("Peso (lb)") or the user's choice. */
  weightUnit: 'kg' | 'lb';
}

export interface DraftItem {
  /** 1-based row in the source sheet, for messages. */
  row: number;
  name: string;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  restS: number | null;
  loadKg: number | null;
  notes: string | null;
  issues: string[];
}

export interface DraftRoutine {
  name: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  days: number[];
  items: DraftItem[];
  source: string;
}

export const FIELD_LABEL: Record<ImportField, string> = {
  routine: 'Rutina',
  days: 'Días',
  exercise: 'Ejercicio',
  sets: 'Series',
  reps: 'Repeticiones',
  setsReps: 'Series × reps',
  rest: 'Descanso',
  weight: 'Peso',
  notes: 'Notas',
};

/** Lowercase, no accents, no punctuation, single spaces. */
export const normalize = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9×x.,:/\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cellText = (c: Cell): string => (c == null ? '' : c instanceof Date ? c.toISOString() : String(c)).trim();

// ── Headers ─────────────────────────────────────────────────────────────────
const SYNONYMS: Record<ImportField, string[]> = {
  setsReps: ['series x reps', 'series x repeticiones', 'sets x reps', 'series y reps', 'esquema', 'scheme', 'sxr', 'volumen'],
  routine: ['rutina', 'routine', 'workout', 'entrenamiento', 'sesion', 'session', 'plan', 'dia', 'day', 'bloque'],
  days: ['dias', 'days', 'dia de la semana', 'dias de la semana', 'frecuencia', 'weekday', 'weekdays'],
  exercise: ['ejercicio', 'ejercicios', 'exercise', 'exercises', 'movimiento', 'nombre', 'name'],
  sets: ['series', 'serie', 'sets', 'set', 'sx'],
  reps: ['reps', 'rep', 'repeticiones', 'repeticion', 'repes', 'repetitions'],
  rest: ['descanso', 'descansos', 'rest', 'pausa', 'recuperacion', 'desc'],
  weight: ['peso', 'kg', 'kilos', 'carga', 'weight', 'load', 'lb', 'lbs'],
  notes: ['notas', 'nota', 'notes', 'comentarios', 'comentario', 'observaciones', 'obs'],
};

/** Which field a header names, or null. Text in parentheses ("Peso (kg)") is ignored for matching. */
export function headerField(header: Cell): ImportField | null {
  const h = normalize(cellText(header).replace(/\(.*?\)/g, ' '));
  if (!h) return null;
  for (const f of Object.keys(SYNONYMS) as ImportField[]) {
    if (SYNONYMS[f].some((s) => h === s || h.startsWith(s + ' '))) return f;
  }
  return null;
}

/** Finds the header row (within the first 15) and maps its columns. */
export function detectColumns(sheet: Sheet): SheetPlan {
  let best: { row: number; mapping: ColumnMapping; score: number } = { row: 0, mapping: {}, score: 0 };
  sheet.rows.slice(0, 15).forEach((row, r) => {
    const mapping: ColumnMapping = {};
    row.forEach((cell, col) => {
      const f = headerField(cell);
      if (f && mapping[f] === undefined) mapping[f] = col;
    });
    const score = Object.keys(mapping).length + (mapping.exercise !== undefined ? 2 : 0);
    if (score > best.score) best = { row: r, mapping, score };
  });
  const headers = (sheet.rows[best.row] ?? []).map(cellText);
  const weightHeader = best.mapping.weight !== undefined ? normalize(headers[best.mapping.weight]) : '';
  return {
    sheet: sheet.name,
    headerRow: best.score >= 3 ? best.row : 0,
    headers,
    mapping: best.score >= 3 ? best.mapping : {},
    weightUnit: /\blbs?\b/.test(weightHeader) ? 'lb' : 'kg',
  };
}

/** True when the plan has what it needs to read rows (an exercise column and some way to get sets). */
export const planReady = (p: SheetPlan) => p.mapping.exercise !== undefined;

// ── Cells ───────────────────────────────────────────────────────────────────
const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** "4x8", "4 × 8-10", "3x12/10/8" → sets and rep range; "3xAMRAP" → 3 sets, no rep number. */
export function parseSetsReps(c: Cell): { sets: number; repsMin: number | null; repsMax: number | null } | null {
  const m = normalize(cellText(c)).match(/^(\d{1,2})\s*[x×*]\s*(.+)$/);
  if (!m) return null;
  const reps = parseReps(m[2]);
  return { sets: Number(m[1]), repsMin: reps?.min ?? null, repsMax: reps?.max ?? null };
}

/** "10", "8-10", "8 a 10", "12/10/8" → range; "AMRAP" or "al fallo" → null. */
export function parseReps(c: Cell): { min: number; max: number } | null {
  const nums = (normalize(cellText(c)).match(/\d{1,3}/g) ?? []).map(Number).filter((n) => n > 0);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** First whole number in the cell ("4", "4 series", 4). */
export function parseCount(c: Cell): number | null {
  if (typeof c === 'number') return Number.isInteger(c) ? c : Math.round(c);
  const m = cellText(c).match(/\d{1,3}/);
  return m ? Number(m[0]) : null;
}

/** "90", "90s", "90 seg", "1:30", "2'", "2 min", "1,5 min" → seconds. A bare number up to 10 means minutes. */
export function parseRest(c: Cell): number | null {
  const s = normalize(cellText(c));
  if (!s) return null;
  const clock = s.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const v = num((s.match(/\d+(?:[.,]\d+)?/) ?? [''])[0]);
  if (v == null) return null;
  if (/min|'|m\b/.test(s)) return Math.round(v * 60);
  if (/s|seg|sec/.test(s)) return Math.round(v);
  return v <= 10 ? Math.round(v * 60) : Math.round(v);
}

/** "60", "60 kg", "135 lb", "62,5" → kg; "corporal", "BW" or empty → null. */
export function parseWeight(c: Cell, unit: 'kg' | 'lb' = 'kg'): number | null {
  const s = normalize(cellText(c));
  const m = s.match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const v = num(m[0])!;
  const isLb = /\blbs?\b|libras?/.test(s) || (unit === 'lb' && !/\bkg\b|kilos?/.test(s));
  return Math.round((isLb ? v * KG_PER_LB : v) * 100) / 100;
}

const DAY_WORDS: Array<[number, string[]]> = [
  [1, ['lunes', 'lun', 'lu', 'l', 'monday', 'mon']],
  [2, ['martes', 'mar', 'ma', 'm', 'tuesday', 'tue', 'tues']],
  [3, ['miercoles', 'mie', 'mi', 'x', 'wednesday', 'wed']],
  [4, ['jueves', 'jue', 'ju', 'j', 'thursday', 'thu', 'thurs']],
  [5, ['viernes', 'vie', 'vi', 'v', 'friday', 'fri']],
  [6, ['sabado', 'sab', 'sa', 's', 'saturday', 'sat']],
  [7, ['domingo', 'dom', 'do', 'd', 'sunday', 'sun']],
];

/** "Lun, Jue", "Lunes y jueves", "Mon/Thu", "L M X" → [1, 4]; unknown words are ignored. */
export function parseDays(c: Cell): number[] {
  const tokens = normalize(cellText(c)).split(/[\s,;/·|&+-]+|\by\b|\band\b/).filter(Boolean);
  const out = new Set<number>();
  for (const t of tokens) for (const [d, words] of DAY_WORDS) if (words.includes(t)) out.add(d);
  return [...out].sort((a, b) => a - b);
}

// ── Rows → routines ────────────────────────────────────────────────────────
const rowIsEmpty = (row: Cell[]) => row.every((c) => cellText(c) === '');

const TITLE_WORDS = /^(dia|day|rutina|routine|semana|week|sesion|session|bloque|block|entrenamiento|workout|push|pull|legs?|pierna|piernas|torso|upper|lower|full ?body|cuerpo completo)\b/;
/** A lone cell that reads like a section title ("Día A", "Lunes – Pierna", "Push"), not an exercise. */
const isTitle = (text: string) => {
  const n = normalize(text);
  const first = n.split(/[\s,;/·:–—-]+/)[0] ?? '';
  return TITLE_WORDS.test(n) || DAY_WORDS.some(([, words]) => first.length > 1 && words.includes(first));
};

/** Builds draft routines from one sheet with its (detected or user-edited) column mapping. */
export function sheetToRoutines(sheet: Sheet, plan: SheetPlan, fallbackName: string): DraftRoutine[] {
  const { mapping: m, weightUnit } = plan;
  if (m.exercise === undefined) return [];
  const out: DraftRoutine[] = [];
  let current: DraftRoutine | null = null;
  let lastRoutineCell = '';
  const at = (row: Cell[], f: ImportField) => (m[f] === undefined ? undefined : row[m[f]!]);
  const start = (name: string, days: number[]) => {
    current = { name: name.slice(0, 80), days, items: [], source: sheet.name };
    out.push(current);
    return current;
  };

  sheet.rows.slice(plan.headerRow + 1).forEach((row, i) => {
    if (rowIsEmpty(row)) return;
    const rowNo = plan.headerRow + i + 2;
    const exercise = cellText(at(row, 'exercise'));
    const routineCell = cellText(at(row, 'routine'));
    const filled = row.map(cellText).filter(Boolean);

    // A lone title row ("Día A", "Lunes – Pierna") starts a new routine.
    if (filled.length === 1 && (!exercise || isTitle(exercise))) {
      start(filled[0]!, parseDays(filled[0]));
      return;
    }
    if (!exercise) return;

    if (routineCell && routineCell !== lastRoutineCell) {
      lastRoutineCell = routineCell;
      start(routineCell, parseDays(at(row, 'days') ?? routineCell));
    }
    const r: DraftRoutine = current ?? start(fallbackName, parseDays(at(row, 'days')));
    if (!r.days.length && m.days !== undefined) r.days = parseDays(at(row, 'days'));

    const issues: string[] = [];
    const combo = parseSetsReps(at(row, 'setsReps')) ?? parseSetsReps(at(row, 'sets')) ?? parseSetsReps(at(row, 'reps'));
    let sets = combo?.sets ?? parseCount(at(row, 'sets'));
    const reps = combo ? (combo.repsMin == null ? null : { min: combo.repsMin, max: combo.repsMax! }) : parseReps(at(row, 'reps'));
    if (sets == null || sets < 1 || sets > 20) {
      if (sets != null) issues.push('Series fuera de rango (' + sets + '): usamos 3.');
      else issues.push('Sin series: usamos 3.');
      sets = 3;
    }
    let repsMin = reps?.min ?? null, repsMax = reps?.max ?? null;
    if (repsMax != null && repsMax > 100) { issues.push('Repeticiones fuera de rango: quedaron vacías.'); repsMin = repsMax = null; }
    const repsText = combo ? cellText(at(row, 'setsReps') ?? at(row, 'sets') ?? at(row, 'reps')) : cellText(at(row, 'reps'));
    if (repsMin == null && repsText) issues.push('Repeticiones «' + repsText + '» sin número: quedaron vacías.');
    let restS = parseRest(at(row, 'rest'));
    if (restS != null && restS > 1800) { issues.push('Descanso mayor a 30 min: quedó vacío.'); restS = null; }
    let loadKg = parseWeight(at(row, 'weight'), weightUnit);
    if (loadKg != null && loadKg > 1000) { issues.push('Peso fuera de rango: quedó vacío.'); loadKg = null; }
    const notes = cellText(at(row, 'notes')) || null;

    r.items.push({ row: rowNo, name: exercise.slice(0, 120), sets, repsMin, repsMax, restS, loadKg, notes: notes?.slice(0, 500) ?? null, issues });
  });

  return out.filter((r) => r.items.length > 0);
}

// ── JSON ────────────────────────────────────────────────────────────────────
type Json = Record<string, unknown>;
const pick = (o: Json, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/**
 * Accepts `{ routines: [...] }` or a bare array. Each routine: name|nombre|rutina, days|dias,
 * exercises|ejercicios: [{ exercise|ejercicio|name|nombre, sets|series, reps|repeticiones,
 * rest|descanso|rest_s, weight|peso|weight_kg|load_kg, notes|notas }]. Throws a readable error.
 */
export function jsonToRoutines(text: string): DraftRoutine[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const list = Array.isArray(data) ? data : ((data as Json)?.routines ?? (data as Json)?.rutinas);
  if (!Array.isArray(list)) throw new Error('No encontramos una lista de rutinas («routines») en el JSON.');
  return list
    .map((raw, i) => {
      const o = (raw ?? {}) as Json;
      const exs = pick(o, 'exercises', 'ejercicios', 'items');
      const items: DraftItem[] = (Array.isArray(exs) ? exs : []).map((e, j) => {
        const x = (e ?? {}) as Json;
        const row: Cell[] = [
          pick(x, 'exercise', 'ejercicio', 'name', 'nombre') as Cell,
          pick(x, 'sets', 'series') as Cell,
          pick(x, 'reps', 'repeticiones', 'repetitions') as Cell,
          pick(x, 'rest_s', 'rest', 'descanso') as Cell,
          (pick(x, 'weight_kg', 'load_kg') ?? pick(x, 'weight', 'peso')) as Cell,
          pick(x, 'notes', 'notas') as Cell,
        ];
        const sheet: Sheet = { name: 'json', rows: [['ejercicio', 'series', 'reps', 'descanso', 'peso', 'notas'], row] };
        const plan = { ...detectColumns(sheet), weightUnit: pick(x, 'weight_lb') !== undefined ? ('lb' as const) : ('kg' as const) };
        const item = sheetToRoutines(sheet, plan, 'x')[0]?.items[0];
        return item ? { ...item, row: j + 1 } : null;
      }).filter((x): x is DraftItem => x != null);
      const days = pick(o, 'days', 'dias');
      return {
        name: String(pick(o, 'name', 'nombre', 'rutina') ?? 'Rutina ' + (i + 1)).slice(0, 80),
        days: Array.isArray(days) ? [...new Set(days.flatMap((d) => (typeof d === 'number' && d >= 1 && d <= 7 ? [d] : parseDays(d as Cell))))].sort() : parseDays(days as Cell),
        items,
        source: 'json',
      };
    })
    .filter((r) => r.items.length > 0);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
/** RFC 4180-ish CSV reader; detects ";" (Excel in Spanish) or "," as the delimiter. */
export function parseCsv(text: string): Cell[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: Cell[][] = [];
  let row: Cell[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── Exercise matching ──────────────────────────────────────────────────────
export interface CatalogExercise {
  id: string;
  name: string;
}

/** Best catalog match for a typed name, or null when unsure (same matcher as the exercise detail). */
export function matchExercise(raw: string, catalog: CatalogExercise[]): CatalogExercise | null {
  return findCatalogMatch(raw, catalog);
}

/** URL-safe slug for a user exercise created from an imported name. */
export const slugify = (s: string) =>
  normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ejercicio';
