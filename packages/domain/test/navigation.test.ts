import { describe, expect, it } from 'vitest';
import type { Coord, RouteStep } from '../src/cycling.js';
import { announcement, bearing, cumulative, isOff, locate, navInfo, pointAt, rideSummary, spokenDistance, stepText } from '../src/navigation.js';

// A square loop in Buenos Aires, ~500 m per side, starting and ending at the same corner.
const A: Coord = [-58.44, -34.61];
const d = 0.0055; // ~500 m east-west, ~600 m north-south at this latitude
const loop: Coord[] = [A, [A[0] + d, A[1]], [A[0] + d, A[1] + d], [A[0], A[1] + d], A];
const cum = cumulative(loop);
const total = cum[cum.length - 1]!;
const steps: RouteStep[] = [
  { at: 0, type: 11, name: 'Av. Rivadavia' },
  { at: 1, type: 0, name: 'Acoyte' },
  { at: 2, type: 0, name: '' },
  { at: 3, type: 0, name: 'Av. Gaona' },
  { at: 4, type: 10, name: '' },
];

describe('navigation', () => {
  it('measures the route', () => {
    expect(total).toBeGreaterThan(2000);
    expect(total).toBeLessThan(2400);
  });

  it('a loop does not jump to its end at the start', () => {
    const f = locate(loop, cum, [A[0] + 0.0001, A[1] + 0.00005], 0);
    expect(f.along_m).toBeLessThan(30);
    const info = navInfo(cum, steps, f);
    expect(info.arrived).toBe(false);
    expect(info.next?.step.name).toBe('Acoyte');
  });

  it('finds the end of the loop when you get there', () => {
    let along = 0;
    for (let m = 0; m <= total; m += 20) along = locate(loop, cum, pointAt(loop, cum, m), along).along_m;
    const info = navInfo(cum, steps, locate(loop, cum, [A[0] + 0.00005, A[1] + 0.0001], along));
    expect(info.arrived).toBe(true);
  });

  it('follows a ride with GPS noise and announces each turn once', () => {
    const said = new Set<string>();
    const spoken: string[] = [];
    let along = 0;
    for (let m = 0; m <= total; m += 7) {
      const p = pointAt(loop, cum, m);
      const noisy: Coord = [p[0] + Math.sin(m) * 0.00006, p[1] + Math.cos(m) * 0.00006]; // ±6 m
      const f = locate(loop, cum, noisy, along);
      along = f.along_m;
      expect(isOff(f, 8)).toBe(false);
      const say = announcement(navInfo(cum, steps, f), said);
      if (say) spoken.push(say);
    }
    expect(spoken).toEqual([
      'En 200 metros, doblá a la izquierda por Acoyte.',
      'Doblá a la izquierda por Acoyte.',
      'En 200 metros, doblá a la izquierda.',
      'Doblá a la izquierda.',
      'En 200 metros, doblá a la izquierda por Av. Gaona.',
      'Doblá a la izquierda por Av. Gaona.',
      'En 200 metros llegás.',
      'Estás llegando.',
      'Llegaste.',
    ]);
  });

  it('notices when you leave the route', () => {
    const p = pointAt(loop, cum, 250);
    const away = locate(loop, cum, [p[0], p[1] - 0.001], 250); // ~110 m south of the first side
    expect(away.off_m).toBeGreaterThan(100);
    expect(isOff(away, 10)).toBe(true);
    // A bad GPS reading is not a detour.
    expect(isOff(locate(loop, cum, [p[0], p[1] - 0.0004], 250), 60)).toBe(false);
  });

  it('words maneuvers and distances', () => {
    expect(stepText({ at: 0, type: 1, name: 'Av. Gaona' })).toBe('Doblá a la derecha por Av. Gaona');
    expect(stepText({ at: 0, type: 7, name: '', exit: 2 })).toBe('En la rotonda, tomá la segunda salida');
    expect(spokenDistance(43)).toBe('40 metros');
    expect(spokenDistance(180)).toBe('200 metros');
    expect(spokenDistance(1240)).toBe('1,2 kilómetros');
    expect(spokenDistance(1000)).toBe('1 kilómetro');
  });

  it('bearing and summary', () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 5);
    expect(rideSummary(12000, 2400)).toEqual({ distance_m: 12000, moving_s: 2400, avg_kmh: 18 });
  });
});
