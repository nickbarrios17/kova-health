import { describe, expect, it } from 'vitest';
import { exerciseName, watchRows } from '../src/watch.js';

describe('watch', () => {
  it('names Samsung Health workouts in Spanish', () => {
    expect(exerciseName(81)).toBe('Pesas');
    expect(exerciseName(56)).toBe('Correr');
    expect(exerciseName(999)).toBe('Entrenamiento');
    expect(exerciseName(56, 'Fondo del domingo')).toBe('Fondo del domingo');
  });
  it('shows the day totals and the latest readings with their date', () => {
    const rows = watchRows([
      { metric: 'blood_pressure_mmhg', value: 118, extra: { diastolic: 76 }, at: '2026-11-10T12:00:00Z' },
      { metric: 'active_energy_kcal', value: 512.4, extra: null, at: '2026-11-13T20:00:00Z' },
      { metric: 'heart_rate_bpm', value: 74, extra: { min: 55, max: 151 }, at: '2026-11-13T20:00:00Z' },
      { metric: 'unknown', value: 1, extra: null, at: '2026-11-13T20:00:00Z' },
    ], '2026-11-13');
    expect(rows.map((r) => r.key)).toEqual(['active_energy_kcal', 'heart_rate_bpm', 'blood_pressure_mmhg']);
    expect(rows[1]!.value).toBe('74 ppm (55–151)');
    expect(rows[2]).toMatchObject({ value: '118/76 mmHg', when: '10/11' });
    expect(rows[0]!.when).toBeNull();
  });
});
