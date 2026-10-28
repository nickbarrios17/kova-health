/**
 * Routine editor model shared by web and mobile: a draft built from a saved routine (or empty),
 * validated and turned into a save_routine input. Weights are kg; the apps convert at the edges.
 */
import { newId } from './ids.js';
import type { SaveRoutineInput } from './schemas.js';

export interface EditorItem {
  /** Stable key for lists (not persisted). */
  key: string;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  restS: number | null;
  loadKg: number | null;
  notes: string | null;
}

export interface RoutineDraft {
  /** Existing routine id, or a new client id. */
  id: string;
  /** Version last seen (null for a new routine): save_routine rejects stale edits. */
  version: number | null;
  name: string;
  days: number[];
  items: EditorItem[];
}

interface RoutineRowLike {
  id: string;
  name: string;
  version: number;
  schedule_days: number[];
  routine_exercises: Array<{
    exercise_id: string;
    position: number;
    target_sets: number;
    target_reps_min: number | null;
    target_reps_max: number | null;
    target_rest_s: number | null;
    target_load_kg: number | string | null;
    notes: string | null;
  }>;
}

export const emptyDraft = (): RoutineDraft => ({ id: newId(), version: null, name: '', days: [], items: [] });

export function draftFromRoutine(r: RoutineRowLike, names: Record<string, string>): RoutineDraft {
  return {
    id: r.id,
    version: r.version,
    name: r.name,
    days: [...r.schedule_days].sort((a, b) => a - b),
    items: [...r.routine_exercises].sort((a, b) => a.position - b.position).map((e) => ({
      key: newId(),
      exerciseId: e.exercise_id,
      exerciseName: names[e.exercise_id] ?? 'Ejercicio',
      sets: e.target_sets,
      repsMin: e.target_reps_min,
      repsMax: e.target_reps_max,
      restS: e.target_rest_s,
      loadKg: e.target_load_kg == null ? null : Number(e.target_load_kg),
      notes: e.notes,
    })),
  };
}

/** A new row for an exercise, with sensible defaults (3 × 8–12, 90 s). */
export const newItem = (exerciseId: string, exerciseName: string): EditorItem => ({
  key: newId(), exerciseId, exerciseName, sets: 3, repsMin: 8, repsMax: 12, restS: 90, loadKg: null, notes: null,
});

export function moveItem(items: EditorItem[], index: number, delta: -1 | 1): EditorItem[] {
  const to = index + delta;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

export const toggleDay = (days: number[], d: number) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));

/** Problems that block saving, in Spanish, one per line; empty means it can be saved. */
export function validateDraft(d: RoutineDraft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Ponle un nombre a la rutina.');
  if (d.name.trim().length > 80) errors.push('El nombre puede tener hasta 80 caracteres.');
  if (d.items.length === 0) errors.push('Añade al menos un ejercicio.');
  if (d.items.length > 50) errors.push('Una rutina puede tener hasta 50 ejercicios.');
  d.items.forEach((it, i) => {
    const n = (i + 1) + '. ' + it.exerciseName;
    if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > 20) errors.push(n + ': las series van de 1 a 20.');
    if (it.repsMin != null && (it.repsMin < 1 || it.repsMin > 100)) errors.push(n + ': las repeticiones van de 1 a 100.');
    if (it.repsMax != null && (it.repsMax < 1 || it.repsMax > 100)) errors.push(n + ': las repeticiones van de 1 a 100.');
    if (it.repsMin != null && it.repsMax != null && it.repsMax < it.repsMin) errors.push(n + ': el máximo de repeticiones es menor que el mínimo.');
    if (it.restS != null && (it.restS < 0 || it.restS > 1800)) errors.push(n + ': el descanso va de 0 a 1800 segundos.');
    if (it.loadKg != null && (it.loadKg < 0 || it.loadKg > 1000)) errors.push(n + ': revisa el peso.');
  });
  return errors;
}

export function draftToSaveInput(d: RoutineDraft): SaveRoutineInput {
  return {
    id: d.id,
    name: d.name.trim(),
    schedule_days: d.days,
    expected_version: d.version,
    items: d.items.map((it) => ({
      exercise_id: it.exerciseId,
      target_sets: it.sets,
      target_reps_min: it.repsMin,
      // A single number means an exact rep target.
      target_reps_max: it.repsMax ?? it.repsMin,
      target_rest_s: it.restS,
      target_load_kg: it.loadKg,
      notes: it.notes?.trim() || null,
    })),
  };
}

/** "8", "8-12", "8 a 12" → range; "" → null. Used by the reps input of both editors. */
export function parseRepsInput(s: string): { min: number | null; max: number | null } | 'invalid' {
  const t = s.trim();
  if (!t) return { min: null, max: null };
  const m = t.match(/^(\d{1,3})(?:\s*(?:-|–|a)\s*(\d{1,3}))?$/);
  if (!m) return 'invalid';
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export const repsLabel = (min: number | null, max: number | null) =>
  min == null ? '' : max == null || max === min ? String(min) : min + '-' + max;
