/**
 * Progreso: only real progress, from daily_summaries. One card per metric with its trend over 30 or
 * 90 days and the change against the previous period; each card opens its detail (Metric). Logging
 * moved to the details (weight, mood, habits) and settings to Ajustes.
 */
import { addDays, localDate, periodChange, series, stats, weekly, type MetricKey } from '@kova/domain';
import { CaretRight, GearSix } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Spark } from '../charts';
import { kova } from '../client';
import { useSession } from '../session';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Empty, ErrorNote, Loading, Row, Seg, T } from '../ui';
import { Ajustes } from './Ajustes';
import { Metric, METRIC, metricFormat } from './Metric';

const ORDER: MetricKey[] = ['training', 'weight', 'food', 'sleep', 'steps', 'mood', 'habits', 'heart'];

export function Progreso() {
  const { prefs } = useSession();
  const units = prefs!.weight_unit;
  const today = localDate(new Date(), prefs!.time_zone);
  const [range, setRange] = useState<'30' | '90'>('30');
  const [open, setOpen] = useState<MetricKey | null>(null);
  const [settings, setSettings] = useState(false);

  const q = useAsync(async () => {
    const [days, goals] = await Promise.all([kova.summaries.daily(addDays(today, -91), today), kova.goals.list()]);
    return { days, stepGoal: (goals as Array<{ kind: string; status: string; target_value: number }>).find((g) => g.kind === 'steps_daily' && g.status === 'active')?.target_value ?? null };
  }, [today]);

  if (settings) return <Ajustes onClose={() => setSettings(false)} />;
  if (open) return <Metric metric={open} onClose={() => { setOpen(null); q.reload(); }} />;
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <View style={{ padding: 16 }}><ErrorNote message={q.error} onRetry={q.reload} /></View>;
  const { days, stepGoal } = q.data!;
  const period = Number(range);
  const rows = days as Array<Record<string, unknown> & { local_date: string }>;
  const weightFmt = metricFormat('weight', units);

  const cards = ORDER.map((k) => {
    const all = series(rows, k);
    const pts = all.slice(-period);
    const st = stats(pts);
    const fmt = metricFormat(k, units);
    const ch = period < 90 ? periodChange(all, period, k) : null;
    const main = !st.days ? null : k === 'training' ? fmt(st.total ?? 0) : k === 'weight' ? fmt(st.last!) : fmt(st.avg!);
    const sub = !st.days ? METRIC[k].empty
      : k === 'training' ? 'en ' + period + ' días'
      : k === 'weight' ? (st.days > 1 ? (st.last! - st.first! >= 0 ? '+' : '−') + weightFmt(Math.abs(st.last! - st.first!)) + ' en el período' : 'último registro')
      : 'promedio · ' + st.days + (st.days === 1 ? ' día' : ' días');
    const trend = ch && k !== 'weight'
      ? (ch.delta >= 0 ? '▲ ' : '▼ ') + (k === 'training' ? Math.abs(ch.delta) + ' vs. antes' : Math.round(Math.abs(ch.delta / (ch.before || 1)) * 100) + ' % vs. antes')
      : null;
    return { k, st, main, sub, trend, spark: k === 'training' ? weekly(pts, 'training') : pts, goal: k === 'steps' ? stepGoal : null };
  });
  const withData = cards.filter((x) => x.st.days);
  const without = cards.filter((x) => !x.st.days);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={22} w="medium">Progreso</T>
        <Pressable onPress={() => setSettings(true)} accessibilityRole="button" accessibilityLabel="Ajustes" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <GearSix size={22} color={c.n300} />
        </Pressable>
      </Row>
      <Seg options={[['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']]} value={range} onChange={setRange} />

      {withData.length === 0 ? (
        <Empty title="Todavía no hay progreso para mostrar">Entrena, registra comidas o conecta Health Connect en Ajustes y aquí verás cómo vienes, con gráficos de cada área.</Empty>
      ) : withData.map((x) => {
        const Ic = METRIC[x.k].icon;
        return (
          <Pressable key={x.k} onPress={() => setOpen(x.k)} accessibilityRole="button" accessibilityLabel={METRIC[x.k].title + ', ver detalle'}
            style={{ padding: 14, borderRadius: r.lg, backgroundColor: c.surface, gap: 10 }}>
            <Row style={{ gap: 8 }}>
              <Ic size={16} color={c.a300} />
              <T size={14} color={c.n300} style={{ flex: 1 }}>{METRIC[x.k].title}</T>
              {x.trend ? <T size={12} color={c.n400}>{x.trend}</T> : null}
              <CaretRight size={14} color={c.n500} />
            </Row>
            <Row style={{ alignItems: 'flex-end', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T size={22} w="medium">{x.main}</T>
                <T size={12} color={c.n400}>{x.sub}</T>
              </View>
              <View style={{ width: '46%' }}><Spark points={x.spark} goal={x.goal} /></View>
            </Row>
          </Pressable>
        );
      })}

      {without.length ? (
        <View style={{ gap: 6 }}>
          <T size={13} color={c.n400}>Sin datos todavía</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {without.map((x) => {
              const Ic = METRIC[x.k].icon;
              return (
                <Pressable key={x.k} onPress={() => setOpen(x.k)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: c.divider }}>
                  <Ic size={14} color={c.n400} /><T size={13} color={c.n300}>{METRIC[x.k].title}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
