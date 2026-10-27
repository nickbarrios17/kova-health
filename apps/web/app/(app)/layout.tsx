'use client';
/** App shell: sidebar + header, markup ported from design/prototypes/VIDA Web v2.dc.html. */
import { newId } from '@vida/domain';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { vida } from '@/lib/client';
import { ago, greeting, headerDate, seg } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';

const NAV: Array<[href: string, label: string, icon: string]> = [
  ['/', 'Hoy', 'ph-squares-four'],
  ['/tendencias', 'Tendencias', 'ph-chart-line'],
  ['/comida', 'Comida', 'ph-fork-knife'],
  ['/entrenamiento', 'Entrenamiento', 'ph-barbell'],
  ['/coach', 'Coach', 'ph-lightbulb-filament'],
];
const TITLES: Record<string, string> = { '/tendencias': 'Tendencias', '/comida': 'Comida', '/entrenamiento': 'Entrenamiento', '/coach': 'Coach' };
const DEVICE_ICON: Record<string, string> = { watch: 'ph ph-watch', mobile: 'ph ph-device-mobile', web: 'ph ph-desktop' };
const DEVICE_KEY = 'vida:web-device-id';

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
  const { status, prefs, setUnit } = useSession();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (status === 'signedOut') router.replace('/login');
  }, [status, router]);
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const devices = useAsync(async () => {
    if (status !== 'signedIn') return [];
    const c = vida();
    await c.devices.register({ id: webDeviceId(), kind: 'web', label: 'Esta web', platform: 'web' }).catch(() => undefined);
    return (await c.devices.list()) as Array<{ id: string; kind: string; label: string | null; last_seen_at: string | null }>;
  }, [status]);

  if (status !== 'signedIn' || !prefs) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--color-neutral-400)', fontFamily: 'var(--font-body)' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><i className="ph ph-circle-notch vida-spin" />Cargando…</span>
      </div>
    );
  }

  const title = path === '/' ? greeting(now, prefs.time_zone) + (prefs.display_name ? ', ' + prefs.display_name : '') : TITLES[path] ?? 'VIDA';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <aside data-screen-label="Barra lateral" style={{ flex: '1 0 232px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 14px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
          <span style={{ width: 10, height: 22, borderRadius: 3, background: 'var(--color-accent)', boxShadow: '0 0 14px var(--color-accent)' }} />
          <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: '.08em' }}>VIDA</span>
        </div>
        <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 2 }}>
          {NAV.map(([href, label, icon]) => {
            const on = path === href;
            return (
              <Link key={href} href={href} className={on ? undefined : 'vida-nav'} aria-current={on ? 'page' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, padding: '0 10px', borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-900)' : 'transparent', color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-300)', fontSize: 14, textDecoration: 'none' }}>
                <i className={(on ? 'ph-fill ' : 'ph ') + icon} style={{ fontSize: 18 }} />
                <span style={{ flex: 1 }}>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 8px' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-neutral-500)' }}>Dispositivos</span>
          {(devices.data ?? []).slice(0, 4).map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <i className={DEVICE_ICON[d.kind] ?? 'ph ph-device-mobile'} style={{ fontSize: 16, color: 'var(--color-neutral-300)' }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span>{d.label ?? d.kind}</span>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{ago(d.last_seen_at, now.getTime())}</span>
              </span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent)', boxShadow: '0 0 8px var(--color-accent)' }} />
            </div>
          ))}
          <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 13, marginTop: 4 }}
            onClick={() => vida().auth.signOut().then(() => router.replace('/login'))}>
            <i className="ph ph-sign-out" />Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: '9999 1 640px', minWidth: 0, padding: '28px clamp(16px,3vw,40px) 48px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 1360, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>{headerDate(now, prefs.time_zone)}</div>
              <h2 style={{ margin: '4px 0 0' }}>{title}</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div role="group" aria-label="Unidad de peso" style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {(['kg', 'lb'] as const).map((u) => (
                  <button key={u} aria-pressed={prefs.weight_unit === u} onClick={() => setUnit(u)}
                    style={{ border: 0, fontSize: 12, padding: '7px 12px', cursor: 'pointer', ...seg(prefs.weight_unit === u) }}>{u}</button>
                ))}
              </div>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
