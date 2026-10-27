/** Weight, mood, habits (with streaks) and account actions. */
import {
  addDays, dailyStreak, dayMonth, fromDisplayWeight, localDate, MOODS, newId, nf, toDisplayWeight, VidaError, type HabitDay,
} from '@vida/domain';
import { Check, Flame, Plus, Scales, SignOut, Smiley, SmileyMeh, SmileyNervous, SmileySad, SmileyWink, Trash, type Icon } from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { outbox, vida } from '../client';
import { useSession } from '../session';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Empty, ErrorNote, Field, Loading, Notice, Row, T } from '../ui';
import { HealthCard } from './HealthCard';

const MOOD_ICONS: Icon[] = [SmileySad, SmileyNervous, SmileyMeh, Smiley, SmileyWink];

export function Progreso() {
  const { prefs, deviceId } = useSession();
  const tz = prefs!.time_zone;
  const units = prefs!.weight_unit;
  const today = localDate(new Date(), tz);
  const [weight, setWeight] = useState('');
  const [habitName, setHabitName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = useAsync(async () => {
    const [weights, habits, days, moods] = await Promise.all([
      vida.body.history('weight_kg', 10),
      vida.habits.list(),
      vida.habits.days(addDays(today, -60), today),
      vida.health.series('mood', today, today),
    ]);
    return {
      weights: weights as Array<{ id: string; value: number | string; local_date: string }>,
      habits: habits as Array<{ id: string; name: string; unit: string | null; habit_schedules: Array<{ target_value: number | null }> }>,
      days: days as Array<HabitDay & { habit_id: string }>,
      mood: (moods as Array<{ value: number | string; start_at: string }>).at(-1),
    };
  }, [today]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      q.reload();
    } catch (e) {
      setError(e instanceof VidaError ? e.message : 'Algo salió mal.');
    }
  };

  const saveWeight = () => run(async () => {
    const v = Number(weight.replace(',', '.'));
    await outbox.enqueue({ kind: 'record_measurement', input: { id: newId(), metric: 'weight_kg', value: fromDisplayWeight(v, units), measured_at: new Date().toISOString(), time_zone: tz, device_id: deviceId } });
    await outbox.flush();
    setWeight('');
  });

  const logMood = (m: number) => run(async () => {
    await outbox.enqueue({ kind: 'record_observation', input: { id: newId(), metric: 'mood', value: m, start_at: new Date().toISOString(), time_zone: tz, device_id: deviceId } });
    await outbox.flush();
  });

  const toggleHabit = (habitId: string, done: boolean) => run(async () => {
    if (!done) {
      await outbox.enqueue({ kind: 'log_habit', input: { id: newId(), habit_id: habitId, local_date: today, device_id: deviceId } });
      await outbox.flush();
    } else {
      // Undo today's logs for this habit.
      const logs = await vida.supabase.from('habit_logs').select('id').eq('habit_id', habitId).eq('local_date', today).is('deleted_at', null);
      for (const l of logs.data ?? []) await vida.habits.unlog(l.id as string);
    }
  });

  const addHabit = () => run(async () => {
    await vida.habits.save({ id: newId(), name: habitName.trim(), effective_from: today });
    setHabitName('');
  });

  const deleteAccount = () =>
    Alert.alert('Borrar cuenta', 'Se borrarán para siempre tu cuenta y todos tus datos (entrenamientos, comidas, hábitos, medidas). No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar todo', style: 'destructive', onPress: () => run(() => vida.account.delete()) },
    ]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <View style={{ padding: 16 }}><ErrorNote message={q.error} onRetry={q.reload} /></View>;
  const { weights, habits, days, mood } = q.data!;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
      <T size={22} w="medium">Progreso</T>
      {error ? <Notice tone="warn" text={error} /> : null}

      <Card>
        <Row><Smiley size={18} color={c.a300} /><T size={16} w="medium" style={{ flex: 1 }}>¿Cómo te sientes hoy?</T></Row>
        <Row style={{ justifyContent: 'space-between' }}>
          {MOOD_ICONS.map((Ic, i) => {
            const on = mood != null && Number(mood.value) === i + 1;
            return (
              <Pressable key={i} onPress={() => logMood(i + 1)} accessibilityLabel={MOODS[i]} accessibilityState={{ selected: on }}
                style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? 'rgba(145,132,217,0.2)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Ic size={26} color={on ? c.a100 : c.n300} weight={on ? 'fill' : 'regular'} />
              </Pressable>
            );
          })}
        </Row>
        <T size={13} color={c.a300}>{mood ? MOODS[Number(mood.value) - 1] : 'Sin registrar hoy'}</T>
      </Card>

      <Card>
        <Row><Scales size={18} color={c.a300} /><T size={16} w="medium" style={{ flex: 1 }}>Peso</T></Row>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label={'Peso de hoy (' + units + ')'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
          <Button label="Guardar" onPress={saveWeight} disabled={!(Number(weight.replace(',', '.')) > 0)} />
        </Row>
        {weights.length === 0 ? <T size={13} color={c.n400}>Aún no hay mediciones.</T> : weights.map((w) => (
          <Row key={w.id} style={{ justifyContent: 'space-between' }}>
            <T size={13} color={c.n300}>{dayMonth(w.local_date)}</T>
            <T size={13}>{nf(units === 'kg' ? Number(w.value) : toDisplayWeight(Number(w.value), 'lb'), 1)} {units}</T>
          </Row>
        ))}
      </Card>

      <Card>
        <Row><Flame size={18} color={c.a300} /><T size={16} w="medium" style={{ flex: 1 }}>Hábitos de hoy</T></Row>
        {habits.length === 0 ? <Empty title="Sin hábitos">Crea uno abajo: por ejemplo «Agua», «Movilidad» o «Leer».</Empty> : habits.map((h) => {
          const hd = days.filter((d) => d.habit_id === h.id);
          const t = hd.find((d) => d.local_date === today);
          const done = !!t?.completed;
          const streak = dailyStreak(hd, today);
          return (
            <Row key={h.id}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={h.name} disabled={t ? !t.scheduled && !done : false}
                onPress={() => toggleHabit(h.id, done)}
                style={{ width: 44, height: 44, borderRadius: r.md, borderWidth: 1, borderColor: done ? c.accent : c.divider, backgroundColor: done ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={18} weight="bold" color={done ? c.bg : c.n400} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <T size={14}>{h.name}</T>
                <T size={12} color={c.n400}>{t && !t.scheduled ? 'Hoy no toca' : t && Number(t.target_value) > 1 ? nf(Number(t.value), 0) + ' de ' + nf(Number(t.target_value), 0) + (h.unit ? ' ' + h.unit : '') : done ? 'Hecho' : 'Pendiente'}</T>
              </View>
              <Row style={{ gap: 4 }}><Flame size={14} color={streak ? c.warn : c.n600} /><T size={13} color={c.n300}>{streak} {streak === 1 ? 'día' : 'días'}</T></Row>
            </Row>
          );
        })}
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="Nuevo hábito diario" value={habitName} onChangeText={setHabitName} placeholder="Ej.: Movilidad" /></View>
          <Button label="Crear" icon={Plus} onPress={addHabit} disabled={!habitName.trim()} />
        </Row>
      </Card>

      <HealthCard onSynced={q.reload} />

      <Card>
        <T size={16} w="medium">Cuenta</T>
        <Button variant="secondary" label="Cerrar sesión" icon={SignOut} onPress={() => vida.auth.signOut()} />
        <Button variant="ghost" label="Borrar mi cuenta y mis datos" icon={Trash} onPress={deleteAccount} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </ScrollView>
  );
}
