/**
 * "Cómo se hace": images (start and end position, alternating like a short animation), steps,
 * coaching cues, common errors, breathing and muscles. An exercise of the user's own (name only)
 * borrows the content of the catalog entry it matches by name.
 */
import { EQUIPMENT_LABEL, exerciseAnimation, exerciseImages, findCatalogMatch, hasHowTo, MUSCLE_LABEL, type ExerciseInstructions } from '@kova/domain';
import { X } from 'phosphor-react-native';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { kova } from '../client';
import { ExerciseFrames } from '../ExerciseFrames';
import { MannequinView } from '../MannequinView';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Card, ErrorNote, Loading, Row, T } from '../ui';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

interface ExerciseRow {
  id: string;
  name: string;
  instructions: ExerciseInstructions;
  media: unknown;
  exercise_muscles: Array<{ muscle_code: string; role: 'primary' | 'secondary' }>;
  exercise_equipment: Array<{ equipment_code: string }>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card style={{ gap: 10 }}><T size={16} w="medium">{title}</T>{children}</Card>;
}

export function ExerciseDetail({ exerciseId, name, catalog, onClose }: {
  exerciseId: string | null;
  name: string;
  /** Names of all visible exercises, when the caller already has them (else loaded on demand). */
  catalog?: Array<{ id: string; name: string; owner_id: string | null }>;
  onClose: () => void;
}) {
  const q = useAsync(async () => {
    if (!exerciseId) return null;
    const own = (await kova.exercises.get(exerciseId)) as ExerciseRow;
    if (hasHowTo(own.instructions, own.media)) return { ex: own, borrowed: false };
    const all = catalog ?? (await kova.exercises.catalog());
    const match = findCatalogMatch(own.name, all.filter((e) => e.owner_id == null && e.id !== own.id));
    if (!match) return { ex: own, borrowed: false };
    return { ex: (await kova.exercises.get(match.id)) as ExerciseRow, borrowed: true };
  }, [exerciseId]);

  const ex = q.data?.ex;
  const ins = ex?.instructions ?? {};
  const anim = ex ? exerciseAnimation(ex.media) : null;
  const urls = ex ? exerciseImages(ex.media, supabaseUrl) : [];
  const primary = ex?.exercise_muscles.filter((m) => m.role === 'primary').map((m) => MUSCLE_LABEL[m.muscle_code] ?? m.muscle_code) ?? [];
  const secondary = ex?.exercise_muscles.filter((m) => m.role === 'secondary').map((m) => MUSCLE_LABEL[m.muscle_code] ?? m.muscle_code) ?? [];
  const equipment = ex?.exercise_equipment.map((e) => EQUIPMENT_LABEL[e.equipment_code] ?? e.equipment_code) ?? [];
  const empty = ex && !hasHowTo(ins, ex.media);

  return (
    <Modal visible={exerciseId != null} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Row style={{ paddingHorizontal: 12, paddingTop: 40, paddingBottom: 8 }}>
          <T size={18} w="medium" style={{ flex: 1, paddingLeft: 8 }} numberOfLines={2}>{name}</T>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <X size={22} color={c.text} />
          </Pressable>
        </Row>
        {q.loading && !q.data ? <Loading /> : q.error ? (
          <View style={{ padding: 16 }}><ErrorNote message={q.error} onRetry={q.reload} /></View>
        ) : ex ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
            {anim ? (
              <View style={{ gap: 4 }}>
                <MannequinView spec={anim} />
                <T size={12} color={c.n400}>Arrastra para girar el modelo. Los músculos que trabajan se iluminan.</T>
              </View>
            ) : null}
            <ExerciseFrames urls={urls} />
            {q.data?.borrowed ? <T size={12} color={c.n400}>Instrucciones de «{ex.name}», el ejercicio del catálogo más parecido.</T> : null}
            {primary.length || equipment.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {primary.map((m) => <Chip key={'p' + m} label={m} strong />)}
                {secondary.map((m) => <Chip key={'s' + m} label={m} />)}
                {equipment.map((m) => <Chip key={'e' + m} label={m} muted />)}
              </View>
            ) : null}
            {empty ? (
              <Card><T size={14} color={c.n300}>Todavía no tenemos instrucciones para este ejercicio. Si lo renombras como en el catálogo (por ejemplo «Press de banca»), se muestran solas.</T></Card>
            ) : null}
            {ins.steps?.length ? (
              <Section title="Cómo hacerlo">
                {ins.steps.map((s, i) => (
                  <Row key={i} style={{ alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <T size={12} color={c.a200}>{i + 1}</T>
                    </View>
                    <T size={14} color={c.n200} style={{ flex: 1 }}>{s}</T>
                  </Row>
                ))}
              </Section>
            ) : null}
            {ins.cues?.length ? (
              <Section title="Claves">
                {ins.cues.map((cue) => (
                  <View key={cue.title} style={{ gap: 2 }}>
                    <T size={14} w="medium">{cue.title}</T>
                    <T size={13} color={c.n300}>{cue.body}</T>
                  </View>
                ))}
              </Section>
            ) : null}
            {ins.errors?.length ? (
              <Section title="Errores comunes">
                {ins.errors.map((e) => (
                  <View key={e.title} style={{ gap: 2 }}>
                    <T size={14} w="medium" color={c.warn}>{e.title}</T>
                    <T size={13} color={c.n300}>{e.fix}</T>
                  </View>
                ))}
              </Section>
            ) : null}
            {ins.breath?.length || ins.tempo ? (
              <Section title="Respiración y ritmo">
                {ins.tempo ? <T size={13} color={c.n300}>Ritmo: {ins.tempo}</T> : null}
                {ins.breath?.map((b) => <T key={b} size={13} color={c.n300}>• {b}</T>)}
              </Section>
            ) : null}
            {urls.length ? <T size={11} color={c.n600}>Imágenes: free-exercise-db (dominio público).</T> : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function Chip({ label, strong, muted }: { label: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: strong ? c.accentSoft : 'transparent', borderWidth: 1, borderColor: strong ? c.accent : c.divider }}>
      <T size={12} color={muted ? c.n400 : strong ? c.a200 : c.n300}>{label}</T>
    </View>
  );
}
