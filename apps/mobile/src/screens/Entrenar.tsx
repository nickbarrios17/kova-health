/** Routines + history (prototype "Rutinas"). Editing routines comes later; they are created on web/seed for now. */
import { dayMonth, dur, isoDays, nf, toDisplayWeight } from '@vida/domain';
import { Barbell, ClockCounterClockwise, Play } from 'phosphor-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';
import { vida } from '../client';
import { useSession } from '../session';
import { c } from '../theme';
import { loadTraining, scheme, type TrainingData } from '../training';
import { useAsync } from '../useAsync';
import { Button, Card, Empty, ErrorNote, Loading, Row, T } from '../ui';

export function Entrenar({ hasLive, onStart }: { hasLive: boolean; onStart: (routineId: string, data: TrainingData) => void }) {
  const { prefs } = useSession();
  const units = prefs!.weight_unit;
  const q = useAsync(async () => {
    const [training, summaries] = await Promise.all([loadTraining(), vida.workouts.summaries(15)]);
    return { training, done: (summaries as Array<Record<string, unknown>>).filter((s) => s.status === 'completed') };
  }, []);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <View style={{ padding: 16 }}><ErrorNote message={q.error} onRetry={q.reload} /></View>;
  const { training, done } = q.data!;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <T size={22} w="medium">Rutinas</T>
      {training.routines.length === 0 ? (
        <Empty icon={Barbell} title="Aún no tienes rutinas">Crea tu primera rutina desde la web; aparecerá aquí y en el reloj.</Empty>
      ) : (
        training.routines.map((r) => (
          <Card key={r.id} style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T size={18} w="medium">{r.name}</T>
              <T size={12} color={c.n400}>{isoDays(r.schedule_days)}</T>
            </Row>
            <View style={{ gap: 6 }}>
              {[...r.routine_exercises].sort((a, b) => a.position - b.position).map((it, i) => (
                <Row key={i} style={{ justifyContent: 'space-between' }}>
                  <T size={13} color={c.n300}>{training.names.get(it.exercise_id) ?? 'Ejercicio'}</T>
                  <T size={13} color={c.n400}>{scheme(it)}</T>
                </Row>
              ))}
            </View>
            <Button label="Empezar" icon={Play} disabled={hasLive} onPress={() => onStart(r.id, training)} />
          </Card>
        ))
      )}
      {hasLive ? <T size={12} color={c.n400}>Termina la sesión en curso para empezar otra.</T> : null}

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
