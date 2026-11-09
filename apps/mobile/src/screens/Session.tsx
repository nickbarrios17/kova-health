/** "Sesión en vivo" + "Resumen de sesión" from the prototype, persisted and offline-capable. */
import { animationFor, clock, dayMonth, dur, formatWeight, fromDisplayWeight, nf, toDisplayWeight, KovaError, type WeightUnit } from '@kova/domain';
import { CaretDown, Check, CheckCircle, Info, Pause, Play, Plus, Trophy } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSession } from '../session';
import { c, font, rad } from '../theme';
import { Banner, Button, Card, Confirm, Notice, Row, Seg, T } from '../ui';
import { SyncBanners, useSync } from '../sync';
import { kova } from '../client';
import { MannequinView } from '../MannequinView';
import { useAsync } from '../useAsync';
import { ExerciseDetail } from './ExerciseDetail';
import { addSet, elapsedS, fillForward, saveLive, summarize, toggleSet, transition, type LiveSession, type Summary } from '../workout';
import { useReportTarget } from '../report';

const parseNum = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(v) ? null : v;
};

export function Session({ live, setLive, onClose, onFinished }: {
  live: LiveSession;
  setLive: (s: LiveSession | null) => void;
  onClose: () => void;
  onFinished: (s: Summary) => void;
}) {
  const { prefs, setUnit, deviceId } = useSession();
  const sync = useSync();
  const units: WeightUnit = prefs!.weight_unit;
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [howTo, setHowTo] = useState(false);
  useReportTarget('session', { exercise_id: live.exercises[live.cur]?.exercise_id, exercise_name: live.exercises[live.cur]?.name });
  // Names + media of every exercise, to show the 3D model of the current one (also for own exercises).
  const catalog = useAsync(() => kova.exercises.catalog(), []);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const ex = live.exercises[live.cur]!;
  const doneSets = live.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const totalSets = live.exercises.reduce((a, e) => a + e.sets.length, 0);
  const restLeft = live.restEndsAt ? Math.max(0, (Date.parse(live.restEndsAt) - now) / 1000) : 0;
  const update = (s: LiveSession) => {
    setLive(s);
    saveLive(s).catch(() => undefined);
  };
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof KovaError ? e.message : 'Algo salió mal.');
    }
  };
  const disp = (kg: number | null) => (kg == null ? '' : String(units === 'kg' ? kg : toDisplayWeight(kg, 'lb')).replace('.', ','));

  const series = (n: number) => n + (n === 1 ? ' serie' : ' series');
  const finish = () => run(async () => {
    setConfirming(false);
    const sum = summarize(live, prefs!.time_zone);
    await transition(live, doneSets ? 'complete' : 'abandon');
    setLive(null);
    if (doneSets) onFinished(sum);
    else onClose();
  });

  const volumeKg = live.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).reduce((b, x) => b + (x.w ?? 0) * (x.reps ?? 0), 0), 0);
  const scheme = (e: typeof ex) => e.sets.length + ' × ' + (e.sets[0]?.reps ?? '—');
  const nextIdx = ex.sets.findIndex((x) => !x.done);
  const exDone = nextIdx < 0 && ex.sets.length > 0;
  const exVolKg = ex.sets.filter((x) => x.done).reduce((b, x) => b + (x.w ?? 0) * (x.reps ?? 0), 0);
  const following = live.exercises.slice(live.cur + 1).find((e) => e.sets.some((x) => !x.done)) ?? live.exercises.find((e, i) => i !== live.cur && e.sets.some((x) => !x.done));
  const resting = restLeft > 0 && !live.pausedAt;
  const vol = (kg: number) => nf(units === 'kg' ? kg : toDisplayWeight(kg, 'lb'), 0) + ' ' + units;
  const anim = catalog.data ? animationFor(ex.exercise_id, catalog.data) : null;
  // Announce the rest timer every 30 s, not every second.
  const restAnnounce = Math.ceil(restLeft / 30) * 30;

  const markNext = () => {
    if (nextIdx < 0) return;
    run(async () => setLive(await toggleSet(live, live.cur, nextIdx, deviceId)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ height: 64, paddingHorizontal: 8, gap: 4 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Minimizar sesión" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <CaretDown size={22} color={c.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} w="semibold" numberOfLines={1}>{live.name}</T>
          <T size={12} color={c.n400}>{clock(elapsedS(live, now))} · {doneSets} de {series(totalSets)} · {vol(volumeKg)}</T>
        </View>
        <Button variant="text" label="Terminar" onPress={() => setConfirming(true)} />
      </Row>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <SyncBanners during="session" />
        {live.pausedAt ? (
          <Banner tone="warn" glyph="‖" text="Sesión en pausa"
            action={{ label: 'Continuar', onPress: () => run(async () => { const s = await transition(live, 'resume'); if (s) setLive(s); }) }} />
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {live.exercises.map((e, i) => {
            const on = i === live.cur;
            const complete = e.sets.length > 0 && e.sets.every((x) => x.done);
            return (
              <Pressable key={e.id} onPress={() => update({ ...live, cur: i })} accessibilityRole="tab" accessibilityState={{ selected: on }}
                accessibilityLabel={e.name + (complete ? ', completo' : ', ' + e.sets.filter((x) => x.done).length + ' de ' + e.sets.length)}
                style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? 'transparent' : c.divider, backgroundColor: on ? c.accentSoftSolid : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {complete ? <T size={13} w="semibold" color={on ? c.a300 : c.ok}>✓</T> : null}
                <T size={13} w={on ? 'medium' : 'regular'} color={on ? c.a300 : c.text}>{e.name}</T>
                {!complete ? <T size={12} color={on ? c.a300 : c.n500}>{e.sets.filter((x) => x.done).length}/{e.sets.length}</T> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <Pressable onPress={() => setHowTo(true)} accessibilityRole="button" accessibilityHint="Muestra cómo se hace"
            style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <T size={13} color={c.n400}>Ejercicio {live.cur + 1} de {live.exercises.length} · {scheme(ex)}</T>
            <Row style={{ gap: 8 }}>
              <T size={22} w="semibold" style={{ lineHeight: 27, flexShrink: 1 }}>{ex.name}</T>
              <Info size={20} color={c.a400} />
            </Row>
          </Pressable>
          <Seg options={[['kg', 'kg'], ['lb', 'lb']]} value={units} onChange={setUnit} label="Unidad de peso" />
        </Row>
        {/* Big 3D model while training (the user prefers it to the small preview); the full technique opens below. */}
        {anim ? (
          <View style={{ borderRadius: rad.card, overflow: 'hidden', backgroundColor: c.surface }}>
            <MannequinView spec={anim} height={220} />
          </View>
        ) : null}
        <Button variant="text" label="Ver la técnica completa" icon={Info} onPress={() => setHowTo(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        {error ? <Banner tone="crit" text={error} /> : null}

        <View style={{ gap: 6 }}>
          <Row style={{ paddingHorizontal: 8 }}>
            <T size={12} w="medium" color={c.n500} style={{ width: 40 }}>Serie</T>
            <T size={12} w="medium" color={c.n500} style={{ flex: 1 }}>Anterior</T>
            <T size={12} w="medium" color={c.n500} style={{ width: 72, textAlign: 'center' }}>{units}</T>
            <T size={12} w="medium" color={c.n500} style={{ width: 56, textAlign: 'center', marginLeft: 8 }}>Reps</T>
            <View style={{ width: 44, marginLeft: 8 }} />
          </Row>
          {ex.sets.map((s, j) => {
            const current = j === nextIdx && !live.pausedAt;
            const queued = s.done && sync.pendingSetIds.has(s.id);
            return (
              <View key={s.id} style={{ padding: 8, borderRadius: 14, gap: 4, backgroundColor: current ? c.raised : 'transparent', borderWidth: current ? 1.5 : 0, borderColor: c.accent }}>
                <Row>
                  <T w="semibold" color={s.done ? c.a400 : c.text} style={{ width: 40 }}>{j + 1}</T>
                  <T size={13} color={c.n500} style={{ flex: 1 }}>{ex.prevKg != null ? formatWeight(ex.prevKg, units) : '—'}</T>
                  <TextInput key={'w' + s.id + s.w} editable={!s.done} keyboardType="decimal-pad" defaultValue={disp(s.w)} accessibilityLabel={'Peso serie ' + (j + 1)}
                    onEndEditing={(e) => { const v = parseNum(e.nativeEvent.text); update(fillForward(live, live.cur, j, 'w', v == null ? null : fromDisplayWeight(v, units))); }}
                    style={inputStyle(72, s.done)} />
                  <TextInput key={'r' + s.id + s.reps} editable={!s.done} keyboardType="number-pad" defaultValue={s.reps == null ? '' : String(s.reps)} accessibilityLabel={'Repeticiones serie ' + (j + 1)}
                    onEndEditing={(e) => { const v = parseNum(e.nativeEvent.text); update(fillForward(live, live.cur, j, 'reps', v == null ? null : Math.round(v))); }}
                    style={[inputStyle(56, s.done), { marginLeft: 8 }]} />
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: s.done, disabled: !!live.pausedAt }}
                    accessibilityLabel={s.done ? 'Serie ' + (j + 1) + ' hecha. Tocá para deshacer' : 'Marcar serie ' + (j + 1) + ' como hecha'}
                    disabled={!!live.pausedAt}
                    onPress={() => run(async () => setLive(await toggleSet(live, live.cur, j, deviceId)))}
                    style={{ width: 44, height: 44, marginLeft: 8, borderRadius: 12, borderWidth: queued ? 2 : 1,
                      borderColor: queued ? c.warn : s.done ? c.a700 : c.divider, backgroundColor: s.done ? c.a700 : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: live.pausedAt ? 0.5 : 1 }}>
                    <Check size={18} weight="bold" color={s.done ? c.white : c.n500} />
                  </Pressable>
                </Row>
                {queued ? <T size={12} color={c.warn} style={{ textAlign: 'right' }}>↑ guardada aquí</T> : null}
              </View>
            );
          })}
          <Button variant="text" label="Agregar serie" icon={Plus} onPress={() => update(addSet(live, live.cur))} style={{ alignSelf: 'flex-start' }} />
        </View>

        {exDone ? (
          <Banner tone="ok" text={ex.name + ' completo · ' + series(ex.sets.length) + ' · volumen ' + vol(exVolKg)} />
        ) : null}

        {!live.pausedAt ? (
          <Button variant="secondary" label="Pausar sesión" icon={Pause} onPress={() => run(async () => { const s = await transition(live, 'pause'); if (s) setLive(s); })} />
        ) : (
          <Button variant="secondary" label="Continuar sesión" icon={Play} onPress={() => run(async () => { const s = await transition(live, 'resume'); if (s) setLive(s); })} />
        )}
        <Notice text="Las series se guardan en el teléfono al instante y se envían cuando hay conexión." />
      </ScrollView>

      <View style={{ backgroundColor: c.navBg, borderTopWidth: 1, borderTopColor: c.borderSubtle, padding: 16, paddingBottom: 20, gap: 10 }}>
        {resting ? (
          <>
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <T size={12} color={c.n400}>Descanso</T>
                <T size={34} w="semibold" style={{ lineHeight: 38 }} accessibilityRole="timer"
                  accessibilityLabel={'Descanso, quedan ' + restAnnounce + ' segundos'} accessibilityLiveRegion="none">{clock(restLeft)}</T>
              </View>
              <Button variant="secondary" label="+15 s" onPress={() => update({ ...live, restEndsAt: new Date(Date.parse(live.restEndsAt!) + 15000).toISOString(), restTotal: live.restTotal + 15 })} style={{ marginRight: 8 }} />
              <Button label="Saltar" onPress={() => update({ ...live, restEndsAt: null })} />
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' }}>
              <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, (restLeft / Math.max(1, live.restTotal)) * 100)}%`, backgroundColor: c.accent }} />
            </View>
          </>
        ) : nextIdx >= 0 ? (
          <>
            <Button large label={'Serie ' + (nextIdx + 1) + ' hecha'} icon={Check} onPress={markNext} disabled={!!live.pausedAt} style={{ minHeight: 56 }} />
            {following ? <T size={13} color={c.n400} style={{ textAlign: 'center' }}>Sigue: {following.name} · {scheme(following)}</T> : null}
          </>
        ) : following ? (
          <Button large label={'Ir a ' + following.name} onPress={() => update({ ...live, cur: live.exercises.indexOf(following) })} style={{ minHeight: 56 }} />
        ) : (
          <Button large label="Terminar sesión" icon={CheckCircle} onPress={() => setConfirming(true)} style={{ minHeight: 56 }} />
        )}
      </View>

      <ExerciseDetail exerciseId={howTo ? ex.exercise_id : null} name={ex.name} onClose={() => setHowTo(false)} />
      <Confirm
        visible={confirming}
        title={doneSets ? '¿Guardar la sesión con ' + series(doneSets) + '?' : 'Terminar sesión'}
        message={doneSets ? 'Se guarda en tu historial.' : 'No registraste ninguna serie. ¿Descartar la sesión?'}
        confirmLabel={doneSets ? 'Guardar' : 'Descartar'}
        destructive={!doneSets}
        cancelLabel="Seguir entrenando"
        onConfirm={finish}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const inputStyle = (width: number, done?: boolean) => ({
  width, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: c.divider, backgroundColor: done ? 'transparent' : c.bg,
  color: done ? c.n400 : c.text, fontFamily: font.medium, fontSize: 16, textAlign: 'center' as const, paddingHorizontal: 4,
});

export function SessionSummary({ summary, onDone }: { summary: Summary; onDone: () => void }) {
  const { prefs } = useSession();
  const units = prefs!.weight_unit;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 20 }}>
      <View style={{ gap: 6 }}>
        <T size={13} w="medium" color={c.ok}>✓ Sesión completada</T>
        <T size={26} w="semibold" style={{ lineHeight: 30 }}>{summary.name}</T>
        <T size={13} color={c.n400}>{dayMonth(summary.date)}</T>
      </View>
      <Row style={{ gap: 8 }}>
        {[['Volumen', nf(units === 'kg' ? summary.volumeKg : toDisplayWeight(summary.volumeKg, 'lb'), 0) + ' ' + units], [summary.sets === 1 ? 'Serie' : 'Series', String(summary.sets)], ['Duración', dur(summary.durationS)]].map(([l, v]) => (
          <View key={l} style={{ flex: 1, padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 2 }}>
            <T size={13} w="medium" color={c.n400}>{l}</T>
            <T size={20} w="semibold">{v}</T>
          </View>
        ))}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <T size={17} w="semibold" style={{ paddingVertical: 8 }}>Por ejercicio</T>
        {summary.rows.map((row) => (
          <Row key={row.name} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.borderSubtle }}>
            <T size={14} style={{ flex: 1 }}>{row.name}</T>
            {row.pr ? <Row style={{ gap: 4, backgroundColor: c.accentSoftSolid, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Trophy size={12} color={c.a300} /><T size={12} w="medium" color={c.a300}>Récord</T></Row> : null}
            <T size={13} color={c.n300}>{row.topKg != null ? formatWeight(row.topKg, units) + ' × ' + row.reps : '—'}</T>
          </Row>
        ))}
      </Card>
      <Notice text="Sin reloj conectado no estimamos calorías: preferimos no mostrar un número inventado." />
      <Button large label="Listo" icon={CheckCircle} onPress={onDone} />
    </ScrollView>
  );
}
