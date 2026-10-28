import { ago, VidaError } from '@vida/domain';
import { ArrowsClockwise, Heartbeat, Link } from 'phosphor-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import * as hc from '../health';
import { useSession } from '../session';
import { c } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Notice, Row, T } from '../ui';

/** Health Connect connection + manual sync. Read-only access to 5 data types. */
export function HealthCard({ onSynced }: { onSynced: () => void }) {
  const { prefs, deviceId } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useAsync(async () => {
    const st = await hc.status();
    return { st, granted: st === 'available' ? await hc.grantedCount() : 0, last: await hc.lastSync() };
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      q.reload();
      onSynced();
    } catch (e) {
      setMsg(e instanceof VidaError ? e.message : 'No se pudo sincronizar. Revisa los permisos de Health Connect.');
    } finally {
      setBusy(false);
    }
  };
  const doSync = () => run(async () => {
    const n = await hc.sync(prefs!.time_zone, deviceId, 30);
    return n === 0 ? 'Todo estaba al día.' : `${n} ${n === 1 ? 'dato nuevo' : 'datos nuevos'} importados.`;
  });

  if (!q.data) return null;
  const { st, granted, last } = q.data;
  return (
    <Card>
      <Row><Heartbeat size={18} color={c.a300} /><T size={16} w="medium" style={{ flex: 1 }}>Health Connect</T></Row>
      {st === 'unsupported' ? (
        <T size={13} color={c.n400}>Disponible solo en Android.</T>
      ) : st !== 'available' ? (
        <View style={{ gap: 8 }}>
          <T size={13} color={c.n400}>
            {st === 'needs_update' ? 'Actualiza Health Connect desde Play Store para conectarlo.' : 'Instala Health Connect desde Play Store (en Android 14 o superior ya viene con el sistema).'}
          </T>
          <Button variant="secondary" label="Reintentar" onPress={q.reload} />
        </View>
      ) : granted === 0 ? (
        <View style={{ gap: 8 }}>
          <T size={13} color={c.n400}>Importa pasos, sueño, peso, % de grasa corporal, frecuencia cardíaca en reposo y HRV desde tu reloj o tus apps de salud. Solo lectura: VIDA no escribe en Health Connect.</T>
          <Button label="Conectar" icon={Link} busy={busy} onPress={() => run(async () => {
            const n = await hc.connect();
            if (n === 0) return 'No diste permiso a ningún dato. Puedes cambiarlo cuando quieras.';
            await hc.sync(prefs!.time_zone, deviceId, 30);
            return `Conectado (${n} de ${hc.PERMISSION_COUNT} tipos de datos).`;
          })} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <T size={13} color={c.n400}>Conectado · {granted} de {hc.PERMISSION_COUNT} tipos de datos · Última sincronización: {last ? ago(last).toLowerCase() : 'nunca'}</T>
          {granted < hc.PERMISSION_COUNT ? (
            <>
              <Notice text="Hay datos nuevos para importar, como el % de grasa de tu reloj: mejoran el cálculo de tu meta diaria." />
              <Button label="Permitir los datos que faltan" icon={Link} busy={busy} onPress={() => run(async () => {
                const n = await hc.connect();
                await hc.sync(prefs!.time_zone, deviceId, 30);
                return `Conectado (${n} de ${hc.PERMISSION_COUNT} tipos de datos).`;
              })} />
            </>
          ) : null}
          <Button variant="secondary" label="Sincronizar ahora" icon={ArrowsClockwise} busy={busy} onPress={doSync} />
          <Button variant="ghost" label="Cambiar permisos" onPress={() => hc.openSettings()} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
      {msg ? <Notice text={msg} /> : null}
    </Card>
  );
}
