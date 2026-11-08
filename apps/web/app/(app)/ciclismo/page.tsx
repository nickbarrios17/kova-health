'use client';
/**
 * Ciclismo on the desktop web (docs/ciclismo.md): plan rides on a big map, see what each route goes
 * through (bike lanes, parks, zones with more robberies or crashes), save it and ride it from the phone,
 * where «Navegar» guides you. Same routes, analysis and map as the phone app.
 */
import type { MySafetyReport, Place, SavedRoute } from '@kova/api-client';
import {
  KovaError, SAFETY_REPORT_KINDS, SPEEDS_KMH, WAY_COLORS, analyzeRoute, formatKm, newId, routeScore,
  type Coord, type Park, type RawRoute, type RouteAnalysis, type SafetyReportKind, type SafetyZones,
} from '@kova/domain';
import { useMemo, useState } from 'react';
import { ErrorNotice, Loading } from '@/components/EmptyState';
import { RouteMapFrame, type MapData, type Ride } from '@/components/RouteMapFrame';
import { kova } from '@/lib/client';
import { chip } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

type Mode = 'tiempo' | 'ab' | 'guardadas';
type Plan = { kind: 'ab' | 'loop'; routes: RawRoute[]; parks: Park[]; zones?: SafetyZones | null; savedName?: string; savedId?: string };
const MINUTES = [30, 45, 60, 90, 120];
const RIDE_SPEEDS = [{ label: 'Lenta', x: 5 }, { label: 'Media', x: 15 }, { label: 'Rápida', x: 40 }];
const NAMES = { bicisenda: 'Bicisenda', calle: 'Calles', avenida: 'Avenidas', sendero: 'Sendero', otro: 'Otros' } as const;

const fmtDuration = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
};
const message = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');
const muted = { fontSize: 13, color: 'var(--kova-text-2)' } as const;

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ ...chip(on), borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
      {label}
    </button>
  );
}

function RouteCard({ a, title, selected, onClick }: { a: RouteAnalysis; title: string; selected: boolean; onClick: () => void }) {
  const parts = (['bicisenda', 'calle', 'avenida', 'sendero', 'otro'] as const).filter((k) => a.shares[k] >= 0.01);
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--kova-radius-xl)', cursor: 'pointer', color: 'var(--color-text)', font: 'inherit',
        border: '1px solid ' + (selected ? 'var(--color-accent)' : 'var(--color-divider)'), background: selected ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))' : 'var(--color-surface)' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 500 }}>
        <span>{title}</span><span style={{ color: 'var(--color-accent-300)' }}>{fmtDuration(a.duration_s)}</span>
      </span>
      <span style={muted}>{formatKm(a.distance_m)}{a.ascent_m >= 10 ? ' · ' + a.ascent_m + ' m de subida' : ''} · tiempo estimado</span>
      <span style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--color-neutral-800)' }}>
        {parts.map((k) => <span key={k} style={{ flex: a.shares[k], background: WAY_COLORS[k] }} />)}
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {parts.map((k) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--kova-text-2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: WAY_COLORS[k] }} />{NAMES[k]} {Math.round(a.shares[k] * 100)} %
          </span>
        ))}
      </span>
      {a.tags.length ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {a.tags.map((t) => <span key={t} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 10, background: 'rgba(95,211,154,0.12)', color: 'var(--kova-ok, #5fd39a)' }}>{t}</span>)}
        </span>
      ) : null}
      {a.warnings.map((w) => (
        <span key={w} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--kova-warn, #EFC173)' }}><i className="ph ph-warning" />{w}</span>
      ))}
    </button>
  );
}

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--kova-text-2)' }}>
      <span style={{ width: 10, height: 10, borderRadius: square ? 2 : 5, background: color }} />{label}
    </span>
  );
}

export default function CiclismoPage() {
  const [mode, setMode] = useState<Mode>('tiempo');
  const [minutes, setMinutes] = useState(60);
  const [speed, setSpeed] = useState(18);
  const [me, setMe] = useState<Coord | null>(null);
  const [start, setStart] = useState<Coord | null>(null);
  const [end, setEnd] = useState<{ coord: Coord; label: string } | null>(null);
  const [tapSets, setTapSets] = useState<'start' | 'end'>('end');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sel, setSel] = useState(0);
  const [view3d, setView3d] = useState(false);
  const [fit, setFit] = useState(0);
  const [riding, setRiding] = useState<{ paused: boolean } | null>(null);
  const [rideX, setRideX] = useState(15);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [reporting, setReporting] = useState<'tap' | { coord: [number, number] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const saved = useAsync(() => (mode === 'guardadas' ? kova().cycling.saved() : Promise.resolve([] as SavedRoute[])), [mode]);
  const myReports = useAsync(() => (mode === 'guardadas' ? kova().cycling.myReports() : Promise.resolve([] as MySafetyReport[])), [mode]);

  const from = start ?? me;
  const analyses = useMemo(() => (plan ? plan.routes.map((rt) => analyzeRoute(rt, plan.parks, speed)) : []), [plan, speed]);
  const order = useMemo(() => analyses.map((a, i) => ({ a, i })).sort((x, y) => (plan?.kind === 'loop' ? routeScore(y.a) - routeScore(x.a) : 0)), [analyses, plan]);
  const mapData = useMemo<MapData>(() => {
    const markers: MapData['markers'] = [];
    if (me) markers.push({ coord: [me[0], me[1]], kind: 'me' });
    if (from && mode !== 'guardadas') markers.push({ coord: [from[0], from[1]], kind: 'start' });
    if (end && mode === 'ab') markers.push({ coord: [end.coord[0], end.coord[1]], kind: 'end' });
    return {
      routes: plan ? plan.routes.map((rt, i) => ({ coords: rt.coords, segments: analyses[i]?.segments ?? [], selected: i === sel })) : [],
      parks: plan?.parks ?? [], markers, fit: fit > 0, view3d, zones: plan?.zones ?? null, showZones,
    };
  }, [plan, analyses, sel, me, from, end, mode, view3d, fit, showZones]);
  const ride = useMemo<Ride | null>(() => (riding ? { kmh: speed * rideX, paused: riding.paused } : null), [riding, speed, rideX]);
  const stopRide = () => { setRiding(null); setProgress(null); };
  const endRide = () => { stopRide(); setFit((n) => n + 1); };

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(null); setNotice(null); setBusy(label);
    try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };
  const locate = () => run('locate', () => new Promise<void>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new KovaError('FORBIDDEN', 'Este navegador no comparte la ubicación. Hacé clic en el mapa para marcar desde dónde salís.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe([pos.coords.longitude, pos.coords.latitude]); setStart(null); setFit((n) => n + 1); resolve(); },
      () => reject(new KovaError('FORBIDDEN', 'Sin permiso de ubicación. Hacé clic en el mapa para marcar desde dónde salís.')),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }));
  const showPlan = (p: Plan) => { setPlan(p); setSel(0); stopRide(); setFit((n) => n + 1); setName(p.savedName ?? ''); };
  const findLoops = () => run('plan', async () => {
    if (!from) throw new KovaError('INVALID_INPUT', 'Primero marcá desde dónde salís: tu ubicación o un punto en el mapa.');
    showPlan({ kind: 'loop', ...(await kova().cycling.loops(from, Math.round((minutes * 60 * (speed / 3.6)) / 1.08))) });
  });
  const findRoute = () => run('plan', async () => {
    if (!from) throw new KovaError('INVALID_INPUT', 'Marcá desde dónde salís: tu ubicación o un punto en el mapa.');
    if (!end) throw new KovaError('INVALID_INPUT', 'Elegí a dónde vas: buscalo o hacé clic en el mapa.');
    showPlan({ kind: 'ab', ...(await kova().cycling.route([from, end.coord])) });
  });
  const search = () => run('search', async () => { setPlaces(await kova().cycling.search(query, from ?? undefined)); });
  const save = (a: RouteAnalysis, rt: RawRoute) => run('save', async () => {
    const fallback = plan?.kind === 'loop' ? 'Vuelta de ' + fmtDuration(a.duration_s) : 'A ' + (end?.label ?? 'destino');
    await kova().cycling.save({ id: newId(), name: name || fallback, kind: plan!.kind, route: rt, analysis: a });
    setNotice('Ruta guardada. En el celular la encontrás en Ciclismo → Guardadas, y desde ahí la podés navegar.');
  });
  const open = (sr: SavedRoute) => run('open', async () => {
    const got = await kova().cycling.get(sr.id);
    showPlan({ kind: got.kind, routes: [got.route], parks: [], savedName: got.name, savedId: got.id });
  });
  const sendReport = (kind: SafetyReportKind) => run('report', async () => {
    if (!reporting || reporting === 'tap') return;
    const id = newId();
    await kova().cycling.report({ id, kind, coord: reporting.coord });
    setPlan((p) => (p?.zones ? { ...p, zones: { ...p.zones, reports: [{ id, coord: reporting.coord, kind, day: '', mine: true }, ...p.zones.reports] } } : p));
    setReporting(null);
    setNotice('Gracias. Otros ciclistas lo van a ver durante 6 meses, sin tu nombre.');
  });
  const onTap = (coord: [number, number]) => {
    if (reporting === 'tap') { setReporting({ coord }); return; }
    if (mode === 'guardadas') return;
    if (mode === 'ab' && tapSets === 'end') { setEnd({ coord, label: 'punto del mapa' }); setPlaces(null); }
    else setStart(coord);
    setPlan(null);
  };
  const selected = plan ? { a: analyses[sel]!, rt: plan.routes[sel]! } : null;

  const mapBtn = (on: boolean) => ({ height: 36, padding: '0 12px', borderRadius: 18, border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
    color: '#fff', background: on ? 'rgba(123,104,217,0.95)' : 'rgba(22,24,38,0.88)' } as const);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 380px', maxWidth: 520, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div role="tablist" aria-label="Modo" style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--kova-radius-control)', overflow: 'hidden', alignSelf: 'flex-start' }}>
          {([['tiempo', 'Por tiempo'], ['ab', 'A → B'], ['guardadas', 'Guardadas']] as const).map(([m, l]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPlan(null); setError(null); setNotice(null); stopRide(); }}
              style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer', ...chip(mode === m), borderWidth: 0 }}>{l}</button>
          ))}
        </div>

        {mode === 'tiempo' && (
          <>
            <span style={muted}>{from ? (start ? 'Salís desde el punto marcado.' : 'Salís desde tu ubicación.') : 'Hacé clic en el mapa, o usá tu ubicación, para marcar desde dónde salís.'}</span>
            <span style={{ fontSize: 13 }}>¿Cuánto querés andar?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{MINUTES.map((m) => <Chip key={m} label={fmtDuration(m * 60)} on={minutes === m} onClick={() => setMinutes(m)} />)}</div>
            <span style={{ fontSize: 13 }}>Tu ritmo</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{SPEEDS_KMH.map((s) => <Chip key={s} label={s + ' km/h'} on={speed === s} onClick={() => setSpeed(s)} />)}</div>
            <button className="btn btn-primary" disabled={busy === 'plan'} onClick={findLoops} style={{ alignSelf: 'flex-start' }}>
              <i className={busy === 'plan' ? 'ph ph-circle-notch kova-spin' : 'ph ph-bicycle'} />{plan ? 'Buscar otros recorridos' : 'Buscar recorridos'}
            </button>
          </>
        )}

        {mode === 'ab' && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); search(); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1 }}>
                <span style={{ fontSize: 12, color: 'var(--kova-text-2)' }}>¿A dónde vas?</span>
                <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Dirección o lugar" />
              </label>
              <button className="btn btn-secondary" disabled={query.trim().length < 3 || busy === 'search'} aria-label="Buscar"><i className="ph ph-magnifying-glass" /></button>
            </form>
            {places && (places.length ? places.map((p) => (
              <button key={p.label + p.coord.join()} type="button" className="kova-nav"
                onClick={() => { setEnd({ coord: p.coord, label: p.name }); setPlaces(null); setQuery(p.name); setPlan(null); setFit((n) => n + 1); }}
                style={{ textAlign: 'left', border: 0, borderBottom: '1px solid var(--color-divider)', background: 'transparent', color: 'var(--color-text)', padding: '8px 4px', cursor: 'pointer', font: 'inherit' }}>
                <div style={{ fontSize: 14 }}>{p.name}</div><div style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>{p.label}</div>
              </button>
            )) : <span style={muted}>No encontramos ese lugar.</span>)}
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', ...muted }}>
              Clic en el mapa marca:
              <Chip label="Salida" on={tapSets === 'start'} onClick={() => setTapSets('start')} />
              <Chip label="Destino" on={tapSets === 'end'} onClick={() => setTapSets('end')} />
            </span>
            <span style={muted}>{from ? (start ? 'Salís del punto marcado' : 'Salís de tu ubicación') : 'Falta la salida'} · {end ? 'vas a ' + end.label : 'falta el destino'}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{SPEEDS_KMH.map((s) => <Chip key={s} label={s + ' km/h'} on={speed === s} onClick={() => setSpeed(s)} />)}</div>
            <button className="btn btn-primary" disabled={busy === 'plan'} onClick={findRoute} style={{ alignSelf: 'flex-start' }}>
              <i className={busy === 'plan' ? 'ph ph-circle-notch kova-spin' : 'ph ph-bicycle'} />Calcular ruta
            </button>
          </>
        )}

        {mode === 'guardadas' && !plan && (
          saved.loading ? <Loading /> : saved.error ? <ErrorNotice message={saved.error} onRetry={saved.reload} /> : !saved.data?.length ? (
            <span style={muted}>Todavía no guardaste rutas. Planificá una en «Por tiempo» o «A → B» y guardala.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saved.data.map((sr) => (
                <button key={sr.id} type="button" className="card" onClick={() => open(sr)} style={{ textAlign: 'left', border: 0, cursor: 'pointer', color: 'var(--color-text)', font: 'inherit' }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 500 }}><span>{sr.name}</span><span style={{ color: 'var(--color-accent-300)' }}>{fmtDuration(sr.duration_s)}</span></span>
                  <span style={{ fontSize: 12, color: 'var(--kova-text-2)' }}>{formatKm(sr.distance_m)}{sr.summary.tags?.length ? ' · ' + sr.summary.tags.join(' · ') : ''}</span>
                </button>
              ))}
            </div>
          )
        )}
        {mode === 'guardadas' && !plan && myReports.data?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Tus avisos</span>
            {myReports.data.map((rp) => (
              <span key={rp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...muted }}>
                {SAFETY_REPORT_KINDS.find((k) => k.kind === rp.kind)?.label} · {rp.created_at.slice(8, 10)}/{rp.created_at.slice(5, 7)}
                <button className="btn btn-ghost" onClick={() => { if (window.confirm('¿Borrar este aviso?')) void run('remove', async () => { await kova().cycling.removeReport(rp.id); myReports.reload(); }); }}>
                  <i className="ph ph-trash" />Borrar
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {reporting === 'tap' && <span role="status" style={{ ...muted, color: 'var(--color-accent-300)' }}>Hacé clic en el mapa en el lugar del que querés avisar.</span>}
        {reporting && reporting !== 'tap' && (
          <div className="card">
            <span style={{ fontSize: 15, fontWeight: 500 }}>¿Qué pasó ahí?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{SAFETY_REPORT_KINDS.map((k) => <Chip key={k.kind} label={k.label} on={false} onClick={() => sendReport(k.kind)} />)}</div>
            <span style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>Otros ciclistas ven el punto y qué pasó, nunca quién avisó. Se borra solo a los 6 meses.</span>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setReporting(null)}>Cancelar</button>
          </div>
        )}

        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--kova-warn, #EFC173)' }}><i className="ph ph-warning" /> {error}</div>}
        {notice && <div role="status" style={{ fontSize: 13, color: 'var(--kova-ok, #5fd39a)' }}>{notice}</div>}

        {plan && order.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.kind === 'loop' && <span style={muted}>{order.length === 1 ? 'Encontramos un recorrido.' : 'Encontramos ' + order.length + ' recorridos; el primero es el que más bicisendas y parques tiene, y menos zonas con robos. Elegí uno para verlo.'}</span>}
            {order.map(({ a, i }, k) => (
              <RouteCard key={i} a={a} selected={i === sel} onClick={() => { setSel(i); stopRide(); }}
                title={plan.savedName ?? (plan.kind === 'loop' ? 'Opción ' + (k + 1) : 'Ruta en bici')} />
            ))}
            {selected && (
              <div className="card">
                <span style={{ fontSize: 13 }}>{riding ? (progress ? formatKm(progress.done) + ' de ' + formatKm(progress.total) : 'Preparando la bici…') : 'Recorrido en 3D'}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {RIDE_SPEEDS.map((o) => <Chip key={o.x} on={rideX === o.x} onClick={() => setRideX(o.x)} label={o.label + ' · ' + fmtDuration(selected.a.distance_m / ((speed * o.x) / 3.6))} />)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {riding ? (
                    <>
                      <button className="btn btn-secondary" onClick={() => setRiding({ paused: !riding.paused })}><i className={riding.paused ? 'ph ph-play' : 'ph ph-pause'} />{riding.paused ? 'Seguir' : 'Pausar'}</button>
                      <button className="btn btn-ghost" onClick={endRide}><i className="ph ph-stop" />Detener</button>
                    </>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => { setProgress(null); setRiding({ paused: false }); }}><i className="ph ph-play" />Recorrer en 3D</button>
                  )}
                </div>
                {!plan.savedId ? (
                  <form onSubmit={(e) => { e.preventDefault(); save(selected.a, selected.rt); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
                    <label className="field" style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: 'var(--kova-text-2)' }}>Nombre</span>
                      <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={plan.kind === 'loop' ? 'Vuelta de ' + fmtDuration(selected.a.duration_s) : 'Mi ruta'} />
                    </label>
                    <button className="btn btn-primary" disabled={busy === 'save'}><i className="ph ph-floppy-disk" />Guardar ruta</button>
                  </form>
                ) : (
                  <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setPlan(null)}>Volver a la lista</button>
                )}
                <span style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>Para que te guíe con voz mientras andás, guardala y abrila en el celular: Ciclismo → Guardadas → Navegar.</span>
              </div>
            )}
          </div>
        )}

        <span style={{ fontSize: 12, color: 'var(--kova-text-3)', lineHeight: 1.5 }}>
          Los tiempos son estimados. Las zonas salen de estadísticas oficiales de robos y choques: muestran dónde pasa más seguido, no garantizan nada. En el conurbano el dato es por partido, menos preciso.
        </span>
        <span style={{ fontSize: 11, color: 'var(--kova-text-3)' }}>
          Rutas: openrouteservice.org · Mapa y parques: © OpenStreetMap, OpenFreeMap · Edificios: Overture Maps · Delitos y choques en CABA: Mapa del delito, BA Data (CC BY) · Conurbano: SNIC, Ministerio de Seguridad
        </span>
      </section>

      <section style={{ flex: '2 1 520px', minWidth: 0, position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <RouteMapFrame data={mapData} ride={ride} height="min(72vh, 760px)" onTap={onTap}
            onPick={(i) => { setSel(i); stopRide(); }} onFlyEnd={endRide} onRideProgress={(done, total) => setProgress({ done, total })} />
          <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <button type="button" style={mapBtn(false)} onClick={() => { setView3d((v) => !v); stopRide(); }}>
              <i className={view3d ? 'ph ph-map-trifold' : 'ph ph-cube-focus'} />{view3d ? '2D' : '3D'}
            </button>
            <button type="button" style={{ ...mapBtn(false), background: showZones ? 'rgba(229,72,77,0.92)' : 'rgba(22,24,38,0.88)' }} aria-pressed={showZones} onClick={() => setShowZones((v) => !v)}>
              <i className="ph ph-shield-warning" />Zonas
            </button>
            <button type="button" style={mapBtn(!!reporting)} aria-pressed={!!reporting} onClick={() => { setReporting((r) => (r ? null : 'tap')); setNotice(null); }}>
              <i className="ph ph-megaphone-simple" />Avisar
            </button>
            {mode !== 'guardadas' && (
              <button type="button" style={mapBtn(false)} onClick={locate}><i className={busy === 'locate' ? 'ph ph-circle-notch kova-spin' : 'ph ph-crosshair'} />Mi ubicación</button>
            )}
          </div>
        </div>
        {showZones && plan?.zones && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Legend color="rgba(229,72,77,0.55)" label="Muchos robos" square />
            <Legend color="rgba(242,153,74,0.45)" label="Algunos robos" square />
            <Legend color="#f2c94c" label="Choques" />
            <Legend color="#8b5cf6" label="Avisos de ciclistas" />
          </div>
        )}
      </section>
    </div>
  );
}
