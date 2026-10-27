/** Web style helpers ported from design/prototypes/VIDA Web v2.dc.html. Pure formatting lives in @vida/domain. */
import type { CSSProperties } from 'react';

export { addDays, ago, dayMonth, dayShort, dur, greeting, headerDate, hm, isoDays, MOODS, nf, shortDate } from '@vida/domain';

/** stroke-dasharray for a progress ring. */
export const ring = (pct: number, r: number) => {
  const c = 2 * Math.PI * r;
  return (Math.min(1, Math.max(0, pct)) * c).toFixed(1) + ' ' + c.toFixed(1);
};

/** Sparkline bars; null values render as a short empty bar (no invented data). */
export const sp = (arr: Array<number | null | undefined>, mn: number, mx: number) =>
  arr.map((v, i) => ({
    h: v == null ? '6%' : Math.max(8, Math.round(((v - mn) / (mx - mn || 1)) * 100)) + '%',
    bg: v == null ? 'var(--color-neutral-800)' : i === arr.length - 1 ? 'var(--color-accent)' : 'var(--color-neutral-700)',
  }));

export const seg = (on: boolean): CSSProperties => ({
  background: on ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent',
  color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)',
});

export const chip = (on: boolean): CSSProperties => ({
  background: on ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
  color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-300)',
  borderColor: on ? 'var(--color-accent)' : 'var(--color-divider)',
});

export const warnFg = (bad: boolean) => (bad ? 'var(--vida-warn)' : 'var(--color-text)');
