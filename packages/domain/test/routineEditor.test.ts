import { describe, expect, it } from 'vitest';
import {
  draftFromRoutine, draftToSaveInput, emptyDraft, moveItem, newItem, parseRepsInput, repsLabel, toggleDay, validateDraft,
} from '../src/routineEditor.js';
import { SaveRoutineSchema } from '../src/schemas.js';

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Fuerza A',
  version: 3,
  schedule_days: [4, 1],
  routine_exercises: [
    { exercise_id: 'b0000000-0000-4000-8000-000000000002', position: 1, target_sets: 4, target_reps_min: 8, target_reps_max: 8, target_rest_s: 90, target_load_kg: '60.00', notes: null },
    { exercise_id: 'a0000000-0000-4000-8000-000000000001', position: 0, target_sets: 4, target_reps_min: 6, target_reps_max: 6, target_rest_s: 120, target_load_kg: null, notes: 'Profunda' },
  ],
};

describe('routine editor', () => {
  it('builds a draft in position order with names and numeric loads', () => {
    const d = draftFromRoutine(row, { 'a0000000-0000-4000-8000-000000000001': 'Sentadilla' });
    expect(d.version).toBe(3);
    expect(d.days).toEqual([1, 4]);
    expect(d.items.map((i) => i.exerciseName)).toEqual(['Sentadilla', 'Ejercicio']);
    expect(d.items[1]!.loadKg).toBe(60);
  });

  it('round-trips to a valid save_routine input, keeping the version', () => {
    const input = draftToSaveInput(draftFromRoutine(row, {}));
    expect(input.expected_version).toBe(3);
    expect(input.items.map((i) => i.exercise_id)).toEqual(['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002']);
    expect(SaveRoutineSchema.safeParse(input).success).toBe(true);
  });

  it('a new routine has no version and needs a name and an exercise', () => {
    const d = emptyDraft();
    expect(d.version).toBeNull();
    expect(validateDraft(d)).toEqual(['Ponle un nombre a la rutina.', 'Añade al menos un ejercicio.']);
    const ok = { ...d, name: 'Pierna', items: [newItem('a0000000-0000-4000-8000-000000000001', 'Sentadilla')] };
    expect(validateDraft(ok)).toEqual([]);
    expect(SaveRoutineSchema.safeParse(draftToSaveInput(ok)).success).toBe(true);
  });

  it('flags out-of-range values per exercise', () => {
    const it0 = { ...newItem('x', 'Remo'), sets: 0, repsMin: 12, repsMax: 8, restS: 4000 };
    expect(validateDraft({ ...emptyDraft(), name: 'X', items: [it0] })).toEqual([
      '1. Remo: las series van de 1 a 20.',
      '1. Remo: el máximo de repeticiones es menor que el mínimo.',
      '1. Remo: el descanso va de 0 a 1800 segundos.',
    ]);
  });

  it('moves items and toggles days', () => {
    const items = [newItem('a', 'A'), newItem('b', 'B'), newItem('c', 'C')];
    expect(moveItem(items, 0, 1).map((i) => i.exerciseId)).toEqual(['b', 'a', 'c']);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(toggleDay([1, 4], 3)).toEqual([1, 3, 4]);
    expect(toggleDay([1, 3, 4], 3)).toEqual([1, 4]);
  });

  it('parses the reps field', () => {
    expect(parseRepsInput('8')).toEqual({ min: 8, max: 8 });
    expect(parseRepsInput('8-12')).toEqual({ min: 8, max: 12 });
    expect(parseRepsInput('12 a 8')).toEqual({ min: 8, max: 12 });
    expect(parseRepsInput('')).toEqual({ min: null, max: null });
    expect(parseRepsInput('muchas')).toBe('invalid');
    expect(repsLabel(8, 12)).toBe('8-12');
    expect(repsLabel(8, 8)).toBe('8');
  });
});
