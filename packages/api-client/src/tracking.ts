/** Nutrition, habits, body, health, goals and daily summaries (phase 4). See docs/api.md. */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BodyMeasurementSchema,
  DateRangeSchema,
  FoodCreateSchema,
  GoalSchema,
  HealthObservationSchema,
  LogFoodSchema,
  LogHabitSchema,
  NutritionGoalSchema,
  SaveHabitSchema,
  SaveRecipeSchema,
  type BodyMeasurementInput,
  type FoodCreate,
  type GoalInput,
  type HabitDay,
  type HealthObservationInput,
  type LogFoodInput,
  type LogHabitInput,
  type NutritionGoalInput,
  type SaveHabitInput,
  type SaveRecipeInput,
} from '@vida/domain';
import type { z } from 'zod';
import type { SupabaseResult } from './errors.js';

export interface TrackingDeps {
  sb: SupabaseClient;
  call: <R extends SupabaseResult>(p: PromiseLike<R>) => Promise<NonNullable<R['data']>>;
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
  idempotent: <T>(fn: () => Promise<T>) => Promise<T>;
  parse: <S extends z.ZodTypeAny>(schema: S, input: unknown) => z.output<S>;
  uid: () => Promise<string>;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const now = () => new Date().toISOString();

export function createTracking({ sb, call, rpc, idempotent, parse }: TrackingDeps) {
  const nutrition = {
    /** Catalog + own foods, by name. Each row carries `data_source` so the UI can label estimates. */
    searchFoods: (q: string, limit = 30) =>
      call(
        sb.from('foods').select('*').is('archived_at', null)
          .ilike('name', `%${escapeLike(q.trim().slice(0, 80))}%`).order('name').limit(Math.min(limit, 100)),
      ),
    /** Idempotent on input.id. */
    createFood: async (input: FoodCreate) => {
      const f = parse(FoodCreateSchema, input);
      return idempotent(async () => {
        await call(sb.from('foods').upsert(f, { onConflict: 'id', ignoreDuplicates: true }));
        return call(sb.from('foods').select('*').eq('id', f.id).single());
      });
    },
    /** Snapshot the item's nutrients at logging time. Idempotent on input.id. */
    logFood: async (input: LogFoodInput) => {
      const l = parse(LogFoodSchema, input);
      return idempotent(() =>
        rpc('log_food', {
          p_item_id: l.id, p_local_date: l.local_date, p_slot: l.slot, p_quantity: l.quantity,
          p_food_id: l.food_id ?? null, p_recipe_id: l.recipe_id ?? null, p_name: l.name ?? null,
          p_kcal: l.kcal ?? null, p_protein_g: l.protein_g ?? null, p_carbs_g: l.carbs_g ?? null,
          p_fat_g: l.fat_g ?? null, p_logged_at: l.logged_at ?? null, p_device_id: l.device_id ?? null,
        }),
      );
    },
    /** To change a logged quantity: remove the item and log it again (snapshots are immutable). */
    removeItem: (itemId: string) =>
      call(sb.from('meal_items').update({ deleted_at: now() }).eq('id', itemId).select().single()),
    /** Meals of one day with their live items. */
    day: (localDate: string) =>
      call(
        sb.from('meals').select('*, meal_items(*)').eq('local_date', localDate).is('deleted_at', null)
          .is('meal_items.deleted_at', null).order('slot'),
      ),
    frequentFoods: (limit = 10) =>
      call(sb.from('frequent_foods').select('*, foods(*)').order('times_logged', { ascending: false }).limit(limit)),
    /** Create or replace a recipe (reusable meal) and its ingredients. Idempotent on input.id. */
    saveRecipe: async (input: SaveRecipeInput) => {
      const r = parse(SaveRecipeSchema, input);
      await idempotent(() =>
        call(sb.from('recipes').upsert({ id: r.id, name: r.name, servings: r.servings, notes: r.notes ?? null }, { onConflict: 'id' })),
      );
      await call(sb.from('recipe_ingredients').delete().eq('recipe_id', r.id));
      await call(
        sb.from('recipe_ingredients').insert(
          r.ingredients.map((i, position) => ({ recipe_id: r.id, food_id: i.food_id, quantity: i.quantity, position })),
        ),
      );
      return call(sb.from('recipes').select('*, recipe_ingredients(*)').eq('id', r.id).single());
    },
    recipeNutrition: (recipeId: string) =>
      call(sb.from('recipe_nutrition').select('*').eq('recipe_id', recipeId).maybeSingle()),
    /** Adds (or replaces) the goal that applies from `effective_from`; earlier days keep their goal. */
    setGoal: async (input: NutritionGoalInput) => {
      const g = parse(NutritionGoalSchema, input);
      // user_id comes from its auth.uid() default, never from the client.
      return call(sb.from('nutrition_goals').upsert(g, { onConflict: 'user_id,effective_from' }).select().single());
    },
  };

  const habits = {
    list: () =>
      call(
        sb.from('habits').select('*, habit_schedules(*)').is('deleted_at', null).is('archived_at', null)
          .order('position').order('effective_from', { referencedTable: 'habit_schedules', ascending: false }),
      ),
    /** Create a habit or set its schedule from a date on; past days keep their old rules. */
    save: async (input: SaveHabitInput) => {
      const h = parse(SaveHabitSchema, input);
      return idempotent(() =>
        rpc('save_habit', {
          p_id: h.id, p_name: h.name, p_effective_from: h.effective_from, p_kind: h.kind, p_unit: h.unit ?? null,
          p_icon: h.icon ?? null, p_frequency: h.frequency, p_days: h.days, p_times_per_week: h.times_per_week ?? null,
          p_target_value: h.target_value ?? null,
        }),
      );
    },
    /** Idempotent on input.id; several logs per day add up (e.g. glasses of water). */
    log: async (input: LogHabitInput) => {
      const l = parse(LogHabitSchema, input);
      return idempotent(async () => {
        await call(sb.from('habit_logs').upsert(l, { onConflict: 'id', ignoreDuplicates: true }));
        return call(sb.from('habit_logs').select('*').eq('id', l.id).single());
      });
    },
    unlog: (logId: string) =>
      call(sb.from('habit_logs').update({ deleted_at: now() }).eq('id', logId).select().single()),
    archive: (habitId: string) =>
      call(sb.from('habits').update({ archived_at: now() }).eq('id', habitId).select().single()),
    /** Per habit and day, judged with the schedule in force that day. Feed to dailyStreak/weeklyStreak. */
    days: async (from: string, to: string) => {
      const r = parse(DateRangeSchema, { from, to });
      return rpc<Array<HabitDay & { habit_id: string }>>('habit_days', { p_from: r.from, p_to: r.to });
    },
  };

  const body = {
    /** Batch, idempotent on id and on (source, external_id). Returns how many rows were new. */
    record: async (rows: BodyMeasurementInput[]) => {
      const parsed = rows.map((r) => parse(BodyMeasurementSchema, r));
      return idempotent(() => rpc<number>('record_body_measurements', { p_rows: parsed }));
    },
    history: (metric: string, limit = 100) =>
      call(
        sb.from('body_measurements').select('*').eq('metric', metric).is('deleted_at', null)
          .order('measured_at', { ascending: false }).limit(limit),
      ),
    remove: (id: string) =>
      call(sb.from('body_measurements').update({ deleted_at: now() }).eq('id', id).select().single()),
  };

  const health = {
    /** Batch import (Health Connect / HealthKit / manual). Idempotent. Returns how many rows were new. */
    record: async (rows: HealthObservationInput[]) => {
      const parsed = rows.map((r) => parse(HealthObservationSchema, r));
      return idempotent(() => rpc<number>('record_observations', { p_rows: parsed }));
    },
    series: async (metric: string, from: string, to: string) => {
      const r = parse(DateRangeSchema, { from, to });
      return call(
        sb.from('health_observations').select('*').eq('metric', metric).is('deleted_at', null)
          .gte('local_date', r.from).lte('local_date', r.to).order('start_at'),
      );
    },
    remove: (id: string) =>
      call(sb.from('health_observations').update({ deleted_at: now() }).eq('id', id).select().single()),
  };

  const goals = {
    list: () => call(sb.from('goals').select('*').is('deleted_at', null).order('created_at')),
    /** Idempotent on input.id. */
    create: async (input: GoalInput) => {
      const g = parse(GoalSchema, input);
      return idempotent(async () => {
        await call(sb.from('goals').upsert(g, { onConflict: 'id', ignoreDuplicates: true }));
        return call(sb.from('goals').select('*').eq('id', g.id).single());
      });
    },
    setStatus: (id: string, status: 'active' | 'achieved' | 'abandoned') =>
      call(
        sb.from('goals').update({ status, achieved_at: status === 'achieved' ? now() : null }).eq('id', id).select().single(),
      ),
  };

  const summaries = {
    /** One row per day (max 93 days), computed from source records. Missing data is null. */
    daily: async (from: string, to: string) => {
      const r = parse(DateRangeSchema, { from, to });
      return rpc<Array<Record<string, unknown> & { local_date: string }>>('daily_summaries', { p_from: r.from, p_to: r.to });
    },
  };

  return { nutrition, habits, body, health, goals, summaries };
}
