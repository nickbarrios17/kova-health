/** Web style helpers ported from design/prototypes/VIDA Web v2.dc.html. Pure formatting lives in @kova/domain. */
import type { CSSProperties } from 'react';

export { addDays, ago, dayMonth, dayShort, dur, greeting, headerDate, hm, isoDays, MOODS, nf, shortDate } from '@kova/domain';

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

/** Segmented option (HANDOFF §3): the active option is raised, with a border and 600. */
export const seg = (on: boolean): CSSProperties => ({
  background: on ? 'var(--kova-surface-raised)' : 'transparent',
  color: on ? 'var(--color-text)' : 'var(--kova-text-2)',
  fontWeight: on ? 600 : 400,
  boxShadow: on ? 'inset 0 0 0 1px var(--color-divider)' : 'none',
});

/** Chip / filter: selected is accent-soft with #D2CEFD text (callers add «✓»). */
export const chip = (on: boolean): CSSProperties => ({
  background: on ? 'var(--kova-accent-soft)' : 'transparent',
  color: on ? 'var(--color-accent-300)' : 'var(--color-text)',
  borderColor: on ? 'transparent' : 'var(--color-divider)',
});

export const warnFg = (bad: boolean) => (bad ? 'var(--kova-warn)' : 'var(--color-text)');
