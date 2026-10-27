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

// ── Nutrition ──────────────────────────────────────────────────────────────
const localDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const grams = z.number().min(0).max(2000);

export const FoodUnitSchema = z.enum(['g', 'ml', 'serving']);
export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack']);
/** Users can only create 'label', 'user' or 'estimated' foods; 'verified' is catalog-only. */
export const UserNutritionSourceSchema = z.enum(['label', 'user', 'estimated']);

export const FoodCreateSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(120),
    brand: text(80).nullish(),
    barcode: z.string().regex(/^[0-9]{8,14}$/).nullish(),
    ref_amount: z.number().positive().max(10_000),
    ref_unit: FoodUnitSchema,
    serving_label: text(60).nullish(),
    default_quantity: z.number().positive().max(10_000).nullish(),
    kcal: z.number().min(0).max(20_000),
    protein_g: grams,
    carbs_g: grams,
    fat_g: grams,
    fiber_g: grams.nullish(),
    data_source: UserNutritionSourceSchema.default('user'),
  })
  .refine((f) => f.ref_unit === 'serving' || f.protein_g + f.carbs_g + f.fat_g + (f.fiber_g ?? 0) <= f.ref_amount * 1.02, {
    message: 'Macros exceed the reference amount',
  });

export const LogFoodSchema = z
  .object({
    id: uuid,
    local_date: localDateStr,
    slot: MealSlotSchema,
    quantity: z.number().positive().max(10_000),
    food_id: uuid.nullish(),
    recipe_id: uuid.nullish(),
    name: z.string().trim().min(1).max(120).nullish(),
    kcal: z.number().min(0).max(20_000).nullish(),
    protein_g: grams.nullish(),
    carbs_g: grams.nullish(),
    fat_g: grams.nullish(),
    logged_at: isoTs.nullish(),
    device_id: uuid.nullish(),
  })
  .refine((l) => [l.food_id, l.recipe_id, l.name].filter((x) => x != null).length === 1, {
    message: 'Give exactly one of food_id, recipe_id or a manual entry',
  })
  .refine((l) => l.name == null || (l.kcal != null && l.protein_g != null && l.carbs_g != null && l.fat_g != null), {
    message: 'Manual entries need kcal and macros',
  });

export const SaveRecipeSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(120),
  servings: z.number().positive().max(100).default(1),
  notes: text(2000).nullish(),
  ingredients: z.array(z.object({ food_id: uuid, quantity: z.number().positive().max(10_000) })).min(1).max(50),
});

export const NutritionGoalSchema = z
  .object({
    effective_from: localDateStr,
    kcal: z.number().int().min(500).max(10_000).nullish(),
    protein_g: z.number().int().min(0).max(1000).nullish(),
    carbs_g: z.number().int().min(0).max(1500).nullish(),
    fat_g: z.number().int().min(0).max(1000).nullish(),
  })
  .refine((g) => g.kcal != null || g.protein_g != null || g.carbs_g != null || g.fat_g != null, 'Set at least one goal');

// ── Habits ─────────────────────────────────────────────────────────────────
export const SaveHabitSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(80),
    effective_from: localDateStr,
    kind: z.enum(['check', 'count', 'duration']).default('check'),
    unit: text(20).nullish(),
    icon: z.string().regex(/^[a-z0-9-]{1,40}$/).nullish(),
    frequency: z.enum(['daily', 'weekly']).default('daily'),
    days: z.array(z.number().int().min(1).max(7)).max(7).refine((d) => new Set(d).size === d.length, 'Duplicate day').default([]),
    times_per_week: z.number().int().min(1).max(7).nullish(),
    target_value: z.number().positive().max(100_000).nullish(),
  })
  .refine((h) => (h.frequency === 'weekly') === (h.times_per_week != null), {
    message: 'times_per_week is required for weekly habits and only for them',
  });

export const LogHabitSchema = z.object({
  id: uuid,
  habit_id: uuid,
  local_date: localDateStr,
  value: z.number().positive().max(100_000).default(1),
  note: text(500).nullish(),
  device_id: uuid.nullish(),
});

// ── Body, health, goals ────────────────────────────────────────────────────
export const DataOriginSchema = z.enum(['manual', 'health_connect', 'healthkit', 'wear_os', 'import']);
export const BodyMetricSchema = z.enum([
  'weight_kg', 'body_fat_pct', 'muscle_mass_kg', 'lean_mass_kg',
  'waist_cm', 'hip_cm', 'chest_cm', 'arm_cm', 'thigh_cm', 'neck_cm',
]);
export const HealthMetricSchema = z.enum([
  'sleep_session', 'resting_hr_bpm', 'hrv_rmssd_ms', 'steps', 'distance_m',
  'active_energy_kcal', 'active_minutes', 'mood', 'stress',
]);

const BODY_RANGE: Record<z.infer<typeof BodyMetricSchema>, [number, number]> = {
  weight_kg: [20, 400], body_fat_pct: [2, 75], muscle_mass_kg: [5, 150], lean_mass_kg: [10, 250],
  waist_cm: [10, 250], hip_cm: [10, 250], chest_cm: [10, 250], arm_cm: [10, 250], thigh_cm: [10, 250], neck_cm: [10, 250],
};
const HEALTH_RANGE: Record<z.infer<typeof HealthMetricSchema>, [number, number, boolean?]> = {
  sleep_session: [0, 1440], resting_hr_bpm: [20, 250], hrv_rmssd_ms: [1, 400], steps: [0, 200_000, true],
  distance_m: [0, 500_000], active_energy_kcal: [0, 20_000], active_minutes: [0, 1440], mood: [1, 5, true], stress: [0, 100],
};
const INTERVAL_METRICS = new Set(['sleep_session', 'steps', 'distance_m', 'active_energy_kcal', 'active_minutes']);

const provenance = {
  source: DataOriginSchema.default('manual'),
  source_app: text(80).nullish(),
  external_id: text(200).nullish(),
  is_estimated: z.boolean().default(false),
  time_zone: TimeZoneSchema.nullish(),
  device_id: uuid.nullish(),
};

export const BodyMeasurementSchema = z
  .object({ id: uuid, metric: BodyMetricSchema, value: z.number(), measured_at: isoTs, note: text(500).nullish(), ...provenance })
  .refine((m) => m.value >= BODY_RANGE[m.metric][0] && m.value <= BODY_RANGE[m.metric][1], { message: 'Value out of range for this metric' });

export const HealthObservationSchema = z
  .object({
    id: uuid,
    metric: HealthMetricSchema,
    value: z.number(),
    start_at: isoTs,
    end_at: isoTs.nullish(),
    details: z.record(z.unknown()).default({}),
    ...provenance,
  })
  .refine((o) => {
    const [min, max, integer] = HEALTH_RANGE[o.metric];
    return o.value >= min && o.value <= max && (!integer || Number.isInteger(o.value));
  }, { message: 'Value out of range for this metric' })
  .refine((o) => !INTERVAL_METRICS.has(o.metric) || o.end_at != null, { message: 'This metric needs end_at' })
  .refine((o) => o.end_at == null || Date.parse(o.end_at) > Date.parse(o.start_at), { message: 'end_at must be after start_at' })
  .refine(
    (o) => o.metric !== 'sleep_session' || o.end_at == null ||
      (Date.parse(o.end_at) - Date.parse(o.start_at) <= 86_400_000 && o.value <= (Date.parse(o.end_at) - Date.parse(o.start_at)) / 60_000),
    { message: 'Sleep minutes cannot exceed the session length (max 24 h)' },
  );

export const GoalSchema = z
  .object({
    id: uuid,
    kind: z.enum(['weight', 'steps_daily', 'sleep_minutes_daily', 'workouts_weekly', 'custom']),
    title: z.string().trim().min(1).max(120),
    target_value: z.number().min(0),
    start_value: z.number().nullish(),
    unit: text(20).nullish(),
    start_date: localDateStr,
    target_date: localDateStr.nullish(),
    notes: text(2000).nullish(),
  })
  .refine((g) => g.target_date == null || g.target_date >= g.start_date, { message: 'target_date before start_date' });

export const DateRangeSchema = z
  .object({ from: localDateStr, to: localDateStr })
  .refine((r) => r.to >= r.from, 'to must be on or after from');

export type FoodCreate = z.input<typeof FoodCreateSchema>;
export type LogFoodInput = z.input<typeof LogFoodSchema>;
export type SaveRecipeInput = z.input<typeof SaveRecipeSchema>;
export type NutritionGoalInput = z.input<typeof NutritionGoalSchema>;
export type SaveHabitInput = z.input<typeof SaveHabitSchema>;
export type LogHabitInput = z.input<typeof LogHabitSchema>;
export type BodyMeasurementInput = z.input<typeof BodyMeasurementSchema>;
export type HealthObservationInput = z.input<typeof HealthObservationSchema>;
export type GoalInput = z.input<typeof GoalSchema>;
