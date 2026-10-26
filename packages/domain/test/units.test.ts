import { describe, expect, it } from 'vitest';
import { formatWeight, fromDisplayWeight, toDisplayWeight, weightStepKg } from '../src/units.js';

describe('weight units', () => {
  it('stores kg input as-is with 2 decimals', () => {
    expect(fromDisplayWeight(92.5, 'kg')).toBe(92.5);
    expect(fromDisplayWeight(92.555, 'kg')).toBe(92.56);
  });

  it('round-trips common lb loads through kg storage', () => {
    for (const lb of [45, 95, 135, 185, 225, 315, 405]) {
      expect(toDisplayWeight(fromDisplayWeight(lb, 'lb'), 'lb')).toBe(lb);
    }
  });

  it('rounds display like the prototype (kg to 0.5, lb to 1)', () => {
    expect(toDisplayWeight(92.6, 'kg')).toBe(92.5);
    expect(toDisplayWeight(92.8, 'kg')).toBe(93);
    expect(toDisplayWeight(100, 'lb')).toBe(220);
  });

  it('uses 2.5 kg / 5 lb steps', () => {
    expect(weightStepKg('kg')).toBe(2.5);
    expect(weightStepKg('lb')).toBeCloseTo(2.268, 3);
  });

  it('formats with the unit and locale decimal separator', () => {
    expect(formatWeight(92.5, 'kg', 'es-ES')).toBe('92,5 kg');
  });
});
