'use client';
/**
 * «Reportar un problema» (docs/reportes.md): quick options for the page the person is on (an exercise
 * gets options about that exercise), plus a comment for the symptom and what they were doing. Same
 * options and rules as the phone (apps/mobile/src/ReportSheet.tsx).
 */
import { composeReport, newId, reportOptions, KovaError, type ReportContext, type ReportScreen } from '@kova/domain';
import { useEffect, useState } from 'react';
import { kova } from '@/lib/client';

/** Which screen a web page is, for its quick options. */
export function screenForPath(path: string): ReportScreen {
  if (path === '/') return 'hoy';
  if (path.startsWith('/entrenamiento')) return 'entrenar';
  if (path.startsWith('/comida')) return 'comida';
  if (path.startsWith('/tendencias')) return 'progreso';
  if (path.startsWith('/importar')) return 'routine';
  if (path.startsWith('/personas') || path.startsWith('/invitar')) return 'personas';
  return 'other';
}

export function ReportDialog({ onClose, screen, context }: { onClose: () => void; screen?: ReportScreen; context?: ReportContext }) {
  const where = screen ?? screenForPath(typeof window === 'undefined' ? '/' : window.location.pathname);
  const options = reportOptions(where);
  const [picked, setPicked] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [id] = useState(newId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chosen = options.filter((o) => picked.includes(o.key));
  const canSend = chosen.length > 0 || comment.trim().length >= 3;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { category, message } = composeReport(chosen, comment, 'other');
      await kova().feedback.report({ id, category, message, context: { screen: where, ...context, symptoms: chosen.map((o) => o.key), platform: 'web' } });
      setSent(true);
    } catch (e) {
      setError(e instanceof KovaError ? e.message : 'No se pudo enviar. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Reportar un problema" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <span className="dialog-title">Reportar un problema</span>
        {sent ? (
          <>
            <span className="dialog-body">¡Gracias! Lo recibimos y lo vamos a revisar.</span>
            <div className="dialog-actions"><button className="btn btn-primary" onClick={onClose}>Cerrar</button></div>
          </>
        ) : (
          <>
            {context?.exercise_name && <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Sobre «{context.exercise_name}»</span>}
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ fontSize: 13, color: 'var(--color-neutral-300)', marginBottom: 6 }}>¿Qué pasa? Puedes marcar varias.</legend>
              {options.map((o) => (
                <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: '1px solid ' + (picked.includes(o.key) ? 'var(--color-accent)' : 'var(--color-divider, rgba(233,233,237,.16))') }}>
                  <input type="checkbox" checked={picked.includes(o.key)} onChange={() => setPicked((p) => (p.includes(o.key) ? p.filter((x) => x !== o.key) : [...p, o.key]))} />
                  {o.label}
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="report-message">Contanos más</label>
              <textarea id="report-message" className="input" rows={4} maxLength={1500} value={comment}
                onChange={(e) => setComment(e.target.value)} placeholder="Qué pasó, qué estabas haciendo, cada cuánto te pasa…" style={{ resize: 'vertical', minHeight: 90 }} />
            </div>
            {error && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy || !canSend} onClick={send}>Enviar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
