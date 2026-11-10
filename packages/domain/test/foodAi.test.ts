import { describe, expect, it } from 'vitest';
import { argentineSeals, betterAlternative, estimateMidpoint, kcalRange, macrosConsistent, scaleFood, usableCandidate, type DescribedItem } from '../src/foodAi.js';

const item = (over: Partial<DescribedItem> = {}): DescribedItem => ({
  name: 'Empanada de carne', search: 'empanada carne', amount: 2, unit: 'unidad', grams: 170,
  kcal_low: 480, kcal_high: 620, protein_g: 22, carbs_g: 50, fat_g: 24, candidates: [], ...over,
});

describe('food AI helpers', () => {
  it('scales a catalog food by grams', () => {
    expect(scaleFood({ ref_amount: 100, kcal: 165, protein_g: 31.02, carbs_g: 0, fat_g: 3.57 }, 150))
      .toEqual({ kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 });
  });

  it('uses only weight-based candidates', () => {
    const c = { id: 'a', name: 'X', ref_amount: 1, ref_unit: 'serving' as const, data_source: 'user' as const, kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 };
    expect(usableCandidate(item({ candidates: [c] }))).toBeNull();
    expect(usableCandidate(item({ candidates: [c, { ...c, id: 'b', ref_unit: 'g', ref_amount: 100 }] }))?.id).toBe('b');
  });

  it('shows the estimate as a range, and its middle when saved', () => {
    expect(kcalRange(480, 620)).toBe('≈ 480–620 kcal');
    expect(kcalRange(300, 310)).toBe('≈ 305 kcal');
    expect(estimateMidpoint(item())).toMatchObject({ kcal: 550, protein_g: 22 });
  });

  it('flags macros that do not add up', () => {
    expect(macrosConsistent({ kcal: 550, protein_g: 22, carbs_g: 50, fat_g: 24 })).toBe(true);
    expect(macrosConsistent({ kcal: 550, protein_g: 5, carbs_g: 5, fat_g: 2 })).toBe(false);
  });

  it('computes the Argentine seals from the table, and prefers the package seals', () => {
    const cookie = { liquid: false, kcal_100: 480, fat_100: 20, sat_fat_100: 9, sugars_100: 35, sodium_mg_100: 300 };
    expect(argentineSeals(cookie)).toEqual({ seals: ['azucares', 'grasas_totales', 'grasas_saturadas', 'sodio', 'calorias'], from: 'table' });
    expect(argentineSeals({ ...cookie, labels: ['es:exceso-en-azucares'] })).toEqual({ seals: ['azucares'], from: 'label' });
    expect(argentineSeals(cookie, ['EXCESO EN AZÚCARES', 'Exceso en sodio']).seals).toEqual(['azucares', 'sodio']);
    expect(argentineSeals({ liquid: true, kcal_100: 0, fat_100: 0, sat_fat_100: 0, sugars_100: 0, sodium_mg_100: 10 }).from).toBe('none');
    // Water-like drink with sugar: sugar and calorie thresholds for liquids.
    expect(argentineSeals({ liquid: true, kcal_100: 42, fat_100: 0, sat_fat_100: 0, sugars_100: 10.5, sodium_mg_100: 5 }).seals).toEqual(['azucares']);
  });

  it('suggests a product with fewer seals in the same category', () => {
    const base = { liquid: false, labels: [], category: 'en:cookies' };
    const a = { ...base, barcode: '1', kcal_100: 480, fat_100: 20, sat_fat_100: 9, sugars_100: 35, sodium_mg_100: 300 };
    const b = { ...base, barcode: '2', kcal_100: 400, fat_100: 10, sat_fat_100: 2, sugars_100: 30, sodium_mg_100: 100 };
    const c = { ...base, barcode: '3', kcal_100: 400, fat_100: 10, sat_fat_100: 2, sugars_100: 30, sodium_mg_100: 100, category: 'en:chips' };
    expect(betterAlternative(a, [a, b, c])?.barcode).toBe('2');
    expect(betterAlternative(b, [a, b])).toBeNull();
  });
});
