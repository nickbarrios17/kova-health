/** Zod contracts for every client → server call and the rows that come back. */
import { z } from 'zod';
import { isValidTimeZone } from './time.js';

const uuid = z.string().uuid();
const isoTs = z.string().datetime({ offset: true });
const kg = z.number().min(0).max(1000);
const text = (max: number) => z.string().max(max);

// ── Enums ──────────────────────────────────────────────────────────────────
export const WeightUnitSchema = z.enum(['kg', 'lb']);
export const SessionStatusSchema = z.enum(['in_progress', 'paused', 'completed', 'abandoned']);
export const SessionActionSchema = z.enum(['pause', 'resume', 'complete', 'abandon']);
export const SetTypeSchema = z.enum(['warmup', 'working', 'drop', 'failure']);
export const DeviceKindSchema = z.enum(['web', 'mobile', 'watch']);
export const OnboardingStateSchema = z.enum(['new', 'profile', 'goals', 'done']);
export const MeasurementTypeSchema = z.enum(['weight_reps', 'reps', 'duration', 'distance_duration']);
export const ExerciseCategorySchema = z.enum(['strength', 'cardio', 'stretching', 'plyometrics', 'mobility']);

export const TimeZoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown time zone');

// ── Profile / preferences ──────────────────────────────────────────────────
export const ProfileUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).nullable(),
    birth_year: z.number().int().min(1900).max(2100).nullable(),
    height_cm: z.number().min(50).max(272).nullable(),
    onboarding_state: OnboardingStateSchema,
  })
  .partial()
  .strict();

export const PreferencesUpdateSchema = z
  .object({
    weight_unit: WeightUnitSchema,
    locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
    time_zone: TimeZoneSchema,
    week_start: z.union([z.literal(1), z.literal(7)]),
  })
  .partial()
  .strict();

export const DeviceRegisterSchema = z.object({
  id: uuid,
  kind: DeviceKindSchema,
  platform: text(40).optional(),
  label: text(80).optional(),
});

// ── Exercises ──────────────────────────────────────────────────────────────
export const ExerciseInstructionsSchema = z
  .object({
    tempo: text(80).optional(),
    cues: z.array(z.object({ title: text(120), body: text(600) })).max(12).optional(),
    errors: z.array(z.object({ title: text(120), fix: text(600) })).max(12).optional(),
    breath: z.array(text(200)).max(8).optional(),
    met: z.number().min(0).max(25).optional(),
  })
  .strict();

export const ExerciseCreateSchema = z.object({
  id: uuid,
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(120),
  short_name: text(40).optional(),
  description: text(2000).optional(),
  category: ExerciseCategorySchema.default('strength'),
  measurement_type: MeasurementTypeSchema.default('weight_reps'),
  instructions: ExerciseInstructionsSchema.default({}),
  muscles: z.array(z.object({ code: z.string(), role: z.enum(['primary', 'secondary']) })).max(10).default([]),
  equipment: z.array(z.string()).max(10).default([]),
});

export const ExerciseSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  muscle: z.string().max(40).optional(),
  equipment: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(100).default(40),
  offset: z.number().int().min(0).max(10_000).default(0),
});

// ── Routines ───────────────────────────────────────────────────────────────
export const RoutineItemSchema = z
  .object({
    exercise_id: uuid,
    target_sets: z.number().int().min(1).max(20),
    target_reps_min: z.number().int().min(1).max(100).nullish(),
    target_reps_max: z.number().int().min(1).max(100).nullish(),
    target_duration_s: z.number().int().min(1).max(86_400).nullish(),
    target_rest_s: z.number().int().min(0).max(1800).nullish(),
    target_load_kg: kg.nullish(),
    notes: text(500).nullish(),
  })
  .refine((i) => i.target_reps_min == null || i.target_reps_max == null || i.target_reps_max >= i.target_reps_min, {
    message: 'target_reps_max must be ≥ target_reps_min',
  });

export const SaveRoutineSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(80),
  items: z.array(RoutineItemSchema).min(1).max(50),
  schedule_days: z.array(z.number().int().min(1).max(7)).max(7).refine((d) => new Set(d).size === d.length, 'Duplicate day').default([]),
  notes: text(2000).nullish(),
  expected_version: z.number().int().positive().nullish(),
});

// ── Sessions / sets ────────────────────────────────────────────────────────
export const SessionExerciseSnapshotSchema = z.object({
  id: uuid,
  exercise_id: uuid,
  position: z.number().int().min(0).max(99),
  planned_sets: z.number().int().min(1).max(20).nullish(),
  planned_reps_min: z.number().int().min(1).max(100).nullish(),
  planned_reps_max: z.number().int().min(1).max(100).nullish(),
  planned_duration_s: z.number().int().min(1).max(86_400).nullish(),
  planned_rest_s: z.number().int().min(0).max(1800).nullish(),
  planned_load_kg: kg.nullish(),
});

export const StartSessionSchema = z.object({
  id: uuid,
  routine_id: uuid.nullish(),
  name: z.string().trim().min(1).max(120).nullish(),
  exercises: z.array(SessionExerciseSnapshotSchema).max(50).nullish(),
  started_at: isoTs.nullish(),
  time_zone: TimeZoneSchema.nullish(),
  device_id: uuid.nullish(),
});

export const RecordSetSchema = z
  .object({
    id: uuid,
    session_exercise_id: uuid,
    set_index: z.number().int().min(0).max(99),
    weight_kg: kg.nullish(),
    reps: z.number().int().min(0).max(1000).nullish(),
    duration_s: z.number().int().min(0).max(86_400).nullish(),
    distance_m: z.number().min(0).max(1_000_000).nullish(),
    rpe: z.number().min(1).max(10).nullish(),
    rest_s: z.number().int().min(0).max(7200).nullish(),
    set_type: SetTypeSchema.default('working'),
    completed_at: isoTs.nullish(),
    device_id: uuid.nullish(),
  })
  .refine((s) => s.reps != null || s.duration_s != null || s.distance_m != null, {
    message: 'A set needs reps, duration or distance',
  });

export const TransitionSessionSchema = z.object({
  id: uuid,
  action: SessionActionSchema,
  at: isoTs.nullish(),
});

// ── Rows returned by the server (validated at the client boundary) ─────────
const num = z.coerce.number(); // numeric columns arrive as numbers or strings
const nNum = num.nullable();

export const RoutineRowSchema = z.object({
  id: uuid,
  user_id: uuid,
  name: z.string(),
  notes: z.string().nullable(),
  schedule_days: z.array(z.number()),
  version: z.number().int(),
  archived_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SessionRowSchema = z.object({
  id: uuid,
  user_id: uuid,
  routine_id: uuid.nullable(),
  routine_version: z.number().int().nullable(),
  name: z.string(),
  status: SessionStatusSchema,
  started_at: z.string(),
  ended_at: z.string().nullable(),
  paused_at: z.string().nullable(),
  total_paused_s: z.number().int(),
  time_zone: z.string(),
  local_date: z.string(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  device_id: uuid.nullable(),
  energy_kcal: nNum,
  energy_is_estimated: z.boolean(),
  avg_hr: z.number().nullable(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SetRowSchema = z.object({
  id: uuid,
  session_id: uuid,
  session_exercise_id: uuid,
  user_id: uuid,
  set_index: z.number().int(),
  set_type: SetTypeSchema,
  weight_kg: nNum,
  reps: z.number().int().nullable(),
  duration_s: z.number().int().nullable(),
  distance_m: nNum,
  rpe: nNum,
  rest_s: z.number().int().nullable(),
  completed_at: z.string(),
  client_recorded_at: z.string().nullable(),
  device_id: uuid.nullable(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;
export type DeviceRegister = z.infer<typeof DeviceRegisterSchema>;
export type ExerciseCreate = z.input<typeof ExerciseCreateSchema>;
export type ExerciseSearch = z.input<typeof ExerciseSearchSchema>;
export type RoutineItem = z.infer<typeof RoutineItemSchema>;
export type SaveRoutineInput = z.input<typeof SaveRoutineSchema>;
export type StartSessionInput = z.input<typeof StartSessionSchema>;
export type RecordSetInput = z.input<typeof RecordSetSchema>;
export type TransitionSessionInput = z.input<typeof TransitionSessionSchema>;
export type RoutineRow = z.infer<typeof RoutineRowSchema>;
export type SessionRow = z.infer<typeof SessionRowSchema>;
export type SetRow = z.infer<typeof SetRowSchema>;
