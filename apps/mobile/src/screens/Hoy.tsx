/** "Hoy" — mobile home from design/prototypes/VIDA Health v2.dc.html, on real data only. */
import { addDays, EVIDENCE_LABEL, KIND_LABEL, greeting, headerDate, hm, isoWeekday, localDate, MOODS, nf, toDisplayWeight, type MetricKey } from '@kova/domain';
import { CaretRight, Flame, ForkKnife, GearSix, Moon, Play, Scales, Smiley, SneakerMove, Barbell, Lightbulb, type Icon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { kova } from '../client';
import { useSession } from '../session';
import { c, r } from '../theme';
import { loadTraining, scheme, type TrainingData } from '../training';
import { useAsync } from '../useAsync';
import type { LiveSession } from '../workout';
import { Button, Empty, ErrorNote, Loading, Row, Seg, T } from '../ui';
import { Ajustes } from './Ajustes';
import { Metric } from './Metric';
import { useReportTarget } from '../report';

const num = (v: unknown) => (v == null ? null : Number(v));

interface Tile { key: MetricKey; icon: Icon; name: string; period: string; value?: string; unit?: string; empty?: string; hint: string }

export function Hoy({ live, onOpenLive, onStart }: {
  live: LiveSession | null;
  onOpenLive: () => void;
  onStart: (routineId: string, data: TrainingData) => void;
}) {
  const { prefs, setUnit } = useSession();
  const tz = prefs!.time_zone;
  const units = prefs!.weight_unit;
  const today = localDate(new Date(), tz);
  const [open, setOpen] = useState<MetricKey | null>(null);
  useReportTarget('hoy');
  const [settings, setSettings] = useState(false);

  const q = useAsync(async () => {
    const [days, training, goals, insights, energy] = await Promise.all([
      kova.summaries.daily(addDays(today, -6), today), loadTraining(), kova.goals.list(), kova.insights.today(today, 2).catch(() => []),
      kova.energy.today(today).catch(() => null),
    ]);
    return { days, training, goals: goals as Array<{ kind: string; status: string; target_value: number }>, insights, energy };
  }, [today]);

  if (settings) return <Ajustes onClose={() => setSettings(false)} />;
  if (open) return <Metric metric={open} onClose={() => { setOpen(null); q.reload(); }} />;
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <View style={{ padding: 16 }}><ErrorNote message={q.error} onRetry={q.reload} /></View>;
  const { days, training, goals, insights, energy } = q.data!;
  const t = days[days.length - 1]! as Record<string, unknown>;
  const plan = training.routines.find((x) => x.schedule_days.includes(isoWeekday(today)));
  const stepGoal = goals.find((g) => g.kind === 'steps_daily' && g.status === 'active')?.target_value ?? null;
  const weekSessions = days.reduce((a, d) => a + Number((d as Record<string, unknown>).workouts_completed ?? 0), 0);
  const latestW = [...days].reverse().find((d) => (d as Record<string, unknown>).weight_kg != null) as Record<string, unknown> | undefined;

  // Today's target follows today's activity when the plan was calculated by Kova Health.
  const habitsScheduled = Number(t.habits_scheduled ?? 0), habitsDone = Number(t.habits_completed ?? 0);
  const kcal = num(t.kcal), kcalGoal = energy?.mode === 'dynamic' ? energy.kcal : num(t.kcal_goal), steps = num(t.steps), sleep = num(t.sleep_min), mood = num(t.mood);
  const tiles: Tile[] = [
    kcal != null ? { key: 'food', icon: ForkKnife, name: 'Comida', period: 'Hoy', value: nf(Math.round(kcal), 0), unit: kcalGoal ? 'de ' + nf(kcalGoal, 0) + ' kcal' : 'kcal', hint: 'Proteína ' + Math.round(num(t.protein_g) ?? 0) + ' g' }
      : { key: 'food', icon: ForkKnife, name: 'Comida', period: 'Hoy', empty: 'Sin registrar', hint: kcalGoal ? 'Meta de hoy: ' + nf(kcalGoal, 0) + ' kcal' : 'Añádelo en Comida' },
    steps != null ? { key: 'steps', icon: SneakerMove, name: 'Pasos', period: 'Hoy', value: nf(steps, 0), unit: stepGoal ? 'de ' + nf(stepGoal, 0) : 'pasos', hint: stepGoal ? (steps >= stepGoal ? 'Objetivo cumplido' : 'Faltan ' + nf(stepGoal - steps, 0)) : 'Sin objetivo' }
      : { key: 'steps', icon: SneakerMove, name: 'Pasos', period: 'Hoy', empty: 'Sin datos', hint: 'Llegan del reloj o de Health Connect' },
    sleep != null ? { key: 'sleep', icon: Moon, name: 'Sueño', period: 'Anoche', value: hm(sleep), hint: 'Duración dormido' }
      : { key: 'sleep', icon: Moon, name: 'Sueño', period: 'Anoche', empty: 'Sin datos', hint: 'Ponte el reloj esta noche' },
    latestW ? { key: 'weight', icon: Scales, name: 'Cuerpo', period: latestW.local_date === today ? 'Hoy' : 'Último', value: nf(units === 'kg' ? Number(latestW.weight_kg) : toDisplayWeight(Number(latestW.weight_kg), 'lb'), 1), unit: units, hint: 'Último peso registrado' }
      : { key: 'weight', icon: Scales, name: 'Cuerpo', period: 'Hoy', empty: 'Sin datos', hint: 'Toca para anotar tu peso' },
    mood != null ? { key: 'mood', icon: Smiley, name: 'Ánimo', period: 'Hoy', value: MOODS[mood - 1], hint: 'Último registro' }
      : { key: 'mood', icon: Smiley, name: 'Ánimo', period: 'Hoy', empty: 'Sin registrar', hint: 'Toca para registrarlo' },
    { key: 'training', icon: Barbell, name: 'Entreno', period: '7 días', value: String(weekSessions), unit: weekSessions === 1 ? 'sesión' : 'sesiones', hint: 'Sesiones completadas' },
    habitsScheduled ? { key: 'habits', icon: Flame, name: 'Hábitos', period: 'Hoy', value: habitsDone + ' de ' + habitsScheduled, hint: habitsDone >= habitsScheduled ? 'Todos hechos' : 'Toca para marcarlos' }
      : { key: 'habits', icon: Flame, name: 'Hábitos', period: 'Hoy', empty: 'Sin hábitos', hint: 'Toca para crear uno' },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 28 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <View style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 4 }}>
          <View style={{ flex: 1 }}>
            <T size={12} color={c.n500}>{headerDate(new Date(), tz, false)}</T>
            <T size={22} w="medium" style={{ marginTop: 4 }}>{greeting(new Date(), tz)}{prefs!.display_name ? ', ' + prefs!.display_name : ''}</T>
          </View>
          <Row style={{ gap: 4 }}>
            <Seg options={[['kg', 'kg'], ['lb', 'lb']]} value={units} onChange={setUnit} />
            <Pressable onPress={() => setSettings(true)} accessibilityRole="button" accessibilityLabel="Ajustes" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <GearSix size={22} color={c.n300} />
            </Pressable>
          </Row>
        </Row>

        {live ? (
          <Pressable onPress={onOpenLive} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: r.lg, borderWidth: 1, borderColor: c.accent, backgroundColor: 'rgba(145,132,217,0.10)' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
            <View style={{ flex: 1 }}><T w="medium">{live.name} en curso</T><T size={12} color={c.n400}>{live.pausedAt ? 'En pausa' : 'Toca para continuar'}</T></View>
            <T size={13} color={c.accent}>Continuar</T><CaretRight size={16} color={c.accent} />
          </Pressable>
        ) : null}

        <View style={{ padding: 18, borderRadius: r.lg, backgroundColor: c.a900, gap: 16 }}>
          <View style={{ gap: 3 }}>
            <T size={13} w="medium" color={c.n300}>Plan de hoy</T>
            {plan ? (
              <>
                <T size={17} w="medium">{plan.name}</T>
                <T size={13} color={c.n400}>{[...plan.routine_exercises].sort((a, b) => a.position - b.position).map((it) => (training.names.get(it.exercise_id) ?? 'Ejercicio') + ' ' + scheme(it)).join(' · ')}</T>
              </>
            ) : (
              <T size={15} color={c.n300}>Hoy no tienes una rutina programada.</T>
            )}
          </View>
          {plan && !live ? <Button label={'Empezar ' + plan.name} icon={Play} onPress={() => onStart(plan.id, training)} style={{ minHeight: 48 }} /> : null}
        </View>

        {insights.length === 0 ? (
          <Empty title="Kova Health todavía no tiene observaciones">
            Cuando haya suficientes días de datos te mostraremos hechos y patrones aquí. No mostramos ejemplos inventados.
          </Empty>
        ) : insights.map((x) => (
          <View key={x.key} style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.divider, borderStyle: x.kind === 'hypothesis' ? 'dashed' : 'solid' }}>
            <Lightbulb size={18} color={x.kind === 'hypothesis' ? c.n400 : c.a300} />
            <View style={{ flex: 1, gap: 2 }}>
              <T size={12} color={c.n400}>Kova Health · {KIND_LABEL[x.kind]}{x.kind !== 'fact' ? ' · ' + EVIDENCE_LABEL[x.evidence] : ''}</T>
              <T size={14}>{x.title}</T>
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <T size={16} w="medium">Progreso de hoy</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tiles.map((tile) => (
            <Pressable key={tile.name} onPress={() => setOpen(tile.key)} accessibilityRole="button" accessibilityLabel={tile.name + ', ver detalle'}
              style={{ width: '48.6%', padding: 12, borderRadius: r.lg, backgroundColor: c.surface, gap: 6 }}>
              <Row style={{ gap: 6 }}>
                <tile.icon size={15} color={c.a300} />
                <T size={12} color={c.n300} style={{ flex: 1 }}>{tile.name}</T>
                <T size={12} color={c.n400}>{tile.period}</T>
              </Row>
              {tile.value != null ? (
                <Row style={{ alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                  <T size={22} w="medium">{tile.value}</T>
                  {tile.unit ? <T size={12} color={c.n400}>{tile.unit}</T> : null}
                </Row>
              ) : (
                <T size={15} color={c.n300}>{tile.empty}</T>
              )}
              <T size={12} color={c.n400}>{tile.hint}</T>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
