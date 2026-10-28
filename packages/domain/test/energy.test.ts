import { describe, expect, it } from 'vitest';
import { ageFromBirthYear, energyTarget, restingEnergy, type EnergyInput } from '../src/energy.js';

const base: EnergyInput = { sex: 'male', age: 30, heightCm: 175, weightKg: 78, activity: 'moderate', goal: 'maintain', pace: null };

describe('restingEnergy (Mifflin-St Jeor)', () => {
  it('matches the published formula', () => {
    expect(restingEnergy('male', 78, 175, 30)).toBeCloseTo(1728.75);
    expect(restingEnergy('female', 60, 165, 28)).toBeCloseTo(1330.25);
  });
});

describe('energyTarget', () => {
  it('maintain: resting × activity, rounded to 50', () => {
    const t = energyTarget(base);
    expect(t.bmr).toBe(1729);
    expect(t.tdee).toBe(2680);
    expect(t.kcal).toBe(2700);
    expect(t.adjust).toBe(0);
    expect(t.floored).toBe(false);
  });

  it('applies the pace when losing or gaining', () => {
    expect(energyTarget({ ...base, goal: 'lose', pace: 'light' }).kcal).toBe(2400);
    expect(energyTarget({ ...base, goal: 'lose', pace: 'moderate' }).kcal).toBe(2150);
    expect(energyTarget({ ...base, goal: 'lose', pace: 'aggressive' }).kcal).toBe(2000);
    expect(energyTarget({ ...base, goal: 'gain', pace: 'light' }).kcal).toBe(2800);
    expect(energyTarget({ ...base, goal: 'gain', pace: 'moderate' }).kcal).toBe(2950);
    expect(energyTarget({ ...base, goal: 'gain', pace: 'aggressive' }).kcal).toBe(3100);
  });

  it('never goes below the safety floor', () => {
    const t = energyTarget({ sex: 'female', age: 60, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose', pace: 'aggressive' });
    expect(t.kcal).toBe(1200);
    expect(t.floored).toBe(true);
  });

  it('macros add up to the target (within rounding)', () => {
    for (const goal of ['lose', 'maintain', 'gain'] as const) {
      const t = energyTarget({ ...base, goal, pace: goal === 'maintain' ? null : 'moderate' });
      expect(Math.abs(t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4 - t.kcal)).toBeLessThanOrEqual(6);
    }
  });

  it('more protein when losing; fat at least 0.8 g/kg and 25% of energy', () => {
    expect(energyTarget({ ...base, goal: 'lose', pace: 'moderate' }).proteinG).toBe(156);
    expect(energyTarget(base).proteinG).toBe(140);
    const t = energyTarget(base);
    expect(t.fatG).toBeGreaterThanOrEqual(Math.round(78 * 0.8));
    expect(t.fatG * 9).toBeGreaterThanOrEqual(t.kcal * 0.25 - 9);
  });

  it('requires a pace when losing or gaining, and valid ranges', () => {
    expect(() => energyTarget({ ...base, goal: 'lose', pace: null })).toThrow();
    expect(() => energyTarget({ ...base, age: 12 })).toThrow();
    expect(() => energyTarget({ ...base, weightKg: 10 })).toThrow();
  });
});

describe('ageFromBirthYear', () => {
  it('uses the local year', () => {
    expect(ageFromBirthYear(1996, '2026-10-28')).toBe(30);
  });
});
