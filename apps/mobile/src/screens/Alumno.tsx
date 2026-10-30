/**
 * A student, seen by their coach (docs/coach.md): their routines, which the coach creates, edits and
 * deletes with the same editor as one's own. Everything goes through kova.people (checked server-side).
 */
import type { CoachRoutine } from '@kova/api-client';
import { draftFromRoutine, emptyDraft, isoDays, type PersonLink, type RoutineDraft } from '@kova/domain';
import { ArrowLeft, Barbell, PencilSimple, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useBack } from '../back';
import { useReportTarget } from '../report';
import { kova } from '../client';
import { useSession } from '../session';
import { c } from '../theme';
import { scheme } from '../training';
import { useAsync } from '../useAsync';
import { Button, Card, Empty, ErrorNote, Loading, Row, T } from '../ui';
import { RoutineEditor } from './RoutineEditor';

export function Alumno({ link, onClose }: { link: PersonLink; onClose: () => void }) {
  const { prefs } = useSession();
  const owner = link.person_id;
  const [editing, setEditing] = useState<RoutineDraft | null>(null);
  useBack(editing == null, onClose);
  useReportTarget('personas');

  const q = useAsync(async () => {
    const [routines, own, catalog] = await Promise.all([kova.people.routines(owner), kova.people.exercises(owner), kova.exercises.catalog()]);
    // The editor offers the catalog plus the student's own exercises (never the coach's private ones).
    const exercises = [...catalog.filter((e) => e.owner_id == null), ...own]
      .map((e) => ({ id: e.id, name: e.short_name ?? e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { routines: routines as CoachRoutine[], exercises };
  }, [owner]);

  if (editing && q.data) {
    const names = Object.fromEntries(q.data.exercises.map((e) => [e.id, e.name]));
    for (const r of q.data.routines) for (const it of r.routine_exercises) names[it.exercise_id] ??= it.exercise_name;
    return (
      <RoutineEditor key={editing.id} initial={editing} exercises={q.data.exercises} units={prefs!.weight_unit} ownerId={owner}
        title={(editing.version == null ? 'Nueva rutina para ' : 'Rutina de ') + link.person_name}
        onClose={(changed) => { setEditing(null); if (changed) q.reload(); }} />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <Row style={{ gap: 4 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T size={22} w="medium">{link.person_name}</T>
          <T size={12} color={c.n400}>Tu alumno · {link.sessions_7d ? link.sessions_7d + (link.sessions_7d === 1 ? ' entrenamiento' : ' entrenamientos') + ' esta semana' : 'sin entrenar esta semana'}</T>
        </View>
      </Row>

      <Row style={{ justifyContent: 'space-between' }}>
        <T size={18} w="medium">Rutinas</T>
        <Button variant="secondary" label="Nueva rutina" icon={Plus} disabled={!q.data} onPress={() => setEditing(emptyDraft())} />
      </Row>

      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : q.data!.routines.length === 0 ? (
        <Empty icon={Barbell} title={link.person_name + ' todavía no tiene rutinas'}>Arma la primera con «Nueva rutina»: le aparece en el celular y en el reloj.</Empty>
      ) : q.data!.routines.map((r) => (
        <Card key={r.id} style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={17} w="medium" style={{ flex: 1 }}>{r.name}</T>
            <T size={12} color={c.n400}>{isoDays(r.schedule_days)}</T>
          </Row>
          {r.assigned_by == null ? <T size={12} color={c.n500}>Creada por {link.person_name}</T> : null}
          <View style={{ gap: 6 }}>
            {r.routine_exercises.map((it) => (
              <Row key={it.id} style={{ justifyContent: 'space-between' }}>
                <T size={13} color={c.n300} style={{ flex: 1 }}>{it.exercise_name}</T>
                <T size={13} color={c.n400}>{scheme(it)}</T>
              </Row>
            ))}
          </View>
          <View style={{ alignSelf: 'flex-start' }}>
            <Button variant="ghost" label="Editar" icon={PencilSimple}
              onPress={() => setEditing(draftFromRoutine(r, Object.fromEntries(r.routine_exercises.map((it) => [it.exercise_id, it.exercise_name]))))} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
