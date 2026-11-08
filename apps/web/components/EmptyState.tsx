import type { ReactNode } from 'react';

/** Empty state from the design system (§4): explains how to start, never shows sample numbers. */
export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: '20px', borderRadius: 'var(--kova-radius-lg)', background: 'var(--color-surface)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <i className={icon} style={{ fontSize: 32, color: 'var(--kova-text-3)', flex: 'none' }} aria-hidden />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--kova-text-2)', textWrap: 'pretty' }}>{children}</span>
        {action ? <span style={{ marginTop: 4 }}>{action}</span> : null}
      </span>
    </div>
  );
}

/** Inline error notice (crit-soft banner, ✕ + text + action — never colour alone). */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="kova-banner kova-banner-crit" style={{ alignItems: 'center' }}>
      <span className="kova-glyph" aria-hidden>✕</span>
      <span style={{ flex: 1, fontSize: 14 }}>{message}</span>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry}><i className="ph ph-arrow-clockwise" />Reintentar</button>}
    </div>
  );
}

/** Loading: a skeleton with roughly the shape of what is coming (never a page spinner after boot). */
export function Loading({ label = 'Cargando…', height = 120 }: { label?: string; height?: number }) {
  return (
    <span role="status" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="kova-skeleton" style={{ display: 'block', height: 20, width: '40%', borderRadius: 6 }} />
      <span className="kova-skeleton" style={{ display: 'block', height, borderRadius: 'var(--kova-radius-xl)' }} />
    </span>
  );
}
