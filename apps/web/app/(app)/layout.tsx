'use client';
/** App shell: sidebar + header, markup ported from design/prototypes/VIDA Web v2.dc.html. */
import { newId } from '@kova/domain';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { KovaMark } from '@/components/KovaMark';
import { NewsDialog, NewsOnOpen, newsDays } from '@/components/NewsDialog';
import { Onboarding } from '@/components/Onboarding';
import { ReportDialog } from '@/components/ReportDialog';
import { Banner, ToastProvider, useOnline } from '@/components/ui';
import { kova } from '@/lib/client';
import { ago, greeting, headerDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';

const NAV: Array<[href: string, label: string, icon: string]> = [
  ['/', 'Hoy', 'ph-squares-four'],
  ['/tendencias', 'Tendencias', 'ph-chart-line'],
  ['/comida', 'Comida', 'ph-fork-knife'],
  ['/entrenamiento', 'Entrenamiento', 'ph-barbell'],
  ['/ciclismo', 'Ciclismo', 'ph-bicycle'],
  ['/coach', 'Coach', 'ph-lightbulb-filament'],
  ['/personas', 'Coach y amigos', 'ph-users-three'],
];
const TITLES: Record<string, string> = { '/importar': 'Importar rutinas', '/tendencias': 'Tendencias', '/comida': 'Comida', '/entrenamiento': 'Entrenamiento', '/ciclismo': 'Ciclismo', '/coach': 'Coach', '/personas': 'Coach y amigos', '/reportes': 'Reportes recibidos', '/admin': 'Administración' };
const DEVICE_ICON: Record<string, string> = { watch: 'ph ph-watch', mobile: 'ph ph-device-mobile', web: 'ph ph-desktop' };
const DEVICE_KEY = 'kova:web-device-id';

/** This browser's device id (a per-browser convenience; losing it only creates a new device row). */
function webDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return newId();
  }
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { status, prefs, setUnit, loadError, retryLoad } = useSession();
  const [now, setNow] = useState(() => new Date());
  const [recalc, setRecalc] = useState(false);
  const [report, setReport] = useState(false);
  const [news, setNews] = useState(false);
  const online = useOnline();

  useEffect(() => {
    if (status === 'signedOut') router.replace(path === '/' ? '/login' : '/login?next=' + encodeURIComponent(path));
  }, [status, router, path]);
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const admin = useAsync(async () => (status === 'signedIn' ? kova().feedback.isAdmin().catch(() => false) : false), [status]);

  const devices = useAsync(async () => {
    if (status !== 'signedIn') return [];
    const c = kova();
    await c.devices.register({ id: webDeviceId(), kind: 'web', label: 'Esta web', platform: 'web' }).catch(() => undefined);
    return (await c.devices.list()) as Array<{ id: string; kind: string; label: string | null; last_seen_at: string | null }>;
  }, [status]);

  if (status === 'signedIn' && !prefs && loadError) {
    return (
      <div className="kova-auth">
        <div className="kova-auth-card" role="alert">
          <h1 style={{ fontSize: 20, margin: 0 }}>No pudimos cargar tu cuenta</h1>
          <span style={{ fontSize: 14, color: 'var(--kova-text-2)' }}>Revisá tu conexión a internet e intentalo de nuevo.</span>
          <button className="btn btn-primary" onClick={retryLoad}><i className="ph ph-arrow-clockwise" />Reintentar</button>
          <button className="btn btn-secondary" onClick={() => kova().auth.signOut().then(() => router.replace('/login'))}>Cerrar sesión</button>
        </div>
      </div>
    );
  }
  if (status !== 'signedIn' || !prefs) {
    return (
      <div role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--kova-text-2)', fontFamily: 'var(--font-body)' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><i className="ph ph-circle-notch kova-spin" />Cargando…</span>
      </div>
    );
  }

  if (!prefs.onboarded || recalc) return <Onboarding onClose={prefs.onboarded ? () => setRecalc(false) : undefined} />;

  const title = path === '/' ? greeting(now, prefs.time_zone) + (prefs.display_name ? ', ' + prefs.display_name : '') : TITLES[path] ?? 'Kova Health';

  return (
    <ToastProvider>
    <div className="kova-shell">
      <a className="kova-skip" href="#contenido">Saltar al contenido</a>
      <aside className="kova-side" data-screen-label="Barra lateral" aria-label="Navegación principal">
        <div className="kova-side-brand">
          <KovaMark size={28} />
          <span className="kova-side-label" style={{ fontSize: 17, fontWeight: 600 }}>Kova Health</span>
        </div>
        <nav className="kova-side-nav">
          {NAV.map(([href, label, icon]) => {
            const on = path === href;
            return (
              <Link key={href} href={href} className="kova-side-item" aria-current={on ? 'page' : undefined} aria-label={label} data-tip={label}>
                <i className={(on ? 'ph-fill ' : 'ph ') + icon} aria-hidden style={{ fontSize: 20, color: on ? 'var(--kova-accent-text)' : undefined }} />
                <span className="kova-side-label" style={{ flex: 1 }}>{label}</span>
              </Link>
            );
          })}
          {admin.data && (
            <>
              <span className="kova-side-sep" role="separator" />
              <Link href="/reportes" className="kova-side-item" aria-current={path === '/reportes' ? 'page' : undefined} aria-label="Reportes" data-tip="Reportes">
                <i className={(path === '/reportes' ? 'ph-fill' : 'ph') + ' ph-flag'} aria-hidden style={{ fontSize: 20 }} /><span className="kova-side-label">Reportes</span>
              </Link>
              <Link href="/admin" className="kova-side-item" aria-current={path === '/admin' ? 'page' : undefined} aria-label="Administración" data-tip="Administración">
                <i className={(path === '/admin' ? 'ph-fill' : 'ph') + ' ph-shield'} aria-hidden style={{ fontSize: 20 }} /><span className="kova-side-label">Administración</span>
              </Link>
            </>
          )}
        </nav>
        <div className="kova-side-foot">
          <span className="kova-side-label" style={{ fontSize: 12, fontWeight: 500, color: 'var(--kova-text-3)', padding: '0 10px' }}>Dispositivos</span>
          {(devices.data ?? []).slice(0, 4).map((d) => (
            <div key={d.id} className="kova-side-device" data-tip={(d.label ?? d.kind) + ' · ' + ago(d.last_seen_at, now.getTime())} tabIndex={-1}>
              <i className={DEVICE_ICON[d.kind] ?? 'ph ph-device-mobile'} aria-hidden style={{ fontSize: 18, color: 'var(--kova-text-2)' }} />
              <span className="kova-side-label" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{d.label ?? d.kind}</span>
                <span style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>{d.last_seen_at ? '✓ ' : ''}{ago(d.last_seen_at, now.getTime())}</span>
              </span>
            </div>
          ))}
          <button className="kova-side-item" onClick={() => setNews(true)} aria-label="Novedades" data-tip="Novedades">
            <i className="ph ph-sparkle" aria-hidden style={{ fontSize: 20 }} /><span className="kova-side-label">Novedades</span>
          </button>
          <button className="kova-side-item" aria-label="Versión para celular" data-tip="Versión para celular"
            onClick={() => { try { localStorage.removeItem('kova:prefer-desktop'); } catch { /* not remembered */ } window.location.assign('/m?celular'); }}>
            <i className="ph ph-device-mobile" aria-hidden style={{ fontSize: 20 }} /><span className="kova-side-label">Versión para celular</span>
          </button>
          <button className="kova-side-item" onClick={() => setRecalc(true)} aria-label="Recalcular meta" data-tip="Recalcular meta">
            <i className="ph ph-target" aria-hidden style={{ fontSize: 20 }} /><span className="kova-side-label">Recalcular meta</span>
          </button>
          <button className="kova-side-item" aria-label="Cerrar sesión" data-tip="Cerrar sesión"
            onClick={() => kova().auth.signOut().then(() => router.replace('/login'))}>
            <i className="ph ph-sign-out" aria-hidden style={{ fontSize: 20 }} /><span className="kova-side-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>
      {report && <ReportDialog onClose={() => setReport(false)} />}
      {news && <NewsDialog days={newsDays()} onClose={() => setNews(false)} />}
      <NewsOnOpen ready />

      <main id="contenido" tabIndex={-1} style={{ flex: '1 1 0', minWidth: 0, padding: '32px clamp(16px,3vw,48px) 64px', boxSizing: 'border-box', outline: 'none' }}>
        <div style={{ maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 32 }}>
          {!online && (
            <Banner glyph="⌁">Sin conexión. La web necesita internet; tus datos están a salvo.</Banner>
          )}
          <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--kova-text-2)' }}>{headerDate(now, prefs.time_zone)}</div>
              <h1 style={{ margin: '4px 0 0' }}>{title}</h1>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div role="group" aria-label="Unidad de peso" className="kova-seg">
                {(['kg', 'lb'] as const).map((u) => (
                  <button key={u} aria-pressed={prefs.weight_unit === u} onClick={() => setUnit(u)}>{u}</button>
                ))}
              </div>
              <button type="button" className="btn btn-icon" onClick={() => setReport(true)} aria-label="Reportar un problema en esta página" title="Reportar un problema">
                <i className="ph ph-flag" aria-hidden style={{ fontSize: 20 }} />
              </button>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
