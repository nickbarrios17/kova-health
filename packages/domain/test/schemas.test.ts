import { describe, expect, it } from 'vitest';
import {
  PreferencesUpdateSchema,
  ProfileUpdateSchema,
  RecordSetSchema,
  SaveRoutineSchema,
  SessionRowSchema,
  StartSessionSchema,
  TransitionSessionSchema,
} from '../src/schemas.js';
import { codeFromSqlState, VidaError } from '../src/errors.js';

const id = '7d3c6b2e-5a4f-4e1b-9c8d-0a1b2c3d4e5f';
const id2 = '0f1e2d3c-4b5a-4968-8776-655443322110';

describe('input schemas', () => {
  it('accepts a valid set and defaults the type', () => {
    const s = RecordSetSchema.parse({ id, session_exercise_id: id2, set_index: 0, weight_kg: 92.5, reps: 5 });
    expect(s.set_type).toBe('working');
  });

  it('rejects sets without any measurement or with out-of-range values', () => {
    expect(RecordSetSchema.safeParse({ id, session_exercise_id: id2, set_index: 0 }).success).toBe(false);
    expect(RecordSetSchema.safeParse({ id, session_exercise_id: id2, set_index: 0, reps: 5, weight_kg: -1 }).success).toBe(false);
    expect(RecordSetSchema.safeParse({ id, session_exercise_id: id2, set_index: 0, reps: 5, rpe: 11 }).success).toBe(false);
    expect(RecordSetSchema.safeParse({ id: 'not-a-uuid', session_exercise_id: id2, set_index: 0, reps: 5 }).success).toBe(false);
  });

  it('validates routines', () => {
    const ok = SaveRoutineSchema.safeParse({ id, name: ' Fuerza A ', items: [{ exercise_id: id2, target_sets: 4, target_reps_min: 6, target_reps_max: 6 }], schedule_days: [1, 4] });
    expect(ok.success && ok.data.name).toBe('Fuerza A');
    expect(SaveRoutineSchema.safeParse({ id, name: 'X', items: [] }).success).toBe(false);
    expect(SaveRoutineSchema.safeParse({ id, name: 'X', items: [{ exercise_id: id2, target_sets: 3, target_reps_min: 10, target_reps_max: 8 }] }).success).toBe(false);
    expect(SaveRoutineSchema.safeParse({ id, name: 'X', items: [{ exercise_id: id2, target_sets: 3 }], schedule_days: [1, 1] }).success).toBe(false);
    expect(SaveRoutineSchema.safeParse({ id, name: 'X', items: [{ exercise_id: id2, target_sets: 3 }], schedule_days: [0] }).success).toBe(false);
  });

  it('validates time zones and strict preference keys', () => {
    expect(PreferencesUpdateSchema.safeParse({ time_zone: 'Europe/Madrid' }).success).toBe(true);
    expect(PreferencesUpdateSchema.safeParse({ time_zone: 'Nowhere/City' }).success).toBe(false);
    expect(PreferencesUpdateSchema.safeParse({ is_premium: true }).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ id }).success).toBe(false); // cannot target another user's id
  });

  it('validates session commands', () => {
    expect(StartSessionSchema.safeParse({ id, routine_id: id2, time_zone: 'UTC' }).success).toBe(true);
    expect(StartSessionSchema.safeParse({ id, started_at: 'yesterday' }).success).toBe(false);
    expect(TransitionSessionSchema.safeParse({ id, action: 'finish' }).success).toBe(false);
  });

  it('coerces numeric columns that PostgREST returns as strings', () => {
    const row = SessionRowSchema.parse({
      id, user_id: id2, routine_id: null, routine_version: null, name: 'Fuerza B', status: 'completed',
      started_at: '2026-10-24T10:00:00+00:00', ended_at: '2026-10-24T11:00:00+00:00', paused_at: null,
      total_paused_s: 0, time_zone: 'Europe/Madrid', local_date: '2026-10-24', notes: null, tags: [],
      device_id: null, energy_kcal: '401.0', energy_is_estimated: true, avg_hr: null, deleted_at: null,
      created_at: '2026-10-24T10:00:00+00:00', updated_at: '2026-10-24T11:00:00+00:00',
    });
    expect(row.energy_kcal).toBe(401);
  });
});

describe('error mapping', () => {
  it('maps SQLSTATE to domain codes without leaking SQL', () => {
    expect(codeFromSqlState('VD001')).toBe('ACTIVE_SESSION_EXISTS');
    expect(codeFromSqlState('42501')).toBe('FORBIDDEN');
    expect(codeFromSqlState('XX000')).toBe('INTERNAL');
    expect(new VidaError('NETWORK').retryable).toBe(true);
    expect(new VidaError('VERSION_CONFLICT').retryable).toBe(false);
  });
});
