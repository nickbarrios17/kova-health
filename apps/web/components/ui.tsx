'use client';
/** Nocturno Vital building blocks for the web (docs/design/HANDOFF.md §3). Presentation only. */
import type { Insight } from '@kova/domain';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/** Confidence badge: every insight says how sure Kova is, with a glyph and a word. */
const BADGE: Record<Insight['kind'], [glyph: string, label: string]> = {
  fact: ['●', 'Hecho'],
  pattern: ['◐', 'Patrón'],
  hypothesis: ['○', 'Hipótesis'],
  prediction: ['⇢', 'Proyección'],
};
export function ConfidenceBadge({ kind }: { kind: Insight['kind'] }) {
  const [glyph, label] = BADGE[kind];
  return (
    <span className={'kova-badge kova-badge-' + kind}>
      <span aria-hidden>{glyph}</span>{label}
    </span>
  );
}

type Tone = 'info' | 'ok' | 'warn' | 'crit';
const GLYPH: Record<Tone, string> = { info: '⌁', ok: '✓', warn: '△', crit: '✕' };

/** Banner: soft background, the tone's glyph and a sentence; optional action on the right. */
export function Banner({ tone = 'info', glyph, children, action }: { tone?: Tone; glyph?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={'kova-banner' + (tone === 'info' ? '' : ' kova-banner-' + tone)} role={tone === 'crit' ? 'alert' : 'status'}>
      <span className="kova-glyph" aria-hidden>{glyph ?? GLYPH[tone]}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {action}
    </div>
  );
}

/** Skeleton block with its component's shape. */
export function Skeleton({ height, width = '100%', radius }: { height: number; width?: number | string; radius?: number }) {
  return <span className="kova-skeleton" aria-hidden style={{ display: 'block', height, width, borderRadius: radius }} />;
}

/**
 * Preparación ring. Kova does not compute readiness yet, so the only state is empty: a dotted
 * chart-empty ring with «—». Never a number.
 */
export function ReadinessRing({ size = 112 }: { size?: number }) {
  const stroke = Math.round(size * 0.11);
  const r = (size - stroke) / 2;
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'block' }} role="img" aria-label="Preparación: aún sin calcular">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--kova-chart-empty)" strokeWidth={stroke} strokeDasharray="4 10" strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.28), fontWeight: 600, color: 'var(--kova-text-3)' }}>—</span>
    </span>
  );
}

/** Seven-day mini bars (7 × 8 px, gap 4, max 36): today in accent or its state colour; no data is a 2 px mark. */
export function MiniBars({ values, todayColor = 'var(--color-accent)', label }: { values: Array<number | null>; todayColor?: string; label: string }) {
  const max = Math.max(...values.map((v) => v ?? 0), 0);
  return (
    <span role="img" aria-label={label} style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
      {values.map((v, i) => {
        const today = i === values.length - 1;
        const h = v == null || max === 0 ? 2 : Math.max(4, Math.round((v / max) * 36));
        return (
          <span key={i} style={{ width: 8, height: h, borderRadius: v == null ? 1 : '3px 3px 1px 1px',
            background: v == null ? 'var(--kova-surface-raised)' : today ? todayColor : 'var(--kova-chart-muted)' }} />
        );
      })}
    </span>
  );
}

/** Brief notice: 3 s, bottom right, polite live region. */
const ToastCtx = createContext<(text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">{text ? <div className="kova-toast">{text}</div> : null}</div>
    </ToastCtx.Provider>
  );
}

/** Web connectivity: the web has no queue, so offline only gets a banner (HANDOFF §6.4). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
