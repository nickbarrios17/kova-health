import { describe, expect, it } from 'vitest';
import { analyzeRoute, distanceM, estimateDurationS, insideRing, loopLengthM, routeScore, type Coord, type Park, type RawRoute } from '../src/cycling.js';

// A straight line east along the equator-ish; ~111 m per 0.001° of longitude at lat 0.
const line = (n: number): Coord[] => Array.from({ length: n + 1 }, (_, i) => [i * 0.001, 0] as Coord);
const route = (over: Partial<RawRoute> = {}): RawRoute => ({ coords: line(10), distance_m: 1113, ascent_m: 0, descent_m: 0, waytype: [], surface: [], ...over });

describe('cycling', () => {
  it('distance', () => {
    expect(distanceM([0, 0], [0.001, 0])).toBeCloseTo(111.2, 0);
  });

  it('time estimate and loop length are inverse on the flat', () => {
    const len = loopLengthM(60, 18);
    expect(Math.abs(estimateDurationS(len, 0, 18) - 3600)).toBeLessThan(2);
    expect(estimateDurationS(10000, 100, 18)).toBe(estimateDurationS(10000, 0, 18) + 600);
  });

  it('shares and tags by way type', () => {
    const a = analyzeRoute(route({ waytype: [[0, 6, 6], [6, 8, 3], [8, 10, 1]] }), []);
    expect(a.shares.bicisenda).toBeCloseTo(0.6, 5);
    expect(a.shares.calle).toBeCloseTo(0.2, 5);
    expect(a.shares.avenida).toBeCloseTo(0.2, 5);
    expect(a.tags).toContain('Mayormente por bicisenda');
    expect(a.segments.map((s) => s.kind)).toEqual(['bicisenda', 'calle', 'avenida']);
  });

  it('merges consecutive stretches of the same kind', () => {
    const a = analyzeRoute(route({ waytype: [[0, 4, 1], [4, 10, 2]] }), []);
    expect(a.segments).toEqual([{ from: 0, to: 10, kind: 'avenida' }]);
    expect(a.warnings).toContain('1,1 km por avenidas');
  });

  it('parks crossed, by name', () => {
    const park: Park = { name: 'Parque Centenario', rings: [[[0.0025, -1], [0.0065, -1], [0.0065, 1], [0.0025, 1], [0.0025, -1]]] };
    const far: Park = { name: 'Lejos', rings: [[[5, 5], [6, 5], [6, 6], [5, 5]]] };
    const a = analyzeRoute(route({ waytype: [[0, 10, 3]] }), [park, far]);
    expect(a.park_share).toBeCloseTo(0.4, 5);
    expect(a.parks).toEqual(['Parque Centenario']);
    expect(a.tags).toContain('Pasa por Parque Centenario');
    expect(a.tags).toContain('Casi todo calles de barrio');
  });

  it('rough surfaces and climbs are warned', () => {
    const a = analyzeRoute(route({ coords: line(100), distance_m: 11120, ascent_m: 180, surface: [[0, 10, 5]] }), []);
    expect(a.warnings).toEqual(['1,1 km de adoquines o tierra', '180 m de subida en total']);
  });

  it('score prefers bike lanes and parks over avenues', () => {
    const lanes = analyzeRoute(route({ waytype: [[0, 10, 6]] }), []);
    const avenues = analyzeRoute(route({ waytype: [[0, 10, 1]] }), []);
    expect(routeScore(lanes)).toBeGreaterThan(routeScore(avenues));
  });

  it('point in ring', () => {
    const sq: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(insideRing([0.5, 0.5], sq)).toBe(true);
    expect(insideRing([1.5, 0.5], sq)).toBe(false);
  });
});
