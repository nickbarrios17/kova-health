/**
 * «Tu coach del entreno», at the end of a session: fatigue, when to add weight, what the week is missing
 * (with catalog exercises), stretches for what you trained and a warm-up for next time. Rules from
 * packages/domain/src/workoutCoach.ts, no AI: every tip has a «¿Por qué?» with your numbers.
 */
import { addDays, dayMonth, dur, exerciseName, exerciseTypeMuscles, setsPerMuscle, stretchesFor, workoutCoach, type CoachTip } from '@kova/domain';
import { Barbell, Fire, Lightbulb, PersonSimpleTaiChi, TrendUp, Warning, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { kova } from '../client';
import { c, rad } from '../theme';
import { useAsync } from '../useAsync';
import type { Summary } from '../workout';
import { Chip, KeyboardRoom, Loading, Row, T } from '../ui';

/** A session as the coach reads it: from the summary just finished, or from the database. */
export type CoachSource = Pick<Summary, 'sessionId' | 'date' | 'detail'>;

/** Every exercise's primary and secondary muscles, and the strength catalog for suggestions. */
async function loadMuscles() {
  const rows = await kova.exercises.withMuscles();
  const muscles = new Map(rows.map((e) => [e.id, {
    primary: e.exercise_muscles.filter((m) => m.role === 'primary').map((m) => m.muscle_code),
    secondary: e.exercise_muscles.filter((m) => m.role === 'secondary').map((m) => m.muscle_code),
  }]));
  return { rows, muscles };
}

const ICON = { fatigue: Warning, progress: TrendUp, balance: Barbell, missing: Barbell } as const;
const COLOR = { fatigue: c.warn, progress: c.ok, balance: c.a300, missing: c.a300 } as const;

export function WorkoutCoachCard({ summary }: { summary: CoachSource }) {
  const q = useAsync(async () => {
    const [{ rows: catalogRows, muscles }, history] = await Promise.all([
      loadMuscles(),
      kova.workouts.recentHistory(1000).catch(() => []) as Promise<Array<{ exercise_id: string; session_id: string; local_date: string; reps: number | null }>>,
    ]);
    const none = { primary: [] as string[], secondary: [] as string[] };
    // The week: other sessions of the last 7 days from the server, plus this one from the phone
    // (its sets may still be on their way).
    // The week up to that session's day (an old session is read against its own week).
    const from = addDays(summary.date, -6);
    const perExercise = new Map<string, number>();
    for (const h of history) {
      if (h.session_id === summary.sessionId || h.local_date < from || h.local_date > summary.date) continue;
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

/** A past session from the history, with its coach. */
export function SessionCoach({ session, onClose }: { session: { id: string; name: string; date: string; durationS: number }; onClose: () => void }) {
  const q = useAsync(() => kova.workouts.coachDetail(session.id), [session.id]);
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardRoom modal style={{ backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <View style={{ flex: 1 }}>
            <T size={17} w="semibold">{session.name}</T>
            <T size={12} color={c.n400}>{dayMonth(session.date)} · {dur(session.durationS)}</T>
          </View>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12 }}>
          {q.loading && !q.data ? <Loading /> : (q.data ?? []).length ? (
            <>
              <View style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 4 }}>
                {q.data!.map((e) => (
                  <Row key={e.exerciseId + e.name} style={{ justifyContent: 'space-between', gap: 8 }}>
                    <T size={14} style={{ flex: 1 }}>{e.name}</T>
                    <T size={12} color={c.n400}>{e.sets.map((s) => (s.kg ? s.kg + '×' : '') + (s.reps ?? '—')).join('  ')}</T>
                  </Row>
                ))}
              </View>
              <WorkoutCoachCard summary={{ sessionId: session.id, date: session.date, detail: q.data! }} />
            </>
          ) : <T size={14} color={c.n400}>Esta sesión no tiene series guardadas para analizar.</T>}
        </ScrollView>
      </KeyboardRoom>
    </Modal>
  );
}

/**
 * «Estirá hoy», in Hoy: stretches for what you trained today, from the Kova sessions (phone and watch,
 * exercise by exercise) and the workouts of the watch's own app (by their type). Hidden on rest days.
 */
export function TodayStretchCard({ today }: { today: string }) {
  const q = useAsync(async () => {
    const [sessions, watch, { muscles }] = await Promise.all([
      kova.workouts.summaries(10) as Promise<Array<Record<string, unknown>>>,
      kova.health.watchWorkouts(today).catch(() => []),
      loadMuscles(),
    ]);
    const todays = sessions.filter((s) => s.status === 'completed' && String(s.local_date) === today);
    const details = await Promise.all(todays.map((s) => kova.workouts.coachDetail(String(s.session_id)).catch(() => [])));
    const score = setsPerMuscle(details.flat().map((e) => ({ ...(muscles.get(e.exerciseId) ?? { primary: [], secondary: [] }), sets: e.sets.length })));
    for (const w of watch) for (const [m, v] of Object.entries(exerciseTypeMuscles(Number(w.details.exercise_type)))) score[m] = (score[m] ?? 0) + v;
    const what = [...todays.map((s) => String(s.name)), ...watch.map((w) => exerciseName(Number(w.details.exercise_type), typeof w.details.title === 'string' ? w.details.title : null))];
    return { stretches: stretchesFor(score), what };
  }, [today]);
  if (!q.data?.stretches.length) return null;
  return (
    <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 10 }}>
      <Row style={{ gap: 8 }}>
        <PersonSimpleTaiChi size={18} color={c.a400} />
        <T size={17} w="semibold" accessibilityRole="header" style={{ flex: 1 }}>Estirá hoy</T>
      </Row>
      <T size={13} color={c.n400}>Por lo que entrenaste: {q.data.what.join(', ')}.</T>
      {q.data.stretches.map((s) => (
        <View key={s.muscle} style={{ gap: 2 }}>
          <T size={14} w="medium">{s.name}</T>
          <T size={13} color={c.n400}>{s.how}</T>
        </View>
      ))}
    </View>
  );
}
