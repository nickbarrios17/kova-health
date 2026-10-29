/**
 * Energy and macro targets. Pure and shared by web and mobile; every result is an estimate (shown
 * as such) and the user can always type their own numbers instead. Rules: docs/api.md §Energy.
 *
 * - Resting energy, best available method (bestRestingEnergy):
 *   body fat % known → Cunningham (1980) on lean mass; very active → Ten-Haaf (2014);
 *   otherwise Mifflin-St Jeor (1990). Body fat can come from the watch (bioimpedance), typed in,
 *   or the US Navy tape formula (navyBodyFat).
 * - Onboarding target: resting × activity factor (energyTarget).
 * - Daily target: resting × 1.2 plus that day's measured activity, partly credited (dailyTarget).
 * - Goal: percentage adjustment by pace, rounded to 50 kcal, never below a safety floor.
 * - Macros: protein by body weight, fat at least 0.8 g/kg or 25% of energy, carbs the rest.
 */
import { z } from 'zod';
import { nf } from './format.js';

export const SexSchema = z.enum(['male', 'female']);
export const ActivityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'very_active']);
export const WeightGoalSchema = z.enum(['lose', 'maintain', 'gain', 'recomp']);
export const GoalPaceSchema = z.enum(['light', 'moderate', 'aggressive']);
export type Sex = z.infer<typeof SexSchema>;
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;
export type WeightGoal = z.infer<typeof WeightGoalSchema>;
export type GoalPace = z.infer<typeof GoalPaceSchema>;

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725 };

/** Only losing and gaining have a pace; maintain and recomposition do not. */
export const goalHasPace = (g: WeightGoal | null | undefined): g is 'lose' | 'gain' => g === 'lose' || g === 'gain';

/**
 * Body recomposition (lose fat and gain muscle at once): calories a little under maintenance
 * and higher protein. Works best for beginners, people returning to training, or with fat to lose.
 */
export const RECOMP_ADJUST = -0.05;

/** Protein per kg of reference weight: higher in a deficit and during recomposition, to keep or build muscle. */
export const PROTEIN_PER_KG: Record<WeightGoal, number> = { lose: 2.0, maintain: 1.8, gain: 1.8, recomp: 2.2 };

/** Signed fraction applied to the total for a goal and pace (0 when maintaining). */
export const goalAdjust = (goal: WeightGoal, pace: GoalPace | null | undefined): number =>
  goal === 'recomp' ? RECOMP_ADJUST : goalHasPace(goal) && pace ? PACE_ADJUST[goal][pace] : 0;

/** Fraction added to (gain) or removed from (lose) the total. */
export const PACE_ADJUST: Record<'lose' | 'gain', Record<GoalPace, number>> = {
  lose: { light: -0.1, moderate: -0.2, aggressive: -0.25 },
  gain: { light: 0.05, moderate: 0.1, aggressive: 0.15 },
};

/** Lowest target Kova Health will suggest without supervision. */
export const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

export const SEX_LABEL: Record<Sex, string> = { male: 'Hombre', female: 'Mujer' };
export const ACTIVITY_LABEL: Record<ActivityLevel, [label: string, hint: string]> = {
  sedentary: ['Sedentaria', 'Trabajo sentado, poco movimiento'],
  light: ['Ligera', 'Caminas a diario o entrenas 1–3 días'],
  moderate: ['Moderada', 'Entrenas 3–5 días por semana'],
  very_active: ['Muy activa', 'Entrenas 6–7 días o trabajo físico'],
};
export const GOAL_LABEL: Record<WeightGoal, string> = { lose: 'Bajar de peso', maintain: 'Mantener', gain: 'Subir de peso', recomp: 'Recomposición corporal' };
export const GOAL_HINT: Record<WeightGoal, string> = {
  lose: 'Perder grasa con un déficit de calorías',
  maintain: 'Mantener tu peso actual',
  gain: 'Ganar peso y músculo con un excedente',
  recomp: 'Perder grasa y ganar músculo a la vez: calorías cerca de mantenimiento y más proteína',
};
export const PACE_LABEL: Record<GoalPace, string> = { light: 'Liviano', moderate: 'Moderado', aggressive: 'Agresivo' };

export const EnergyInputSchema = z
  .object({
    sex: SexSchema,
    age: z.number().int().min(14).max(100),
    heightCm: z.number().min(120).max(230),
    weightKg: z.number().min(30).max(300),
    activity: ActivityLevelSchema,
    goal: WeightGoalSchema,
    pace: GoalPaceSchema.nullable(),
    /** Body fat %, if known: switches resting energy to the lean-mass formula. */
    bodyFatPct: z.number().min(3).max(60).nullish(),
  })
  .refine((v) => !goalHasPace(v.goal) || v.pace != null, { message: 'Elige un ritmo', path: ['pace'] });
export type EnergyInput = z.input<typeof EnergyInputSchema>;

export interface EnergyTarget {
  bmr: number;
  /** Formula used for `bmr`. */
  method: RmrMethod;
  tdee: number;
  /** Signed fraction applied to the total (0 when maintaining). */
  adjust: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** True when the safety floor raised the target. */
  floored: boolean;
}

/** Mifflin-St Jeor (1990): best general equation without body composition (Frankenfield 2005). */
export function restingEnergy(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Ten-Haaf and Weijs (2014), weight-based: the most precise in athletes (O'Neill 2023 meta-analysis). */
export const tenHaaf = (sex: Sex, weightKg: number, heightCm: number, age: number) =>
  11.936 * weightKg + 587.728 * (heightCm / 100) - 8.129 * age + (sex === 'male' ? 191.027 : 0) + 29.279;

/** Cunningham (1980) on lean (fat-free) mass in kg. */
export const cunningham = (leanMassKg: number) => 500 + 22 * leanMassKg;

/**
 * US Navy circumference formula (Hodgdon and Beckett): body fat % from neck, waist (at the navel)
 * and, for women, hip, all in cm. Null when the measurements cannot be valid. Typical error vs DXA
 * is a few percentage points, larger for very lean or very heavy people.
 */
export function navyBodyFat(sex: Sex, heightCm: number, neckCm: number, waistCm: number, hipCm?: number | null): number | null {
  let v = NaN;
  if (sex === 'male' && waistCm > neckCm) {
    v = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else if (sex === 'female' && hipCm && waistCm + hipCm > neckCm) {
    v = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  }
  return Number.isFinite(v) && v >= 3 && v <= 60 ? Math.round(v * 10) / 10 : null;
}

/** Body fat to use from what the user typed: a percentage wins; otherwise tape measurements (Navy). */
export function resolveBodyFat(p: {
  sex: Sex | null; heightCm: number | null; typedPct: number | null; neckCm: number | null; waistCm: number | null; hipCm: number | null;
}): { pct: number; source: 'manual' | 'tape' } | null {
  if (p.typedPct != null && p.typedPct >= 3 && p.typedPct <= 60) return { pct: Math.round(p.typedPct * 10) / 10, source: 'manual' };
  if (!p.sex || !p.heightCm || !p.neckCm || !p.waistCm) return null;
  const pct = navyBodyFat(p.sex, p.heightCm, p.neckCm, p.waistCm, p.hipCm);
  return pct == null ? null : { pct, source: 'tape' };
}

export type RmrMethod = 'cunningham' | 'ten_haaf' | 'mifflin';
export const RMR_METHOD_LABEL: Record<RmrMethod, string> = {
  cunningham: 'Cunningham (masa magra)',
  ten_haaf: 'Ten-Haaf (personas activas)',
  mifflin: 'Mifflin-St Jeor',
};

export interface RestingEnergy {
  kcal: number;
  method: RmrMethod;
  leanMassKg: number | null;
}

/** Best available resting energy: lean mass if body fat is known, Ten-Haaf if very active, else Mifflin. */
export function bestRestingEnergy(p: {
  sex: Sex; age: number; heightCm: number; weightKg: number; activity?: ActivityLevel | null; bodyFatPct?: number | null;
}): RestingEnergy {
  if (p.bodyFatPct != null && p.bodyFatPct >= 3 && p.bodyFatPct <= 60) {
    const lean = p.weightKg * (1 - p.bodyFatPct / 100);
    return { kcal: Math.round(cunningham(lean)), method: 'cunningham', leanMassKg: Math.round(lean * 10) / 10 };
  }
  if (p.activity === 'very_active') return { kcal: Math.round(tenHaaf(p.sex, p.weightKg, p.heightCm, p.age)), method: 'ten_haaf', leanMassKg: null };
  return { kcal: Math.round(restingEnergy(p.sex, p.weightKg, p.heightCm, p.age)), method: 'mifflin', leanMassKg: null };
}

/**
 * Weight that protein and fat are scaled to. Fat mass needs no protein, so per-kg rules on total
 * weight overshoot for heavier people (e.g. 260 g of protein at 130 kg). Uses the weight at a
 * healthy body fat (15% men, 25% women) when lean mass is known, else the weight at BMI 25;
 * never more than the actual weight, so it changes nothing for people of normal weight.
 */
export function macroReferenceWeight(p: { sex: Sex; weightKg: number; heightCm: number; leanMassKg?: number | null }): number {
  const ref = p.leanMassKg != null ? p.leanMassKg / (1 - (p.sex === 'male' ? 0.15 : 0.25)) : 25 * (p.heightCm / 100) ** 2;
  return Math.round(Math.min(p.weightKg, ref) * 10) / 10;
}

const macros = (kcal: number, refWeightKg: number, goal: WeightGoal) => {
  const proteinG = Math.round(refWeightKg * PROTEIN_PER_KG[goal]);
  const fatG = Math.round(Math.max(refWeightKg * 0.8, (kcal * 0.25) / 9));
  return { proteinG, fatG, carbsG: Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4)) };
};

export function energyTarget(input: EnergyInput): EnergyTarget {
  const { sex, age, heightCm, weightKg, activity, goal, pace, bodyFatPct } = EnergyInputSchema.parse(input);
  const rmr = bestRestingEnergy({ sex, age, heightCm, weightKg, activity, bodyFatPct });
  const tdee = rmr.kcal * ACTIVITY_FACTOR[activity];
  const adjust = goalAdjust(goal, pace);
  const raw = Math.round((tdee * (1 + adjust)) / 50) * 50;
  const kcal = Math.max(KCAL_FLOOR[sex], raw);
  const ref = macroReferenceWeight({ sex, weightKg, heightCm, leanMassKg: rmr.leanMassKg });
  return { bmr: rmr.kcal, method: rmr.method, tdee: Math.round(tdee), adjust, kcal, ...macros(kcal, ref, goal), floored: kcal > raw };
}

// ── Daily target from the day's activity ─────────────────────────────────────
/**
 * Constants of the daily target (docs/api.md §Energy):
 * - base: resting × 1.2 covers a sedentary day, including ~3,000 steps of moving around;
 * - walking: ~0.0004 kcal per kg per step above that allowance (net of resting, ~2.5 METs at 100 steps/min);
 * - strength training: 4.5 METs, i.e. 3.5 above resting, per minute of active workout time;
 * - only 70% of the activity is credited (activity estimates run high), at most +1,200 kcal.
 */
export const DAILY_TARGET = { baseFactor: 1.2, stepAllowance: 3000, kcalPerKgStep: 0.0004, strengthMet: 4.5, credit: 0.7, maxActivityKcal: 1200 } as const;

export interface DailyTargetInput {
  sex: Sex;
  restingKcal: number;
  /** Total weight: drives the energy cost of activity. */
  weightKg: number;
  heightCm: number;
  /** Known lean mass, if any (from body fat): used for the macro reference weight. */
  leanMassKg?: number | null;
  goal: WeightGoal;
  pace: GoalPace | null;
  /** Steps counted today; null means no data (watch not synced), not zero. */
  steps: number | null;
  /** Average of the last 7 days with data, used when today's steps are missing. */
  avgSteps7d: number | null;
  /** Active minutes of workouts completed today. */
  workoutMinutes: number;
  /** Fixed protein/fat to use instead of the computed ones; carbs flex with the day. */
  proteinG?: number | null;
  fatG?: number | null;
}

export interface DailyTarget {
  kcal: number;
  base: number;
  stepsKcal: number;
  workoutKcal: number;
  /** Activity actually credited (after the 70% factor and the cap). */
  activityKcal: number;
  steps: number;
  /** True when today's steps were missing and the 7-day average was used. */
  stepsEstimated: boolean;
  workoutMinutes: number;
  adjust: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  floored: boolean;
}

export function dailyTarget(i: DailyTargetInput): DailyTarget {
  const D = DAILY_TARGET;
  const stepsEstimated = i.steps == null && i.avgSteps7d != null;
  const steps = Math.max(0, Math.round(i.steps ?? i.avgSteps7d ?? 0));
  const base = i.restingKcal * D.baseFactor;
  const stepsKcal = Math.max(0, steps - D.stepAllowance) * i.weightKg * D.kcalPerKgStep;
  const workoutKcal = (D.strengthMet - 1) * i.weightKg * (Math.max(0, i.workoutMinutes) / 60);
  const activityKcal = Math.min(D.maxActivityKcal, (stepsKcal + workoutKcal) * D.credit);
  const adjust = goalAdjust(i.goal, i.pace);
  const raw = Math.round(((base + activityKcal) * (1 + adjust)) / 50) * 50;
  const kcal = Math.max(KCAL_FLOOR[i.sex], raw);
  const def = macros(kcal, macroReferenceWeight({ sex: i.sex, weightKg: i.weightKg, heightCm: i.heightCm, leanMassKg: i.leanMassKg }), i.goal);
  const proteinG = i.proteinG ?? def.proteinG;
  const fatG = i.fatG ?? def.fatG;
  return {
    kcal, base: Math.round(base), stepsKcal: Math.round(stepsKcal), workoutKcal: Math.round(workoutKcal), activityKcal: Math.round(activityKcal),
    steps, stepsEstimated, workoutMinutes: Math.round(Math.max(0, i.workoutMinutes)), adjust, proteinG, fatG,
    carbsG: Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4)), floored: kcal > raw,
  };
}

/** Plain-language breakdown of a daily target, e.g. "Base 2.075 kcal + 388 por actividad (12.000 pasos, 60 min de entrenamiento) − 20% por tu objetivo". */
export function describeDailyTarget(d: DailyTarget): string {
  const what = [
    d.steps ? nf(d.steps, 0) + ' pasos' + (d.stepsEstimated ? ' según tu promedio, porque hoy no hay datos del reloj' : '') : null,
    d.workoutMinutes ? d.workoutMinutes + ' min de entrenamiento' : null,
  ].filter(Boolean).join(', ');
  let out = 'Base ' + nf(d.base, 0) + ' kcal';
  if (d.activityKcal > 0) out += ' + ' + nf(d.activityKcal, 0) + ' por actividad' + (what ? ' (' + what + ')' : '');
  if (d.adjust) out += (d.adjust < 0 ? ' − ' : ' + ') + Math.round(Math.abs(d.adjust) * 100) + '% por tu objetivo';
  return out + '.';
}

/** Age in whole years from a birth year, as of `today` (YYYY-MM-DD local date). Month is unknown, so this can be one year high. */
export const ageFromBirthYear = (birthYear: number, today: string) => Number(today.slice(0, 4)) - birthYear;

/** Input of `complete_onboarding` (client-side contract; the RPC re-validates). */
export const OnboardingSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
    birthYear: z.number().int().min(1920).max(2100),
    heightCm: z.number().min(120).max(230),
    weightKg: z.number().min(30).max(300),
    sex: SexSchema,
    activity: ActivityLevelSchema,
    goal: WeightGoalSchema,
    pace: GoalPaceSchema.nullable(),
    measurementId: z.string().uuid(),
    kcal: z.number().int().min(800).max(10000),
    proteinG: z.number().int().min(0).max(1000),
    carbsG: z.number().int().min(0).max(1500),
    fatG: z.number().int().min(0).max(1000),
    isEstimated: z.boolean(),
    timeZone: z.string().optional(),
  })
  .strict()
  .refine((v) => !goalHasPace(v.goal) || v.pace != null, { message: 'Elige un ritmo', path: ['pace'] });
export type OnboardingInput = z.input<typeof OnboardingSchema>;
