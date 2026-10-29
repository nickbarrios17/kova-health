'use client';
/**
 * «Reportar un problema» (docs/reportes.md): pick what it is about, write what happened, send. The page,
 * the exercise (if any) and the browser travel with it automatically. Same rules as the phone.
 */
import { newId, REPORT_CATEGORIES, KovaError, type ReportCategory, type ReportContext } from '@kova/domain';
import { useEffect, useState } from 'react';
import { kova } from '@/lib/client';

export function ReportDialog({ onClose, category = 'bug', context }: { onClose: () => void; category?: ReportCategory; context?: ReportContext }) {
  const [cat, setCat] = useState<ReportCategory>(category);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [id] = useState(newId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await kova().feedback.report({ id, category: cat, message, context: { screen: window.location.pathname, ...context, platform: 'web' } });
      setSent(true);
    } catch (e) {
      setError(e instanceof KovaError ? e.message : 'No se pudo enviar. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Reportar un problema" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(520px, 100%)' }}>
        <span className="dialog-title">Reportar un problema</span>
        {sent ? (
          <>
            <span className="dialog-body">¡Gracias! Lo recibimos y lo vamos a revisar.</span>
            <div className="dialog-actions"><button className="btn btn-primary" onClick={onClose}>Cerrar</button></div>
          </>
        ) : (
          <>
            {context?.exercise_name && <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Sobre «{context.exercise_name}»</span>}
            <div role="radiogroup" aria-label="Sobre qué es" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {REPORT_CATEGORIES.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={cat === k} className={'kova-chip' + (cat === k ? ' strong' : '')}
                  style={{ cursor: 'pointer', background: cat === k ? undefined : 'transparent', font: 'inherit', fontSize: 12 }} onClick={() => setCat(k)}>{label}</button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="report-message">¿Qué pasó o qué cambiarías?</label>
              <textarea id="report-message" className="input" rows={5} maxLength={2000} value={message} autoFocus
                onChange={(e) => setMessage(e.target.value)} placeholder="Si es un error, cuéntanos qué estabas haciendo." style={{ resize: 'vertical', minHeight: 110 }} />
            </div>
            {error && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy || message.trim().length < 3} onClick={send}>Enviar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
