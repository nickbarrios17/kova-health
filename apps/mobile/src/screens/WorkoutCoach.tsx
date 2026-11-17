/**
 * «Tu coach del entreno», at the end of a session: fatigue, when to add weight, what the week is missing
 * (with catalog exercises), stretches for what you trained and a warm-up for next time. Rules from
 * packages/domain/src/workoutCoach.ts, no AI: every tip has a «¿Por qué?» with your numbers.
 */
import { addDays, setsPerMuscle, workoutCoach, type CoachTip } from '@kova/domain';
import { Barbell, Fire, Lightbulb, PersonSimpleTaiChi, TrendUp, Warning } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { kova } from '../client';
import { c, rad } from '../theme';
import { useAsync } from '../useAsync';
import type { Summary } from '../workout';
import { Chip, Row, T } from '../ui';

const ICON = { fatigue: Warning, progress: TrendUp, balance: Barbell, missing: Barbell } as const;
const COLOR = { fatigue: c.warn, progress: c.ok, balance: c.a300, missing: c.a300 } as const;

export function WorkoutCoachCard({ summary }: { summary: Summary }) {
  const q = useAsync(async () => {
    const [catalogRows, history] = await Promise.all([
      kova.exercises.withMuscles(),
      kova.workouts.recentHistory(1000).catch(() => []) as Promise<Array<{ exercise_id: string; session_id: string; local_date: string; reps: number | null }>>,
    ]);
    const muscles = new Map(catalogRows.map((e) => [e.id, {
      primary: e.exercise_muscles.filter((m) => m.role === 'primary').map((m) => m.muscle_code),
      secondary: e.exercise_muscles.filter((m) => m.role === 'secondary').map((m) => m.muscle_code),
    }]));
    const none = { primary: [] as string[], secondary: [] as string[] };
    // The week: other sessions of the last 7 days from the server, plus this one from the phone
    // (its sets may still be on their way).
    const from = addDays(summary.date, -6);
    const perExercise = new Map<string, number>();
    for (const h of history) {
      if (h.session_id === summary.sessionId || h.local_date < from) continue;
      perExercise.set(h.exercise_id, (perExercise.get(h.exercise_id) ?? 0) + 1);
    }
    for (const d of summary.detail) perExercise.set(d.exerciseId, (perExercise.get(d.exerciseId) ?? 0) + d.sets.length);
    const weekSets = setsPerMuscle([...perExercise].map(([id, sets]) => ({ ...(muscles.get(id) ?? none), sets })));
    return workoutCoach({
      exercises: summary.detail.map((d) => ({ ...d, ...(muscles.get(d.exerciseId) ?? none) })),
      weekSets,
      catalog: catalogRows.filter((e) => e.category === 'strength').map((e) => ({ id: e.id, name: e.name, primary: muscles.get(e.id)!.primary })),
      usedBefore: new Set(history.map((h) => h.exercise_id)),
    });
  }, [summary.sessionId]);

  const r = q.data;
  if (!r || (!r.tips.length && !r.stretches.length && !r.warmup.length)) return null;
  return (
    <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 14 }}>
      <Row style={{ gap: 8 }}>
        <Lightbulb size={18} color={c.a400} />
        <T size={17} w="semibold" accessibilityRole="header" style={{ flex: 1 }}>Tu coach del entreno</T>
      </Row>
      {r.tips.length ? r.tips.map((t, k) => <Tip key={k} tip={t} />) : (
        <T size={14} color={c.n300}>Sesión pareja: llegaste bien a todos los ejercicios. Seguí así.</T>
      )}
      {r.stretches.length ? (
        <View style={{ gap: 8 }}>
          <Row style={{ gap: 6 }}><PersonSimpleTaiChi size={16} color={c.a300} /><T size={15} w="semibold">Estirá ahora</T></Row>
          {r.stretches.map((s) => (
            <View key={s.muscle} style={{ gap: 2 }}>
              <T size={14} w="medium">{s.name}</T>
              <T size={13} color={c.n400}>{s.how}</T>
            </View>
          ))}
        </View>
      ) : null}
      {r.warmup.length ? (
        <View style={{ gap: 6 }}>
          <Row style={{ gap: 6 }}><Fire size={16} color={c.a300} /><T size={15} w="semibold">Para la próxima, calentá así</T></Row>
          {r.warmup.map((w, k) => <T key={k} size={13} color={c.n300}>• {w.text}</T>)}
        </View>
      ) : null}
      <T size={11} color={c.n500}>Reglas simples sobre tus series, no una evaluación médica. Si algo duele, pará.</T>
    </View>
  );
}

function Tip({ tip }: { tip: CoachTip }) {
  const [why, setWhy] = useState(false);
  const Icon = ICON[tip.kind];
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ gap: 8, alignItems: 'flex-start' }}>
        <Icon size={16} color={COLOR[tip.kind]} style={{ marginTop: 2 }} />
        <T size={15} w="semibold" style={{ flex: 1 }}>{tip.title}</T>
      </Row>
      <T size={14} color={c.n300}>{tip.body}</T>
      {tip.suggest?.length ? (
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>{tip.suggest.map((s) => <Chip key={s.id} label={s.name} />)}</Row>
      ) : null}
      {tip.why ? (
        <Pressable onPress={() => setWhy((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <T size={12} color={c.a400}>{why ? tip.why : '¿Por qué?'}</T>
        </Pressable>
      ) : null}
    </View>
  );
}
