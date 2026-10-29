/**
 * «Reportar un problema» (docs/reportes.md): pick what it is about, write what happened, send. The
 * screen, the exercise (if any), the platform and the app version travel with it automatically.
 */
import { newId, REPORT_CATEGORIES, KovaError, type ReportCategory, type ReportContext } from '@kova/domain';
import * as Application from 'expo-application';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { kova } from './client';
import { c, font, r } from './theme';
import { Button, Notice, Row, T } from './ui';

export function ReportSheet({ visible, onClose, category = 'bug', context }: {
  visible: boolean;
  onClose: () => void;
  category?: ReportCategory;
  context?: ReportContext;
}) {
  const [cat, setCat] = useState<ReportCategory>(category);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [id, setId] = useState(newId());
  useEffect(() => {
    if (!visible) return;
    setCat(category); setMessage(''); setError(null); setSent(false); setId(newId());
  }, [visible, category]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await kova.feedback.report({
        id, category: cat, message,
        context: { ...context, platform: Platform.OS, app_version: Application.nativeApplicationVersion + ' (' + Application.nativeBuildVersion + ')' },
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
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <T size={18} w="medium">Reportar un problema</T>
            {sent ? (
              <>
                <Notice text="¡Gracias! Lo recibimos y lo vamos a revisar." />
                <Button label="Cerrar" onPress={onClose} />
              </>
            ) : (
              <>
                {context?.exercise_name ? <T size={13} color={c.n400}>Sobre «{context.exercise_name}»</T> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {REPORT_CATEGORIES.map(([k, label]) => {
                    const on = cat === k;
                    return (
                      <Pressable key={k} onPress={() => setCat(k)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                        style={{ paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? c.accentSoft : 'transparent' }}>
                        <T size={13} color={on ? c.a200 : c.n300}>{label}</T>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput value={message} onChangeText={setMessage} multiline maxLength={2000} autoFocus
                  placeholder="¿Qué pasó o qué cambiarías? Si es un error, cuéntanos qué estabas haciendo."
                  placeholderTextColor={c.n500} accessibilityLabel="Mensaje"
                  style={{ minHeight: 120, textAlignVertical: 'top', padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.divider, color: c.text, fontFamily: font.regular, fontSize: 15 }} />
                {error ? <Notice tone="warn" text={error} /> : null}
                <Row style={{ gap: 8 }}>
                  <Button label="Enviar" busy={busy} disabled={message.trim().length < 3} onPress={send} />
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
