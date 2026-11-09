/**
 * Ciclismo, navigation mode (docs/ciclismo.md): follow a planned route with the GPS.
 * Pure functions: where you are on the route, what the next maneuver is, what to say and when,
 * and when you left the route. The screen feeds them GPS fixes; nothing here touches the device.
 */
import { distanceM, type Coord, type RouteStep } from './cycling.js';

/** Meters from the start of the route to each point. */
export function cumulative(coords: Coord[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1]! + distanceM(coords[i - 1]!, coords[i]!));
  return out;
}

export interface Fix {
  /** Meters along the route of the closest point. */
  along_m: number;
  /** Meters from you to the route. */
  off_m: number;
  /** Closest point on the route. */
  point: [number, number];
}

const M_PER_DEG_LAT = 110540;

/** Closest point of segment a→b to p, in local meters around p. */
function project(p: Coord, a: Coord, b: Coord) {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111320;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * M_PER_DEG_LAT;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * M_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const x = ax + dx * t, y = ay + dy * t;
  return { t, off: Math.sqrt(x * x + y * y) };
}

/**
 * Where `p` is on the route. With `hintAlong` (where you were a moment ago) it looks just around
 * there first, so a loop that passes the same corner twice, or ends where it starts, does not jump
 * ahead or back. It searches the whole route only when you are far from that stretch.
 */
export function locate(coords: Coord[], cum: number[], p: Coord, hintAlong?: number): Fix {
  const best = (from: number, to: number) => {
    let r = { i: -1, t: 0, off: Infinity };
    for (let i = from; i < to; i++) {
      const q = project(p, coords[i]!, coords[i + 1]!);
      if (q.off < r.off - 0.01) r = { i, t: q.t, off: q.off };
    }
    return r;
  };
  let r = { i: -1, t: 0, off: Infinity };
  if (hintAlong !== undefined && coords.length > 1) {
    let from = 0, to = coords.length - 1;
    while (from < to - 1 && cum[from + 1]! < hintAlong - 60) from++;
    while (to > from + 1 && cum[to - 1]! > hintAlong + 400) to--;
    r = best(from, to);
  }
  if (r.off > 60 && coords.length > 1) {
    const all = best(0, coords.length - 1);
    if (all.off < r.off - 20) r = all;
  }
  if (r.i < 0) return { along_m: 0, off_m: coords[0] ? distanceM(p, coords[0]) : 0, point: coords[0] ? [coords[0][0], coords[0][1]] : [p[0], p[1]] };
  const a = coords[r.i]!, b = coords[r.i + 1]!;
  return {
    along_m: cum[r.i]! + (cum[r.i + 1]! - cum[r.i]!) * r.t,
    off_m: r.off,
    point: [a[0] + (b[0] - a[0]) * r.t, a[1] + (b[1] - a[1]) * r.t],
  };
}

/** The point `m` meters along the route. */
export function pointAt(coords: Coord[], cum: number[], m: number): [number, number] {
  const total = cum[cum.length - 1] ?? 0;
  m = Math.max(0, Math.min(total, m));
  let k = 1;
  while (k < cum.length - 1 && cum[k]! < m) k++;
  const a = coords[k - 1]!, b = coords[k] ?? a;
  const u = (m - cum[k - 1]!) / ((cum[k]! - cum[k - 1]!) || 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Compass bearing from a to b, 0 = north, clockwise. */
export function bearing(a: Coord, b: Coord): number {
  const la1 = (a[1] * Math.PI) / 180, la2 = (b[1] * Math.PI) / 180, dlo = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(dlo) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const ORDINAL = ['', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava'];

/** The maneuver in a few words, voseo: «Doblá a la derecha por Av. Gaona». */
export function stepText(s: RouteStep): string {
  const base: Record<number, string> = {
    0: 'Doblá a la izquierda', 1: 'Doblá a la derecha', 2: 'Doblá bien cerrado a la izquierda', 3: 'Doblá bien cerrado a la derecha',
    4: 'Doblá apenas a la izquierda', 5: 'Doblá apenas a la derecha', 6: 'Seguí derecho', 8: 'Salí de la rotonda',
    9: 'Pegá la vuelta', 10: 'Llegaste', 11: 'Salí', 12: 'Mantenete a la izquierda', 13: 'Mantenete a la derecha',
  };
  const t = s.type === 7
    ? 'En la rotonda, tomá la ' + (s.exit && ORDINAL[s.exit] ? ORDINAL[s.exit] + ' salida' : 'salida')
    : base[s.type] ?? 'Seguí';
  return s.name && s.type !== 10 ? t + ' por ' + s.name : t;
}

/** A distance said out loud: «150 metros», «1,2 kilómetros». */
export function spokenDistance(m: number): string {
  if (m < 1000) {
    const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
    return r + ' metros';
  }
  const km = Math.round(m / 100) / 10;
  return (km === 1 ? '1' : String(km).replace('.', ',')) + (km === 1 ? ' kilómetro' : ' kilómetros');
}

export interface NavInfo {
  along_m: number;
  off_m: number;
  remaining_m: number;
  /** The next maneuver and how far it is. */
  next: { index: number; step: RouteStep; in_m: number } | null;
  arrived: boolean;
}

export const ARRIVE_M = 25;

export function navInfo(cum: number[], steps: RouteStep[], fix: Fix): NavInfo {
  const total = cum[cum.length - 1] ?? 0;
  const remaining = Math.max(0, total - fix.along_m);
  let next: NavInfo['next'] = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.type === 11) continue; // «Salí»: the start, never ahead of you
    const at = s.type === 10 ? total : cum[Math.min(s.at, cum.length - 1)] ?? 0;
    if (at > fix.along_m + 5) { next = { index: i, step: s, in_m: at - fix.along_m }; break; }
  }
  return { along_m: fix.along_m, off_m: fix.off_m, remaining_m: remaining, next, arrived: remaining <= ARRIVE_M };
}

/**
 * What to say now, if anything. Each maneuver is announced twice at most: once ahead
 * (200 m out, or as soon as it is in range if it comes sooner) and once when it is right there.
 * `said` remembers what was already announced; this adds to it.
 */
export function announcement(info: NavInfo, said: Set<string>): string | null {
  if (info.arrived) {
    if (said.has('arrived')) return null;
    said.add('arrived');
    return 'Llegaste.';
  }
  const n = info.next;
  if (!n) return null;
  const text = stepText(n.step);
  if (n.step.type === 6) return null; // «seguí derecho» needs no voice
  if (n.in_m <= 35) {
    const k = n.index + ':now';
    if (said.has(k)) return null;
    said.add(k); said.add(n.index + ':soon');
    return n.step.type === 10 ? 'Estás llegando.' : text + '.';
  }
  if (n.in_m <= 220) {
    const k = n.index + ':soon';
    if (said.has(k)) return null;
    said.add(k);
    return n.step.type === 10 ? 'En ' + spokenDistance(n.in_m) + ' llegás.' : 'En ' + spokenDistance(n.in_m) + ', ' + text.charAt(0).toLowerCase() + text.slice(1) + '.';
  }
  return null;
}

/** Off route: far from it, with a GPS reading good enough to trust, for a few readings in a row. */
export const OFF_ROUTE_M = 40;
export function isOff(fix: Fix, accuracy_m: number | null): boolean {
  return fix.off_m > Math.max(OFF_ROUTE_M, (accuracy_m ?? 0) * 1.2);
}

/** Ride totals for the summary and the workout log. */
export function rideSummary(distance_m: number, moving_s: number) {
  const avg = moving_s > 0 ? distance_m / moving_s * 3.6 : 0;
  return { distance_m: Math.round(distance_m), moving_s: Math.round(moving_s), avg_kmh: Math.round(avg * 10) / 10 };
}
