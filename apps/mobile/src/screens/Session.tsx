/** "Sesión en vivo" + "Resumen de sesión" from the prototype, persisted and offline-capable. */
import { clock, dayMonth, dur, formatWeight, fromDisplayWeight, nf, toDisplayWeight, KovaError, type WeightUnit } from '@kova/domain';
import { CaretDown, Check, CheckCircle, HourglassMedium, Info, Pause, Play, Plus, Trophy } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSession } from '../session';
import { c, font, r } from '../theme';
import { Button, Card, Confirm, Notice, Row, Seg, T } from '../ui';
import { ExerciseDetail } from './ExerciseDetail';
import { addSet, elapsedS, fillForward, saveLive, summarize, toggleSet, transition, type LiveSession, type Summary } from '../workout';

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
  const units: WeightUnit = prefs!.weight_unit;
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [howTo, setHowTo] = useState(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
        <Pressable onPress={onClose} accessibilityLabel="Minimizar sesión" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><CaretDown size={22} color={c.text} /></Pressable>
        <View style={{ flex: 1 }}><T size={16} w="medium">{live.name}</T><T size={12} color={c.n400}>{doneSets} de {series(totalSets)}</T></View>
        <Button label="Terminar" onPress={() => setConfirming(true)} />
      </Row>

      <View style={{ marginHorizontal: 16, marginTop: 8, flexDirection: 'row', borderRadius: r.md, backgroundColor: c.surface, paddingVertical: 10 }}>
        {[[clock(elapsedS(live, now)), 'Duración'], [String(doneSets), 'Series hechas'], [nf(units === 'kg' ? live.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).reduce((b, x) => b + (x.w ?? 0) * (x.reps ?? 0), 0), 0) : toDisplayWeight(live.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).reduce((b, x) => b + (x.w ?? 0) * (x.reps ?? 0), 0), 0), 'lb'), 0), 'Volumen ' + units]].map(([v, l], i) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: c.divider }}>
            <T size={20} w="medium" style={{ fontVariant: ['tabular-nums'] }}>{v}</T>
            <T size={11} color={c.n400}>{l}</T>
          </View>
        ))}
      </View>

      {live.pausedAt ? (
        <View style={{ margin: 16, marginBottom: 0, padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.divider, gap: 10 }}>
          <Row><Pause size={18} color={c.n300} /><T style={{ flex: 1 }}>Sesión en pausa</T></Row>
          <Button label="Reanudar" icon={Play} onPress={() => run(async () => { const s = await transition(live, 'resume'); if (s) setLive(s); })} />
        </View>
      ) : restLeft > 0 ? (
        <View style={{ marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: r.md, borderWidth: 1, borderColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${(restLeft / Math.max(1, live.restTotal)) * 100}%`, backgroundColor: c.accent }} />
          <HourglassMedium size={18} color={c.accent} />
          <T style={{ flex: 1 }}>Descanso <T w="medium">{clock(restLeft)}</T></T>
          <Button variant="ghost" label="+15 s" onPress={() => update({ ...live, restEndsAt: new Date(Date.parse(live.restEndsAt!) + 15000).toISOString(), restTotal: live.restTotal + 15 })} />
          <Button variant="ghost" label="Saltar" onPress={() => update({ ...live, restEndsAt: null })} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {live.exercises.map((e, i) => {
            const on = i === live.cur;
            const d = e.sets.filter((x) => x.done).length;
            return (
              <Pressable key={e.id} onPress={() => update({ ...live, cur: i })} accessibilityState={{ selected: on }}
                style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? 'rgba(145,132,217,0.14)' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T size={13} color={on ? c.a200 : c.n300}>{e.name}</T>
                <T size={11} color={on ? c.a200 : c.n400}>{d}/{e.sets.length}</T>
              </Pressable>
            );
          })}
        </ScrollView>

        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => setHowTo(true)} accessibilityRole="button" accessibilityHint="Muestra cómo se hace"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <T size={20} w="medium" style={{ flexShrink: 1 }}>{ex.name}</T>
            <Info size={20} color={c.accent} />
          </Pressable>
          <Seg options={[['kg', 'kg'], ['lb', 'lb']]} value={units} onChange={setUnit} />
        </Row>
        {error ? <Notice tone="warn" text={error} /> : null}

        <View>
          <Row style={{ paddingHorizontal: 6, paddingBottom: 6 }}>
            <T size={11} w="medium" color={c.n500} style={{ width: 36 }}>Serie</T>
            <T size={11} w="medium" color={c.n500} style={{ flex: 1 }}>Anterior</T>
            <T size={11} w="medium" color={c.n500} style={{ width: 72, textAlign: 'center' }}>{units}</T>
            <T size={11} w="medium" color={c.n500} style={{ width: 56, textAlign: 'center' }}>Reps</T>
            <View style={{ width: 44 }} />
          </Row>
          {ex.sets.map((s, j) => (
            <Row key={s.id} style={{ padding: 6, borderRadius: r.md, backgroundColor: s.done ? 'rgba(145,132,217,0.08)' : 'transparent' }}>
              <T w="medium" color={s.done ? c.accent : c.text} style={{ width: 36 }}>{j + 1}</T>
              <T size={13} color={c.n500} style={{ flex: 1 }}>{ex.prevKg != null ? formatWeight(ex.prevKg, units) : '—'}</T>
              <TextInput key={'w' + s.id + s.w} editable={!s.done} keyboardType="decimal-pad" defaultValue={disp(s.w)} accessibilityLabel={'Peso serie ' + (j + 1)}
                onEndEditing={(e) => { const v = parseNum(e.nativeEvent.text); update(fillForward(live, live.cur, j, 'w', v == null ? null : fromDisplayWeight(v, units))); }}
                style={inputStyle(72)} />
              <TextInput key={'r' + s.id + s.reps} editable={!s.done} keyboardType="number-pad" defaultValue={s.reps == null ? '' : String(s.reps)} accessibilityLabel={'Repeticiones serie ' + (j + 1)}
                onEndEditing={(e) => { const v = parseNum(e.nativeEvent.text); update(fillForward(live, live.cur, j, 'reps', v == null ? null : Math.round(v))); }}
                style={[inputStyle(56), { marginLeft: 8 }]} />
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: s.done }} accessibilityLabel={'Serie ' + (j + 1) + ' hecha'}
                disabled={!!live.pausedAt}
                onPress={() => run(async () => setLive(await toggleSet(live, live.cur, j, deviceId)))}
                style={{ width: 44, height: 44, marginLeft: 8, borderRadius: r.md, borderWidth: 1, borderColor: s.done ? c.accent : c.divider, backgroundColor: s.done ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={18} weight="bold" color={s.done ? c.bg : c.n400} />
              </Pressable>
            </Row>
          ))}
          <Button variant="ghost" label="Añadir serie" icon={Plus} onPress={() => update(addSet(live, live.cur))} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
        </View>

        {!live.pausedAt ? (
          <Button variant="secondary" label="Pausar sesión" icon={Pause} onPress={() => run(async () => { const s = await transition(live, 'pause'); if (s) setLive(s); })} />
        ) : null}
        <Notice text="Las series se guardan en el teléfono al instante y se envían cuando hay conexión." />
      </ScrollView>
      <ExerciseDetail exerciseId={howTo ? ex.exercise_id : null} name={ex.name} onClose={() => setHowTo(false)} />
      <Confirm
        visible={confirming}
        title="Terminar sesión"
        message={doneSets ? '¿Guardar la sesión con ' + series(doneSets) + '?' : 'No registraste ninguna serie. ¿Descartar la sesión?'}
        confirmLabel={doneSets ? 'Terminar' : 'Descartar'}
        destructive={!doneSets}
        cancelLabel="Seguir entrenando"
        onConfirm={finish}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const inputStyle = (width: number) => ({
  width, minHeight: 40, borderRadius: r.md, borderWidth: 1, borderColor: c.divider, backgroundColor: c.surface,
  color: c.text, fontFamily: font.regular, fontSize: 15, textAlign: 'center' as const, paddingHorizontal: 4,
});

export function SessionSummary({ summary, onDone }: { summary: Summary; onDone: () => void }) {
  const { prefs } = useSession();
  const units = prefs!.weight_unit;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 20 }}>
      <View style={{ gap: 6 }}>
        <T size={11} w="medium" color={c.accent}>Sesión completada</T>
        <T size={28} w="medium">{summary.name}</T>
        <T size={13} color={c.n400}>{dayMonth(summary.date)}</T>
      </View>
      <Row style={{ gap: 8 }}>
        {[['Volumen', nf(units === 'kg' ? summary.volumeKg : toDisplayWeight(summary.volumeKg, 'lb'), 0) + ' ' + units], [summary.sets === 1 ? 'Serie' : 'Series', String(summary.sets)], ['Duración', dur(summary.durationS)]].map(([l, v]) => (
          <View key={l} style={{ flex: 1, padding: 12, borderRadius: r.md, backgroundColor: c.surface }}>
            <T size={11} color={c.n400}>{l}</T>
            <T size={17} w="medium">{v}</T>
          </View>
        ))}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <T size={15} w="medium" style={{ paddingVertical: 8 }}>Por ejercicio</T>
        {summary.rows.map((row) => (
          <Row key={row.name} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(233,233,237,0.06)' }}>
            <T size={14} style={{ flex: 1 }}>{row.name}</T>
            {row.pr ? <Row style={{ gap: 4, borderWidth: 1, borderColor: c.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Trophy size={12} color={c.accent} /><T size={11} color={c.accent}>Récord</T></Row> : null}
            <T size={13} color={c.n300}>{row.topKg != null ? formatWeight(row.topKg, units) + ' × ' + row.reps : '—'}</T>
          </Row>
        ))}
      </Card>
      <Notice text="Sin reloj conectado no estimamos calorías: preferimos no mostrar un número inventado." />
      <Button label="Listo" icon={CheckCircle} onPress={onDone} />
    </ScrollView>
  );
}
