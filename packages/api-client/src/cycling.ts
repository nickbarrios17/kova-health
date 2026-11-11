/** Ciclismo (docs/ciclismo.md): routes through the `bike-route` Edge Function, saved routes in bike_routes. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { KovaError, type Coord, type Park, type RawRoute, type RouteAnalysis, type SafetyReportKind, type SafetyZones, type Sport } from '@kova/domain';

export interface Place { name: string; label: string; coord: [number, number] }
export interface PlannedRoutes { routes: RawRoute[]; parks: Park[]; zones?: SafetyZones | null }
export interface MySafetyReport { id: string; kind: SafetyReportKind; coord: [number, number]; created_at: string }
export interface SavedRoute {
  id: string;
  name: string;
  kind: 'ab' | 'loop';
  sport: Sport;
  distance_m: number;
  ascent_m: number;
  duration_s: number;
  summary: Partial<Pick<RouteAnalysis, 'tags' | 'warnings' | 'parks'>>;
  created_at: string;
}

interface CyclingDeps {
  sb: SupabaseClient;
  call: <R extends { data: unknown; error: unknown }>(p: PromiseLike<R>) => Promise<NonNullable<R['data']>>;
  toKovaError: (e: unknown, status?: number) => KovaError;
}

export function createCycling({ sb, call, toKovaError }: CyclingDeps) {
  const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.functions.invoke('bike-route', { body });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      // The function answers { code, message } in Spanish: show that message.
      let payload: { code?: string; message?: string } | null = null;
      try { payload = ctx && typeof ctx.json === 'function' ? await ctx.clone().json() : null; } catch { /* not JSON */ }
      if (payload?.message) throw new KovaError(payload.code === 'INVALID_INPUT' ? 'INVALID_INPUT' : payload.code === 'NO_ROUTE' ? 'NOT_FOUND' : 'INTERNAL', payload.message);
      throw toKovaError(error, ctx?.status);
    }
    return data as T;
  };
  const pt = (c: Coord): [number, number] => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];

  return {
    /** Places in Argentina, nearest to `near` first. */
    search: (text: string, near?: Coord) => invoke<{ places: Place[] }>({ action: 'search', text, near: near ? pt(near) : undefined }).then((r) => r.places.filter((p) => p.coord)),
    /** A → (stops) → B, by bike or on foot (run and walk use the pedestrian profile). */
    route: (points: Coord[], sport: Sport = 'bike') => invoke<PlannedRoutes>({ action: 'route', points: points.map(pt), sport }),
    /** Up to 3 different loops of about `length_m` from `start`. */
    loops: (start: Coord, length_m: number, sport: Sport = 'bike') =>
      invoke<PlannedRoutes>({ action: 'loop', start: pt(start), length_m: Math.round(length_m), options: 3, sport }),

    /** Saved routes; `sport` 'foot' lists the run and walk ones together. */
    saved: (sport: Sport | 'foot' = 'bike') => {
      const q = sb.from('bike_routes').select('id, name, kind, sport, distance_m, ascent_m, duration_s, summary, created_at').is('deleted_at', null);
      return call((sport === 'foot' ? q.in('sport', ['run', 'walk']) : q.eq('sport', sport)).order('created_at', { ascending: false }).limit(100)) as Promise<SavedRoute[]>;
    },
    get: async (id: string) => {
      const rows = await call(sb.from('bike_routes').select('id, name, kind, sport, route').eq('id', id).limit(1)) as Array<{ id: string; name: string; kind: 'ab' | 'loop'; sport: Sport; route: RawRoute }>;
      if (!rows[0]) throw new KovaError('NOT_FOUND', 'Esa ruta ya no está.');
      return rows[0];
    },
    /** Idempotent on `id`. */
    save: async (r: { id: string; name: string; kind: 'ab' | 'loop'; route: RawRoute; analysis: RouteAnalysis; sport?: Sport }) => {
      const name = r.name.trim().slice(0, 80) || 'Mi ruta';
      const { tags, warnings, parks, shares, park_share } = r.analysis;
      await call(sb.from('bike_routes').upsert({
        id: r.id, name, kind: r.kind, route: r.route, sport: r.sport ?? 'bike',
        distance_m: r.analysis.distance_m, ascent_m: r.analysis.ascent_m, duration_s: r.analysis.duration_s,
        summary: { tags, warnings, parks, shares, park_share },
      }, { onConflict: 'id', ignoreDuplicates: true }));
    },
    remove: (id: string) => call(sb.from('bike_routes').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id')),
    /** Mark a place: a robbery, an attempt, an unsafe or dangerous stretch. Others see it without your name. */
    report: async (r: { id: string; kind: SafetyReportKind; coord: Coord }) => {
      const [lng, lat] = pt(r.coord);
      await call(sb.from('safety_reports').insert({ id: r.id, kind: r.kind, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 }).select('id'));
    },
    myReports: async () => {
      const rows = await call(sb.from('safety_reports').select('id, kind, lat, lng, created_at').is('deleted_at', null)
        .gte('created_at', new Date(Date.now() - 180 * 86400e3).toISOString()).order('created_at', { ascending: false }).limit(100)) as Array<{ id: string; kind: SafetyReportKind; lat: number; lng: number; created_at: string }>;
      return rows.map((r): MySafetyReport => ({ id: r.id, kind: r.kind, coord: [Number(r.lng), Number(r.lat)], created_at: r.created_at }));
    },
    removeReport: (id: string) => call(sb.from('safety_reports').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id')),
    /** A navigated ride, saved as a completed workout (Ciclismo). Idempotent on `id`. */
    logRide: async (r: { id: string; name: string; startedAt: Date; endedAt: Date; movingS: number; distanceM: number; timeZone?: string }) => {
      await call(sb.rpc('log_bike_ride', {
        p_id: r.id, p_name: r.name.trim().slice(0, 120) || 'Salida en bici',
        p_started_at: r.startedAt.toISOString(), p_ended_at: r.endedAt.toISOString(),
        p_moving_s: Math.round(r.movingS), p_distance_m: Math.round(r.distanceM * 10) / 10, p_time_zone: r.timeZone ?? null,
      }));
    },
    /** A navigated run or walk, saved as a completed workout (Correr / Caminata). Idempotent on `id`. */
    logFoot: async (r: { id: string; sport: 'run' | 'walk'; name: string; startedAt: Date; endedAt: Date; movingS: number; distanceM: number; timeZone?: string }) => {
      await call(sb.rpc('log_foot_activity', {
        p_id: r.id, p_sport: r.sport, p_name: r.name.trim().slice(0, 120) || (r.sport === 'run' ? 'Salida a correr' : 'Caminata'),
        p_started_at: r.startedAt.toISOString(), p_ended_at: r.endedAt.toISOString(),
        p_moving_s: Math.round(r.movingS), p_distance_m: Math.round(r.distanceM * 10) / 10, p_time_zone: r.timeZone ?? null,
      }));
    },
  };
}
