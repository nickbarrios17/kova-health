/** Routines + history (prototype "Rutinas"), with the routine editor (new, edit, duplicate, delete). */
import { dayMonth, draftFromRoutine, dur, emptyDraft, isoDays, newId, nf, toDisplayWeight, type RoutineDraft } from '@kova/domain';
import { Barbell, CaretRight, ClockCounterClockwise, Copy, PencilSimple, Play, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { kova } from '../client';
import { useSession } from '../session';
import { c } from '../theme';
import { loadTraining, scheme, type TrainingData } from '../training';
import { useAsync } from '../useAsync';
import { Button, Card, Empty, ErrorNote, Loading, Row, T } from '../ui';
import { ExerciseDetail } from './ExerciseDetail';
import { RoutineEditor } from './RoutineEditor';
import { useReportTarget } from '../report';

export function Entrenar({ hasLive, onStart }: { hasLive: boolean; onStart: (routineId: string, data: TrainingData) => void }) {
  const { prefs } = useSession();
  const units = prefs!.weight_unit;
  const q = useAsync(async () => {
    const [training, summaries] = await Promise.all([loadTraining(), kova.workouts.summaries(15)]);
    return { training, done: (summaries as Array<Record<string, unknown>>).filter((s) => s.status === 'completed') };
  }, []);
  const [editing, setEditing] = useState<RoutineDraft | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  useReportTarget('entrenar');
  const [howTo, setHowTo] = useState<{ id: string; name: string } | null>(null);

  // Back closes the routine editor without saving, like «Cancelar».

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <View style={{ padding: 16 }}><ErrorNote message={q.error} onRetry={q.reload} /></View>;
  const { training, done } = q.data!;
  const exerciseList = [...training.names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  if (editing) {
    return <RoutineEditor key={editing.id} initial={editing} exercises={exerciseList} units={units} onClose={(changed) => { setEditing(null); if (changed) q.reload(); }} />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={22} w="medium">Rutinas</T>
        <Button variant="secondary" label="Nueva rutina" icon={Plus} onPress={() => setEditing(emptyDraft())} />
      </Row>
      {training.routines.length === 0 ? (
        <Empty icon={Barbell} title="Aún no tienes rutinas">Crea una con «Nueva rutina» o importa tu planilla desde la web. Aparecerán aquí y en el reloj.</Empty>
      ) : (
        training.routines.map((r) => (
          <Card key={r.id} style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T size={18} w="medium">{r.name}</T>
              <T size={12} color={c.n400}>{isoDays(r.schedule_days)}</T>
            </Row>
            {r.assigned_by ? <T size={12} color={c.a300}>De tu coach</T> : null}
            <View style={{ gap: 6 }}>
              {[...r.routine_exercises].sort((a, b) => a.position - b.position).map((it, i) => (
                <Pressable key={i} onPress={() => setHowTo({ id: it.exercise_id, name: training.names.get(it.exercise_id) ?? 'Ejercicio' })}
                  accessibilityRole="button" accessibilityHint="Muestra cómo se hace"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}>
                  <T size={14} color={c.n300} style={{ flex: 1 }}>{training.names.get(it.exercise_id) ?? 'Ejercicio'}</T>
                  <T size={13} color={c.n400}>{scheme(it)}</T>
                  <CaretRight size={14} color={c.n500} />
                </Pressable>
              ))}
            </View>
            <Button label="Empezar" icon={Play} disabled={hasLive} onPress={() => onStart(r.id, training)} />
            <Row style={{ gap: 4 }}>
              <Button variant="ghost" label="Editar" icon={PencilSimple} onPress={() => setEditing(draftFromRoutine(r, Object.fromEntries(training.names)))} />
              <Button variant="ghost" label="Duplicar" icon={Copy} busy={copying === r.id}
                onPress={async () => {
                  setCopying(r.id);
                  try { await kova.routines.duplicate(r.id, newId(), (r.name + ' (copia)').slice(0, 80)); q.reload(); } finally { setCopying(null); }
                }} />
            </Row>
          </Card>
        ))
      )}
      {hasLive ? <T size={12} color={c.n400}>Termina la sesión en curso para empezar otra.</T> : null}
      <ExerciseDetail exerciseId={howTo?.id ?? null} name={howTo?.name ?? ''} catalog={training.catalog} onClose={() => setHowTo(null)} />

      <T size={16} w="medium" style={{ marginTop: 8 }}>Historial</T>
      {done.length === 0 ? (
        <Empty icon={ClockCounterClockwise} title="Sin sesiones todavía">Tus sesiones completadas aparecerán aquí con su duración y volumen.</Empty>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {done.map((s, i) => {
            const vol = Number(s.volume_kg);
            return (
              <Row key={String(s.session_id)} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(233,233,237,0.06)' }}>
                <View style={{ flex: 1 }}>
                  <T size={14}>{String(s.name)}</T>
                  <T size={12} color={c.n400}>{dayMonth(String(s.local_date))} · {dur(Number(s.active_duration_s))}</T>
                </View>
                <T size={13} color={c.n300}>{nf(units === 'kg' ? vol : toDisplayWeight(vol, 'lb'), 0)} {units}</T>
              </Row>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}
