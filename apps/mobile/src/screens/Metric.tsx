/**
 * Detail ("desglose") of one metric over 7, 30 or 90 days: chart, averages, change against the
 * previous period and the day-by-day list. Opened from the Hoy cards and from Progreso. Logging that
 * belongs to a metric lives here too: weight in Cuerpo, mood in Ánimo, today's habits in Hábitos.
 */
import {
  addDays, currentStreak, dailyStreak, dayMonth, dayShort, dur, fromDisplayWeight, hm, localDate, MOODS, newId, nf, periodChange,
  series, stats, toDisplayWeight, weekly, KovaError, type DayPoint, type HabitDay, type MetricKey, type WeightUnit,
} from '@kova/domain';
import {
  ArrowLeft, Barbell, Check, Flame, ForkKnife, Heartbeat, Moon, Plus, Scales, Smiley, SmileyMeh, SmileyNervous, SmileySad, SmileyWink, SneakerMove, type Icon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { Keyboard, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useBack } from '../back';
import { Chart } from '../charts';
import { kova, outbox } from '../client';
import { useSession } from '../session';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Empty, ErrorNote, Field, Loading, Notice, Row, Seg, T } from '../ui';

export const METRIC: Record<MetricKey, { title: string; icon: Icon; empty: string }> = {
  steps: { title: 'Pasos', icon: SneakerMove, empty: 'Los pasos llegan del reloj o de Health Connect.' },
  sleep: { title: 'Sueño', icon: Moon, empty: 'El sueño llega del reloj o de Health Connect.' },
  food: { title: 'Comida', icon: ForkKnife, empty: 'Registra lo que comes en la pestaña Comida.' },
  weight: { title: 'Cuerpo', icon: Scales, empty: 'Anota tu peso arriba o conecta una balanza en Health Connect.' },
  mood: { title: 'Ánimo', icon: Smiley, empty: 'Elige cómo te sientes arriba, un toque por día.' },
  training: { title: 'Entrenamientos', icon: Barbell, empty: 'Tus sesiones completadas aparecerán aquí.' },
  heart: { title: 'Corazón', icon: Heartbeat, empty: 'La frecuencia cardíaca en reposo llega del reloj o de Health Connect.' },
  habits: { title: 'Hábitos', icon: Flame, empty: 'Crea un hábito arriba y márcalo cada día.' },
};

const MOOD_ICONS: Icon[] = [SmileySad, SmileyNervous, SmileyMeh, Smiley, SmileyWink];
const SLEEP_REF_MIN = 7 * 60; // reference line: the usual adult minimum

/** How each metric is shown. */
export function metricFormat(key: MetricKey, units: WeightUnit): (v: number) => string {
  switch (key) {
    case 'steps': return (v) => nf(Math.round(v), 0);
    case 'sleep': return (v) => hm(v);
    case 'food': return (v) => nf(Math.round(v), 0) + ' kcal';
    case 'weight': return (v) => nf(units === 'kg' ? v : toDisplayWeight(v, 'lb'), 1) + ' ' + units;
    case 'mood': return (v) => (Number.isInteger(v) ? MOODS[v - 1] ?? nf(v, 1) : nf(v, 1) + ' / 5');
    case 'training': return (v) => nf(v, v % 1 ? 1 : 0) + (v === 1 ? ' sesión' : ' sesiones');
    case 'heart': return (v) => nf(Math.round(v), 0) + ' lpm';
    case 'habits': return (v) => Math.round(v) + ' %';
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flex: 1, minWidth: '45%', padding: 12, borderRadius: r.md, backgroundColor: c.bg, gap: 2 }}>
      <T size={12} color={c.n400}>{label}</T>
      <T size={18} w="medium">{value}</T>
      {hint ? <T size={11} color={c.n500}>{hint}</T> : null}
    </View>
  );
}

export function Metric({ metric, onClose }: { metric: MetricKey; onClose: () => void }) {
  const { prefs, deviceId } = useSession();
  const tz = prefs!.time_zone;
  const units = prefs!.weight_unit;
  const today = localDate(new Date(), tz);
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [error, setError] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [habitName, setHabitName] = useState('');
  useBack(true, onClose);

  // 92 days (the daily_summaries limit) cover 7 and 30 days plus their previous period.
  const q = useAsync(async () => {
    const [days, goals, sessions, habits, habitDays] = await Promise.all([
      kova.summaries.daily(addDays(today, -91), today),
      kova.goals.list(),
      metric === 'training' ? kova.workouts.summaries(30) : Promise.resolve([]),
      metric === 'habits' ? kova.habits.list() : Promise.resolve([]),
      metric === 'habits' ? kova.habits.days(addDays(today, -60), today) : Promise.resolve([]),
    ]);
    return {
      days,
      stepGoal: (goals as Array<{ kind: string; status: string; target_value: number }>).find((g) => g.kind === 'steps_daily' && g.status === 'active')?.target_value ?? null,
      sessions: (sessions as Array<Record<string, unknown>>).filter((s) => s.status === 'completed'),
      habits: habits as Array<{ id: string; name: string; unit: string | null }>,
      habitDays: habitDays as Array<HabitDay & { habit_id: string }>,
    };
  }, [today, metric]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      q.reload();
    } catch (e) {
      setError(e instanceof KovaError ? e.message : 'Algo salió mal.');
    }
  };
  const saveWeight = () => run(async () => {
    Keyboard.dismiss();
    const v = Number(weight.replace(',', '.'));
    await outbox.enqueue({ kind: 'record_measurement', input: { id: newId(), metric: 'weight_kg', value: fromDisplayWeight(v, units), measured_at: new Date().toISOString(), time_zone: tz, device_id: deviceId } });
    await outbox.flush();
    setWeight('');
  });
  const logMood = (m: number) => run(async () => {
    await outbox.enqueue({ kind: 'record_observation', input: { id: newId(), metric: 'mood', value: m, start_at: new Date().toISOString(), time_zone: tz, device_id: deviceId } });
    await outbox.flush();
  });
  const toggleHabit = (habitId: string, done: boolean) => run(async () => {
    if (!done) {
      await outbox.enqueue({ kind: 'log_habit', input: { id: newId(), habit_id: habitId, local_date: today, device_id: deviceId } });
      await outbox.flush();
    } else {
      const logs = await kova.supabase.from('habit_logs').select('id').eq('habit_id', habitId).eq('local_date', today).is('deleted_at', null);
      for (const l of logs.data ?? []) await kova.habits.unlog(l.id as string);
    }
  });
  const addHabit = () => run(async () => {
    Keyboard.dismiss();
    await kova.habits.save({ id: newId(), name: habitName.trim(), effective_from: today });
    setHabitName('');
  });

  const meta = METRIC[metric];
  const fmt = metricFormat(metric, units);
  const header = (
    <Row style={{ gap: 4 }}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
        <ArrowLeft size={22} color={c.text} />
      </Pressable>
      <meta.icon size={20} color={c.a300} />
      <T size={22} w="medium" style={{ flex: 1 }}>{meta.title}</T>
    </Row>
  );

  if (q.loading && !q.data) return <View style={{ flex: 1, padding: 16 }}>{header}<Loading /></View>;
  if (q.error) return <View style={{ padding: 16, gap: 12 }}>{header}<ErrorNote message={q.error} onRetry={q.reload} /></View>;
  const { days, stepGoal, sessions, habits, habitDays } = q.data!;

  const period = Number(range);
  const periodRows = [...(days as Array<Record<string, unknown> & { local_date: string }>)].sort((a, b) => a.local_date.localeCompare(b.local_date)).slice(-period);
  const all = series(days as Array<Record<string, unknown> & { local_date: string }>, metric);
  const daily = all.slice(-period);
  const st0 = stats(daily);
  // Days with zero sessions are data, but a period without any session reads as «sin datos».
  const st = metric === 'training' && !st0.total ? { ...st0, days: 0 } : st0;
  const change = period < 90 ? periodChange(all, period, metric) : null;
  const latestKcalGoal = [...(days as Array<Record<string, unknown>>)].reverse().map((d) => d.kcal_goal).find((v) => v != null);
  const goal = metric === 'steps' ? stepGoal : metric === 'food' ? (latestKcalGoal != null ? Number(latestKcalGoal) : null) : metric === 'sleep' ? SLEEP_REF_MIN : null;
  // Sessions read better per week over 30/90 days.
  const chartPoints: DayPoint[] = metric === 'training' && period > 7 ? weekly(daily, 'training') : daily;
  const isWeekly = chartPoints !== daily;
  const label = (d: string) => (isWeekly ? 'Semana del ' + dayMonth(d) : dayMonth(d));
  const changeText = (delta: number) => {
    if (metric === 'sleep') return (delta >= 0 ? '+' : '−') + hm(Math.abs(delta));
    if (metric === 'weight') return (delta >= 0 ? '+' : '−') + nf(Math.abs(units === 'kg' ? delta : toDisplayWeight(delta, 'lb')), 1) + ' ' + units;
    if (metric === 'mood') return (delta >= 0 ? '+' : '−') + nf(Math.abs(delta), 1);
    return (delta >= 0 ? '+' : '−') + nf(Math.abs(Math.round(delta)), 0) + (metric === 'habits' ? ' pts' : '');
  };

  const statCards: Array<{ label: string; value: string; hint?: string }> = [];
  if (st.days) {
    if (metric === 'training') {
      statCards.push({ label: 'Sesiones', value: nf(st.total ?? 0, 0), hint: 'en ' + period + ' días' });
      const vol = periodRows.reduce((a, d) => a + Number(d.workout_volume_kg ?? 0), 0);
      statCards.push({ label: 'Volumen total', value: nf(units === 'kg' ? vol : toDisplayWeight(vol, 'lb'), 0) + ' ' + units });
    } else if (metric === 'weight') {
      statCards.push({ label: 'Último', value: fmt(st.last!) });
      if (st.days > 1) statCards.push({ label: 'Cambio en el período', value: changeText(st.last! - st.first!), hint: 'desde ' + fmt(st.first!) });
    } else {
      statCards.push({ label: metric === 'habits' ? 'Cumplimiento medio' : 'Promedio por día', value: fmt(st.avg!), hint: st.days + (st.days === 1 ? ' día con datos' : ' días con datos') });
      statCards.push({ label: metric === 'heart' || metric === 'mood' ? 'Más bajo' : 'Mejor día', value: fmt(metric === 'heart' || metric === 'mood' ? st.min! : st.max!) });
    }
    if (change) statCards.push({ label: 'Contra los ' + period + ' días anteriores', value: changeText(change.delta), hint: 'antes: ' + fmt(change.before) });
    if (goal != null && metric !== 'food') {
      const met = daily.filter((p) => p.value != null && p.value >= goal).length;
      statCards.push({ label: metric === 'sleep' ? 'Noches de 7 h o más' : 'Días con el objetivo', value: met + ' de ' + st.days });
    }
    if (metric === 'food' && goal != null) {
      const near = daily.filter((p) => p.value != null && Math.abs(p.value - goal) <= goal * 0.1).length;
      statCards.push({ label: 'Días cerca de la meta (±10 %)', value: near + ' de ' + st.days, hint: 'meta: ' + fmt(goal) });
    }
    if (metric === 'steps' && stepGoal) {
      const s = currentStreak(all, (v) => v >= stepGoal);
      if (s) statCards.push({ label: 'Racha', value: s + (s === 1 ? ' día' : ' días'), hint: 'seguidos con el objetivo' });
    }
  }

  // Macros for food: averages over days with something logged.
  const foodDays = periodRows.filter((d) => d.kcal != null);
  const avgOf = (k: string) => foodDays.length ? foodDays.reduce((a, d) => a + Number(d[k] ?? 0), 0) / foodDays.length : 0;

  const todayMood = all.length && metric === 'mood' ? all[all.length - 1]!.value : null;
  const listDays = [...daily].reverse().filter((p) => p.value != null).slice(0, 31);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      {header}
      {error ? <Notice tone="warn" text={error} /> : null}

      {metric === 'mood' ? (
        <Card>
          <T size={14} w="medium">¿Cómo te sientes hoy?</T>
          <Row style={{ justifyContent: 'space-between' }}>
            {MOOD_ICONS.map((Ic, i) => {
              const on = todayMood === i + 1;
              return (
                <Pressable key={i} onPress={() => logMood(i + 1)} accessibilityLabel={MOODS[i]} accessibilityState={{ selected: on }}
                  style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? 'rgba(145,132,217,0.2)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic size={26} color={on ? c.a100 : c.n300} weight={on ? 'fill' : 'regular'} />
                </Pressable>
              );
            })}
          </Row>
          <T size={13} color={c.a300}>{todayMood ? MOODS[todayMood - 1] : 'Sin registrar hoy'}</T>
        </Card>
      ) : null}

      {metric === 'weight' ? (
        <Card>
          <Row style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label={'Peso de hoy (' + units + ')'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
            <Button label="Guardar" onPress={saveWeight} disabled={!(Number(weight.replace(',', '.')) > 0)} />
          </Row>
        </Card>
      ) : null}

      {metric === 'habits' ? (
        <Card>
          <T size={14} w="medium">Hoy</T>
          {habits.length === 0 ? <T size={13} color={c.n400}>Todavía no tienes hábitos.</T> : habits.map((h) => {
            const hd = habitDays.filter((d) => d.habit_id === h.id);
            const t = hd.find((d) => d.local_date === today);
            const done = !!t?.completed;
            const streak = dailyStreak(hd, today);
            return (
              <Row key={h.id}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={h.name} disabled={t ? !t.scheduled && !done : false}
                  onPress={() => toggleHabit(h.id, done)}
                  style={{ width: 44, height: 44, borderRadius: r.md, borderWidth: 1, borderColor: done ? c.accent : c.divider, backgroundColor: done ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={18} weight="bold" color={done ? c.bg : c.n400} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <T size={14}>{h.name}</T>
                  <T size={12} color={c.n400}>{t && !t.scheduled ? 'Hoy no toca' : done ? 'Hecho' : 'Pendiente'}</T>
                </View>
                <Row style={{ gap: 4 }}><Flame size={14} color={streak ? c.warn : c.n600} /><T size={13} color={c.n300}>{streak} {streak === 1 ? 'día' : 'días'}</T></Row>
              </Row>
            );
          })}
          <Row style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="Nuevo hábito diario" value={habitName} onChangeText={setHabitName} placeholder="Ej.: Movilidad" /></View>
            <Button label="Crear" icon={Plus} onPress={addHabit} disabled={!habitName.trim()} />
          </Row>
        </Card>
      ) : null}

      <Seg options={[['7', '7 días'], ['30', '30 días'], ['90', '90 días']]} value={range} onChange={setRange} />

      {st.days === 0 ? (
        <Empty icon={meta.icon} title={'Sin datos en ' + period + ' días'}>{meta.empty}</Empty>
      ) : (
        <>
          <Card>
            <Chart points={chartPoints} format={fmt} label={label} goal={isWeekly ? null : goal}
              kind={metric === 'weight' || metric === 'heart' || metric === 'mood' ? 'line' : 'bars'} domain={metric === 'mood' ? [1, 5] : metric === 'habits' ? [0, 100] : undefined} />
            {goal != null && !isWeekly ? (
              <T size={11} color={c.n500}>Línea punteada: {metric === 'sleep' ? 'referencia de 7 h' : metric === 'food' ? 'tu meta de calorías' : 'tu objetivo diario'}</T>
            ) : null}
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {statCards.map((s) => <Stat key={s.label} {...s} />)}
          </View>
        </>
      )}

      {metric === 'food' && foodDays.length ? (
        <Card>
          <T size={14} w="medium">Macros promedio por día</T>
          <Row style={{ justifyContent: 'space-between' }}>
            {[['Proteína', 'protein_g'], ['Carbos', 'carbs_g'], ['Grasa', 'fat_g']].map(([l, k]) => (
              <View key={k} style={{ alignItems: 'center', flex: 1 }}>
                <T size={18} w="medium">{Math.round(avgOf(k!))} g</T>
                <T size={12} color={c.n400}>{l}</T>
              </View>
            ))}
          </Row>
          <T size={11} color={c.n500}>Sobre {foodDays.length} {foodDays.length === 1 ? 'día registrado' : 'días registrados'}.</T>
        </Card>
      ) : null}

      {metric === 'training' ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <T size={14} w="medium" style={{ paddingVertical: 10 }}>Últimas sesiones</T>
          {sessions.length === 0 ? <T size={13} color={c.n400} style={{ paddingBottom: 10 }}>Todavía no completaste ninguna.</T> : sessions.map((s, i) => {
            const vol = Number(s.volume_kg ?? 0);
            return (
              <Row key={String(s.session_id)} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(233,233,237,0.06)' }}>
                <View style={{ flex: 1 }}>
                  <T size={14}>{String(s.name)}</T>
                  <T size={12} color={c.n400}>{dayMonth(String(s.local_date))} · {dur(Number(s.active_duration_s))} · {Number(s.working_sets ?? 0)} series</T>
                </View>
                <T size={13} color={c.n300}>{nf(units === 'kg' ? vol : toDisplayWeight(vol, 'lb'), 0)} {units}</T>
              </Row>
            );
          })}
        </Card>
      ) : listDays.length && metric !== 'habits' ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <T size={14} w="medium" style={{ paddingVertical: 10 }}>Día por día</T>
          {listDays.map((p, i) => (
            <Row key={p.date} style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(233,233,237,0.06)', justifyContent: 'space-between' }}>
              <T size={13} color={c.n300}>{p.date === today ? 'Hoy' : dayMonth(p.date)}</T>
              <T size={13}>{fmt(p.value!)}</T>
            </Row>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
