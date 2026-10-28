/**
 * Daily energy and macro target for onboarding. Pure and shared by web and mobile; the result is
 * an estimate (shown as such) and the user can always type their own numbers instead.
 *
 * - Resting energy: Mifflin-St Jeor (1990), kcal/day.
 * - Total: resting × activity factor.
 * - Goal: percentage adjustment by pace, rounded to 50 kcal, never below a safety floor.
 * - Macros: protein by body weight, fat at least 0.8 g/kg or 25% of energy, carbs the rest.
 */
import { z } from 'zod';

export const SexSchema = z.enum(['male', 'female']);
export const ActivityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'very_active']);
export const WeightGoalSchema = z.enum(['lose', 'maintain', 'gain']);
export const GoalPaceSchema = z.enum(['light', 'moderate', 'aggressive']);
export type Sex = z.infer<typeof SexSchema>;
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;
export type WeightGoal = z.infer<typeof WeightGoalSchema>;
export type GoalPace = z.infer<typeof GoalPaceSchema>;

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725 };

/** Fraction added to (gain) or removed from (lose) the total. */
export const PACE_ADJUST: Record<'lose' | 'gain', Record<GoalPace, number>> = {
  lose: { light: -0.1, moderate: -0.2, aggressive: -0.25 },
  gain: { light: 0.05, moderate: 0.1, aggressive: 0.15 },
};

/** Lowest target VIDA will suggest without supervision. */
export const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

export const SEX_LABEL: Record<Sex, string> = { male: 'Hombre', female: 'Mujer' };
export const ACTIVITY_LABEL: Record<ActivityLevel, [label: string, hint: string]> = {
  sedentary: ['Sedentaria', 'Trabajo sentado, poco movimiento'],
  light: ['Ligera', 'Caminas a diario o entrenas 1–3 días'],
  moderate: ['Moderada', 'Entrenas 3–5 días por semana'],
  very_active: ['Muy activa', 'Entrenas 6–7 días o trabajo físico'],
};
export const GOAL_LABEL: Record<WeightGoal, string> = { lose: 'Bajar de peso', maintain: 'Mantener', gain: 'Subir de peso' };
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
  })
  .refine((v) => v.goal === 'maintain' || v.pace != null, { message: 'Elige un ritmo', path: ['pace'] });
export type EnergyInput = z.infer<typeof EnergyInputSchema>;

export interface EnergyTarget {
  bmr: number;
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

export function restingEnergy(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function energyTarget(input: EnergyInput): EnergyTarget {
  const { sex, age, heightCm, weightKg, activity, goal, pace } = EnergyInputSchema.parse(input);
  const bmr = restingEnergy(sex, weightKg, heightCm, age);
  const tdee = bmr * ACTIVITY_FACTOR[activity];
  const adjust = goal === 'maintain' ? 0 : PACE_ADJUST[goal][pace!];
  const raw = Math.round((tdee * (1 + adjust)) / 50) * 50;
  const kcal = Math.max(KCAL_FLOOR[sex], raw);
  const proteinG = Math.round(weightKg * (goal === 'lose' ? 2.0 : 1.8));
  const fatG = Math.round(Math.max(weightKg * 0.8, (kcal * 0.25) / 9));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), adjust, kcal, proteinG, fatG, carbsG, floored: kcal > raw };
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
  .refine((v) => v.goal === 'maintain' || v.pace != null, { message: 'Elige un ritmo', path: ['pace'] });
export type OnboardingInput = z.input<typeof OnboardingSchema>;
