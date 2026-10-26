/** Canonical storage is kg (ADR 0003). These helpers convert only at the UI edge. */
export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Value shown to the user. kg rounds to 0.5, lb to 1 (same as the prototypes). */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? round(kg, 0.5) : Math.round(kg * LB_PER_KG);
}

/** Value to store, from what the user typed. Stored with 2 decimals (numeric(6,2)). */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  const kg = unit === 'kg' ? value : value * KG_PER_LB;
  return Math.round(kg * 100) / 100;
}

/** Increment for +/- buttons, in kg. 2.5 kg or 5 lb plates. */
export function weightStepKg(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : 5 * KG_PER_LB;
}

/** Locale-aware label, e.g. "92,5 kg". */
export function formatWeight(kg: number, unit: WeightUnit, locale = 'es-ES'): string {
  const v = toDisplayWeight(kg, unit);
  return `${v.toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit}`;
}
