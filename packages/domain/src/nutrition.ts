/** Nutrition math. Mirrors `log_food` in migrations/…_nutrition.sql. */

export type FoodUnit = 'g' | 'ml' | 'serving';
export type NutritionSource = 'verified' | 'label' | 'user' | 'estimated';

export interface Nutrients {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
}

export interface FoodLike extends Nutrients {
  ref_amount: number;
  ref_unit: FoodUnit;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Nutrients for `quantity` (in the food's ref_unit), rounded like the server snapshot. */
export function scaleNutrients(food: FoodLike, quantity: number): Nutrients {
  if (!(quantity > 0)) throw new RangeError('quantity must be positive');
  const f = quantity / food.ref_amount;
  return {
    kcal: r1(food.kcal * f),
    protein_g: r2(food.protein_g * f),
    carbs_g: r2(food.carbs_g * f),
    fat_g: r2(food.fat_g * f),
    fiber_g: food.fiber_g == null ? null : r2(food.fiber_g * f),
  };
}

/** Sum of items; fiber is only reported when every item has it (unknown ≠ 0). */
export function sumNutrients(items: Nutrients[]): Nutrients {
  const allFiber = items.length > 0 && items.every((i) => i.fiber_g != null);
  return {
    kcal: r1(items.reduce((a, i) => a + i.kcal, 0)),
    protein_g: r2(items.reduce((a, i) => a + i.protein_g, 0)),
    carbs_g: r2(items.reduce((a, i) => a + i.carbs_g, 0)),
    fat_g: r2(items.reduce((a, i) => a + i.fat_g, 0)),
    fiber_g: allFiber ? r2(items.reduce((a, i) => a + (i.fiber_g ?? 0), 0)) : null,
  };
}

/** Energy implied by macros (Atwater 4/4/9 kcal per g). */
export const atwaterKcal = (n: Pick<Nutrients, 'protein_g' | 'carbs_g' | 'fat_g'>) =>
  r1(n.protein_g * 4 + n.carbs_g * 4 + n.fat_g * 9);

/**
 * True when stated kcal and macros disagree by more than `tolerance` (default 20 %, plus 10 kcal
 * for small values). A hint to double-check a user-entered food — never used to change data.
 */
export function kcalLooksInconsistent(n: Nutrients, tolerance = 0.2): boolean {
  const implied = atwaterKcal(n);
  return Math.abs(n.kcal - implied) > Math.max(10, tolerance * Math.max(n.kcal, implied));
}

/** Label for the UI so estimates are never shown as measured facts. */
export function nutritionSourceLabel(s: NutritionSource): string {
  return { verified: 'Verificado', label: 'Etiqueta del producto', user: 'Introducido por ti', estimated: 'Estimado' }[s];
}

export interface MacroProgress {
  value: number;
  goal: number | null;
  /** 0–1, null without a goal. Can exceed 1. */
  ratio: number | null;
  remaining: number | null;
}

export function macroProgress(value: number, goal: number | null | undefined): MacroProgress {
  if (goal == null || goal <= 0) return { value, goal: null, ratio: null, remaining: null };
  return { value, goal, ratio: value / goal, remaining: r1(goal - value) };
}
