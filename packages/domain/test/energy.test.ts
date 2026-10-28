import { describe, expect, it } from 'vitest';
import {
  ageFromBirthYear, bestRestingEnergy, dailyTarget, describeDailyTarget, energyTarget, navyBodyFat, resolveBodyFat, restingEnergy, tenHaaf,
  type EnergyInput,
} from '../src/energy.js';

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

describe('bestRestingEnergy', () => {
  const p = { sex: 'male' as const, age: 30, heightCm: 175, weightKg: 78 };
  it('lean mass (Cunningham) when body fat is known', () => {
    expect(bestRestingEnergy({ ...p, bodyFatPct: 15 })).toEqual({ kcal: 1959, method: 'cunningham', leanMassKg: 66.3 });
  });
  it('Ten-Haaf for very active people, Mifflin otherwise', () => {
    expect(tenHaaf('male', 78, 175, 30)).toBeCloseTo(1935.97, 1);
    expect(bestRestingEnergy({ ...p, activity: 'very_active' }).method).toBe('ten_haaf');
    expect(bestRestingEnergy({ ...p, activity: 'moderate' })).toEqual({ kcal: 1729, method: 'mifflin', leanMassKg: null });
  });
  it('ignores impossible body fat values', () => {
    expect(bestRestingEnergy({ ...p, bodyFatPct: 80 }).method).toBe('mifflin');
  });
  it('energyTarget uses the best method', () => {
    expect(energyTarget({ ...base, bodyFatPct: 15 })).toMatchObject({ bmr: 1959, method: 'cunningham', kcal: 3050 });
    expect(energyTarget(base).method).toBe('mifflin');
  });
});

describe('navyBodyFat', () => {
  it('men: neck and waist; women: also hip', () => {
    expect(navyBodyFat('male', 175, 38, 85)).toBe(16.9);
    expect(navyBodyFat('female', 165, 33, 75, 98)).toBe(28.4);
  });
  it('null when the measurements cannot be valid', () => {
    expect(navyBodyFat('male', 175, 40, 38)).toBeNull();
    expect(navyBodyFat('female', 165, 33, 75)).toBeNull();
  });
});

describe('dailyTarget', () => {
  const d = { sex: 'male' as const, restingKcal: 1729, weightKg: 78, goal: 'lose' as const, pace: 'moderate' as const, avgSteps7d: 8000 };
  it('a quiet day is close to the base; an active day earns more', () => {
    const rest = dailyTarget({ ...d, steps: 3500, workoutMinutes: 0 });
    const active = dailyTarget({ ...d, steps: 12000, workoutMinutes: 60 });
    expect(rest).toMatchObject({ kcal: 1650, base: 2075, activityKcal: 11, stepsEstimated: false });
    expect(active).toMatchObject({ kcal: 1950, stepsKcal: 281, workoutKcal: 273, activityKcal: 388 });
    // Protein and fat stay fixed; carbs absorb the difference.
    expect(active.proteinG).toBe(rest.proteinG);
    expect(active.carbsG - rest.carbsG).toBe(75);
  });
  it('missing steps use the 7-day average, not zero', () => {
    const t = dailyTarget({ ...d, goal: 'maintain', pace: null, steps: null, workoutMinutes: 0, proteinG: 140, fatG: 75 });
    expect(t).toMatchObject({ steps: 8000, stepsEstimated: true, kcal: 2200, proteinG: 140, fatG: 75, carbsG: 241 });
  });
  it('credits at most 1,200 kcal of activity', () => {
    expect(dailyTarget({ ...d, goal: 'maintain', pace: null, steps: 40000, avgSteps7d: null, workoutMinutes: 240 }).activityKcal).toBe(1200);
  });
  it('never below the safety floor', () => {
    expect(dailyTarget({ ...d, sex: 'female', restingKcal: 1000, weightKg: 45, pace: 'aggressive', steps: 0, workoutMinutes: 0 })).toMatchObject({ kcal: 1200, floored: true });
  });
});

describe('describeDailyTarget', () => {
  it('explains base, activity and goal', () => {
    const t = dailyTarget({ sex: 'male', restingKcal: 1729, weightKg: 78, goal: 'lose', pace: 'moderate', steps: 12000, avgSteps7d: null, workoutMinutes: 60 });
    expect(describeDailyTarget(t)).toBe('Base 2.075 kcal + 388 por actividad (12.000 pasos, 60 min de entrenamiento) − 20% por tu objetivo.');
  });
  it('says when steps come from the average', () => {
    const t = dailyTarget({ sex: 'male', restingKcal: 1729, weightKg: 78, goal: 'maintain', pace: null, steps: null, avgSteps7d: 8000, workoutMinutes: 0 });
    expect(describeDailyTarget(t)).toContain('tu promedio');
  });
});

describe('resolveBodyFat', () => {
  const base2 = { sex: 'male' as const, heightCm: 175, neckCm: 38, waistCm: 85, hipCm: null };
  it('a typed percentage wins over tape measurements', () => {
    expect(resolveBodyFat({ ...base2, typedPct: 18 })).toEqual({ pct: 18, source: 'manual' });
  });
  it('falls back to the Navy formula, or null', () => {
    expect(resolveBodyFat({ ...base2, typedPct: null })).toEqual({ pct: 16.9, source: 'tape' });
    expect(resolveBodyFat({ ...base2, typedPct: null, waistCm: null })).toBeNull();
  });
});
