'use client';
import { VidaError } from '@vida/domain';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { vida } from '@/lib/client';
import { useSession } from '@/lib/session';

/** Landing page of the password-recovery email link (supabase-js reads the token from the URL). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { status } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await vida().auth.updatePassword(password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof VidaError ? err.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vida-auth">
      <form className="vida-auth-card" onSubmit={submit}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Elige una contraseña nueva</h1>
        {status === 'signedOut' ? (
          <div className="vida-error" role="alert">
            <i className="ph ph-warning" style={{ color: 'var(--vida-warn)', fontSize: 16, marginTop: 1 }} />
            <span>El enlace no es válido o ha caducado. Pide uno nuevo desde «Olvidé mi contraseña».</span>
          </div>
        ) : (
          <>
            {error && (
              <div className="vida-error" role="alert">
                <i className="ph ph-x-circle" style={{ color: 'var(--vida-crit)', fontSize: 16, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="password">Contraseña nueva</label>
              <input id="password" className="input" type="password" autoComplete="new-password" minLength={8} required
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Mínimo 8 caracteres, con letras y números.</span>
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || status !== 'signedIn' || password.length < 8}>
              <i className={busy ? 'ph ph-circle-notch vida-spin' : 'ph ph-check'} />
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </>
        )}
        <a href="/login" style={{ fontSize: 13 }}>Volver a iniciar sesión</a>
      </form>
    </div>
  );
}
