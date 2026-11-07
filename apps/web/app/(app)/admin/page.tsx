'use client';
/**
 * Administración (admins only, docs/admin.md): the week at a glance and every account with its
 * activity, admin role and suspension. Shows counts and dates, never the content of anyone's data.
 */
import { ago, searchUsers, KovaError, type AdminUser } from '@kova/domain';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorNotice } from '@/components/EmptyState';
import { kova } from '@/lib/client';
import { useAsync } from '@/lib/useAsync';

type Action = { user: AdminUser; kind: 'admin' | 'suspend' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </>
  );
  return href
    ? <Link href={href} className="card" style={{ gap: 4, textDecoration: 'none', color: 'inherit' }}>{body}</Link>
    : <div className="card" style={{ gap: 4 }}>{body}</div>;
}

export default function AdminPage() {
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = useAsync(async () => {
    const c = kova();
    if (!(await c.feedback.isAdmin())) return null;
    const [overview, users] = await Promise.all([c.admin.overview(), c.admin.users()]);
    return { overview, users };
  }, []);

  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  if (q.loading && !q.data) return <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Cargando…</span>;
  if (q.data === null || !q.data) return <EmptyState icon="ph ph-lock" title="Solo para administradores">Esta página muestra las cuentas de la app.</EmptyState>;
  const { overview: o, users } = q.data;
  const rows = searchUsers(users, query);
  const now = Date.now();

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'admin') await kova().admin.setAdmin(action.user.id, !action.user.is_admin);
      else await kova().admin.setSuspended(action.user.id, !action.user.suspended);
      setAction(null);
      q.reload();
    } catch (e) {
      setError(e instanceof KovaError ? e.message : 'No se pudo cambiar.');
    } finally {
      setBusy(false);
    }
  };

  const question = !action ? '' : action.kind === 'admin'
    ? (action.user.is_admin ? `¿Quitarle el rol de administrador a ${action.user.name}?` : `¿Hacer administrador a ${action.user.name}? Va a ver todas las cuentas y los reportes.`)
    : (action.user.suspended ? `¿Reactivar la cuenta de ${action.user.name}?` : `¿Suspender la cuenta de ${action.user.name}? No va a poder entrar hasta que la reactives. Sus datos no se borran.`);

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1100 }}>
      <section aria-label="Esta semana" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Cuentas" value={o.users} />
        <Stat label="Nuevas (7 días)" value={o.new_7d} />
        <Stat label="Activas (7 días)" value={o.active_7d} />
        <Stat label="Entrenamientos (7 días)" value={o.workouts_7d} />
        <Stat label="Comidas anotadas (7 días)" value={o.meals_7d} />
        <Stat label="Reportes nuevos" value={o.reports_new} href="/reportes" />
        <Stat label="Coaches con alumnos" value={o.coach_links} />
      </section>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" type="search" placeholder="Buscar por nombre o correo" aria-label="Buscar cuentas" value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
        <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>{rows.length} de {users.length}</span>
      </div>
      {error && !action && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}

      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Cuenta</th><th>Alta</th><th>Última actividad</th><th>Entrenamientos</th><th>Esta semana</th><th>Coach</th><th>Reportes</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={u.suspended ? { opacity: 0.6 } : undefined}>
                <td>
                  <div style={{ fontWeight: 500 }}>{u.name}{u.is_admin && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-accent-200)' }}>ADMIN</span>}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{u.email}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{u.last_seen_at ? ago(u.last_seen_at, now) : 'Nunca'}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{u.workouts}</td>
                <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{u.workouts_7d} entren. · {u.meals_7d} comidas</td>
                <td style={{ fontSize: 13 }}>{[u.has_coach && 'Tiene coach', u.students > 0 && `${u.students} alumno${u.students === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || '—'}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{u.reports}</td>
                <td>{u.suspended
                  ? <span style={{ color: 'var(--kova-warn)', fontSize: 13 }}><i className="ph ph-prohibit" /> Suspendida</span>
                  : <span style={{ fontSize: 13, color: 'var(--color-neutral-300)' }}>Activa</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setAction({ user: u, kind: 'admin' })}>
                    {u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  </button>
                  {!u.is_admin && (
                    <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setAction({ user: u, kind: 'suspend' })}>
                      {u.suspended ? 'Reactivar' : 'Suspender'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
        El panel muestra cantidades y fechas, no el contenido de las comidas, el peso ni la salud de nadie.
      </span>

      {action && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar" onClick={(e) => e.target === e.currentTarget && !busy && setAction(null)}>
          <div className="dialog" style={{ width: 'min(440px, 100%)' }}>
            <span className="dialog-title">{action.kind === 'admin' ? 'Rol de administrador' : action.user.suspended ? 'Reactivar cuenta' : 'Suspender cuenta'}</span>
            <span className="dialog-body">{question}</span>
            {error && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => { setAction(null); setError(null); }}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy} onClick={confirm}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
