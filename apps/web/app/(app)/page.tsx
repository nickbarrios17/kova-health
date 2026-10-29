'use client';
/**
 * "Hoy" — markup ported from design/prototypes/VIDA Web v2.dc.html (isHoy). Every number comes from
 * daily_summaries / routines / history; missing data shows the design system's empty state.
 * Readiness needs an HRV/sleep baseline model (not built), so it shows the raw facts instead of a
 * score. "Kova Health ve hoy" shows Kova Intelligence v1 insights (deterministic rules, @kova/domain).
 */
import { formatWeight, localDate, toDisplayWeight, type WeightUnit } from '@kova/domain';
import Link from 'next/link';
import { EmptyState, ErrorNotice, Loading } from '@/components/EmptyState';
import { InsightCard } from '@/components/InsightCard';
import { kova } from '@/lib/client';
import { addDays, dayShort, hm, MOODS, nf, ring, sp, warnFg } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { lastWeights, routineItems, type ExerciseRow, type HistoryRow, type RoutineRow } from '@/lib/training';

interface Summary {
  local_date: string;
  workouts_completed: number;
  kcal: number | null;
  protein_g: number | null;
  kcal_goal: number | null;
  protein_goal_g: number | null;
  weight_kg: number | null;
  steps: number | null;
  sleep_min: number | null;
  resting_hr_bpm: number | null;
  hrv_rmssd_ms: number | null;
  mood: number | null;
}

interface Tile {
  icon: string;
  name: string;
  period: string;
  value?: string;
  unit?: string;
  emptyTxt?: string;
  spark: ReturnType<typeof sp>;
  cmp: string;
  cmpIcon: string;
  cmpFg?: string;
  href: string;
}

const num = (v: unknown) => (v == null ? null : Number(v));
const avg = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export default function HoyPage() {
  const { prefs } = useSession();
  const tz = prefs!.time_zone;
  const units: WeightUnit = prefs!.weight_unit;
  const today = localDate(new Date(), tz);

  const q = useAsync(async () => {
    const c = kova();
    const [days, routines, active, exercises, history, goals, energy] = await Promise.all([
      c.summaries.daily(addDays(today, -6), today),
      c.routines.list(),
      c.workouts.active(),
      c.exercises.catalog(),
      c.workouts.recentHistory(500),
      c.goals.list(),
      c.energy.today(today).catch(() => null),
    ]);
    const insights = await c.insights.today(today, 3).catch(() => []);
    const rows = days.map((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'local_date' ? v : num(v) ?? v])) as unknown as Summary);
    // Today's target follows today's activity when the plan was calculated by Kova Health.
    const last = rows[rows.length - 1];
    if (last && energy?.mode === 'dynamic') last.kcal_goal = energy.kcal;
    return {
      days: rows,
      routines: routines as RoutineRow[],
      active,
      exercises: exercises as ExerciseRow[],
      history: history as HistoryRow[],
      goals: goals as Array<{ kind: string; status: string; target_value: number }>,
      insights,
    };
  }, [today]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  const { days, routines, active, exercises, history, goals, insights } = q.data!;

  const t = days[days.length - 1]!;
  const prev = days.slice(0, -1);
  const isoToday = ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  const plan = routines.find((r) => r.schedule_days.includes(isoToday));
  const lastW = lastWeights(history);
  const stepGoal = goals.find((g) => g.kind === 'steps_daily' && g.status === 'active')?.target_value ?? null;
  const sleepGoal = goals.find((g) => g.kind === 'sleep_minutes_daily' && g.status === 'active')?.target_value ?? null;
  const fw = (kg: number) => formatWeight(kg, units);

  // ── Progreso de hoy ──────────────────────────────────────────────────
  const latestWeight = [...days].reverse().find((d) => d.weight_kg != null);
  const firstWeight = days.find((d) => d.weight_kg != null);
  const prevHrv = avg(prev.map((d) => d.hrv_rmssd_ms));
  const prevSleep = avg(prev.map((d) => d.sleep_min));
  const enough = (k: keyof Summary) => prev.filter((d) => d[k] != null).length >= 3;

  const tiles: Tile[] = [
    t.kcal != null
      ? { icon: 'ph ph-fork-knife', name: 'Comida', period: 'Hoy', value: nf(Math.round(t.kcal), 0), unit: t.kcal_goal ? 'de ' + nf(t.kcal_goal, 0) + ' kcal' : 'kcal',
          spark: sp(days.map((d) => d.kcal), 0, Math.max(2800, (t.kcal_goal ?? 0) * 1.2)),
          cmp: 'Proteína ' + Math.round(t.protein_g ?? 0) + (t.protein_goal_g ? ' de ' + t.protein_goal_g : '') + ' g', cmpIcon: 'ph ph-info', href: '/comida' }
      : { icon: 'ph ph-fork-knife', name: 'Comida', period: 'Hoy', emptyTxt: 'Sin registrar', spark: sp(days.map((d) => d.kcal), 0, 2800),
          cmp: 'Registra tus comidas desde el móvil', cmpIcon: 'ph ph-info', href: '/comida' },
    t.steps != null
      ? { icon: 'ph ph-sneaker-move', name: 'Pasos', period: 'Hoy', value: nf(t.steps, 0), unit: stepGoal ? 'de ' + nf(stepGoal, 0) : 'pasos',
          spark: sp(days.map((d) => d.steps), 0, Math.max(13000, stepGoal ?? 0)),
          ...(stepGoal == null ? { cmp: 'Sin objetivo de pasos', cmpIcon: 'ph ph-info' }
            : t.steps >= stepGoal ? { cmp: 'Objetivo cumplido', cmpIcon: 'ph ph-check-circle', cmpFg: 'var(--kova-ok)' }
            : { cmp: 'Faltan ' + nf(stepGoal - t.steps, 0), cmpIcon: 'ph ph-arrow-up-right' }), href: '/tendencias' }
      : { icon: 'ph ph-sneaker-move', name: 'Pasos', period: 'Hoy', emptyTxt: 'Sin datos', spark: sp(days.map((d) => d.steps), 0, 13000),
          cmp: 'Conecta el reloj o el móvil para ver tus pasos', cmpIcon: 'ph ph-info', href: '/tendencias' },
    t.sleep_min != null
      ? { icon: 'ph ph-moon-stars', name: 'Sueño', period: 'Anoche', value: hm(t.sleep_min), unit: '', spark: sp(days.map((d) => d.sleep_min), 300, 540),
          ...(sleepGoal != null
            ? t.sleep_min >= sleepGoal ? { cmp: 'Dormiste lo que necesitas', cmpIcon: 'ph ph-check-circle', cmpFg: 'var(--kova-ok)' }
              : { cmp: Math.round(sleepGoal - t.sleep_min) + ' min menos de lo que necesitas', cmpIcon: 'ph ph-arrow-down' }
            : enough('sleep_min') && prevSleep != null
              ? { cmp: Math.abs(Math.round(t.sleep_min - prevSleep)) + ' min ' + (t.sleep_min >= prevSleep ? 'más' : 'menos') + ' que tu media de 7 días', cmpIcon: t.sleep_min >= prevSleep ? 'ph ph-arrow-up' : 'ph ph-arrow-down' }
              : { cmp: 'Aún no hay noches suficientes para comparar', cmpIcon: 'ph ph-info' }), href: '/tendencias' }
      : { icon: 'ph ph-moon-stars', name: 'Sueño', period: 'Anoche', emptyTxt: 'Sin datos', spark: sp(days.map((d) => d.sleep_min), 300, 540),
          cmp: 'Ponte el reloj esta noche y mañana verás tu primera noche aquí', cmpIcon: 'ph ph-info', href: '/tendencias' },
    t.hrv_rmssd_ms != null
      ? (() => {
          const pct = prevHrv != null && enough('hrv_rmssd_ms') ? Math.round(((t.hrv_rmssd_ms - prevHrv) / prevHrv) * 100) : null;
          return { icon: 'ph ph-heartbeat', name: 'Corazón', period: 'Anoche', value: nf(t.hrv_rmssd_ms, 0), unit: 'ms HRV', spark: sp(days.map((d) => d.hrv_rmssd_ms), 30, 90),
            ...(pct == null ? { cmp: 'Aún no hay noches suficientes para comparar', cmpIcon: 'ph ph-info' }
              : pct <= -8 ? { cmp: pct + '% frente a tu media de 7 días', cmpIcon: 'ph ph-warning', cmpFg: 'var(--kova-warn)' }
              : { cmp: (pct > 0 ? '+' : '') + pct + '% frente a tu media de 7 días', cmpIcon: 'ph ph-check-circle', cmpFg: 'var(--kova-ok)' }), href: '/tendencias' };
        })()
      : { icon: 'ph ph-heartbeat', name: 'Corazón', period: 'Anoche', emptyTxt: 'Sin datos', spark: sp(days.map((d) => d.hrv_rmssd_ms), 30, 90),
          cmp: 'La HRV llega del reloj mientras duermes', cmpIcon: 'ph ph-info', href: '/tendencias' },
    latestWeight
      ? { icon: 'ph ph-scales', name: 'Cuerpo', period: latestWeight.local_date === today ? 'Hoy' : dayShort(latestWeight.local_date),
          value: nf(units === 'kg' ? latestWeight.weight_kg! : toDisplayWeight(latestWeight.weight_kg!, 'lb'), 1), unit: units,
          spark: sp(days.map((d) => d.weight_kg), Math.min(...days.flatMap((d) => (d.weight_kg != null ? [d.weight_kg - 0.5] : []))), Math.max(...days.flatMap((d) => (d.weight_kg != null ? [d.weight_kg + 0.5] : [])))),
          ...(firstWeight && firstWeight !== latestWeight
            ? (() => {
                const diff = latestWeight.weight_kg! - firstWeight.weight_kg!;
                return { cmp: (diff > 0 ? '+' : diff < 0 ? '−' : '') + fw(Math.abs(diff)) + ' desde el ' + dayShort(firstWeight.local_date), cmpIcon: diff <= 0 ? 'ph ph-trend-down' : 'ph ph-trend-up' };
              })()
            : { cmp: 'Una sola medición esta semana', cmpIcon: 'ph ph-info' }), href: '/tendencias' }
      : { icon: 'ph ph-scales', name: 'Cuerpo', period: 'Hoy', emptyTxt: 'Sin datos', spark: sp(days.map(() => null), 0, 1),
          cmp: 'Pésate desde el móvil o conecta tu báscula', cmpIcon: 'ph ph-info', href: '/tendencias' },
    t.mood != null
      ? { icon: 'ph ph-smiley', name: 'Ánimo', period: 'Hoy', value: MOODS[t.mood - 1], unit: '', spark: sp(days.map((d) => d.mood), 0, 5),
          cmp: 'Último registro del día', cmpIcon: 'ph ph-info', href: '/tendencias' }
      : { icon: 'ph ph-smiley', name: 'Ánimo', period: 'Hoy', emptyTxt: 'Sin registrar', spark: sp(days.map((d) => d.mood), 0, 5),
          cmp: 'Regístralo desde el móvil o el reloj', cmpIcon: 'ph ph-info', href: '/tendencias' },
  ];

  // ── La semana en números ─────────────────────────────────────────────
  const fmtAvg = (xs: Array<number | null>, f: (n: number) => string) => {
    const a = avg(xs);
    return a == null ? '—' : f(a);
  };
  const hrvAvg = avg(days.map((d) => d.hrv_rmssd_ms));
  const rhrAvg = avg(days.map((d) => d.resting_hr_bpm));
  const cell = (v: number | null, f: (n: number) => string, bad: (n: number) => boolean) =>
    v == null ? { v: '—', fg: 'var(--color-neutral-600)' } : { v: f(v), fg: warnFg(bad(v)) };
  const weekRows: Array<{ label: string; cells: Array<{ v: string; fg: string }>; avg: string }> = [
    { label: 'Sueño', cells: days.map((d) => cell(d.sleep_min, hm, (v) => v < 390)), avg: fmtAvg(days.map((d) => d.sleep_min), hm) },
    { label: 'HRV (ms)', cells: days.map((d) => cell(d.hrv_rmssd_ms, (v) => nf(v, 0), (v) => hrvAvg != null && v < hrvAvg * 0.92)), avg: fmtAvg(days.map((d) => d.hrv_rmssd_ms), (v) => nf(v, 0)) },
    { label: 'FC reposo (lpm)', cells: days.map((d) => cell(d.resting_hr_bpm, (v) => nf(v, 0), (v) => rhrAvg != null && v >= rhrAvg + 4)), avg: fmtAvg(days.map((d) => d.resting_hr_bpm), (v) => nf(v, 0)) },
    { label: 'Pasos', cells: days.map((d) => cell(d.steps, (v) => nf(v, 0), (v) => v < 7000)), avg: fmtAvg(days.map((d) => d.steps), (v) => nf(v, 0)) },
    { label: 'Calorías', cells: days.map((d) => cell(d.kcal, (v) => nf(Math.round(v), 0), (v) => d.local_date !== today && d.kcal_goal != null && v > d.kcal_goal + 100)), avg: fmtAvg(days.map((d) => d.kcal), (v) => nf(Math.round(v), 0)) },
    { label: 'Proteína (g)', cells: days.map((d) => cell(d.protein_g, (v) => String(Math.round(v)), (v) => d.local_date !== today && d.protein_goal_g != null && v < d.protein_goal_g - 10)), avg: fmtAvg(days.map((d) => d.protein_g), (v) => String(Math.round(v))) },
    { label: 'Entrenamiento', cells: days.map((d) => (d.workouts_completed > 0 ? { v: d.workouts_completed > 1 ? d.workouts_completed + ' sesiones' : 'Hecho', fg: 'var(--color-text)' } : { v: '—', fg: 'var(--color-neutral-600)' })),
      avg: (() => {
        const n = days.reduce((a, d) => a + d.workouts_completed, 0);
        return n + (n === 1 ? ' sesión' : ' sesiones');
      })() },
    { label: 'Peso (' + units + ')', cells: days.map((d) => cell(d.weight_kg, (v) => nf(units === 'kg' ? v : toDisplayWeight(v, 'lb'), 1), () => false)),
      avg: fmtAvg(days.map((d) => d.weight_kg), (v) => nf(units === 'kg' ? v : toDisplayWeight(v, 'lb'), 1)) },
    { label: 'Ánimo', cells: days.map((d) => cell(d.mood, (v) => MOODS[Math.round(v) - 1] ?? '—', () => false)), avg: fmtAvg(days.map((d) => d.mood), (v) => nf(v, 1)) },
  ];

  const facts: Array<{ label: string; val: string; has: boolean }> = [
    { label: 'Sueño', val: t.sleep_min != null ? hm(t.sleep_min) : 'sin datos', has: t.sleep_min != null },
    { label: 'HRV', val: t.hrv_rmssd_ms != null ? nf(t.hrv_rmssd_ms, 0) + ' ms' : 'sin datos', has: t.hrv_rmssd_ms != null },
    { label: 'FC en reposo', val: t.resting_hr_bpm != null ? nf(t.resting_hr_bpm, 0) + ' lpm' : 'sin datos', has: t.resting_hr_bpm != null },
  ];

  return (
    <div data-screen-label="Hoy" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: '3 1 460px', minWidth: 0, padding: '22px 24px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(160deg, var(--color-accent-900), var(--color-surface) 70%)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ flex: '1 1 240px', display: 'flex', gap: 18, alignItems: 'center' }}>
            <span style={{ position: 'relative', width: 112, height: 112, flex: 'none', display: 'block' }}>
              <svg viewBox="0 0 128 128" style={{ width: 112, height: 112, transform: 'rotate(-90deg)', display: 'block' }} aria-hidden>
                <circle cx="64" cy="64" r="56" fill="none" stroke="var(--color-neutral-800)" strokeWidth="10" />
                <circle cx="64" cy="64" r="56" fill="none" stroke="var(--color-accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={ring(0, 56)} />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 500, color: 'var(--color-neutral-500)' }}>—</span>
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-300)' }}>Preparación de hoy</span>
              <span style={{ fontSize: 22, fontWeight: 500 }}>Aún sin calcular</span>
              {facts.map((p) => (
                <span key={p.label} style={{ fontSize: 13, color: 'var(--color-neutral-400)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <i className={p.has ? 'ph ph-check-circle' : 'ph ph-minus-circle'} style={{ color: p.has ? 'var(--kova-ok)' : 'var(--color-neutral-500)' }} />{p.label} · {p.val}
                </span>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 24, borderLeft: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-300)' }}>Plan de hoy</span>
            {plan ? (
              <>
                <span style={{ fontSize: 20, fontWeight: 500 }}>{plan.name}</span>
                {routineItems(plan, exercises, lastW, fw).map((it) => (
                  <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                    <span style={{ color: 'var(--color-neutral-300)' }}>{it.name}</span>
                    <span style={{ color: 'var(--color-neutral-400)', fontVariantNumeric: 'tabular-nums' }}>{it.scheme} · {it.w}</span>
                  </div>
                ))}
              </>
            ) : (
              <span style={{ fontSize: 15, color: 'var(--color-neutral-300)' }}>Hoy no tienes una rutina programada.</span>
            )}
            {active && (
              <span style={{ fontSize: 13, color: 'var(--color-accent-300)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <i className="ph ph-record" />Sesión en curso · {active.name}{active.status === 'paused' ? ' (en pausa)' : ''}
              </span>
            )}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 'auto', paddingTop: 8, flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" href="/entrenamiento"><i className="ph ph-barbell" />{plan ? 'Ver rutina' : 'Ver rutinas'}</Link>
            </div>
          </div>
        </div>
        <div style={{ flex: '2 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 6px' }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Kova Health ve hoy</span>
            <Link className="btn btn-ghost" href="/coach" style={{ fontSize: 13 }}>Todo el Coach</Link>
          </div>
          {insights.length === 0 ? (
            <EmptyState icon="ph ph-lightbulb-filament" title="Todavía no hay observaciones">
              Cuando haya suficientes días de sueño, entrenamiento y comida, Kova Health te mostrará aquí hechos y patrones de tus datos.
              No mostramos ejemplos inventados.
            </EmptyState>
          ) : (
            insights.map((i) => <InsightCard key={i.key} insight={i} compact />)
          )}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>Progreso de hoy</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10 }}>
          {tiles.map((tile) => (
            <Link key={tile.name} href={tile.href} className="kova-tile"
              style={{ padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', border: '1px solid transparent', color: 'var(--color-text)', textAlign: 'left', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-neutral-400)', width: '100%' }}>
                <i className={tile.icon} style={{ fontSize: 15, color: 'var(--color-accent-300)' }} />
                <span style={{ flex: 1, color: 'var(--color-neutral-300)' }}>{tile.name}</span>
                <span>{tile.period}</span>
              </span>
              {tile.value != null ? (
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{tile.value}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>{tile.unit}</span>
                </span>
              ) : (
                <span style={{ fontSize: 16, color: 'var(--color-neutral-300)' }}>{tile.emptyTxt}</span>
              )}
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }} aria-hidden>
                {tile.spark.map((b, i) => <span key={i} style={{ flex: 1, height: b.h, borderRadius: 2, background: b.bg }} />)}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, lineHeight: 1.3, color: tile.cmpFg ?? 'var(--color-neutral-400)' }}>
                <i className={tile.cmpIcon} style={{ fontSize: 13, flex: 'none' }} />{tile.cmp}
              </span>
            </Link>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Barras: últimos 7 días. Los días sin datos aparecen vacíos.</span>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>Profundizar</span>
        <div style={{ padding: '16px 18px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>La semana en números</span>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>Resaltado: fuera de tu objetivo o de tu media</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', minWidth: 760, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Métrica</th>
                  {days.map((d) => <th key={d.local_date} style={{ textAlign: 'right' }}>{dayShort(d.local_date, today)}</th>)}
                  <th style={{ textAlign: 'right' }}>Media</th>
                </tr>
              </thead>
              <tbody>
                {weekRows.map((r) => (
                  <tr key={r.label}>
                    <td style={{ color: 'var(--color-neutral-300)', whiteSpace: 'nowrap' }}>{r.label}</td>
                    {r.cells.map((c, i) => <td key={i} style={{ textAlign: 'right', color: c.fg, whiteSpace: 'nowrap' }}>{c.v}</td>)}
                    <td style={{ textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
