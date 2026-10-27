/** UI-independent formatting shared by web and mobile (Spanish copy, prototype conventions). */

/** Numbers like the prototypes: 7.842 and 92,5 (de-DE groups 4-digit numbers, es-ES does not). */
export const nf = (n: number, d = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });

/** Minutes → "7 h 12". */
export const hm = (m: number) => Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0');

/** Seconds → "1 h 02" / "54 min". */
export const dur = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min';
};

/** Seconds → "12:05" or "1:02:05" (live clocks). */
export const clock = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
};

const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const parseDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
};

/** YYYY-MM-DD ± n days. */
export const addDays = (d: string, n: number) => {
  const x = parseDay(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** "Dom 18" (or "Hoy"). */
export const dayShort = (d: string, today?: string) =>
  d === today ? 'Hoy' : WD[parseDay(d).getUTCDay()] + ' ' + parseDay(d).getUTCDate();

/** "Jue 22 oct". */
export const dayMonth = (d: string) => {
  const x = parseDay(d);
  return WD[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MES[x.getUTCMonth()];
};

/** "22 oct". */
export const shortDate = (d: string) => {
  const x = parseDay(d);
  return x.getUTCDate() + ' ' + MES[x.getUTCMonth()];
};

/** ISO weekdays → "Lun · Jue". */
export const isoDays = (days: number[]) =>
  days.length === 0 ? 'Sin días fijos' : [...days].sort().map((d) => WD[d % 7]).join(' · ');

/** "Sábado, 24 de octubre · 18:20" in the user's time zone (time optional). */
export function headerDate(now: Date, timeZone: string, withTime = true) {
  const date = new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const cap = date.charAt(0).toUpperCase() + date.slice(1);
  if (!withTime) return cap;
  const time = new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return cap + ' · ' + time;
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

export const MOODS = ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'] as const;

export const MEAL_SLOTS = [
  ['breakfast', 'Desayuno'],
  ['lunch', 'Almuerzo'],
  ['afternoon_snack', 'Merienda'],
  ['dinner', 'Cena'],
  ['snack', 'Picoteo'],
] as const;
