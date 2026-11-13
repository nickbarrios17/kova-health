/** "Hoy" — mobile home from design/prototypes/VIDA Health v2.dc.html, on real data only. */
import { addDays, EVIDENCE_LABEL, headerDate, workoutFuelTips, hm, isoWeekday, localDate, MOODS, nf, toDisplayWeight, type MetricKey } from '@kova/domain';
import { Flame, ForkKnife, GearSix, Moon, Play, Plus, Scales, Smiley, SneakerMove, Barbell, Lightbulb, type Icon } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { kova } from '../client';
import { useSession } from '../session';
import { c, rad } from '../theme';
import { loadTraining, scheme, type TrainingData } from '../training';
import { useAsync } from '../useAsync';
import type { LiveSession } from '../workout';
import { Button, ConfidenceBadge, Empty, ErrorNote, IconButton, Loading, ReadinessRing, Row, Seg, T } from '../ui';
import { SyncChip } from '../sync';
import { HealthCard } from './HealthCard';
import { WatchCard } from './WatchCard';
import { Ajustes } from './Ajustes';
import { Metric } from './Metric';
import { useReportTarget } from '../report';

const num = (v: unknown) => (v == null ? null : Number(v));

interface Tile { key: MetricKey; icon: Icon; name: string; period: string; value?: string; unit?: string; empty?: string; hint: string; state?: 'ok'; action?: boolean }

export function Hoy({ live, onOpenLive, onStart, onCreateRoutine }: {
  live: LiveSession | null;
  onOpenLive: () => void;
  onStart: (routineId: string, data: TrainingData) => void;
  /** No routine yet: opens Entrenar, where routines are created. */
  onCreateRoutine: () => void;
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
      kova.summaries.daily(addDays(today, -6), today), loadTraining(), kova.goals.list(), kova.insights.today(today, 1).catch(() => []),
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
      : { key: 'food', icon: ForkKnife, name: 'Comida', period: 'Hoy', empty: 'Sin registrar', hint: kcalGoal ? 'Meta de hoy: ' + nf(kcalGoal, 0) + ' kcal' : 'Agregalo en Comida', action: true },
    steps != null ? { key: 'steps', icon: SneakerMove, name: 'Pasos', period: 'Hoy', value: nf(steps, 0), unit: stepGoal ? 'de ' + nf(stepGoal, 0) : 'pasos', hint: stepGoal ? (steps >= stepGoal ? 'Objetivo cumplido' : 'Faltan ' + nf(stepGoal - steps, 0)) : 'Sin objetivo de pasos', state: stepGoal && steps >= stepGoal ? 'ok' : undefined }
      : { key: 'steps', icon: SneakerMove, name: 'Pasos', period: 'Hoy', empty: 'Sin datos', hint: 'Llegan del reloj o de Health Connect' },
    sleep != null ? { key: 'sleep', icon: Moon, name: 'Sueño', period: 'Anoche', value: hm(sleep), hint: 'Duración dormido' }
      : { key: 'sleep', icon: Moon, name: 'Sueño', period: 'Anoche', empty: 'Sin datos', hint: 'Ponete el reloj esta noche' },
    latestW ? { key: 'weight', icon: Scales, name: 'Cuerpo', period: latestW.local_date === today ? 'Hoy' : 'Último', value: nf(units === 'kg' ? Number(latestW.weight_kg) : toDisplayWeight(Number(latestW.weight_kg), 'lb'), 1), unit: units, hint: 'Último peso registrado' }
      : { key: 'weight', icon: Scales, name: 'Cuerpo', period: 'Hoy', empty: 'Sin datos', hint: 'Tocá para anotar tu peso', action: true },
    mood != null ? { key: 'mood', icon: Smiley, name: 'Ánimo', period: 'Hoy', value: MOODS[mood - 1], hint: 'Último registro' }
      : { key: 'mood', icon: Smiley, name: 'Ánimo', period: 'Hoy', empty: 'Sin registrar', hint: 'Tocá para registrarlo', action: true },
    { key: 'training', icon: Barbell, name: 'Entreno', period: '7 días', value: String(weekSessions), unit: weekSessions === 1 ? 'sesión' : 'sesiones', hint: 'Sesiones completadas' },
    habitsScheduled ? { key: 'habits', icon: Flame, name: 'Hábitos', period: 'Hoy', value: habitsDone + ' de ' + habitsScheduled, hint: habitsDone >= habitsScheduled ? 'Todos hechos' : 'Tocá para marcarlos', state: habitsDone >= habitsScheduled ? 'ok' : undefined }
      : { key: 'habits', icon: Flame, name: 'Hábitos', period: 'Hoy', empty: 'Sin hábitos', hint: 'Tocá para crear uno', action: true },
  ];

  const items = plan ? [...plan.routine_exercises].sort((a, b) => a.position - b.position) : [];
  const noData = steps == null && sleep == null && kcal == null && mood == null && !latestW;
  const top = insights[0];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" disableScrollViewPanResponder contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <T size={13} color={c.n400}>{headerDate(new Date(), tz, false)}</T>
          <T size={26} w="semibold" accessibilityRole="header" style={{ lineHeight: 30 }}>{prefs!.display_name ? 'Hola, ' + prefs!.display_name : 'Hola'}</T>
          <View style={{ marginTop: 4, alignSelf: 'flex-start' }}><SyncChip /></View>
        </View>
        <Row style={{ gap: 8 }}>
          <Seg options={[['kg', 'kg'], ['lb', 'lb']]} value={units} onChange={setUnit} label="Unidad de peso" />
          <IconButton icon={GearSix} label="Ajustes" onPress={() => setSettings(true)} />
        </Row>
      </Row>

      <View style={{ padding: 18, borderRadius: rad.sheet, backgroundColor: c.surface, gap: 18 }}>
        <Row style={{ gap: 14, alignItems: 'flex-start' }}>
          <ReadinessRing size={64} />
          <View style={{ flex: 1, gap: 3 }}>
            <T size={13} w="medium" color={c.n400}>Preparación</T>
            <T size={17} w="semibold">Aún sin calcular</T>
            <T size={13} color={c.n400}>Mientras tanto, mirá tu sueño y tu corazón abajo.</T>
          </View>
        </Row>
        <View style={{ height: 1, backgroundColor: c.borderSubtle }} />
        <View style={{ gap: 4 }}>
          <T size={13} w="medium" color={c.n400}>Plan de hoy</T>
          {plan ? (
            <>
              <T size={17} w="semibold">{plan.name}</T>
              <T size={13} color={c.n400}>{items.map((it) => (training.names.get(it.exercise_id) ?? 'Ejercicio') + ' ' + scheme(it)).join(' · ')}</T>
            </>
          ) : live ? (
            <T size={17} w="semibold">{live.name}</T>
          ) : (
            <T size={15}>Hoy no tenés una rutina programada.</T>
          )}
        </View>
        {live ? (
          <Button large label={'Continuar ' + live.name} icon={Play} onPress={onOpenLive}
            accessibilityHint={live.pausedAt ? 'La sesión está en pausa' : undefined} />
        ) : plan ? (
          <Button large label={'Empezar ' + plan.name} icon={Play} onPress={() => onStart(plan.id, training)} />
        ) : (
          <Button variant="secondary" label="Crear una rutina" icon={Plus} onPress={onCreateRoutine} />
        )}
      </View>

      {plan && !live ? (() => {
        const tips = workoutFuelTips({
          routineName: plan.name,
          weightKg: latestW ? Number(latestW.weight_kg) : null,
          proteinLeftG: energy?.proteinG != null ? energy.proteinG - (num(t.protein_g) ?? 0) : null,
        });
        return (
          <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 6 }}>
            <Row style={{ gap: 8 }}><ForkKnife size={18} color={c.a400} /><T size={15} w="semibold">Comida y entreno</T></Row>
            <T size={14} color={c.n400}>{tips.before}</T>
            <T size={14} color={c.n400}>{tips.after}</T>
          </View>
        );
      })() : null}

      {top ? (
        <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 8 }}>
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            <ConfidenceBadge kind={top.kind} />
            {top.kind !== 'fact' ? <T size={12} color={c.n500}>{EVIDENCE_LABEL[top.evidence]}</T> : null}
          </Row>
          <T size={15} w="medium" style={{ lineHeight: 22 }}>{top.title}</T>
        </View>
      ) : (
        <Empty icon={Lightbulb} title="Nada por ahora">
          Cuando haya suficientes días de datos, Kova Health te va a mostrar acá hechos y patrones.
        </Empty>
      )}

      {noData && Platform.OS !== 'web' ? <HealthCard onSynced={q.reload} /> : null}

      <View style={{ gap: 12 }}>
        <T size={17} w="semibold" accessibilityRole="header">Progreso de hoy</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map((tile) => (
            <Pressable key={tile.name} onPress={() => setOpen(tile.key)} accessibilityRole="button"
              accessibilityLabel={tile.name + ', ' + (tile.value != null ? tile.value + ' ' + (tile.unit ?? '') : tile.empty) + '. ' + tile.hint}
              style={({ pressed }) => ({ width: '48.4%', minHeight: 124, padding: 14, borderRadius: rad.card, backgroundColor: pressed ? c.raised : c.surface, gap: 8 })}>
              <Row style={{ gap: 6 }}>
                <tile.icon size={18} color={c.a400} />
                <T size={13} w="medium" style={{ flex: 1 }} numberOfLines={1}>{tile.name}</T>
                <T size={12} color={c.n500}>{tile.period}</T>
              </Row>
              {tile.value != null ? (
                <Row style={{ alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                  <T size={24} w="semibold" style={{ lineHeight: 27 }}>{tile.value}</T>
                  {tile.unit ? <T size={13} color={c.n400}>{tile.unit}</T> : null}
                </Row>
              ) : (
                <T size={15} w="medium" color={c.n400}>{tile.empty}</T>
              )}
              <T size={12} color={tile.state === 'ok' ? c.ok : tile.empty && tile.action ? c.a400 : c.n400} w={tile.state ? 'medium' : 'regular'}>
                {tile.state === 'ok' ? '✓ ' : ''}{tile.hint}
              </T>
            </Pressable>
          ))}
        </View>
      </View>
      <WatchCard today={today} onSynced={q.reload} />
    </ScrollView>
  );
}
