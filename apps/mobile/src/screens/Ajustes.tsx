/** Ajustes: Health Connect, app version and account (moved out of Progreso, which is only progress). */
import { KovaError } from '@kova/domain';
import { ArrowLeft, Bug, CaretRight, SignOut, Sparkle, Target, Trash, UsersThree } from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useBack } from '../back';
import { kova } from '../client';
import { NewsSheet, newsDays } from '../NewsSheet';
import { ReportSheet } from '../ReportSheet';
import { useSession } from '../session';
import { c } from '../theme';
import { Button, Card, Notice, Row, Seg, T } from '../ui';
import { HealthCard } from './HealthCard';
import { Onboarding } from './Onboarding';
import { Personas } from './Personas';
import { VersionCard } from './VersionCard';
import { useReportTarget } from '../report';

export function Ajustes({ onClose }: { onClose: () => void }) {
  const { prefs, setUnit } = useSession();
  const [recalc, setRecalc] = useState(false);
  const [report, setReport] = useState(false);
  useReportTarget('ajustes');
  const [people, setPeople] = useState(false);
  const [news, setNews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBack(!recalc && !people, onClose);
  useBack(recalc, () => setRecalc(false));

  const deleteAccount = () =>
    Alert.alert('Borrar cuenta', 'Se borrarán para siempre tu cuenta y todos tus datos (entrenamientos, comidas, hábitos, medidas). No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar todo', style: 'destructive',
        onPress: () => { kova.account.delete().catch((e) => setError(e instanceof KovaError ? e.message : 'No se pudo borrar la cuenta.')); },
      },
    ]);

  if (recalc) return <Onboarding onCancel={() => setRecalc(false)} />;
  if (people) return <Personas onClose={() => setPeople(false)} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}>
      <Row style={{ gap: 4 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <T size={22} w="medium" style={{ flex: 1 }}>Ajustes</T>
      </Row>
      {error ? <Notice tone="warn" text={error} /> : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={14}>Unidad de peso</T>
          <Seg options={[['kg', 'kg'], ['lb', 'lb']]} value={prefs!.weight_unit} onChange={setUnit} />
        </Row>
      </Card>
      <Card>
        <T size={16} w="medium">¿Algo no anda o se te ocurre una mejora?</T>
        <T size={13} color={c.n400}>Contanos sobre un ejercicio, el modelo 3D, el diseño o un error. Lo leemos todo.</T>
        <Button variant="secondary" label="Reportar un problema" icon={Bug} onPress={() => setReport(true)} />
      </Card>
      <ReportSheet visible={report} onClose={() => setReport(false)} screen="ajustes" />
      <Pressable onPress={() => setPeople(true)} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: c.surface }}>
        <UsersThree size={20} color={c.a300} />
        <View style={{ flex: 1 }}>
          <T size={15} w="medium">Coach y amigos</T>
          <T size={12} color={c.n400}>Invita a tu coach, a tus alumnos o a tus amigos</T>
        </View>
        <CaretRight size={16} color={c.n500} />
      </Pressable>
      <Pressable onPress={() => setNews(true)} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: c.surface }}>
        <Sparkle size={20} color={c.a300} />
        <View style={{ flex: 1 }}>
          <T size={15} w="medium">Novedades</T>
          <T size={12} color={c.n400}>Lo nuevo de cada actualización</T>
        </View>
        <CaretRight size={16} color={c.n500} />
      </Pressable>
      <NewsSheet visible={news} days={newsDays()} onClose={() => setNews(false)} />
      <HealthCard onSynced={() => undefined} />
      <VersionCard />
      <Card>
        <T size={16} w="medium">Cuenta</T>
        <Button variant="secondary" label="Recalcular mi meta diaria" icon={Target} onPress={() => setRecalc(true)} />
        <Button variant="secondary" label="Cerrar sesión" icon={SignOut} onPress={() => kova.auth.signOut()} />
        <View style={{ alignSelf: 'flex-start' }}><Button variant="ghost" label="Borrar mi cuenta y mis datos" icon={Trash} onPress={deleteAccount} /></View>
      </Card>
    </ScrollView>
  );
}
