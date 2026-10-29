/** Nutrition, habits, body, health, goals and daily summaries (phase 4). See docs/api.md. */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addDays,
  ageFromBirthYear,
  bestRestingEnergy,
  dailyTarget,
  generateInsights,
  navyBodyFat,
  type ActivityLevel,
  type DailyTarget,
  type GoalPace,
  type RestingEnergy,
  type Sex,
  type WeightGoal,
  type DaySummary,
  type HabitDayLite,
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
} from '@kova/domain';
import type { z } from 'zod';
import type { SupabaseResult } from './errors.js';

/** Result of `energy.today`: the target to show today and how it was obtained. */
export interface EnergyToday {
  /** dynamic = resting energy + today's activity; fixed = the numbers the user typed (or missing profile data). */
  mode: 'dynamic' | 'fixed';
  /** The saved plan (nutrition_goals row in effect). */
  plan: { kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  rmr: RestingEnergy | null;
  bodyFat: { pct: number; source: 'device' | 'manual' | 'tape'; measuredAt: string } | null;
  day: DailyTarget | null;
}

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
    /** Latest body fat % (with its source) and tape measurements, for the energy formulas. */
    composition: async () => {
      const latest = async (metric: string) => {
        const rows = (await call(
          sb.from('body_measurements').select('value, measured_at, source').eq('metric', metric).is('deleted_at', null)
            .order('measured_at', { ascending: false }).limit(1),
        )) as Array<{ value: number | string; measured_at: string; source: string }>;
        return rows[0] ? { value: Number(rows[0].value), measuredAt: rows[0].measured_at, source: rows[0].source } : null;
      };
      const [fat, neck, waist, hip] = await Promise.all([latest('body_fat_pct'), latest('neck_cm'), latest('waist_cm'), latest('hip_cm')]);
      return { fat, neck, waist, hip };
    },
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

  const insights = {
    /** Times each insight was shown since `sinceLocalDate` (for novelty/fatigue scoring). */
    shownCounts: async (sinceLocalDate: string) => {
      const rows = (await call(
        sb.from('shown_insights').select('insight_key').gte('shown_on', sinceLocalDate),
      )) as Array<{ insight_key: string }>;
      return rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.insight_key]: (acc[r.insight_key] ?? 0) + 1 }), {});
    },
    /** Records that these insights were shown today. Idempotent per insight and day. */
    markShown: (items: Array<{ key: string; kind: string }>, localDate: string) =>
      items.length === 0
        ? Promise.resolve(null)
        : call(
            sb.from('shown_insights').upsert(
              items.map((i) => ({ insight_key: i.key, kind: i.kind, shown_on: localDate })),
              { onConflict: 'user_id,insight_key,shown_on', ignoreDuplicates: true },
            ),
          ),
    feedback: (key: string, localDate: string, value: 'useful' | 'not_useful') =>
      call(sb.from('shown_insights').update({ feedback: value }).eq('insight_key', key).eq('shown_on', localDate)),
    /**
     * Today's insights: deterministic rules over the last 60 days (computed on the device, no AI),
     * ranked with novelty/fatigue, and recorded as shown. Returns [] when there is not enough data.
     */
    today: async (today: string, limit = 5) => {
      const from = addDays(today, -59);
      const [days, habitDays, shown] = await Promise.all([
        rpc<Array<Record<string, unknown>>>('daily_summaries', { p_from: from, p_to: today }),
        rpc<HabitDayLite[]>('habit_days', { p_from: from, p_to: today }),
        insights.shownCounts(addDays(today, -13)),
      ]);
      const num = (v: unknown) => (v == null ? null : Number(v));
      const summaries: DaySummary[] = days.map((d) => ({
        local_date: String(d.local_date), workouts_completed: Number(d.workouts_completed ?? 0), kcal: num(d.kcal),
        protein_g: num(d.protein_g), protein_goal_g: num(d.protein_goal_g), weight_kg: num(d.weight_kg),
        steps: num(d.steps), sleep_min: num(d.sleep_min), mood: num(d.mood),
      }));
      const list = generateInsights(summaries, habitDays, shown, limit);
      await insights.markShown(list.map((i) => ({ key: i.key, kind: i.kind })), today).catch(() => undefined);
      return list;
    },
  };

  const energy = {
    /**
     * Today's nutrition target. Dynamic (resting energy + today's activity, docs/api.md §Energy) when
     * the plan was calculated by Kova Health; the user's own numbers when they typed them; null without a plan.
     * Body fat comes from the latest measurement (≤ 30 days), else from tape measurements (≤ 90 days).
     */
    today: async (today: string): Promise<EnergyToday | null> => {
      const [profiles, goals, days, weights, comp] = await Promise.all([
        call(sb.from('profiles').select('sex, birth_year, height_cm, activity_level, weight_goal, goal_pace').limit(1)),
        call(sb.from('nutrition_goals').select('*').lte('effective_from', today).order('effective_from', { ascending: false }).limit(1)),
        rpc<Array<Record<string, unknown>>>('daily_summaries', { p_from: addDays(today, -7), p_to: today }),
        body.history('weight_kg', 1),
        body.composition(),
      ]);
      const p = (profiles as Array<Record<string, unknown>>)[0];
      const g = (goals as Array<Record<string, unknown>>)[0];
      if (!g) return null;
      const n = (v: unknown) => (v == null ? null : Number(v));
      const plan = { kcal: n(g.kcal), proteinG: n(g.protein_g), carbsG: n(g.carbs_g), fatG: n(g.fat_g) };
      const w = n((weights as Array<{ value: unknown }>)[0]?.value);
      const { fat, neck, waist, hip } = comp;
      if (!g.is_estimated || !p?.sex || !p.birth_year || !p.height_cm || !p.weight_goal || w == null) {
        return { mode: 'fixed', plan, kcal: plan.kcal, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, rmr: null, bodyFat: null, day: null };
      }
      const sex = p.sex as Sex;
      const heightCm = Number(p.height_cm);
      const ageDays = (iso: string) => (Date.parse(today) - Date.parse(iso.slice(0, 10))) / 86_400_000;
      let bodyFat: EnergyToday['bodyFat'] = null;
      if (fat && ageDays(fat.measuredAt) <= 30) {
        bodyFat = { pct: fat.value, source: fat.source === 'manual' ? 'manual' : 'device', measuredAt: fat.measuredAt };
      } else if (neck && waist && ageDays(waist.measuredAt) <= 90) {
        const pct = navyBodyFat(sex, heightCm, neck.value, waist.value, hip?.value ?? null);
        if (pct != null) bodyFat = { pct, source: 'tape', measuredAt: waist.measuredAt };
      }
      const rmr = bestRestingEnergy({
        sex, age: ageFromBirthYear(Number(p.birth_year), today), heightCm, weightKg: w,
        activity: p.activity_level as ActivityLevel | null, bodyFatPct: bodyFat?.pct ?? null,
      });
      const todayRow = days.find((d) => String(d.local_date) === today);
      const past = days.filter((d) => String(d.local_date) !== today && d.steps != null).map((d) => Number(d.steps));
      // Macros are recomputed with today's data (reference weight, body fat), not copied from the saved plan.
      const day = dailyTarget({
        sex, restingKcal: rmr.kcal, weightKg: w, heightCm, leanMassKg: rmr.leanMassKg,
        goal: p.weight_goal as WeightGoal, pace: (p.goal_pace as GoalPace | null) ?? null,
        steps: n(todayRow?.steps), avgSteps7d: past.length ? past.reduce((a, b) => a + b, 0) / past.length : null,
        workoutMinutes: (n(todayRow?.workout_active_s) ?? 0) / 60,
      });
      return { mode: 'dynamic', plan, kcal: day.kcal, proteinG: day.proteinG, carbsG: day.carbsG, fatG: day.fatG, rmr, bodyFat, day };
    },
  };

  return { nutrition, habits, body, health, goals, summaries, insights, energy };
}
