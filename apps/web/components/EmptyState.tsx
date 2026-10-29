import type { ReactNode } from 'react';

/** Empty state from the design system (§4): explains how to start, never shows sample numbers. */
export function EmptyState({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div style={{ padding: '18px 20px', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-neutral-700)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <i className={icon} style={{ fontSize: 24, color: 'var(--color-neutral-400)', flex: 'none' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-400)', textWrap: 'pretty' }}>{children}</span>
      </span>
    </div>
  );
}

/** Inline error notice (crit border, icon + text — never colour alone). */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', border: '1px solid var(--kova-crit)' }}>
      <i className="ph ph-x-circle" style={{ fontSize: 18, color: 'var(--kova-crit)' }} />
      <span style={{ flex: 1, fontSize: 14 }}>{message}</span>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry}><i className="ph ph-arrow-clockwise" />Reintentar</button>}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--color-neutral-400)' }}>
      <i className="ph ph-circle-notch kova-spin" />{label}
    </span>
  );
}
