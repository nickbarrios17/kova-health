/**
 * Ciclismo (docs/ciclismo.md): what a planned route is like, from the route engine's data
 * (OpenRouteService, through the `bike-route` Edge Function) and the parks around it (OpenStreetMap).
 * Pure functions: the same analysis on the phone, the phone web and the desktop web.
 */

/** [longitude, latitude] or [longitude, latitude, elevation_m], as GeoJSON. */
export type Coord = [number, number] | [number, number, number];
/** A stretch of the route: coordinate indexes [from, to] and the engine's value for it. */
export type Stretch = [number, number, number];

export interface RawRoute {
  coords: Coord[];
  distance_m: number;
  ascent_m: number;
  descent_m: number;
  /** OpenRouteService `waytype` extra: 1 state road, 2 road, 3 street, 4 path, 5 track, 6 cycleway, 7 footway, 8 steps, 9 ferry, 10 construction. */
  waytype: Stretch[];
  /** OpenRouteService `surface` extra: 5 cobblestone, 2/8–12/15–17 unpaved… */
  surface: Stretch[];
}

export interface Park {
  name: string | null;
  /** Outer rings, [lng, lat]. */
  rings: Array<Array<[number, number]>>;
}

export type WayKind = 'bicisenda' | 'calle' | 'avenida' | 'sendero' | 'otro';

export interface RouteAnalysis {
  distance_m: number;
  ascent_m: number;
  /** Estimated riding time at the given speed (an estimate, not a promise). */
  duration_s: number;
  /** Share of the distance (0–1) by kind of way. */
  shares: Record<WayKind, number>;
  /** Share of the distance inside a park, and the parks' names (in route order). */
  park_share: number;
  parks: string[];
  /** Short, positive descriptions: «Mayormente por bicisenda», «Pasa por Parque Centenario». */
  tags: string[];
  /** Things to know before going: «3,2 km por avenidas». */
  warnings: string[];
  /** For drawing: consecutive stretches by kind. */
  segments: Array<{ from: number; to: number; kind: WayKind }>;
}

export const DEFAULT_SPEED_KMH = 18;
export const SPEEDS_KMH = [14, 18, 22, 26] as const;

/** Traffic lights and corners in a city make a ride ~8 % slower than the flat-road speed. */
const URBAN_FACTOR = 1.08;
/** Seconds added per metre climbed. */
const CLIMB_S_PER_M = 6;

export function estimateDurationS(distance_m: number, ascent_m: number, speedKmh: number): number {
  const v = Math.max(5, speedKmh) / 3.6;
  return Math.round((distance_m / v) * URBAN_FACTOR + Math.max(0, ascent_m) * CLIMB_S_PER_M);
}

/** The loop length to ask the engine for, to ride for `minutes` at `speedKmh` (flat). */
export function loopLengthM(minutes: number, speedKmh: number): number {
  return Math.round(((minutes * 60) * (speedKmh / 3.6)) / URBAN_FACTOR);
}

export function wayKind(waytype: number): WayKind {
  switch (waytype) {
    case 6: return 'bicisenda';
    case 3: return 'calle';
    case 1: case 2: return 'avenida';
    case 4: case 5: case 7: return 'sendero';
    default: return 'otro';
  }
}

const ROUGH_SURFACES = new Set([2, 5, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]);

/** Great-circle distance in metres. */
export function distanceM(a: Coord, b: Coord): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray casting; ring in [lng, lat]. */
export function insideRing(p: Coord, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(ring: Array<[number, number]>): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

// No Intl: Hermes may lack the locale data. «3,2» under 10 km, «12» from there.
const km = (m: number) => (m < 10000 ? (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') : String(Math.round(m / 1000)));
const pct = (x: number) => Math.round(x * 100) + ' %';

export function analyzeRoute(route: RawRoute, parks: Park[], speedKmh: number = DEFAULT_SPEED_KMH): RouteAnalysis {
  const { coords } = route;
  // Length of each step i → i+1.
  const step = coords.slice(1).map((c, i) => distanceM(coords[i]!, c));
  const total = step.reduce((a, b) => a + b, 0) || 1;
  const lengthOf = (from: number, to: number) => { let s = 0; for (let i = from; i < to && i < step.length; i++) s += step[i]!; return s; };

  const meters: Record<WayKind, number> = { bicisenda: 0, calle: 0, avenida: 0, sendero: 0, otro: 0 };
  const segments: RouteAnalysis['segments'] = [];
  let covered = 0;
  for (const [from, to, v] of route.waytype) {
    const kind = wayKind(v);
    const len = lengthOf(from, to);
    meters[kind] += len;
    covered += len;
    const last = segments[segments.length - 1];
    if (last && last.kind === kind && last.to === from) last.to = to;
    else segments.push({ from, to, kind });
  }
  meters.otro += Math.max(0, total - covered);
  const shares = Object.fromEntries(Object.entries(meters).map(([k, m]) => [k, m / total])) as Record<WayKind, number>;

  let rough = 0;
  for (const [from, to, v] of route.surface) if (ROUGH_SURFACES.has(v)) rough += lengthOf(from, to);

  // Parks: a step counts as inside when its midpoint is inside a park's outer ring.
  const boxes = parks.map((p) => p.rings.map((r) => ({ r, b: bbox(r) })));
  let inPark = 0;
  const names: string[] = [];
  for (let i = 0; i < step.length; i++) {
    const a = coords[i]!, b = coords[i + 1]!;
    const mid: Coord = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const hit = boxes.findIndex((rings) => rings.some(({ r, b: [w, s, e, n] }) => mid[0] >= w && mid[0] <= e && mid[1] >= s && mid[1] <= n && insideRing(mid, r)));
    if (hit >= 0) {
      inPark += step[i]!;
      const name = parks[hit]!.name;
      if (name && !names.includes(name)) names.push(name);
    }
  }
  const park_share = inPark / total;

  const tags: string[] = [];
  if (shares.bicisenda >= 0.5) tags.push('Mayormente por bicisenda');
  else if (shares.bicisenda >= 0.15) tags.push(pct(shares.bicisenda) + ' por bicisenda');
  if (shares.calle >= 0.6) tags.push('Casi todo calles de barrio');
  if (names.length) tags.push('Pasa por ' + names.slice(0, 2).join(' y ') + (names.length > 2 ? ' y más' : ''));
  else if (park_share >= 0.05) tags.push('Pasa por un parque');
  if (shares.sendero >= 0.2) tags.push('Tramos de sendero');

  const warnings: string[] = [];
  if (meters.avenida >= 1000 || shares.avenida >= 0.4) warnings.push(km(meters.avenida) + ' km por avenidas');
  if (rough >= 500) warnings.push(km(rough) + ' km de adoquines o tierra');
  if (route.ascent_m >= 150) warnings.push(Math.round(route.ascent_m) + ' m de subida en total');

  return {
    distance_m: Math.round(route.distance_m || total),
    ascent_m: Math.round(route.ascent_m),
    duration_s: estimateDurationS(route.distance_m || total, route.ascent_m, speedKmh),
    shares, park_share, parks: names, tags, warnings, segments,
  };
}

/** Order for the «por tiempo» options: more bike lanes and parks first, more avenues last. */
export function routeScore(a: RouteAnalysis): number {
  return a.shares.bicisenda * 2 + a.park_share * 1.5 + a.shares.calle * 0.5 + a.shares.sendero * 0.5 - a.shares.avenida;
}

export const formatKm = (m: number) => km(m) + ' km';
