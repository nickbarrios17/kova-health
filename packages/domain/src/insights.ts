/**
 * Kova Intelligence v1 (design/reference/Kova Intelligence (Copy).md §03–§09, §12).
 * Deterministic detectors over the user's own daily summaries — no AI, no network.
 * Every insight carries its kind and evidence level; the kind decides the allowed language:
 *   fact        → plain arithmetic, always true.
 *   pattern     → repeated association in the user's own data ("cuando… también…"), never "porque".
 *   prediction  → projection that states its assumption ("si mantienes este ritmo…").
 *   hypothesis  → possible relation with weak evidence; conditional language only.
 * Correlation is never presented as causation, and nothing here is medical advice.
 */
import { isoWeekday } from './time.js';

export type InsightKind = 'fact' | 'pattern' | 'prediction' | 'hypothesis';
export type Evidence = 'confirmed' | 'emerging' | 'weak' | 'insufficient';
export type Domain = 'training' | 'nutrition' | 'sleep' | 'habits' | 'body' | 'mood' | 'activity';

export interface Insight {
  /** Stable key per rule + subject, used for novelty/fatigue (shown_insights). */
  key: string;
  kind: InsightKind;
  evidence: Evidence;
  domains: Domain[];
  title: string;
  detail: string;
  /** 0–3 */
  severity: number;
  actionable: boolean;
  /** Numbers that support the statement, for "¿por qué?" views and validation. */
  support: Record<string, number | string>;
  score: number;
}

export interface DaySummary {
  local_date: string;
  workouts_completed: number;
  kcal: number | null;
  protein_g: number | null;
  protein_goal_g: number | null;
  weight_kg: number | null;
  steps: number | null;
  sleep_min: number | null;
  mood: number | null;
}

export interface HabitDayLite {
  habit_id: string;
  local_date: string;
  frequency: 'daily' | 'weekly';
  scheduled: boolean;
  completed: boolean;
}

export const KIND_LABEL: Record<InsightKind, string> = { fact: 'Hecho', pattern: 'Patrón', prediction: 'Proyección', hypothesis: 'Hipótesis' };
export const EVIDENCE_LABEL: Record<Evidence, string> = {
  confirmed: 'Confirmado', emerging: 'Patrón emergente', weak: 'Hipótesis a validar', insufficient: 'Datos insuficientes',
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (n: number) => Math.round(n * 10) / 10;
const es = (n: number, d = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: d });

/** Evidence from sample size per group and effect size (both must be meaningful). */
export function evidenceFor(minGroupN: number, effect: number, threshold: number): Evidence {
  if (minGroupN < 3) return 'insufficient';
  if (Math.abs(effect) < threshold) return 'insufficient';
  if (minGroupN >= 8 && Math.abs(effect) >= threshold * 2) return 'confirmed';
  if (minGroupN >= 5) return 'emerging';
  return 'weak';
}

// ── Detectors ──────────────────────────────────────────────────────────────

/** Fact: training sessions in the last 7 days vs the 7 before. */
function trainingWeek(days: DaySummary[]): Insight | null {
  if (days.length < 14) return null;
  const last = days.slice(-7).reduce((a, d) => a + d.workouts_completed, 0);
  const prev = days.slice(-14, -7).reduce((a, d) => a + d.workouts_completed, 0);
  if (last === 0 && prev === 0) return null;
  const diff = last - prev;
  return {
    key: 'training-week', kind: 'fact', evidence: 'confirmed', domains: ['training'],
    title: diff === 0 ? `Entrenaste ${last} ${last === 1 ? 'vez' : 'veces'} esta semana, igual que la anterior.`
      : `Entrenaste ${last} ${last === 1 ? 'vez' : 'veces'} esta semana, ${Math.abs(diff)} ${diff > 0 ? 'más' : 'menos'} que la anterior.`,
    detail: 'Cuenta de sesiones completadas en los últimos 7 días frente a los 7 anteriores.',
    severity: diff < 0 ? 1 : 0, actionable: false, support: { last, prev }, score: 0,
  };
}

/** Fact: days under the protein goal in the last 7 days with food logged. */
function proteinGoal(days: DaySummary[]): Insight | null {
  const logged = days.slice(-8, -1).filter((d) => d.protein_g != null && d.protein_goal_g != null); // exclude today (not over)
  if (logged.length < 3) return null;
  const under = logged.filter((d) => d.protein_g! < d.protein_goal_g! - 10).length;
  if (under === 0) return null;
  return {
    key: 'protein-under-goal', kind: 'fact', evidence: 'confirmed', domains: ['nutrition'],
    title: `Quedaste por debajo de tu objetivo de proteína ${under} de los últimos ${logged.length} días que registraste.`,
    detail: 'Solo cuenta días con comidas registradas. Si no registraste todo, el total real puede ser mayor.',
    severity: under >= logged.length / 2 ? 2 : 1, actionable: true, support: { under, days: logged.length }, score: 0,
  };
}

/** Pattern: mood on days after short sleep (< 6 h 30) vs good sleep (≥ 7 h). */
function sleepMood(days: DaySummary[]): Insight | null {
  const short: number[] = [], good: number[] = [];
  for (const d of days) {
    if (d.sleep_min == null || d.mood == null) continue;
    if (d.sleep_min < 390) short.push(d.mood);
    else if (d.sleep_min >= 420) good.push(d.mood);
  }
  const n = Math.min(short.length, good.length);
  if (n < 3) return null;
  const diff = mean(good) - mean(short);
  const ev = evidenceFor(n, diff, 0.5);
  if (ev === 'insufficient') return null;
  const kind: InsightKind = ev === 'weak' ? 'hypothesis' : 'pattern';
  return {
    key: 'sleep-mood', kind, evidence: ev, domains: ['sleep', 'mood'],
    title: kind === 'pattern'
      ? `Los días que dormiste menos de 6 h 30, tu ánimo fue ${diff > 0 ? 'más bajo' : 'más alto'} (${es(mean(short))} frente a ${es(mean(good))} sobre 5).`
      : `Dormir poco podría estar relacionado con tu ánimo: ${es(mean(short))} frente a ${es(mean(good))} sobre 5, con pocos días todavía.`,
    detail: `Comparación de ${short.length} días con poco sueño y ${good.length} con 7 h o más. Es una asociación en tus datos, no una causa.`,
    severity: 1, actionable: false, support: { shortN: short.length, goodN: good.length, shortMood: r1(mean(short)), goodMood: r1(mean(good)) }, score: 0,
  };
}

/** Pattern: weekday where daily habits are completed least often. */
function weakWeekday(habitDays: HabitDayLite[]): Insight | null {
  const byDay = new Map<number, { s: number; c: number }>();
  for (const d of habitDays) {
    if (d.frequency !== 'daily' || !d.scheduled) continue;
    const wd = isoWeekday(d.local_date);
    const v = byDay.get(wd) ?? { s: 0, c: 0 };
    v.s++;
    if (d.completed) v.c++;
    byDay.set(wd, v);
  }
  const rates = [...byDay.entries()].filter(([, v]) => v.s >= 3).map(([wd, v]) => ({ wd, rate: v.c / v.s, n: v.s }));
  if (rates.length < 4) return null;
  const worst = rates.reduce((a, b) => (b.rate < a.rate ? b : a));
  const others = rates.filter((r) => r.wd !== worst.wd);
  const rest = mean(others.map((r) => r.rate));
  const ev = evidenceFor(Math.min(worst.n, ...others.map((o) => o.n)), rest - worst.rate, 0.2);
  if (ev === 'insufficient') return null;
  const name = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][worst.wd];
  return {
    key: `habit-weekday-${worst.wd}`, kind: ev === 'weak' ? 'hypothesis' : 'pattern', evidence: ev, domains: ['habits'],
    title: `Los ${name} cumples tus hábitos el ${Math.round(worst.rate * 100)} % de las veces, frente al ${Math.round(rest * 100)} % del resto de días.`,
    detail: 'Calculado con los hábitos diarios que tocaban cada día. Puede ayudarte a mover un recordatorio.',
    severity: 1, actionable: true, support: { weekday: worst.wd, rate: r1(worst.rate * 100), rest: r1(rest * 100) }, score: 0,
  };
}

/** Prediction: weight trend by least squares over ≥ 4 weigh-ins spanning ≥ 10 days. */
function weightTrend(days: DaySummary[]): Insight | null {
  const pts = days
    .map((d, i) => ({ x: i, y: d.weight_kg }))
    .filter((p): p is { x: number; y: number } => p.y != null);
  if (pts.length < 4 || pts[pts.length - 1]!.x - pts[0]!.x < 10) return null;
  const mx = mean(pts.map((p) => p.x)), my = mean(pts.map((p) => p.y));
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const perWeek = slope * 7;
  if (Math.abs(perWeek) < 0.1) {
    return {
      key: 'weight-trend', kind: 'fact', evidence: 'confirmed', domains: ['body'],
      title: 'Tu peso se mantiene estable en las últimas semanas.', detail: `${pts.length} mediciones; variación de la tendencia menor a 0,1 kg por semana.`,
      severity: 0, actionable: false, support: { n: pts.length, perWeek: r1(perWeek) }, score: 0,
    };
  }
  return {
    key: 'weight-trend', kind: 'prediction', evidence: pts.length >= 8 ? 'confirmed' : 'emerging', domains: ['body'],
    title: `Si mantienes este ritmo, tu peso ${perWeek < 0 ? 'baja' : 'sube'} unos ${es(Math.abs(perWeek))} kg por semana.`,
    detail: `Tendencia lineal de ${pts.length} mediciones. El peso varía a diario por agua y digestión; míralo como orientación.`,
    severity: 0, actionable: false, support: { n: pts.length, perWeek: r1(perWeek) }, score: 0,
  };
}

/** Fact about the data itself: days without any sleep data (honest about ambiguity). */
function missingSleep(days: DaySummary[]): Insight | null {
  const last7 = days.slice(-7);
  const missing = last7.filter((d) => d.sleep_min == null).length;
  // Only relevant if the user did track sleep before (otherwise it is noise for new users).
  const trackedBefore = days.slice(0, -7).some((d) => d.sleep_min != null);
  if (missing < 5 || last7.length < 7 || !trackedBefore) return null;
  return {
    key: 'sleep-missing', kind: 'fact', evidence: 'confirmed', domains: ['sleep'],
    title: `No hay datos de sueño en ${missing} de los últimos 7 días.`,
    detail: 'No significa que hayas dormido poco: simplemente no llegó ningún registro. Usa el reloj para dormir o regístralo.',
    severity: 0, actionable: true, support: { missing }, score: 0,
  };
}

// ── Scoring (§09) ──────────────────────────────────────────────────────────

const EVIDENCE_WEIGHT: Record<Evidence, number> = { confirmed: 1, emerging: 0.7, weak: 0.4, insufficient: 0 };

/** score = severity·w1 + evidence·w2 + actionable·w3 + novelty·w4 − fatigue·w5 */
export function scoreInsight(i: Insight, timesShownLast14d = 0): number {
  const novelty = timesShownLast14d === 0 ? 1 : 0;
  return i.severity * 1.0 + EVIDENCE_WEIGHT[i.evidence] * 1.5 + (i.actionable ? 0.5 : 0) + novelty * 0.8 - Math.min(timesShownLast14d, 5) * 0.4;
}

/**
 * Runs all detectors over up to ~60 days of summaries (oldest first) and returns at most `limit`
 * insights ordered by score. `shownCounts` maps insight key → times shown in the last 14 days.
 */
export function generateInsights(
  days: DaySummary[],
  habitDays: HabitDayLite[] = [],
  shownCounts: Record<string, number> = {},
  limit = 5,
): Insight[] {
  const found = [trainingWeek(days), proteinGoal(days), sleepMood(days), weakWeekday(habitDays), weightTrend(days), missingSleep(days)]
    .filter((x): x is Insight => x != null && x.evidence !== 'insufficient');
  return found
    .map((i) => ({ ...i, score: Math.round(scoreInsight(i, shownCounts[i.key] ?? 0) * 100) / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
