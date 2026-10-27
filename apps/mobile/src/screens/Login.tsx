import { VidaError } from '@vida/domain';
import { EnvelopeSimple, SignIn, UserPlus } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { vida } from '../client';
import { c } from '../theme';
import { Button, Card, Field, Notice, T } from '../ui';

type Mode = 'signin' | 'signup' | 'forgot';
const COPY = {
  signin: { title: 'Inicia sesión', cta: 'Entrar', icon: SignIn },
  signup: { title: 'Crea tu cuenta', cta: 'Crear cuenta', icon: UserPlus },
  forgot: { title: 'Recupera tu contraseña', cta: 'Enviar enlace', icon: EnvelopeSimple },
} as const;

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') await vida.auth.signIn(email.trim(), password);
      else if (mode === 'signup') {
        const res = await vida.auth.signUp(email.trim(), password);
        if (!res.session) setNotice('Te enviamos un correo para confirmar la cuenta. Ábrelo y después inicia sesión aquí.');
      } else {
        await vida.auth.requestPasswordReset(email.trim());
        setNotice('Si existe una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña.');
      }
    } catch (e) {
      const code = e instanceof VidaError ? e.code : 'INTERNAL';
      setError(mode === 'signin' && code !== 'NETWORK' && code !== 'EMAIL_NOT_CONFIRMED' && code !== 'RATE_LIMITED' ? 'Correo o contraseña incorrectos.' : e instanceof VidaError ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  };

  const k = COPY[mode];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 16, padding: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 22, borderRadius: 3, backgroundColor: c.accent }} />
            <T size={20} w="medium" style={{ letterSpacing: 1.6 }}>VIDA</T>
          </View>
          <T size={22} w="medium">{k.title}</T>
          {error ? <Notice tone="warn" text={error} /> : null}
          {notice ? <Notice text={notice} /> : null}
          <Field label="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          {mode !== 'forgot' ? (
            <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              hint={mode === 'signup' ? 'Mínimo 8 caracteres, con letras y números.' : undefined} />
          ) : null}
          <Button label={busy ? 'Un momento…' : k.cta} icon={k.icon} busy={busy} onPress={submit} disabled={!email || (mode !== 'forgot' && !password)} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {mode === 'signin' ? (
              <>
                <Button variant="ghost" label="Crear una cuenta" onPress={() => setMode('signup')} />
                <Button variant="ghost" label="Olvidé mi contraseña" onPress={() => setMode('forgot')} />
              </>
            ) : (
              <Button variant="ghost" label="Ya tengo cuenta" onPress={() => setMode('signin')} />
            )}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
