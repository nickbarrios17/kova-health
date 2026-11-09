// Ciclismo (docs/ciclismo.md): bike routes and place search through OpenRouteService, plus the parks
// around the route from OpenStreetMap (Overpass). The ORS key lives only here (secret ORS_API_KEY),
// never in the apps; only signed-in users can call it (verify_jwt), which protects the free quota.
//
// POST { action: 'route',  points: [[lng,lat], ...] }                  → { routes: [RawRoute], parks, zones }
// POST { action: 'loop',   start: [lng,lat], length_m, options?: 1-3 } → { routes: [RawRoute...], parks, zones }
// Each route carries `safety` (meters through zones with many robberies or crashes, partidos, reports nearby).
// POST { action: 'search', text, near?: [lng,lat] }                    → { places: [{ name, label, coord }] }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ORS = 'https://api.openrouteservice.org';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const bad = (message: string) => json(400, { code: 'INVALID_INPUT', message });

type LngLat = [number, number];
const isCoord = (c: unknown): c is LngLat =>
  Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number' &&
  Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

async function ors(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('ORS_API_KEY');
  if (!key) throw new Error('ORS_API_KEY missing');
  const res = await fetch(ORS + path, {
    ...init,
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json, application/geo+json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// deno-lint-ignore no-explicit-any
function toRaw(feature: any) {
  const p = feature.properties ?? {};
  return {
    coords: feature.geometry.coordinates,
    distance_m: p.summary?.distance ?? 0,
    ascent_m: p.ascent ?? 0,
    descent_m: p.descent ?? 0,
    waytype: p.extras?.waytype?.values ?? [],
    surface: p.extras?.surface?.values ?? [],
    // Turn-by-turn for the navigation mode: where each maneuver starts (index into coords), its kind
    // (ORS step type), the street, and roundabout exit. The app words them itself, in voseo.
    // deno-lint-ignore no-explicit-any
    steps: (p.segments ?? []).flatMap((sg: any) => (sg.steps ?? []).map((st: any) => ({
      at: st.way_points?.[0] ?? 0, type: st.type ?? 6, name: st.name && st.name !== '-' ? String(st.name).slice(0, 80) : '',
      ...(st.exit_number ? { exit: st.exit_number } : {}),
    }))),
  };
}

async function directions(coordinates: LngLat[], roundTrip?: { length: number; seed: number }) {
  const body: Record<string, unknown> = {
    coordinates, elevation: true, instructions: true, language: 'es', extra_info: ['waytype', 'surface'],
    preference: 'recommended', units: 'm',
  };
  if (roundTrip) body.options = { round_trip: { length: roundTrip.length, points: 5, seed: roundTrip.seed } };
  const r = await ors('/v2/directions/cycling-regular/geojson', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) {
    const msg = r.body?.error?.message ?? r.body?.error ?? 'route failed';
    console.error('ors directions', r.status, msg);
    return { error: r.status === 404 || r.status === 400 ? 'NO_ROUTE' : 'UPSTREAM', status: r.status };
  }
  return { route: toRaw(r.body.features[0]) };
}

// Parks (and similar green areas) that touch the routes' bounding box; outer rings only.
// deno-lint-ignore no-explicit-any
async function parksAround(routes: any[]) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of routes) for (const [x, y] of r.coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  if (w > e) return [];
  const q = `[out:json][timeout:12];(way["leisure"~"^(park|garden|nature_reserve)$"](${s},${w},${n},${e});relation["leisure"~"^(park|nature_reserve)$"](${s},${w},${n},${e}););out geom 400;`;
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST', body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'KovaHealth/1.0 (bike routes)' },
      signal: AbortSignal.timeout(14000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const round = (v: number) => Math.round(v * 1e5) / 1e5;
    // deno-lint-ignore no-explicit-any
    const ring = (g: any[]) => g.map((p) => [round(p.lon), round(p.lat)]);
    // deno-lint-ignore no-explicit-any
    return (data.elements ?? []).flatMap((el: any) => {
      const name = el.tags?.name ?? null;
      if (el.type === 'way' && el.geometry?.length > 3) return [{ name, rings: [ring(el.geometry)] }];
      if (el.type === 'relation') {
        // deno-lint-ignore no-explicit-any
        const rings = (el.members ?? []).filter((m: any) => m.role === 'outer' && m.geometry?.length > 3).map((m: any) => ring(m.geometry));
        return rings.length ? [{ name, rings }] : [];
      }
      return [];
    });
  } catch (e) {
    console.error('overpass', String(e));
    return []; // Parks are a nice-to-have: the route still works without them.
  }
}

// ── Safety (docs/ciclismo.md, «Zonas inseguras») ─────────────────────────────────────────────
// CABA: ~275 m cells from the city's crime map (robberies, traffic crashes). Conurbano: robbery rate
// per partido against the conurbano average (SNIC), coarse. Plus places other cyclists marked.
// Safety is extra information: if any source fails, the route still comes back, without it.
const GRID = { lat0: -34.75, lng0: -58.55, dlat: 0.0025, dlng: 0.003 }; // same as scripts/safety/build-safety-data.py
const GEOREF = 'https://apis.datos.gob.ar/georef/api/ubicacion';
const cellOf = (lng: number, lat: number) => Math.floor((lat - GRID.lat0) / GRID.dlat) + ':' + Math.floor((lng - GRID.lng0) / GRID.dlng);
function meters(a: number[], b: number[]) {
  const R = 6371000, la1 = (a[1] * Math.PI) / 180, la2 = (b[1] * Math.PI) / 180;
  const dla = la2 - la1, dlo = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Points every `step` meters along the route, each with the meters it stands for. */
function samples(coords: number[][], step: number) {
  const out: Array<{ p: number[]; m: number }> = [];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!, b = coords[i]!, d = meters(a, b), n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) out.push({ p: [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n], m: d / n });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function safetyFor(sb: any, routes: any[]) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of routes) for (const [x, y] of r.coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  if (w > e) return null;
  const pad = 0.004;
  const sampled = routes.map((r) => samples(r.coords, 25));

  // Partidos outside CABA, from a few points along each route (one georef call for all).
  const probes: Array<{ lat: number; lon: number }> = [];
  const probeOf: number[][] = routes.map(() => []);
  const seen = new Map<string, number>();
  sampled.forEach((ss, ri) => {
    let acc = 0;
    for (const x of ss) {
      acc += x.m;
      if (acc < 1200 && probeOf[ri]!.length) continue;
      acc = 0;
      const key = x.p[0]!.toFixed(2) + ',' + x.p[1]!.toFixed(2);
      if (!seen.has(key) && probes.length < 60) { seen.set(key, probes.length); probes.push({ lat: x.p[1]!, lon: x.p[0]! }); }
      if (seen.has(key)) probeOf[ri]!.push(seen.get(key)!);
    }
  });

  const [cellsRes, reportsRes, georef] = await Promise.all([
    sb.from('safety_cells').select('cell, lat, lng, robo_level, choque_level')
      .gte('lat', s - pad).lte('lat', n + pad).gte('lng', w - pad).lte('lng', e + pad).limit(6000),
    sb.rpc('safety_reports_in', { p_west: w - pad, p_south: s - pad, p_east: e + pad, p_north: n + pad }),
    probes.length
      ? fetch(GEOREF, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'KovaHealth/1.0 (bike routes)' },
          body: JSON.stringify({ ubicaciones: probes.map((p) => ({ ...p, campos: 'departamento.id,provincia.id' })) }),
          signal: AbortSignal.timeout(8000),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null),
  ]);
  // deno-lint-ignore no-explicit-any
  const cells = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  for (const c of cellsRes.data ?? []) cells.set(c.cell, c);
  // deno-lint-ignore no-explicit-any
  const reports: any[] = reportsRes.data ?? [];
  // deno-lint-ignore no-explicit-any
  const depOfProbe: Array<string | null> = (georef?.resultados ?? []).map((r: any) => (r?.ubicacion?.provincia?.id === '06' ? r?.ubicacion?.departamento?.id ?? null : null));
  const depIds = [...new Set(depOfProbe.filter(Boolean))] as string[];
  // deno-lint-ignore no-explicit-any
  const partidos = new Map<string, any>();
  if (depIds.length) {
    const { data } = await sb.from('safety_partidos').select('id, name, level').in('id', depIds);
    // deno-lint-ignore no-explicit-any
    for (const p of data ?? []) partidos.set(p.id, p);
  }

  const perRoute = sampled.map((ss, ri) => {
    let robo_high_m = 0, robo_mid_m = 0, choque_high_m = 0, caba_m = 0;
    for (const x of ss) {
      const c = cells.get(cellOf(x.p[0]!, x.p[1]!));
      if (!c) continue;
      caba_m += x.m;
      if (c.robo_level === 2) robo_high_m += x.m; else if (c.robo_level === 1) robo_mid_m += x.m;
      if (c.choque_level === 2) choque_high_m += x.m;
    }
    const names: Array<{ name: string; level: number }> = [];
    for (const pi of probeOf[ri]!) {
      const p = partidos.get(depOfProbe[pi] ?? '');
      if (p && !names.some((q) => q.name === p.name)) names.push({ name: p.name, level: p.level });
    }
    // Reports within 100 m of the route.
    let near = 0;
    for (const rep of reports) {
      const q = [Number(rep.lng), Number(rep.lat)];
      for (let k = 0; k < ss.length; k += 2) if (meters(q, ss[k]!.p) < 100) { near++; break; }
    }
    return { robo_high_m: Math.round(robo_high_m), robo_mid_m: Math.round(robo_mid_m), choque_high_m: Math.round(choque_high_m), caba_m: Math.round(caba_m), partidos: names, reports: near };
  });
  const zones = {
    cells: [...cells.values()].filter((c) => c.robo_level > 0 || c.choque_level === 2)
      .map((c) => ({ lat: Number(c.lat), lng: Number(c.lng), r: c.robo_level, c: c.choque_level })),
    // deno-lint-ignore no-explicit-any
    reports: reports.map((r: any) => ({ id: r.id, coord: [Number(r.lng), Number(r.lat)], kind: r.kind, day: r.day, mine: r.mine })),
    grid: GRID,
  };
  return { perRoute, zones };
}

// deno-lint-ignore no-explicit-any
async function withSafety(sb: any, routes: any[]) {
  try {
    const sf = await safetyFor(sb, routes);
    if (!sf) return { routes, zones: null };
    return { routes: routes.map((r, i) => ({ ...r, safety: sf.perRoute[i] })), zones: sf.zones };
  } catch (e) {
    console.error('safety', String(e));
    return { routes, zones: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const authorization = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !url || !anonKey) return json(401, { code: 'UNAUTHENTICATED', message: 'Missing credentials' });
  const sb = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: who } = await sb.auth.getUser();
  if (!who?.user) return json(401, { code: 'UNAUTHENTICATED', message: 'Invalid session' });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return bad('Body must be JSON'); }

  try {
    if (body.action === 'search') {
      const text = String(body.text ?? '').trim().slice(0, 120);
      if (text.length < 3) return bad('Escribí al menos 3 letras');
      const qs = new URLSearchParams({ text, size: '6', 'boundary.country': 'AR', lang: 'es' });
      if (isCoord(body.near)) { qs.set('focus.point.lon', String(body.near[0])); qs.set('focus.point.lat', String(body.near[1])); }
      const r = await ors('/geocode/autocomplete?' + qs.toString(), { method: 'GET' });
      if (!r.ok) return json(502, { code: 'UPSTREAM', message: 'No pudimos buscar ahora' });
      // deno-lint-ignore no-explicit-any
      const places = (r.body.features ?? []).map((f: any) => ({ name: f.properties?.name, label: f.properties?.label, coord: f.geometry?.coordinates }));
      return json(200, { places });
    }

    if (body.action === 'route') {
      const points = body.points;
      if (!Array.isArray(points) || points.length < 2 || points.length > 10 || !points.every(isCoord)) return bad('Entre 2 y 10 puntos');
      const r = await directions(points.map((p: LngLat) => [p[0], p[1]]));
      if (!r.route) return json(r.error === 'NO_ROUTE' ? 404 : 502, { code: r.error, message: 'No encontramos una ruta en bici entre esos puntos' });
      const [parks, safe] = await Promise.all([parksAround([r.route]), withSafety(sb, [r.route])]);
      return json(200, { routes: safe.routes, parks, zones: safe.zones });
    }

    if (body.action === 'loop') {
      const length = Number(body.length_m);
      if (!isCoord(body.start) || !(length >= 2000 && length <= 150000)) return bad('Largo entre 2 y 150 km');
      const n = Math.min(3, Math.max(1, Number(body.options) || 3));
      const seed0 = Math.floor(Math.random() * 1000);
      const results = await Promise.all(Array.from({ length: n }, (_, i) =>
        directions([[body.start[0], body.start[1]]], { length, seed: seed0 + i * 37 })));
      const routes = results.flatMap((r) => (r.route ? [r.route] : []));
      if (!routes.length) return json(502, { code: 'UPSTREAM', message: 'No pudimos armar recorridos ahora' });
      const [parks, safe] = await Promise.all([parksAround(routes), withSafety(sb, routes)]);
      return json(200, { routes: safe.routes, parks, zones: safe.zones });
    }

    return bad('action must be route, loop or search');
  } catch (e) {
    console.error('bike-route', String(e));
    return json(500, { code: 'INTERNAL', message: 'Algo salió mal' });
  }
});
