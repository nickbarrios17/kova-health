/** Progreso → "Versión de la app": installed version, code-update status, manual check. */
import { ArrowsClockwise, Info } from 'phosphor-react-native';
import { useState } from 'react';
import { checkApkUpdate, fetchOtaNow, installedVersionCode, installedVersionName, otaStatus, reloadApp, type ApkRelease } from '../appUpdate';
import { c } from '../theme';
import { Button, Card, Confirm, Notice, Row, T } from '../ui';
import { UpdatePrompt } from './UpdatePrompt';

export function VersionCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [apk, setApk] = useState<ApkRelease | null>(null);
  const [otaReady, setOtaReady] = useState(false);
  const ota = otaStatus();

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const rel = await checkApkUpdate();
      if (rel) return setApk(rel);
      if (await fetchOtaNow()) return setOtaReady(true);
      setMsg('Tenés la última versión.');
    } catch {
      setMsg('No se pudo buscar actualizaciones. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Row><Info size={18} color={c.a300} /><T size={16} w="medium" style={{ flex: 1 }}>Versión de la app</T></Row>
      <T size={13} color={c.n400}>VIDA {installedVersionName()} · compilación {installedVersionCode()}</T>
      <T size={12} color={c.n500}>{ota.label}</T>
      <Button variant="secondary" label="Buscar actualizaciones" icon={ArrowsClockwise} busy={busy} onPress={check} />
      {msg ? <Notice text={msg} /> : null}
      {apk ? <UpdatePrompt release={apk} onLater={() => setApk(null)} /> : null}
      <Confirm visible={otaReady} title="Mejora lista" message="Se descargó una actualización de VIDA. ¿Reiniciar la app ahora para usarla?"
        confirmLabel="Reiniciar" cancelLabel="Después" onConfirm={() => reloadApp()} onCancel={() => setOtaReady(false)} />
    </Card>
  );
}
