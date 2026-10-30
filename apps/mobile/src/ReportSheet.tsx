/**
 * «Reportar un problema» (docs/reportes.md): quick options for the screen the person is on (an exercise
 * gets options about that exercise), plus a comment for the symptom and what they were doing. The
 * screen, the exercise, the platform and the app version travel with it automatically.
 */
import { composeReport, newId, reportOptions, KovaError, type ReportContext, type ReportOption, type ReportScreen } from '@kova/domain';
import * as Application from 'expo-application';
import { Check } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { kova } from './client';
import { c, font, r } from './theme';
import { Button, Notice, Row, T } from './ui';

export function ReportSheet({ visible, onClose, screen = 'other', context }: {
  visible: boolean;
  onClose: () => void;
  screen?: ReportScreen;
  context?: ReportContext;
}) {
  const options = reportOptions(screen);
  const [picked, setPicked] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [id, setId] = useState(newId());
  useEffect(() => {
    if (!visible) return;
    setPicked([]); setComment(''); setError(null); setSent(false); setId(newId());
  }, [visible, screen]);

  const chosen: ReportOption[] = options.filter((o) => picked.includes(o.key));
  const canSend = chosen.length > 0 || comment.trim().length >= 3;
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { category, message } = composeReport(chosen, comment, 'other');
      await kova.feedback.report({
        id, category, message,
        context: {
          screen, ...context, symptoms: chosen.map((o) => o.key), platform: Platform.OS,
          app_version: Application.nativeApplicationVersion + ' (' + Application.nativeBuildVersion + ')',
        },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof KovaError ? e.message : 'No se pudo enviar. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: r.lg, borderTopRightRadius: r.lg, maxHeight: '90%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
            <T size={18} w="medium">Reportar un problema</T>
            {sent ? (
              <>
                <Notice text="¡Gracias! Lo recibimos y lo vamos a revisar." />
                <Button label="Cerrar" onPress={onClose} />
              </>
            ) : (
              <>
                {context?.exercise_name ? <T size={13} color={c.n400}>Sobre «{context.exercise_name}»</T> : null}
                <T size={13} color={c.n300}>¿Qué pasa? Puedes marcar varias.</T>
                <View style={{ gap: 6 }}>
                  {options.map((o) => {
                    const on = picked.includes(o.key);
                    return (
                      <Pressable key={o.key} onPress={() => toggle(o.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: r.md, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? c.accentSoft : 'transparent' }}>
                        <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: on ? c.accent : c.n500, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Check size={14} weight="bold" color={c.bg} /> : null}
                        </View>
                        <T size={14} color={on ? c.a100 : c.n200} style={{ flex: 1 }}>{o.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput value={comment} onChangeText={setComment} multiline maxLength={1500}
                  placeholder="Contanos más: qué pasó, qué estabas haciendo, cada cuánto te pasa…"
                  placeholderTextColor={c.n500} accessibilityLabel="Comentario"
                  style={{ minHeight: 96, textAlignVertical: 'top', padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.divider, color: c.text, fontFamily: font.regular, fontSize: 15 }} />
                {error ? <Notice tone="warn" text={error} /> : null}
                <Row style={{ gap: 8 }}>
                  <Button label="Enviar" busy={busy} disabled={!canSend} onPress={send} />
                  <Button variant="ghost" label="Cancelar" onPress={onClose} />
                </Row>
                <T size={11} color={c.n500}>Se envía con la pantalla y la versión de la app, para encontrar el problema más rápido.</T>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
