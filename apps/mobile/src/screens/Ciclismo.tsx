/**
 * Ciclismo (docs/ciclismo.md): plan a ride before going out.
 * - Por tiempo: «quiero andar 1 hora» → up to 3 loops from where you are, best first.
 * - A → B: to a place you search or tap on the map.
 * Each route says how much is bike lane, neighbourhood streets or avenues, which parks it crosses,
 * the estimated time at your speed, and what to watch out for. 2D/3D map and a 3D ride: a bike follows the route at the speed you pick.
 */
import { KovaError, SPEEDS_KMH, analyzeRoute, formatKm, newId, routeScore, type Coord, type Park, type RawRoute, type RouteAnalysis } from '@kova/domain';
import type { Place, SavedRoute } from '@kova/api-client';
import * as Location from 'expo-location';
import { ArrowLeft, Bicycle, Crosshair, CubeFocus, FloppyDisk, MagnifyingGlass, MapTrifold, NavigationArrow, Pause, Play, Stop, Trash, Warning } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useBack } from '../back';
import { kova } from '../client';
import { RouteMap, type MapData, type Ride } from '../RouteMap';
import { WAY_COLORS } from '../routeMapHtml';
import { Navegar } from './Navegar';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Confirm, Empty, ErrorNote, Field, Loading, Notice, Row, Seg, T } from '../ui';

type Mode = 'tiempo' | 'ab' | 'guardadas';
type Plan = { kind: 'ab' | 'loop'; routes: RawRoute[]; parks: Park[]; savedName?: string; savedId?: string };
const MINUTES = [30, 45, 60, 90, 120];
// «Recorrer en 3D»: how many times faster than your pace the bike goes on the map.
const RIDE_SPEEDS = [{ label: 'Lenta', x: 5 }, { label: 'Media', x: 15 }, { label: 'Rápida', x: 40 }];

export const fmtDuration = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
};
const message = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? c.accentSoft : 'transparent', justifyContent: 'center' }}>
      <T size={13} color={on ? c.a200 : c.n300}>{label}</T>
    </Pressable>
  );
}

function Shares({ a }: { a: RouteAnalysis }) {
  const parts = (['bicisenda', 'calle', 'avenida', 'sendero', 'otro'] as const).filter((k) => a.shares[k] >= 0.01);
  const names = { bicisenda: 'Bicisenda', calle: 'Calles', avenida: 'Avenidas', sendero: 'Sendero', otro: 'Otros' };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.n800 }}>
        {parts.map((k) => <View key={k} style={{ flex: a.shares[k], backgroundColor: WAY_COLORS[k] }} />)}
      </View>
      <Row style={{ flexWrap: 'wrap', gap: 10 }}>
        {parts.map((k) => (
          <Row key={k} style={{ gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: WAY_COLORS[k] }} />
            <T size={11} color={c.n400}>{names[k]} {Math.round(a.shares[k] * 100)} %</T>
          </Row>
        ))}
      </Row>
    </View>
  );
}

function RouteCard({ a, title, selected, onPress }: { a: RouteAnalysis; title: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ padding: 14, gap: 10, borderRadius: r.lg, borderWidth: 1, borderColor: selected ? c.accent : c.divider, backgroundColor: selected ? 'rgba(145,132,217,0.08)' : c.surface }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={15} w="medium">{title}</T>
        <T size={15} w="medium" color={c.a200}>{fmtDuration(a.duration_s)}</T>
      </Row>
      <T size={13} color={c.n400}>{formatKm(a.distance_m)}{a.ascent_m >= 10 ? ' · ' + a.ascent_m + ' m de subida' : ''} · tiempo estimado</T>
      <Shares a={a} />
      {a.tags.length ? <Row style={{ flexWrap: 'wrap', gap: 6 }}>{a.tags.map((t) => (
        <View key={t} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(95,211,154,0.12)' }}><T size={12} color={c.ok}>{t}</T></View>
      ))}</Row> : null}
      {a.warnings.map((w) => (
        <Row key={w} style={{ gap: 6 }}><Warning size={14} color={c.warn} /><T size={12} color={c.warn}>{w}</T></Row>
      ))}
    </Pressable>
  );
}

export function Ciclismo({ onClose }: { onClose: () => void }) {
  useBack(true, onClose);
  const { height: screenH } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('tiempo');
  const [minutes, setMinutes] = useState(60);
  const [speed, setSpeed] = useState<number>(18);
  const [me, setMe] = useState<Coord | null>(null);
  const [start, setStart] = useState<Coord | null>(null);
  const [end, setEnd] = useState<{ coord: Coord; label: string } | null>(null);
  const [tapSets, setTapSets] = useState<'start' | 'end'>('end');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sel, setSel] = useState(0);
  const [view3d, setView3d] = useState(false);
  const [riding, setRiding] = useState<{ paused: boolean } | null>(null);
  const [rideX, setRideX] = useState(15);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [fit, setFit] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<SavedRoute | null>(null);
  const saved = useAsync(() => (mode === 'guardadas' ? kova.cycling.saved() : Promise.resolve([] as SavedRoute[])), [mode]);

  const from = start ?? me;
  const analyses = useMemo(() => (plan ? plan.routes.map((rt) => analyzeRoute(rt, plan.parks, speed)) : []), [plan, speed]);
  // Loops: best first. A → B: the only route.
  const order = useMemo(() => analyses.map((a, i) => ({ a, i })).sort((x, y) => (plan?.kind === 'loop' ? routeScore(y.a) - routeScore(x.a) : 0)), [analyses, plan]);

  const mapData = useMemo<MapData>(() => {
    const markers: MapData['markers'] = [];
    if (me) markers.push({ coord: [me[0], me[1]], kind: 'me' });
    if (from && mode !== 'guardadas') markers.push({ coord: [from[0], from[1]], kind: 'start' });
    if (end && mode === 'ab') markers.push({ coord: [end.coord[0], end.coord[1]], kind: 'end' });
    return {
      routes: plan ? plan.routes.map((rt, i) => ({ coords: rt.coords, segments: analyses[i]?.segments ?? [], selected: i === sel })) : [],
      parks: plan?.parks ?? [],
      markers, fit: fit > 0, view3d,
    };
  }, [plan, analyses, sel, me, from, end, mode, view3d, fit]);
  const ride = useMemo<Ride | null>(() => (riding ? { kmh: speed * rideX, paused: riding.paused } : null), [riding, speed, rideX]);
  const stopRide = () => { setRiding(null); setProgress(null); };
  // Back to the whole route when a ride ends or is stopped.
  const endRide = () => { stopRide(); setFit((n) => n + 1); };

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(null); setNotice(null); setBusy(label);
    try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };

  const locate = () => run('locate', async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) throw new KovaError('FORBIDDEN', 'Sin permiso de ubicación. Tocá el mapa para marcar desde dónde salís.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMe([pos.coords.longitude, pos.coords.latitude]);
    setStart(null);
    setFit((n) => n + 1);
  });

  const showPlan = (p: Plan) => { setPlan(p); setSel(0); stopRide(); setFit((n) => n + 1); setName(p.savedName ?? ''); };

  const findLoops = () => run('plan', async () => {
    if (!from) throw new KovaError('INVALID_INPUT', 'Primero marcá desde dónde salís: tu ubicación o un punto en el mapa.');
    const res = await kova.cycling.loops(from, Math.round(((minutes * 60) * (speed / 3.6)) / 1.08));
    showPlan({ kind: 'loop', ...res });
  });
  const findRoute = () => run('plan', async () => {
    if (!from) throw new KovaError('INVALID_INPUT', 'Marcá desde dónde salís: tu ubicación o un punto en el mapa.');
    if (!end) throw new KovaError('INVALID_INPUT', 'Elegí a dónde vas: buscalo o tocá el mapa.');
    const res = await kova.cycling.route([from, end.coord]);
    showPlan({ kind: 'ab', ...res });
  });
  const search = () => run('search', async () => {
    Keyboard.dismiss();
    setPlaces(await kova.cycling.search(query, from ?? undefined));
  });
  const save = (a: RouteAnalysis, rt: RawRoute) => run('save', async () => {
    const fallback = plan?.kind === 'loop' ? 'Vuelta de ' + fmtDuration(a.duration_s) : 'A ' + (end?.label ?? 'destino');
    await kova.cycling.save({ id: newId(), name: name || fallback, kind: plan!.kind, route: rt, analysis: a });
    setNotice('Ruta guardada. La encontrás en «Guardadas».');
  });
  const open = (s: SavedRoute) => run('open', async () => {
    const got = await kova.cycling.get(s.id);
    showPlan({ kind: got.kind, routes: [got.route], parks: [], savedName: got.name, savedId: got.id });
  });

  const onTap = (coord: [number, number]) => {
    if (mode === 'guardadas') return;
    if (mode === 'ab' && tapSets === 'end') { setEnd({ coord, label: 'punto del mapa' }); setPlaces(null); }
    else setStart(coord);
    setPlan(null);
  };

  const selected = plan ? { a: analyses[sel]!, rt: plan.routes[sel]! } : null;
  const mapH = Math.max(260, Math.min(420, Math.round(screenH * 0.42)));

  if (navigating && selected && plan) {
    return (
      <Navegar route={selected.rt} kind={plan.kind} speedKmh={speed} onClose={() => setNavigating(false)}
        name={plan.savedName ?? (plan.kind === 'loop' ? 'Vuelta en bici' : 'A ' + (end?.label ?? 'destino'))} />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Row style={{ gap: 8 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <T size={22} w="medium" style={{ flex: 1 }}>Ciclismo</T>
        <Bicycle size={24} color={c.accent} />
      </Row>

      <Seg options={[['tiempo', 'Por tiempo'], ['ab', 'A → B'], ['guardadas', 'Guardadas']]} value={mode}
        onChange={(m) => { setMode(m); setPlan(null); setError(null); setNotice(null); stopRide(); }} />

      <View>
        <RouteMap data={mapData} height={mapH} onTap={onTap}
          onPick={(i) => { setSel(i); stopRide(); }} onFlyEnd={endRide} ride={ride}
          onRideProgress={(done, total) => setProgress({ done, total })} />
        <View style={{ position: 'absolute', right: 8, top: 8, gap: 8 }}>
          <Pressable onPress={() => { setView3d((v) => !v); stopRide(); }} accessibilityRole="button" accessibilityLabel={view3d ? 'Ver en 2D' : 'Ver en 3D'}
            style={{ minWidth: 44, height: 40, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(22,24,38,0.88)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {view3d ? <MapTrifold size={18} color={c.text} /> : <CubeFocus size={18} color={c.text} />}
            <T size={12}>{view3d ? '2D' : '3D'}</T>
          </Pressable>
          {mode !== 'guardadas' ? (
            <Pressable onPress={locate} accessibilityRole="button" accessibilityLabel="Ir a mi ubicación"
              style={{ width: 44, height: 40, borderRadius: 20, backgroundColor: 'rgba(22,24,38,0.88)', alignItems: 'center', justifyContent: 'center' }}>
              <Crosshair size={18} color={busy === 'locate' ? c.n500 : c.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {mode === 'tiempo' ? (
        <View style={{ gap: 12 }}>
          <T size={13} color={c.n400}>{from ? (start ? 'Salís desde el punto marcado.' : 'Salís desde tu ubicación.') : 'Tocá el mapa o el botón de ubicación para marcar desde dónde salís.'}</T>
          <View style={{ gap: 8 }}>
            <T size={13} color={c.n300}>¿Cuánto querés andar?</T>
            <Row style={{ flexWrap: 'wrap', gap: 8 }}>{MINUTES.map((m) => <Chip key={m} label={fmtDuration(m * 60)} on={minutes === m} onPress={() => setMinutes(m)} />)}</Row>
          </View>
          <View style={{ gap: 8 }}>
            <T size={13} color={c.n300}>Tu ritmo</T>
            <Row style={{ flexWrap: 'wrap', gap: 8 }}>{SPEEDS_KMH.map((s) => <Chip key={s} label={s + ' km/h'} on={speed === s} onPress={() => setSpeed(s)} />)}</Row>
          </View>
          <Button label={plan ? 'Buscar otros recorridos' : 'Buscar recorridos'} icon={Bicycle} onPress={findLoops} busy={busy === 'plan'} />
        </View>
      ) : null}

      {mode === 'ab' ? (
        <View style={{ gap: 10 }}>
          <Row style={{ gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="¿A dónde vas?" value={query} onChangeText={setQuery} placeholder="Dirección o lugar" returnKeyType="search" onSubmitEditing={search} /></View>
            <Button label="" accessibilityLabel="Buscar" icon={MagnifyingGlass} onPress={search} busy={busy === 'search'} disabled={query.trim().length < 3} style={{ width: 48 }} />
          </Row>
          {places ? (places.length ? places.map((p) => (
            <Pressable key={p.label + p.coord.join()} onPress={() => { setEnd({ coord: p.coord, label: p.name }); setPlaces(null); setQuery(p.name); setPlan(null); setFit((n) => n + 1); }}
              accessibilityRole="button" style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}>
              <T size={14}>{p.name}</T>
              <T size={12} color={c.n500}>{p.label}</T>
            </Pressable>
          )) : <T size={13} color={c.n400}>No encontramos ese lugar.</T>) : null}
          <Row style={{ gap: 8 }}>
            <T size={12} color={c.n400}>Tocar el mapa marca:</T>
            <Seg options={[['start', 'Salida'], ['end', 'Destino']]} value={tapSets} onChange={setTapSets} />
          </Row>
          <T size={13} color={c.n400}>
            {from ? (start ? 'Salís del punto marcado' : 'Salís de tu ubicación') : 'Falta la salida'}{' · '}{end ? 'vas a ' + end.label : 'falta el destino'}
          </T>
          <Row style={{ gap: 8 }}>
            {SPEEDS_KMH.map((s) => <Chip key={s} label={s + ' km/h'} on={speed === s} onPress={() => setSpeed(s)} />)}
          </Row>
          <Button label="Calcular ruta" icon={Bicycle} onPress={findRoute} busy={busy === 'plan'} />
        </View>
      ) : null}

      {mode === 'guardadas' && !plan ? (
        saved.loading ? <Loading /> : saved.error ? <ErrorNote message={saved.error} onRetry={saved.reload} /> : !saved.data?.length ? (
          <Empty icon={Bicycle} title="Todavía no guardaste rutas">Planificá una en «Por tiempo» o «A → B» y tocá «Guardar ruta».</Empty>
        ) : (
          <View style={{ gap: 10 }}>{saved.data.map((s) => (
            <Card key={s.id} style={{ gap: 6 }}>
              <Pressable onPress={() => open(s)} accessibilityRole="button" style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size={15} w="medium" style={{ flex: 1 }}>{s.name}</T>
                  <T size={14} color={c.a200}>{fmtDuration(s.duration_s)}</T>
                </Row>
                <T size={12} color={c.n400}>{formatKm(s.distance_m)}{s.summary.tags?.length ? ' · ' + s.summary.tags.join(' · ') : ''}</T>
              </Pressable>
              <Button variant="ghost" label="Borrar" icon={Trash} onPress={() => setRemoving(s)} style={{ alignSelf: 'flex-start' }} />
            </Card>
          ))}</View>
        )
      ) : null}

      {error ? <ErrorNote message={error} /> : null}
      {notice ? <Notice text={notice} /> : null}

      {plan && order.length ? (
        <View style={{ gap: 10 }}>
          {plan.kind === 'loop' ? <T size={13} color={c.n400}>{order.length === 1 ? 'Encontramos un recorrido.' : 'Encontramos ' + order.length + ' recorridos; el primero es el que más bicisendas y parques tiene. Tocá uno para verlo.'}</T> : null}
          {order.map(({ a, i }, k) => (
            <RouteCard key={i} a={a} selected={i === sel} onPress={() => { setSel(i); stopRide(); }}
              title={plan.savedName ?? (plan.kind === 'loop' ? 'Opción ' + (k + 1) : 'Ruta en bici')} />
          ))}
          {selected ? (
            <View style={{ gap: 10 }}>
              <Button label="Navegar" icon={NavigationArrow} onPress={() => { stopRide(); setNavigating(true); }} />
              <View style={{ gap: 8 }}>
                <T size={13} color={c.n300}>{riding ? (progress ? formatKm(progress.done) + ' de ' + formatKm(progress.total) : 'Preparando la bici…') : 'Velocidad del recorrido en 3D'}</T>
                <Row style={{ flexWrap: 'wrap', gap: 8 }}>{RIDE_SPEEDS.map((o) => (
                  <Chip key={o.x} on={rideX === o.x} onPress={() => setRideX(o.x)}
                    label={o.label + ' · ' + fmtDuration(selected.a.distance_m / ((speed * o.x) / 3.6))} />
                ))}</Row>
                {riding ? (
                  <Row style={{ gap: 8 }}>
                    <Button variant="secondary" label={riding.paused ? 'Seguir' : 'Pausar'} icon={riding.paused ? Play : Pause}
                      onPress={() => setRiding({ paused: !riding.paused })} style={{ flex: 1 }} />
                    <Button variant="ghost" label="Detener" icon={Stop} onPress={endRide} style={{ flex: 1 }} />
                  </Row>
                ) : (
                  <Button variant="secondary" label="Recorrer en 3D" icon={Play} onPress={() => { setProgress(null); setRiding({ paused: false }); }} />
                )}
              </View>
              {!plan.savedId ? (
                <Row style={{ gap: 8, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}><Field label="Nombre" value={name} onChangeText={setName} placeholder={plan.kind === 'loop' ? 'Vuelta de ' + fmtDuration(selected.a.duration_s) : 'Mi ruta'} maxLength={80} /></View>
                  <Button label="Guardar ruta" icon={FloppyDisk} onPress={() => save(selected.a, selected.rt)} busy={busy === 'save'} />
                </Row>
              ) : (
                <Button variant="ghost" label="Volver a la lista" onPress={() => setPlan(null)} />
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      <Notice text="Los tiempos son estimados. Pronto: avisos de zonas con más delitos en CABA y el conurbano." />
      <T size={11} color={c.n600}>Rutas: openrouteservice.org · Mapa y parques: © OpenStreetMap, OpenFreeMap</T>

      <Confirm
        visible={!!removing}
        title="¿Borrar esta ruta?"
        message={removing ? removing.name : ''}
        confirmLabel="Borrar"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const s = removing!;
          setRemoving(null);
          await run('remove', async () => { await kova.cycling.remove(s.id); saved.reload(); });
        }}
      />
    </ScrollView>
  );
}
