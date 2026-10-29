/** "Actualizar app": a new APK is available. Downloads it and opens Android's installer. */
import { DownloadSimple } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { downloadAndInstall, isMandatory, type ApkRelease } from '../appUpdate';
import { c, r } from '../theme';
import { Button, ErrorNote, T } from '../ui';

export function UpdatePrompt({ release, onLater }: { release: ApkRelease; onLater: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mandatory = isMandatory(release);

  const update = async () => {
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstall(release, setProgress);
      // Android's installer is now on screen; the app restarts on its own after installing.
      setProgress(null);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={mandatory ? () => undefined : onLater}>
      <View style={{ flex: 1, backgroundColor: 'rgba(8,9,16,0.72)', justifyContent: 'center', padding: 24 }}>
        <View accessibilityViewIsModal style={{ backgroundColor: c.surface, borderRadius: r.lg, borderWidth: 1, borderColor: c.divider, padding: 20, gap: 12 }}>
          <T size={18} w="medium" accessibilityRole="header">Hay una versión nueva de Kova Health</T>
          <T size={14} color={c.n300}>
            Versión {release.versionName}.{release.notes ? ' ' + release.notes : ''}
          </T>
          <T size={12} color={c.n400}>
            {mandatory
              ? 'Esta actualización es necesaria para seguir usando la app.'
              : 'Se descarga y se abre el instalador de Android: tocá «Instalar». Tus datos no se pierden.'}
          </T>
          {progress != null ? (
            <View style={{ gap: 6 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.bg, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: c.accent }} />
              </View>
              <T size={12} color={c.n400}>Descargando… {Math.round(progress * 100)} %</T>
            </View>
          ) : null}
          {error ? <ErrorNote message={error} /> : null}
          <View style={{ gap: 8, marginTop: 4 }}>
            <Button label="Actualizar" icon={DownloadSimple} busy={progress != null} onPress={update} />
            {!mandatory ? <Button variant="secondary" label="Más tarde" onPress={onLater} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
