/**
 * Typed data access for Kova Health web and mobile. Talks to Supabase with the user's session only;
 * authorization is enforced by RLS in the database, never here. See docs/api.md.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DeviceRegisterSchema,
  ExerciseCreateSchema,
  ExerciseSearchSchema,
  goalHasPace,
  OnboardingSchema,
  PreferencesUpdateSchema,
  ProfileUpdateSchema,
  RecordSetSchema,
  RoutineRowSchema,
  SaveRoutineSchema,
  SessionRowSchema,
  SetRowSchema,
  StartSessionSchema,
  TransitionSessionSchema,
  KovaError,
  type DeviceRegister,
  type ExerciseCreate,
  type ExerciseSearch,
  type OnboardingInput,
  type PreferencesUpdate,
  type ProfileUpdate,
  type RecordSetInput,
  type SaveRoutineInput,
  type StartSessionInput,
  type Tables,
  type TransitionSessionInput,
} from '@kova/domain';
import type { z } from 'zod';
import { toKovaError, unwrap, type SupabaseResult } from './errors.js';
import { Outbox, type OutboxOp, type OutboxStorage } from './outbox.js';
import { withRetry, type RetryOptions } from './retry.js';
import { createPeople } from './people.js';
import { createTracking } from './tracking.js';
export type { EnergyToday } from './tracking.js';

export { toKovaError } from './errors.js';
export { withRetry } from './retry.js';
export { inviteCode } from './people.js';
export * from './outbox.js';

export interface KovaClientOptions {
  url: string;
  anonKey: string;
  /** Inject a preconfigured client (e.g. with React Native AsyncStorage). */
  supabase?: SupabaseClient;
  fetch?: typeof fetch;
  retry?: RetryOptions;
}

export interface SyncCursor {
  updated_at: string;
  id: string;
}

export const SYNC_TABLES = [
  'routines',
  'routine_exercises',
  'workout_sessions',
  'workout_session_exercises',
  'workout_sets',
  'exercises',
  'foods',
  'recipes',
  'recipe_ingredients',
  'meals',
  'meal_items',
  'nutrition_goals',
  'habits',
  'habit_schedules',
  'habit_logs',
  'body_measurements',
  'health_observations',
  'goals',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new KovaError('INVALID_INPUT', 'Algún dato no es válido.');
  return r.data;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export function createKovaClient(opts: KovaClientOptions) {
  const sb: SupabaseClient =
    opts.supabase ??
    createClient(opts.url, opts.anonKey, opts.fetch ? { global: { fetch: opts.fetch } } : undefined);

  // supabase-js resolves network failures as `{ error }` too; normalise everything to KovaError.
  const call = async <R extends SupabaseResult>(p: PromiseLike<R>): Promise<NonNullable<R['data']>> => {
    try {
      return unwrap(await p);
    } catch (err) {
      throw toKovaError(err);
    }
  };
  const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> =>
    (await call(sb.rpc(fn, args))) as T;
  const idempotent = <T>(fn: () => Promise<T>) => withRetry(fn, opts.retry);

  const uid = async (): Promise<string> => {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new KovaError('UNAUTHENTICATED', 'Inicia sesión de nuevo.');
    return id;
  };

  const auth = {
    signUp: (email: string, password: string) => call(sb.auth.signUp({ email, password })),
    signIn: (email: string, password: string) => call(sb.auth.signInWithPassword({ email, password })),
    signOut: async () => {
      const { error } = await sb.auth.signOut();
      if (error) throw toKovaError(error);
    },
    requestPasswordReset: (email: string, redirectTo?: string) =>
      call(sb.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)),
    updatePassword: (password: string) => call(sb.auth.updateUser({ password })),
    userId: uid,
  };

  const profile = {
    get: async () => call(sb.from('profiles').select('*').eq('id', await uid()).single()),
    update: async (patch: ProfileUpdate) =>
      call(sb.from('profiles').update(parse(ProfileUpdateSchema, patch)).eq('id', await uid()).select().single()),
    getPreferences: async () => call(sb.from('user_preferences').select('*').eq('user_id', await uid()).single()),
    updatePreferences: async (patch: PreferencesUpdate) =>
      call(
        sb.from('user_preferences').update(parse(PreferencesUpdateSchema, patch)).eq('user_id', await uid()).select().single(),
      ),
    /**
     * Saves onboarding (profile, starting weight, nutrition target from local today) and marks it done.
     * Idempotent on `measurementId`; calling it again recalculates the target.
     */
    completeOnboarding: (input: OnboardingInput) => {
      const v = parse(OnboardingSchema, input);
      return idempotent(() =>
        rpc<Tables<'profiles'>>('complete_onboarding', {
          p_display_name: v.displayName ?? null, p_birth_year: v.birthYear, p_height_cm: v.heightCm, p_sex: v.sex,
          p_activity_level: v.activity, p_weight_goal: v.goal, p_goal_pace: goalHasPace(v.goal) ? v.pace : null,
          p_weight_kg: v.weightKg, p_measurement_id: v.measurementId, p_kcal: v.kcal, p_protein_g: v.proteinG,
          p_carbs_g: v.carbsG, p_fat_g: v.fatG, p_is_estimated: v.isEstimated, p_time_zone: v.timeZone ?? null,
        }),
      );
    },
  };

  const devices = {
    list: () => call(sb.from('devices').select('*').order('last_seen_at', { ascending: false, nullsFirst: false })),
    /** Idempotent on the device id; also refreshes last_seen_at. */
    register: async (input: DeviceRegister) => {
      const d = parse(DeviceRegisterSchema, input);
      return idempotent(() =>
        call(sb.from('devices').upsert({ ...d, last_seen_at: new Date().toISOString() }, { onConflict: 'id' }).select().single()),
      );
    },
  };

  const exercises = {
    search: async (params: ExerciseSearch = {}) => {
      const p = parse(ExerciseSearchSchema, params);
      const muscles = p.muscle ? 'exercise_muscles!inner(muscle_code, role)' : 'exercise_muscles(muscle_code, role)';
      const equipment = p.equipment ? 'exercise_equipment!inner(equipment_code)' : 'exercise_equipment(equipment_code)';
      let q = sb.from('exercises').select(`*, ${muscles}, ${equipment}`).is('archived_at', null);
      if (p.q) q = q.ilike('name', `%${escapeLike(p.q)}%`);
      if (p.muscle) q = q.eq('exercise_muscles.muscle_code', p.muscle);
      if (p.equipment) q = q.eq('exercise_equipment.equipment_code', p.equipment);
      return call(q.order('name').order('id').range(p.offset, p.offset + p.limit - 1));
    },
    get: (id: string) =>
      call(sb.from('exercises').select('*, exercise_muscles(muscle_code, role), exercise_equipment(equipment_code)').eq('id', id).single()),
    /** Every exercise the user can see (system catalog + own, not archived): names and media refs, for lookups. */
    catalog: async () => {
      const out: Array<{ id: string; name: string; short_name: string | null; owner_id: string | null; media: unknown }> = [];
      for (let from = 0; ; from += 1000) {
        const page = (await call(
          sb.from('exercises').select('id, name, short_name, owner_id, media').is('archived_at', null).order('name').order('id').range(from, from + 999),
        )) as typeof out;
        out.push(...page);
        if (page.length < 1000) return out;
      }
    },
    /** Idempotent on input.id. */
    create: async (input: ExerciseCreate) => {
      const e = parse(ExerciseCreateSchema, input);
      const { muscles, equipment, ...row } = e;
      await idempotent(() => call(sb.from('exercises').upsert(row, { onConflict: 'id', ignoreDuplicates: true })));
      if (muscles.length)
        await idempotent(() =>
          call(
            sb.from('exercise_muscles').upsert(
              muscles.map((m) => ({ exercise_id: e.id, muscle_code: m.code, role: m.role })),
              { onConflict: 'exercise_id,muscle_code', ignoreDuplicates: true },
            ),
          ),
        );
      if (equipment.length)
        await idempotent(() =>
          call(
            sb.from('exercise_equipment').upsert(
              equipment.map((code) => ({ exercise_id: e.id, equipment_code: code })),
              { onConflict: 'exercise_id,equipment_code', ignoreDuplicates: true },
            ),
          ),
        );
      return exercises.get(e.id);
    },
    /** User exercises are archived, not deleted, so history keeps resolving. */
    archive: (id: string) =>
      call(sb.from('exercises').update({ archived_at: new Date().toISOString() }).eq('id', id).select().single()),
  };

  const routines = {
    list: () =>
      call(
        sb.from('routines').select('*, routine_exercises(*)').is('deleted_at', null).is('archived_at', null)
          .order('created_at').order('position', { referencedTable: 'routine_exercises' }),
      ),
    get: (id: string) =>
      call(sb.from('routines').select('*, routine_exercises(*)').eq('id', id).order('position', { referencedTable: 'routine_exercises' }).single()),
    /** Create (expected_version omitted) or replace (expected_version = last seen). VERSION_CONFLICT on stale edits. */
    save: async (input: SaveRoutineInput) => {
      const r = parse(SaveRoutineSchema, input);
      return idempotent(async () =>
        RoutineRowSchema.parse(
          await rpc('save_routine', {
            p_id: r.id,
            p_name: r.name,
            p_items: r.items,
            p_schedule_days: r.schedule_days,
            p_notes: r.notes ?? null,
            p_expected_version: r.expected_version ?? null,
          }),
        ),
      );
    },
    duplicate: (sourceId: string, newRoutineId: string, name?: string) =>
      idempotent(async () =>
        RoutineRowSchema.parse(await rpc('duplicate_routine', { p_source_id: sourceId, p_new_id: newRoutineId, p_name: name ?? null })),
      ),
    remove: (id: string) =>
      call(sb.from('routines').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single()),
  };

  const workouts = {
    start: async (input: StartSessionInput) => {
      const s = parse(StartSessionSchema, input);
      return idempotent(async () =>
        SessionRowSchema.parse(
          await rpc('start_session', {
            p_id: s.id,
            p_routine_id: s.routine_id ?? null,
            p_name: s.name ?? null,
            p_exercises: s.exercises ?? null,
            p_started_at: s.started_at ?? null,
            p_time_zone: s.time_zone ?? null,
            p_device_id: s.device_id ?? null,
          }),
        ),
      );
    },
    recordSet: async (input: RecordSetInput) => {
      const s = parse(RecordSetSchema, input);
      return idempotent(async () =>
        SetRowSchema.parse(
          await rpc('record_set', {
            p_id: s.id,
            p_session_exercise_id: s.session_exercise_id,
            p_set_index: s.set_index,
            p_weight_kg: s.weight_kg ?? null,
            p_reps: s.reps ?? null,
            p_duration_s: s.duration_s ?? null,
            p_distance_m: s.distance_m ?? null,
            p_rpe: s.rpe ?? null,
            p_rest_s: s.rest_s ?? null,
            p_set_type: s.set_type,
            p_completed_at: s.completed_at ?? null,
            p_device_id: s.device_id ?? null,
          }),
        ),
      );
    },
    transition: async (input: TransitionSessionInput) => {
      const t = parse(TransitionSessionSchema, input);
      return idempotent(async () =>
        SessionRowSchema.parse(await rpc('transition_session', { p_id: t.id, p_action: t.action, p_at: t.at ?? null })),
      );
    },
    /** The single in_progress/paused session, if any (for resuming after a crash or on another device). */
    active: async () => {
      const rows = await call(
        sb.from('workout_sessions').select('*').in('status', ['in_progress', 'paused']).is('deleted_at', null).limit(1),
      );
      return rows?.[0] ? SessionRowSchema.parse(rows[0]) : null;
    },
    get: (id: string) =>
      call(
        sb.from('workout_sessions')
          .select('*, workout_session_exercises(*, workout_sets(*))')
          .eq('id', id)
          .order('position', { referencedTable: 'workout_session_exercises' })
          .single(),
      ),
    updateSet: (id: string, patch: Partial<Pick<RecordSetInput, 'weight_kg' | 'reps' | 'duration_s' | 'distance_m' | 'rpe' | 'rest_s' | 'set_type'>>) =>
      call(sb.from('workout_sets').update(patch).eq('id', id).select().single()),
    deleteSet: (id: string) =>
      call(sb.from('workout_sets').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single()),
    updateNotes: (id: string, notes: string | null, tags: string[] = []) =>
      call(sb.from('workout_sessions').update({ notes, tags }).eq('id', id).select().single()),
    summaries: (limit = 20, beforeLocalDate?: string) => {
      let q = sb.from('session_summaries').select('*').order('local_date', { ascending: false }).order('started_at', { ascending: false }).limit(limit);
      if (beforeLocalDate) q = q.lt('local_date', beforeLocalDate);
      return call(q);
    },
    history: (exerciseId: string, limit = 200) =>
      call(sb.from('exercise_history').select('*').eq('exercise_id', exerciseId).order('completed_at', { ascending: false }).limit(limit)),
    personalRecords: () => call(sb.from('personal_records').select('*')),
    /** Latest working sets across exercises (e.g. "last weight used" per exercise). */
    recentHistory: (limit = 500) =>
      call(sb.from('exercise_history').select('*').order('completed_at', { ascending: false }).limit(Math.min(limit, 1000))),
    /** Notes, tags and heart rate for sessions listed in summaries. */
    sessionDetails: (ids: string[]) =>
      ids.length === 0
        ? Promise.resolve([] as Array<{ id: string; notes: string | null; tags: string[]; avg_hr: number | null }>)
        : call(sb.from('workout_sessions').select('id, notes, tags, avg_hr').in('id', ids)),
  };

  const sync = {
    /** Keyset pull of rows changed after `cursor`, tombstones included (docs/sync.md). */
    pull: async (table: SyncTable, cursor: SyncCursor | null, limit = 500) => {
      let q = sb.from(table).select('*').order('updated_at').order('id').limit(limit);
      if (cursor) {
        q = q.or(`updated_at.gt."${cursor.updated_at}",and(updated_at.eq."${cursor.updated_at}",id.gt.${cursor.id})`);
      }
      const rows = (await call(q)) as Array<{ updated_at: string; id: string }>;
      const last = rows.at(-1);
      return { rows, cursor: last ? { updated_at: last.updated_at, id: last.id } : cursor };
    },
  };

  const tracking = createTracking({ sb, call, rpc, idempotent, parse, uid });
  const people = createPeople({ rpc });

  const sendOp = (op: OutboxOp): Promise<unknown> => {
    switch (op.kind) {
      case 'start_session':
        return workouts.start(op.input);
      case 'record_set':
        return workouts.recordSet(op.input);
      case 'transition_session':
        return workouts.transition(op.input);
      case 'log_food':
        return tracking.nutrition.logFood(op.input);
      case 'log_habit':
        return tracking.habits.log(op.input);
      case 'record_measurement':
        return tracking.body.record([op.input]);
      case 'record_observation':
        return tracking.health.record([op.input]);
    }
  };

  const account = {
    export: () => rpc<Record<string, unknown>>('export_my_data', {}),
    /** Permanently deletes the account and all its data (server-side, service role). */
    delete: async () => {
      const { data, error } = await sb.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
      if (error) throw toKovaError(error, (error as { context?: { status?: number } }).context?.status);
      await sb.auth.signOut({ scope: 'local' });
      return data as { deleted: true };
    },
  };

  return {
    supabase: sb,
    auth,
    profile,
    devices,
    exercises,
    routines,
    workouts,
    ...tracking,
    people,
    sync,
    account,
    entitlements: { has: (code: string) => rpc<boolean>('has_entitlement', { p_code: code }) },
    /** Outbox wired to this client's idempotent RPCs. Pass durable storage on mobile/watch. */
    createOutbox: (storage?: OutboxStorage) => new Outbox(sendOp, storage),
  };
}

export type KovaClient = ReturnType<typeof createKovaClient>;
