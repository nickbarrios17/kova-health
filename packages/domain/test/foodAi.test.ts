import { describe, expect, it } from 'vitest';
import { amountLabel, argentineSeals, betterAlternative, estimateMidpoint, kcalRange, macrosConsistent, scaleFood, usableCandidate, type DescribedItem } from '../src/foodAi.js';

const item = (over: Partial<DescribedItem> = {}): DescribedItem => ({
  name: 'Empanada de carne', search: 'empanada carne', amount: 2, unit: 'unidad', grams: 170,
  kcal_low: 480, kcal_high: 620, protein_g: 22, carbs_g: 50, fat_g: 24, candidates: [], ...over,
});

describe('food AI helpers', () => {
  it('scales a catalog food by grams', () => {
    expect(scaleFood({ ref_amount: 100, kcal: 165, protein_g: 31.02, carbs_g: 0, fat_g: 3.57 }, 150))
      .toEqual({ kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 });
  });

  it('picks a weight-based candidate whose calories match the estimate', () => {
    const base = { ref_amount: 100, data_source: 'verified' as const, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const serving = { ...base, id: 'a', name: 'X', ref_amount: 1, ref_unit: 'serving' as const, kcal: 300 };
    const empanada = { ...base, id: 'b', name: 'Empanada de carne', ref_unit: 'g' as const, kcal: 300 };
    expect(usableCandidate(item({ candidates: [serving] }))).toBeNull();
    // 170 g × 3 kcal/g = 510 kcal, inside the 480–620 estimate.
    expect(usableCandidate(item({ candidates: [serving, empanada] }))?.id).toBe('b');
    // «2 medialunas» (≈ 100 g, 330–420 kcal) must not become 100 g of butter (717 kcal).
    const manteca = { ...base, id: 'm', name: 'Manteca', ref_unit: 'g' as const, kcal: 717 };
    const medialuna = { ...base, id: 'c', name: 'Medialuna / croissant', ref_unit: 'g' as const, kcal: 406 };
    const medialunas = item({ name: 'Medialunas', grams: 100, kcal_low: 330, kcal_high: 420, candidates: [manteca, medialuna] });
    expect(usableCandidate(medialunas)?.id).toBe('c');
    expect(usableCandidate({ ...medialunas, candidates: [manteca] })).toBeNull();
    // «Barra de cereal sabor yogur y frutilla» (25 g, ≈ 100 kcal) must not become 25 g of strawberries (8 kcal).
    const frutillas = { ...base, id: 'f', name: 'Frutillas', ref_unit: 'g' as const, kcal: 32 };
    expect(usableCandidate(item({ name: 'Barra de cereal sabor yogur y frutilla', grams: 25, kcal_low: 90, kcal_high: 110, candidates: [frutillas] }))).toBeNull();
    // Same food, another word order: still picked.
    const pechuga = { ...base, id: 'p', name: 'Pechuga de pollo (a la plancha)', ref_unit: 'g' as const, kcal: 165 };
    expect(usableCandidate(item({ name: 'Pollo a la plancha', grams: 150, kcal_low: 220, kcal_high: 280, candidates: [pechuga] }))?.id).toBe('p');
    // «Tostada con manteca» is not plain toast: without the butter the calories come out low.
    const tostadas = { ...base, id: 't', name: 'Tostadas de pan', ref_unit: 'g' as const, kcal: 290 };
    expect(usableCandidate(item({ name: 'Tostada con manteca', grams: 60, kcal_low: 200, kcal_high: 260, candidates: [tostadas] }))).toBeNull();
    const cafe = { ...base, id: 'k', name: 'Café con leche', ref_unit: 'ml' as const, kcal: 40 };
    expect(usableCandidate(item({ name: 'Café con leche', grams: 250, kcal_low: 80, kcal_high: 120, candidates: [cafe] }))?.id).toBe('k');
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

  it('says the amount in plain Spanish', () => {
    expect(amountLabel(2, 'unidad')).toBe('2 unidades');
    expect(amountLabel(1, 'porcion')).toBe('1 porción');
    expect(amountLabel(2, 'porcion')).toBe('2 porciones');
    expect(amountLabel(150, 'g')).toBe('150 g');
  });
});
