/**
 * Ciclismo, navigation mode (docs/ciclismo.md): follow the chosen route with the GPS.
 * The next maneuver on top, said out loud; distance and time left, speed and arrival time below.
 * Leaving the route recalculates from where you are. The screen stays on while navigating.
 * At the end: distance, time moving and average speed, and it can be saved as a workout.
 * Location is used only while this screen is open and never leaves the phone, except the
 * point sent to recalculate a route.
 */
import {
  ARRIVE_M, analyzeRoute, announcement, bearing, cumulative, distanceM, formatKm, isOff, locate, navInfo, newId, pointAt, rideSummary,
  stepText, type Coord, type NavInfo, type RawRoute, type SafetyZones,
} from '@kova/domain';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import {
  ArrowBendUpLeft, ArrowBendUpRight, ArrowUUpLeft, ArrowUp, ArrowUpLeft, ArrowUpRight, ArrowsClockwise, FlagCheckered,
  FloppyDisk, NavigationArrow, SpeakerHigh, SpeakerSlash, Stop, type Icon as PhosphorIcon,
} from 'phosphor-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useBack } from '../back';
import { kova } from '../client';
import { RouteMap, type MapData, type NavPos } from '../RouteMap';
import { c, rad } from '../theme';
import { Button, Card, ErrorNote, Field, Notice, Row, T } from '../ui';
import { fmtDuration } from './Ciclismo';

const ICONS: Record<number, PhosphorIcon> = {
  0: ArrowBendUpLeft, 1: ArrowBendUpRight, 2: ArrowBendUpLeft, 3: ArrowBendUpRight, 4: ArrowUpLeft, 5: ArrowUpRight,
  6: ArrowUp, 7: ArrowsClockwise, 8: ArrowsClockwise, 9: ArrowUUpLeft, 10: FlagCheckered, 12: ArrowUpLeft, 13: ArrowUpRight,
};
const shortDistance = (m: number) => (m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + ' m' : formatKm(m));
const clock = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Algo salió mal.');

export interface NavigateProps {
  route: RawRoute;
  kind: 'ab' | 'loop';
  /** Your planned pace, until there is a real average. */
  speedKmh: number;
  name: string;
  /** Zones with many robberies: a voice heads-up when you enter one. */
  zones?: SafetyZones | null;
  onClose: () => void;
}

export function Navegar({ route, kind, speedKmh, name: plannedName, zones = null, onClose }: NavigateProps) {
  useKeepAwake();
  const { height: screenH } = useWindowDimensions();
  const [rt, setRt] = useState(route);
  const cum = useMemo(() => cumulative(rt.coords), [rt]);
  const segments = useMemo(() => analyzeRoute(rt, [], speedKmh).segments, [rt, speedKmh]);
  const [info, setInfo] = useState<NavInfo | null>(null);
  const [pos, setPos] = useState<NavPos | null>(null);
  const [kmh, setKmh] = useState(0);
  const [off, setOff] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState<{ arrived: boolean; startedAt: Date; endedAt: Date; distance_m: number; moving_s: number; avg_kmh: number } | null>(null);
  const [name, setName] = useState(plannedName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inZone, setInZone] = useState(false);
  const risky = useMemo(() => {
    if (!zones) return null;
    const g = zones.grid, set = new Set<string>();
    for (const z of zones.cells) if (z.r === 2) set.add(Math.floor((z.lat - g.lat0) / g.dlat) + ':' + Math.floor((z.lng - g.lng0) / g.dlng));
    return { g, set };
  }, [zones]);
  // One id per ride: saving twice (a retry) keeps one workout.
  const rideId = useRef(newId());

  // Everything the GPS callback needs, without restarting the watch on each change.
  const s = useRef({
    rt: route, cum: cumulative(route.coords), along: 0, said: new Set<string>(), muted: false, voice: undefined as string | undefined,
    risky: null as typeof risky, lastZoneWarn: 0, wasInZone: false,
    last: null as Coord | null, lastTs: 0, odometer: 0, moving: 0, startedAt: new Date(), offCount: 0, lastReroute: 0, rerouting: false, done: false,
  }).current;
  s.rt = rt; s.cum = cum; s.muted = muted; s.risky = risky;

  const say = (text: string | null) => {
    if (!text || s.muted) return;
    Speech.stop();
    Speech.speak(text, { language: 'es-AR', voice: s.voice, rate: 1.0 });
  };

  const finish = (arrived: boolean) => {
    if (s.done) return;
    s.done = true;
    const sum = rideSummary(s.odometer, s.moving);
    setEnded({ arrived, startedAt: s.startedAt, endedAt: new Date(), ...sum });
  };
  useBack(true, () => (ended ? onClose() : finish(false)));

  const reroute = async (here: Coord) => {
    s.rerouting = true; s.lastReroute = Date.now(); setRerouting(true);
    say('Te saliste de la ruta. Recalculo.');
    try {
      const end = s.rt.coords[s.rt.coords.length - 1]!;
      const total = s.cum[s.cum.length - 1] ?? 0;
      // A loop goes back to it a bit ahead of where you left it, then on to the end, so it stays a loop.
      const via = kind === 'loop' && total - s.along > 800 ? [pointAt(s.rt.coords, s.cum, s.along + 400)] : [];
      const res = await kova.cycling.route([here, ...via, end]);
      const next = res.routes[0];
      if (next) {
        s.rt = next; s.cum = cumulative(next.coords); s.along = 0; s.said = new Set(); s.offCount = 0;
        setRt(next); setOff(false);
        say('Listo. Seguí las indicaciones.');
      }
    } catch {
      // Keep the old route; it tries again in a few seconds if you are still off.
    } finally {
      s.rerouting = false; setRerouting(false);
    }
  };

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    Speech.getAvailableVoicesAsync().then((voices) => {
      const es = voices.filter((v) => v.language?.toLowerCase().startsWith('es'));
      const pick = es.find((v) => /ar/i.test(v.language)) ?? es.find((v) => /419|us|mx/i.test(v.language)) ?? es[0];
      s.voice = pick?.identifier;
    }).catch(() => undefined);
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setGpsError('Sin permiso de ubicación no podemos guiarte. Activalo en los ajustes del celular.'); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
        (loc) => {
          if (!alive || s.done) return;
          setGpsError(null);
          const p: Coord = [loc.coords.longitude, loc.coords.latitude];
          const acc = loc.coords.accuracy ?? null;
          const now = loc.timestamp || Date.now();
          // Odometer and time moving, ignoring jumps a bike cannot make.
          if (s.last && (acc ?? 0) < 35) {
            const d = distanceM(s.last, p), dt = Math.max(0.001, (now - s.lastTs) / 1000);
            if (d / dt < 20 && dt < 30) {
              if (d > 2) s.odometer += d;
              if (d / dt > 0.8) s.moving += dt;
            }
          }
          if (!s.last || (acc ?? 0) < 35) { s.last = p; s.lastTs = now; }
          const gpsSpeed = loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null;
          setKmh(Math.round((gpsSpeed ?? 0) * 3.6));

          // Entering a zone with many robberies: say it once, then not again for a few minutes.
          if (s.risky) {
            const g = s.risky.g, here = s.risky.set.has(Math.floor((p[1] - g.lat0) / g.dlat) + ':' + Math.floor((p[0] - g.lng0) / g.dlng));
            if (here && !s.wasInZone && Date.now() - s.lastZoneWarn > 180000) { s.lastZoneWarn = Date.now(); say('Atención: zona con muchos robos.'); }
            if (here !== s.wasInZone) { s.wasInZone = here; setInZone(here); }
          }
          const f = locate(s.rt.coords, s.cum, p, s.along);
          let heading: number;
          if (!isOff(f, acc)) {
            s.offCount = 0; s.along = f.along_m;
            setOff(false);
            const ni = navInfo(s.cum, s.rt.steps ?? [], f);
            setInfo(ni);
            say(announcement(ni, s.said));
            if (ni.arrived && (kind === 'ab' || s.odometer > ARRIVE_M * 4)) finish(true);
            heading = bearing(p, pointAt(s.rt.coords, s.cum, s.along + 30));
          } else {
            s.offCount++;
            setOff(true);
            if (s.offCount >= 3 && !s.rerouting && Date.now() - s.lastReroute > 15000) void reroute(p);
            heading = loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : bearing(p, f.point);
          }
          if (gpsSpeed !== null && gpsSpeed > 1.5 && loc.coords.heading != null && loc.coords.heading >= 0) heading = loc.coords.heading;
          setPos({ pos: [p[0], p[1]], bearing: heading, kmh: (gpsSpeed ?? 0) * 3.6 });
        },
      );
    })().catch((e) => setGpsError('No pudimos leer el GPS: ' + message(e)));
    return () => { alive = false; sub?.remove(); Speech.stop(); };
  }, []);

  useEffect(() => { if (ended) Speech.stop(); }, [ended]);

  const mapData = useMemo<MapData>(() => ({
    routes: [{ coords: rt.coords, segments, selected: true }],
    parks: [],
    markers: [{ coord: [rt.coords[rt.coords.length - 1]![0], rt.coords[rt.coords.length - 1]![1]], kind: 'end' }],
    fit: true, view3d: true,
  }), [rt, segments]);

  if (ended) {
    const save = async () => {
      setSaving(true); setSaveError(null);
      try {
        await kova.cycling.logRide({ id: rideId.current, name: name || 'Salida en bici', startedAt: ended.startedAt, endedAt: ended.endedAt, movingS: ended.moving_s, distanceM: ended.distance_m });
        setSaved(true);
      } catch (e) { setSaveError(message(e)); } finally { setSaving(false); }
    };
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Row style={{ gap: 10 }}>
          <FlagCheckered size={26} color={c.accent} />
          <T size={22} w="medium">{ended.arrived ? 'Llegaste' : 'Salida terminada'}</T>
        </Row>
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="Distancia" value={formatKm(ended.distance_m)} />
            <Stat label="En movimiento" value={ended.moving_s >= 60 ? fmtDuration(ended.moving_s) : ended.moving_s + ' s'} />
            <Stat label="Promedio" value={ended.avg_kmh + ' km/h'} />
          </Row>
          <T size={12} color={c.n500}>Medido con el GPS del celular.</T>
        </Card>
        {ended.distance_m >= 100 ? (saved ? <Notice text="Guardada en tu historial de entrenamientos." /> : (
          <View style={{ gap: 10 }}>
            <Field label="Nombre" value={name} onChangeText={setName} placeholder="Salida en bici" maxLength={120} />
            <Button label="Guardar como entrenamiento" icon={FloppyDisk} onPress={save} busy={saving} />
            {saveError ? <ErrorNote message={saveError} /> : null}
          </View>
        )) : <T size={13} color={c.n400}>Fue muy corta para guardarla como entrenamiento.</T>}
        <Button variant={saved ? 'primary' : 'ghost'} label="Cerrar" onPress={onClose} />
      </ScrollView>
    );
  }

  const next = info?.next;
  const Icon = next ? ICONS[next.step.type] ?? ArrowUp : NavigationArrow;
  const remaining = info?.remaining_m ?? (cum[cum.length - 1] ?? 0);
  const avg = s.moving > 60 ? (s.odometer / s.moving) * 3.6 : speedKmh;
  const leftS = remaining / (Math.max(5, avg) / 3.6);
  const banner = gpsError ? null : rerouting ? 'Recalculando la ruta…' : off ? 'Te saliste de la ruta' : !info ? 'Buscando tu ubicación…'
    : next ? stepText(next.step) : (rt.steps?.length ? 'Seguí la ruta' : 'Seguí la línea de la ruta');
  const mapH = Math.max(280, screenH - 330);

  return (
    <View style={{ flex: 1, padding: 12, gap: 10 }}>
      {gpsError ? <ErrorNote message={gpsError} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: rad.card, backgroundColor: off || rerouting ? 'rgba(242,153,74,0.16)' : c.accentSoft }}
          accessibilityLiveRegion="polite">
          <Icon size={40} color={off || rerouting ? c.warn : c.a300} weight="bold" />
          <View style={{ flex: 1, gap: 2 }}>
            {next && !off && !rerouting ? <T size={26} w="medium">{shortDistance(next.in_m)}</T> : null}
            <T size={next && !off ? 15 : 17} w="medium" color={off || rerouting ? c.warn : c.text}>{banner}</T>
          </View>
        </View>
      )}
      <View>
        <RouteMap data={mapData} nav={pos} height={mapH} />
        {inZone ? (
          <View style={{ position: 'absolute', left: 8, top: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(229,72,77,0.92)' }}>
            <T size={12} w="medium">Zona con muchos robos</T>
          </View>
        ) : null}
      </View>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Stat label="Falta" value={formatKm(remaining)} />
        <Stat label="Tiempo" value={fmtDuration(leftS)} />
        <Stat label="Llegada" value={clock(new Date(Date.now() + leftS * 1000))} />
        <Stat label="Velocidad" value={kmh + ' km/h'} />
      </Row>
      <Row style={{ gap: 8 }}>
        <Pressable onPress={() => { setMuted((m) => !m); if (!muted) Speech.stop(); }} accessibilityRole="button" accessibilityLabel={muted ? 'Activar la voz' : 'Silenciar la voz'}
          style={{ width: 52, height: 48, borderRadius: rad.control, borderWidth: 1, borderColor: c.divider, alignItems: 'center', justifyContent: 'center' }}>
          {muted ? <SpeakerSlash size={22} color={c.n400} /> : <SpeakerHigh size={22} color={c.text} />}
        </Pressable>
        <Button variant="secondary" label="Terminar" icon={Stop} onPress={() => finish(false)} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T size={11} color={c.n500}>{label}</T>
      <T size={17} w="medium">{value}</T>
    </View>
  );
}
