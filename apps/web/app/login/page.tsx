'use client';
import { VidaError } from '@vida/domain';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { vida } from '@/lib/client';
import { useSession } from '@/lib/session';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; cta: string; icon: string }> = {
  signin: { title: 'Inicia sesión', cta: 'Entrar', icon: 'ph ph-sign-in' },
  signup: { title: 'Crea tu cuenta', cta: 'Crear cuenta', icon: 'ph ph-user-plus' },
  forgot: { title: 'Recupera tu contraseña', cta: 'Enviar enlace', icon: 'ph ph-envelope-simple' },
};

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'signedIn') router.replace('/');
  }, [status, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const auth = vida().auth;
      if (mode === 'signin') await auth.signIn(email, password);
      else if (mode === 'signup') {
        const res = await auth.signUp(email, password);
        if (!res.session) setNotice('Revisa tu correo para confirmar la cuenta y después inicia sesión.');
      } else {
        await auth.requestPasswordReset(email, window.location.origin + '/reset-password');
        setNotice('Si existe una cuenta con ese correo, te hemos enviado un enlace para cambiar la contraseña.');
      }
    } catch (err) {
      const code = err instanceof VidaError ? err.code : 'INTERNAL';
      setError(
        mode === 'signin' && (code === 'INVALID_INPUT' || code === 'UNAUTHENTICATED' || code === 'INTERNAL')
          ? 'Correo o contraseña incorrectos.'
          : err instanceof VidaError ? err.message : 'Algo salió mal.',
      );
    } finally {
      setBusy(false);
    }
  };

  const c = COPY[mode];
  return (
    <div className="vida-auth">
      <form className="vida-auth-card" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 22, borderRadius: 3, background: 'var(--color-accent)', boxShadow: '0 0 14px var(--color-accent)' }} />
          <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: '.08em' }}>VIDA</span>
        </div>
        <h1 style={{ fontSize: 22, margin: 0 }}>{c.title}</h1>

        {error && (
          <div className="vida-error" role="alert">
            <i className="ph ph-x-circle" style={{ color: 'var(--vida-crit)', fontSize: 16, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="vida-error" role="status" style={{ borderColor: 'var(--color-divider)' }}>
            <i className="ph ph-check-circle" style={{ color: 'var(--vida-ok)', fontSize: 16, marginTop: 1 }} />
            <span>{notice}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password" className="input" type="password" required minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && (
              <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Mínimo 8 caracteres, con letras y números.</span>
            )}
          </div>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email || (mode !== 'forgot' && !password)}>
          <i className={busy ? 'ph ph-circle-notch vida-spin' : c.icon} />
          {busy ? 'Un momento…' : c.cta}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
          {mode === 'signin' ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setMode('signup')}>Crear una cuenta</button>
              <button type="button" className="btn btn-ghost" onClick={() => setMode('forgot')}>Olvidé mi contraseña</button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setMode('signin')}>Ya tengo cuenta</button>
          )}
        </div>
      </form>
    </div>
  );
}
