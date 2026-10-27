/** Formatting and small style helpers, ported 1:1 from design/prototypes/VIDA Web v2.dc.html. */
import type { CSSProperties } from 'react';

/** Numbers like the prototype: 7.842 and 92,5 (de-DE groups 4-digit numbers, es-ES does not). */
export const nf = (n: number, d = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });

/** Minutes → "7 h 12". */
export const hm = (m: number) => Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0');

/** Seconds → "1 h 02" / "54 min". */
export const dur = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min';
};

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

const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const parse = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
};

/** YYYY-MM-DD ± n days. */
export const addDays = (d: string, n: number) => {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** "Dom 18" (or "Hoy"). */
export const dayShort = (d: string, today?: string) => (d === today ? 'Hoy' : WD[parse(d).getUTCDay()] + ' ' + parse(d).getUTCDate());

/** "Jue 22 oct". */
export const dayMonth = (d: string) => {
  const x = parse(d);
  return WD[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MES[x.getUTCMonth()];
};

/** "22 oct". */
export const shortDate = (d: string) => {
  const x = parse(d);
  return x.getUTCDate() + ' ' + MES[x.getUTCMonth()];
};

/** ISO weekdays → "Lun · Jue". */
export const isoDays = (days: number[]) =>
  days.length === 0 ? 'Sin días fijos' : [...days].sort().map((d) => WD[d % 7]).join(' · ');

/** "Sábado, 24 de octubre · 18:20" in the user's time zone. */
export function headerDate(now: Date, timeZone: string) {
  const date = new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return date.charAt(0).toUpperCase() + date.slice(1) + ' · ' + time;
}

export function greeting(now: Date, timeZone: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now));
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'Sin datos aún';
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return 'Ahora';
  if (s < 3600) return 'Hace ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'Hace ' + Math.round(s / 3600) + ' h';
  return 'Hace ' + Math.round(s / 86400) + ' d';
}

export const MOODS = ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'];
