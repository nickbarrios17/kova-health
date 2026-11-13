/**
 * «Del reloj»: what Samsung Health (or another app) measured today, read from Health Connect: the
 * workouts it recorded with their calories, the day's totals and the latest vitals and body readings.
 * Hidden when there is nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exerciseName, nf, watchRows } from '@kova/domain';
import { Watch } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { kova } from '../client';
import * as hc from '../health';
import { useSession } from '../session';
import { c, rad } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Notice, Row, T } from '../ui';

// Asked once: whatever the person declines there stays declined (they can change it in Health Connect).
const ASKED_KEY = 'kova:hc-asked-all';

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

export function WatchCard({ today, onSynced }: { today: string; onSynced?: () => void }) {
  const { prefs, deviceId } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useAsync(async () => {
    const [values, workouts] = await Promise.all([kova.health.day(today).catch(() => []), kova.health.watchWorkouts(today).catch(() => [])]);
    // Connected but without the new data types (workouts, pulse, pressure…): offer to allow them.
    const missing = Platform.OS === 'android' && !(await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) && (await hc.status()) === 'available'
      ? await hc.grantedCount().then((n) => n > 0 && n < hc.PERMISSION_COUNT) : false;
    return { rows: watchRows(values, today), workouts, missing };
  }, [today]);
  const allow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await hc.connect();
      await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
      const n = await hc.sync(prefs!.time_zone, deviceId, 30);
      setMsg(n ? n + ' datos nuevos de tu reloj.' : 'Listo. Si no ves datos nuevos, abrí Samsung Health y sincronizalo con Health Connect.');
      q.reload();
      onSynced?.();
    } catch {
      setMsg('No se pudo. Revisá los permisos en Health Connect.');
    } finally {
      setBusy(false);
    }
  };
  if (!q.data || (!q.data.rows.length && !q.data.workouts.length && !q.data.missing)) return null;
  const { rows, workouts, missing } = q.data;
  return (
    <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 12 }}>
      <Row style={{ gap: 8 }}>
        <Watch size={18} color={c.a400} />
        <T size={17} w="semibold" accessibilityRole="header" style={{ flex: 1 }}>Del reloj</T>
      </Row>
      {missing ? (
        <View style={{ gap: 8 }}>
          <T size={13} color={c.n400}>Kova ahora puede traer tus entrenos de Samsung Health con sus calorías, y el pulso, la presión, el oxígeno y más. Tenés que permitirlo una vez.</T>
          <Button label="Traer todo lo del reloj" icon={Watch} busy={busy} onPress={allow} />
        </View>
      ) : null}
      {msg ? <Notice text={msg} /> : null}
      {workouts.length ? (
        <View style={{ gap: 6 }}>
          {workouts.map((w) => {
            const kcal = typeof w.details.kcal === 'number' ? w.details.kcal : null;
            return (
              <Row key={w.id} style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T size={15} w="medium">{exerciseName(Number(w.details.exercise_type), typeof w.details.title === 'string' ? w.details.title : null)}</T>
                  <T size={12} color={c.n400}>{hhmm(w.start_at)} · {nf(Number(w.value), 0)} min{kcal != null ? ' · ' + nf(kcal, 0) + ' kcal' + (w.details.kcal_from_total ? ' (aprox.)' : '') : ''}</T>
                </View>
              </Row>
            );
          })}
          <T size={12} color={c.n500}>Cuentan como entreno y suman a tu meta de calorías de hoy.</T>
        </View>
      ) : null}
      {rows.length ? (
        <View style={{ gap: 6 }}>
          {rows.map((r) => (
            <Row key={r.key} style={{ justifyContent: 'space-between', gap: 8 }}>
              <T size={14} color={c.n300}>{r.label}</T>
              <T size={14} w="medium">{r.value}{r.when ? <T size={12} color={c.n500}>{'  · ' + r.when}</T> : null}</T>
            </Row>
          ))}
        </View>
      ) : null}
      <T size={11} color={c.n500}>Datos de Samsung Health y tus otras apps, vía Health Connect, tal como los midieron.</T>
    </View>
  );
}
