'use client';
/** Reportes (admins only, docs/reportes.md): every report sent from the apps, to decide what to work on. */
import { REPORT_CATEGORY_LABEL, REPORT_STATUS_LABEL, KovaError, type AdminReport, type ReportStatus } from '@kova/domain';
import { useState } from 'react';
import { EmptyState, ErrorNotice } from '@/components/EmptyState';
import { kova } from '@/lib/client';
import { useAsync } from '@/lib/useAsync';

const FILTERS: Array<[ReportStatus | '', string]> = [['new', 'Nuevos'], ['seen', 'Vistos'], ['done', 'Resueltos'], ['dismissed', 'Descartados'], ['', 'Todos']];
const fmt = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ReportesPage() {
  const [filter, setFilter] = useState<ReportStatus | ''>('new');
  const [error, setError] = useState<string | null>(null);
  const q = useAsync(async () => {
    const c = kova();
    if (!(await c.feedback.isAdmin())) return null;
    return c.feedback.all(filter || undefined);
  }, [filter]);

  const set = async (r: AdminReport, status: ReportStatus) => {
    setError(null);
    try { await kova().feedback.setStatus(r.id, status, r.admin_note ?? undefined); q.reload(); } catch (e) { setError(e instanceof KovaError ? e.message : 'No se pudo cambiar.'); }
  };

  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  if (q.loading && !q.data) return <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Cargando…</span>;
  if (q.data === null) return <EmptyState icon="ph ph-lock" title="Solo para administradores">Esta página muestra los reportes de todos los usuarios.</EmptyState>;
  const rows = q.data ?? [];

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 980 }}>
      <div className="seg" role="tablist" aria-label="Estado" style={{ justifySelf: 'start' }}>
        {FILTERS.map(([k, label]) => (
          <button key={k || 'all'} role="tab" aria-selected={filter === k} className="seg-opt" onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {error && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}
      {rows.length === 0 ? (
        <EmptyState icon="ph ph-check-circle" title="No hay reportes acá">Cuando alguien reporte algo desde la app o la web, aparece en esta lista.</EmptyState>
      ) : (
        <table className="table">
          <thead><tr><th>Fecha</th><th>Quién</th><th>Sobre</th><th>Mensaje</th><th>Estado</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                <td>{r.reporter_name}</td>
                <td>
                  {REPORT_CATEGORY_LABEL[r.category]}
                  {r.context.exercise_name && <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{r.context.exercise_name}</div>}
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{[r.context.platform, r.context.screen, r.context.app_version].filter(Boolean).join(' · ')}</div>
                </td>
                <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{r.message}</td>
                <td>
                  <select className="input" value={r.status} onChange={(e) => set(r, e.target.value as ReportStatus)} aria-label="Estado del reporte">
                    {(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((s) => <option key={s} value={s}>{REPORT_STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
