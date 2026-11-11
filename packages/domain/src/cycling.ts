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
  /** Turn-by-turn maneuvers (navigation.ts). Missing on routes saved before navigation existed. */
  steps?: RouteStep[];
  /** What the route goes through, from public statistics and cyclists' reports. Missing if unavailable. */
  safety?: RouteSafety;
}

/**
 * CABA: meters through ~275 m cells with many robberies (top 10 % of the city) or some (next 20 %),
 * and with many traffic crashes, from the city's crime map. Conurbano: partidos crossed, with their
 * robbery level against the conurbano average (1 above, 2 well above). `reports`: places other
 * cyclists marked within 100 m of the route.
 */
export interface RouteSafety {
  robo_high_m: number;
  robo_mid_m: number;
  choque_high_m: number;
  caba_m: number;
  partidos: Array<{ name: string; level: number }>;
  reports: number;
}

/** What the map draws: zones (cell centers) and reports near the routes. */
export interface SafetyZones {
  cells: Array<{ lat: number; lng: number; r: number; c: number }>;
  reports: Array<{ id: string; coord: [number, number]; kind: SafetyReportKind; day: string; mine: boolean }>;
  grid: { lat0: number; lng0: number; dlat: number; dlng: number };
}
export type SafetyReportKind = 'robo' | 'intento' | 'insegura' | 'peligrosa';
export const SAFETY_REPORT_KINDS: Array<{ kind: SafetyReportKind; label: string }> = [
  { kind: 'robo', label: 'Me robaron' },
  { kind: 'intento', label: 'Intento de robo' },
  { kind: 'insegura', label: 'Zona insegura u oscura' },
  { kind: 'peligrosa', label: 'Calle peligrosa para la bici' },
];

/** One maneuver: it starts at `coords[at]`. `type` is the OpenRouteService step type (0 left … 13 keep right). */
export interface RouteStep { at: number; type: number; name: string; exit?: number }

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
  /** Share of the distance (0–1) through CABA zones with many robberies; 0 without safety data. */
  risk_share: number;
  /** For drawing: consecutive stretches by kind. */
  segments: Array<{ from: number; to: number; kind: WayKind }>;
}

export const DEFAULT_SPEED_KMH = 18;
export const SPEEDS_KMH = [14, 18, 22, 26] as const;

/** Ciclismo, or the same planner on foot (docs/correr.md). */
export type Sport = 'bike' | 'run' | 'walk';

/**
 * Per sport: the paces offered (km/h), the default, how much a city slows you down (lights, corners) and
 * the seconds added per metre climbed (Naismith for walking: ~1 h per 600 m; about half running).
 */
export const SPORTS: Record<Sport, { speeds: readonly number[]; defaultKmh: number; urban: number; climbSPerM: number; minutes: readonly number[] }> = {
  bike: { speeds: SPEEDS_KMH, defaultKmh: DEFAULT_SPEED_KMH, urban: 1.08, climbSPerM: 6, minutes: [30, 45, 60, 90, 120] },
  run: { speeds: [8, 9.5, 11, 12.5], defaultKmh: 9.5, urban: 1.03, climbSPerM: 3, minutes: [20, 30, 45, 60, 90] },
  walk: { speeds: [4, 5, 6], defaultKmh: 5, urban: 1.05, climbSPerM: 6, minutes: [20, 30, 45, 60, 90] },
};

/** «6:19 min/km» for running and walking; «18 km/h» for the bike. */
export function paceLabel(kmh: number, sport: Sport): string {
  if (sport === 'bike') return String(kmh).replace('.', ',') + ' km/h';
  const s = Math.round(3600 / kmh);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min/km';
}

export function estimateDurationS(distance_m: number, ascent_m: number, speedKmh: number, sport: Sport = 'bike'): number {
  const k = SPORTS[sport];
  const v = Math.max(sport === 'bike' ? 5 : 2, speedKmh) / 3.6;
  return Math.round((distance_m / v) * k.urban + Math.max(0, ascent_m) * k.climbSPerM);
}

/** The loop length to ask the engine for, to go for `minutes` at `speedKmh` (flat). */
export function loopLengthM(minutes: number, speedKmh: number, sport: Sport = 'bike'): number {
  return Math.round(((minutes * 60) * (speedKmh / 3.6)) / SPORTS[sport].urban);
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

export function analyzeRoute(route: RawRoute, parks: Park[], speedKmh: number = DEFAULT_SPEED_KMH, sport: Sport = 'bike'): RouteAnalysis {
  const foot = sport !== 'bike';
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
  if (foot) {
    // On foot, bike lanes do not matter; paths and parks do (and a dirt path is a plus for running).
    if (park_share >= 0.4) tags.push('Mayormente por parques');
    if (shares.sendero >= 0.3) tags.push(pct(shares.sendero) + ' por senderos y caminos peatonales');
  } else {
    if (shares.bicisenda >= 0.5) tags.push('Mayormente por bicisenda');
    else if (shares.bicisenda >= 0.15) tags.push(pct(shares.bicisenda) + ' por bicisenda');
  }
  if (shares.calle >= 0.6) tags.push('Casi todo calles de barrio');
  if (names.length) tags.push('Pasa por ' + names.slice(0, 2).join(' y ') + (names.length > 2 ? ' y más' : ''));
  else if (park_share >= 0.05) tags.push('Pasa por un parque');
  if (!foot && shares.sendero >= 0.2) tags.push('Tramos de sendero');

  const warnings: string[] = [];
  if (meters.avenida >= 1000 || shares.avenida >= 0.4) warnings.push(km(meters.avenida) + (foot ? ' km junto a avenidas' : ' km por avenidas'));
  if (!foot && rough >= 500) warnings.push(km(rough) + ' km de adoquines o tierra');
  if (route.ascent_m >= (foot ? 80 : 150)) warnings.push(Math.round(route.ascent_m) + ' m de subida en total');

  // Safety, from public statistics: said plainly, as an average, not as a promise either way.
  const sf = route.safety;
  let risk_share = 0;
  if (sf) {
    risk_share = sf.robo_high_m / total;
    if (sf.robo_high_m >= 300) warnings.push(km(sf.robo_high_m) + ' km por zonas con muchos robos');
    else if (sf.caba_m >= 1500 && sf.robo_high_m < 100 && sf.robo_mid_m / total < 0.15) tags.push('Evita las zonas con más robos');
    if (sf.choque_high_m >= 300) warnings.push(km(sf.choque_high_m) + ' km por zonas con muchos choques');
    const risky = sf.partidos.filter((p) => p.level >= 2).map((p) => p.name);
    if (risky.length) warnings.push('Pasa por ' + risky.slice(0, 2).join(' y ') + ', con más robos que el promedio del conurbano');
    if (sf.reports > 0) warnings.push(sf.reports === 1 ? (foot ? 'Un aviso de otra persona cerca de la ruta' : 'Un aviso de otro ciclista cerca de la ruta') : sf.reports + (foot ? ' avisos de otras personas cerca de la ruta' : ' avisos de ciclistas cerca de la ruta'));
  }

  return {
    distance_m: Math.round(route.distance_m || total),
    ascent_m: Math.round(route.ascent_m),
    duration_s: estimateDurationS(route.distance_m || total, route.ascent_m, speedKmh, sport),
    shares, park_share, parks: names, tags, warnings, risk_share, segments,
  };
}

/** Order for the «por tiempo» options: more bike lanes and parks first; avenues and zones with many robberies last. */
export function routeScore(a: RouteAnalysis, sport: Sport = 'bike'): number {
  // On foot: parks and paths first, quiet streets next, avenues last.
  if (sport !== 'bike') return a.park_share * 2.5 + a.shares.sendero * 1.2 + a.shares.calle * 0.6 - a.shares.avenida * 1.2 - a.risk_share * 2.5;
  return a.shares.bicisenda * 2 + a.park_share * 1.5 + a.shares.calle * 0.5 + a.shares.sendero * 0.5 - a.shares.avenida - a.risk_share * 2.5;
}

export const formatKm = (m: number) => km(m) + ' km';
