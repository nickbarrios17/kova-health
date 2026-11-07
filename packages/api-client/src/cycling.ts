/** Ciclismo (docs/ciclismo.md): routes through the `bike-route` Edge Function, saved routes in bike_routes. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { KovaError, type Coord, type Park, type RawRoute, type RouteAnalysis } from '@kova/domain';

export interface Place { name: string; label: string; coord: [number, number] }
export interface PlannedRoutes { routes: RawRoute[]; parks: Park[] }
export interface SavedRoute {
  id: string;
  name: string;
  kind: 'ab' | 'loop';
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
    /** A → (stops) → B. */
    route: (points: Coord[]) => invoke<PlannedRoutes>({ action: 'route', points: points.map(pt) }),
    /** Up to 3 different loops of about `length_m` from `start`. */
    loops: (start: Coord, length_m: number) => invoke<PlannedRoutes>({ action: 'loop', start: pt(start), length_m: Math.round(length_m), options: 3 }),

    saved: () => call(sb.from('bike_routes').select('id, name, kind, distance_m, ascent_m, duration_s, summary, created_at')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(100)) as Promise<SavedRoute[]>,
    get: async (id: string) => {
      const rows = await call(sb.from('bike_routes').select('id, name, kind, route').eq('id', id).limit(1)) as Array<{ id: string; name: string; kind: 'ab' | 'loop'; route: RawRoute }>;
      if (!rows[0]) throw new KovaError('NOT_FOUND', 'Esa ruta ya no está.');
      return rows[0];
    },
    /** Idempotent on `id`. */
    save: async (r: { id: string; name: string; kind: 'ab' | 'loop'; route: RawRoute; analysis: RouteAnalysis }) => {
      const name = r.name.trim().slice(0, 80) || 'Mi ruta';
      const { tags, warnings, parks, shares, park_share } = r.analysis;
      await call(sb.from('bike_routes').upsert({
        id: r.id, name, kind: r.kind, route: r.route,
        distance_m: r.analysis.distance_m, ascent_m: r.analysis.ascent_m, duration_s: r.analysis.duration_s,
        summary: { tags, warnings, parks, shares, park_share },
      }, { onConflict: 'id', ignoreDuplicates: true }));
    },
    remove: (id: string) => call(sb.from('bike_routes').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id')),
  };
}
