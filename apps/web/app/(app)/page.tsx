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
import { ReadinessRing } from '@/components/ui';
import { kova } from '@/lib/client';
import { addDays, dayShort, hm, MOODS, nf, sp, warnFg } from '@/lib/format';
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
  state?: 'ok' | 'warn';
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
    const insights = await c.insights.today(today, 4).catch(() => []);
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
          cmp: 'Registrá tus comidas desde el móvil', cmpIcon: 'ph ph-info', href: '/comida' },
    t.steps != null
      ? { icon: 'ph ph-sneaker-move', name: 'Pasos', period: 'Hoy', value: nf(t.steps, 0), unit: stepGoal ? 'de ' + nf(stepGoal, 0) : 'pasos',
          spark: sp(days.map((d) => d.steps), 0, Math.max(13000, stepGoal ?? 0)),
          ...(stepGoal == null ? { cmp: 'Sin objetivo de pasos', cmpIcon: 'ph ph-info' }
            : t.steps >= stepGoal ? { cmp: 'Objetivo cumplido', cmpIcon: 'ph ph-check-circle', cmpFg: 'var(--kova-ok)', state: 'ok' as const }
            : { cmp: 'Faltan ' + nf(stepGoal - t.steps, 0), cmpIcon: 'ph ph-arrow-up-right' }), href: '/tendencias' }
      : { icon: 'ph ph-sneaker-move', name: 'Pasos', period: 'Hoy', emptyTxt: 'Sin datos', spark: sp(days.map((d) => d.steps), 0, 13000),
          cmp: 'Conectá el reloj o el móvil para ver tus pasos', cmpIcon: 'ph ph-info', href: '/tendencias' },
    t.sleep_min != null
      ? { icon: 'ph ph-moon-stars', name: 'Sueño', period: 'Anoche', value: hm(t.sleep_min), unit: '', spark: sp(days.map((d) => d.sleep_min), 300, 540),
          ...(sleepGoal != null
            ? t.sleep_min >= sleepGoal ? { cmp: 'Dormiste lo que necesitás', cmpIcon: 'ph ph-check-circle', cmpFg: 'var(--kova-ok)', state: 'ok' as const }
              : { cmp: '↓ ' + Math.round(sleepGoal - t.sleep_min) + ' min menos de lo que necesitás', cmpIcon: '' }
            : enough('sleep_min') && prevSleep != null
              ? { cmp: Math.abs(Math.round(t.sleep_min - prevSleep)) + ' min ' + (t.sleep_min >= prevSleep ? 'más' : 'menos') + ' que tu media de 7 días', cmpIcon: t.sleep_min >= prevSleep ? 'ph ph-arrow-up' : 'ph ph-arrow-down' }
              : { cmp: 'Aún no hay noches suficientes para comparar', cmpIcon: 'ph ph-info' }), href: '/tendencias' }
      : { icon: 'ph ph-moon-stars', name: 'Sueño', period: 'Anoche', emptyTxt: 'Sin datos', spark: sp(days.map((d) => d.sleep_min), 300, 540),
          cmp: 'Ponete el reloj esta noche', cmpIcon: 'ph ph-info', href: '/tendencias' },
    t.hrv_rmssd_ms != null
      ? (() => {
          const pct = prevHrv != null && enough('hrv_rmssd_ms') ? Math.round(((t.hrv_rmssd_ms - prevHrv) / prevHrv) * 100) : null;
          return { icon: 'ph ph-heartbeat', name: 'Corazón', period: 'Anoche', value: nf(t.hrv_rmssd_ms, 0), unit: 'ms HRV', spark: sp(days.map((d) => d.hrv_rmssd_ms), 30, 90),
            ...(pct == null ? { cmp: 'Aún no hay noches suficientes para comparar', cmpIcon: 'ph ph-info' }
              : pct <= -8 ? { cmp: '−' + Math.abs(pct) + ' % frente a tu base', cmpIcon: '', cmpFg: 'var(--kova-warn)', state: 'warn' as const }
              : { cmp: (pct > 0 ? '+' : '') + pct + ' % frente a tu base', cmpIcon: 'ph ph-info' }), href: '/tendencias' };
        })()
      : { icon: 'ph ph-heartbeat', name: 'Corazón', period: 'Anoche', emptyTxt: 'Sin datos', spark: sp(days.map((d) => d.hrv_rmssd_ms), 30, 90),
          cmp: 'La HRV llega del reloj mientras dormís', cmpIcon: 'ph ph-info', href: '/tendencias' },
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
          cmp: 'Pesate desde el móvil o conectá tu báscula', cmpIcon: 'ph ph-info', href: '/tendencias' },
    t.mood != null
      ? { icon: 'ph ph-smiley', name: 'Ánimo', period: 'Hoy', value: MOODS[t.mood - 1], unit: '', spark: sp(days.map((d) => d.mood), 0, 5),
          cmp: 'Último registro del día', cmpIcon: 'ph ph-info', href: '/tendencias' }
      : { icon: 'ph ph-smiley', name: 'Ánimo', period: 'Hoy', emptyTxt: 'Sin registrar', spark: sp(days.map((d) => d.mood), 0, 5),
          cmp: 'Registralo desde el móvil o el reloj', cmpIcon: 'ph ph-info', href: '/tendencias' },
  ];

  // ── La semana en números ─────────────────────────────────────────────
  const fmtAvg = (xs: Array<number | null>, f: (n: number) => string) => {
    const a = avg(xs);
    return a == null ? '—' : f(a);
  };
  const hrvAvg = avg(days.map((d) => d.hrv_rmssd_ms));
  const rhrAvg = avg(days.map((d) => d.resting_hr_bpm));
  const cell = (v: number | null, f: (n: number) => string, bad: (n: number) => boolean) =>
    v == null ? { v: '—', fg: 'var(--kova-text-3)', warn: false } : bad(v) ? { v: '△ ' + f(v), fg: warnFg(true), warn: true } : { v: f(v), fg: warnFg(false), warn: false };
  const weekRows: Array<{ label: string; cells: Array<{ v: string; fg: string; warn?: boolean }>; avg: string }> = [
    { label: 'Sueño', cells: days.map((d) => cell(d.sleep_min, hm, () => false)), avg: fmtAvg(days.map((d) => d.sleep_min), hm) },
    { label: 'HRV (ms)', cells: days.map((d) => cell(d.hrv_rmssd_ms, (v) => nf(v, 0), (v) => hrvAvg != null && v < hrvAvg * 0.92)), avg: fmtAvg(days.map((d) => d.hrv_rmssd_ms), (v) => nf(v, 0)) },
    { label: 'FC reposo (lpm)', cells: days.map((d) => cell(d.resting_hr_bpm, (v) => nf(v, 0), (v) => rhrAvg != null && v >= rhrAvg + 4)), avg: fmtAvg(days.map((d) => d.resting_hr_bpm), (v) => nf(v, 0)) },
    { label: 'Pasos', cells: days.map((d) => cell(d.steps, (v) => nf(v, 0), () => false)), avg: fmtAvg(days.map((d) => d.steps), (v) => nf(v, 0)) },
    { label: 'Calorías', cells: days.map((d) => cell(d.kcal, (v) => nf(Math.round(v), 0), (v) => d.local_date !== today && d.kcal_goal != null && v > d.kcal_goal + 100)), avg: fmtAvg(days.map((d) => d.kcal), (v) => nf(Math.round(v), 0)) },
    { label: 'Proteína (g)', cells: days.map((d) => cell(d.protein_g, (v) => String(Math.round(v)), (v) => d.local_date !== today && d.protein_goal_g != null && v < d.protein_goal_g - 10)), avg: fmtAvg(days.map((d) => d.protein_g), (v) => String(Math.round(v))) },
    { label: 'Entrenamiento', cells: days.map((d) => (d.workouts_completed > 0 ? { v: d.workouts_completed > 1 ? d.workouts_completed + ' sesiones' : '✓ Hecho', fg: 'var(--color-text)' } : { v: '—', fg: 'var(--kova-text-3)' })),
      avg: (() => {
        const n = days.reduce((a, d) => a + d.workouts_completed, 0);
        return n + (n === 1 ? ' sesión' : ' sesiones');
      })() },
    { label: 'Peso (' + units + ')', cells: days.map((d) => cell(d.weight_kg, (v) => nf(units === 'kg' ? v : toDisplayWeight(v, 'lb'), 1), () => false)),
      avg: fmtAvg(days.map((d) => d.weight_kg), (v) => nf(units === 'kg' ? v : toDisplayWeight(v, 'lb'), 1)) },
    { label: 'Ánimo', cells: days.map((d) => cell(d.mood, (v) => MOODS[Math.round(v) - 1] ?? '—', () => false)), avg: fmtAvg(days.map((d) => d.mood), (v) => nf(v, 1)) },
  ];

  // Access chips to Progreso de hoy: the facts Kova has, with △ when HRV is out of the usual range.
  const hrvPct = t.hrv_rmssd_ms != null && prevHrv != null && enough('hrv_rmssd_ms') ? Math.round(((t.hrv_rmssd_ms - prevHrv) / prevHrv) * 100) : null;
  const facts: Array<{ label: string; val: string; warn: boolean }> = [
    { label: 'Sueño', val: t.sleep_min != null ? hm(t.sleep_min) : 'sin datos', warn: false },
    { label: 'HRV', val: t.hrv_rmssd_ms != null ? nf(t.hrv_rmssd_ms, 0) + ' ms' : 'sin datos', warn: hrvPct != null && hrvPct <= -8 },
    { label: 'FC reposo', val: t.resting_hr_bpm != null ? nf(t.resting_hr_bpm, 0) + ' lpm' : 'sin datos', warn: false },
  ];
  const items = plan ? routineItems(plan, exercises, lastW, fw) : [];
  const todayCol = days.length - 1;

  return (
    <div data-screen-label="Hoy" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <section aria-label="Hoy" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div className="kova-appear" style={{ flex: '3 1 560px', minWidth: 0, padding: 28, borderRadius: 'var(--kova-radius-2xl)', background: 'var(--color-surface)', display: 'flex', flexWrap: 'wrap', gap: 28 }}>
          <div style={{ flex: '1 1 260px', display: 'flex', gap: 20, alignItems: 'flex-start', minWidth: 0 }}>
            <ReadinessRing size={112} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--kova-text-2)' }}>Preparación</span>
              <span style={{ fontSize: 'var(--kova-fs-title-3)', fontWeight: 600 }}>Aún sin calcular</span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--kova-text-2)' }}>
                Kova todavía no calcula tu preparación. Mientras tanto, mirá cómo dormiste y tu corazón en Progreso de hoy.
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {facts.map((f) => (
                  <a key={f.label} href="#progreso" className="kova-chip" style={f.warn ? { borderColor: 'rgba(239,193,115,.5)' } : undefined}>
                    {f.warn ? <span aria-hidden style={{ color: 'var(--kova-warn)', fontWeight: 600 }}>△</span> : null}
                    {f.label} · {f.val}{f.warn ? <span className="kova-faint" style={{ fontSize: 12 }}>fuera de tu rango</span> : null}
                  </a>
                ))}
              </span>
            </div>
          </div>
          <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, paddingLeft: 28, borderLeft: '1px solid var(--kova-border-subtle)' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--kova-text-2)' }}>Plan de hoy</span>
            {plan ? (
              <>
                <span style={{ fontSize: 'var(--kova-fs-title-2)', fontWeight: 600 }}>{plan.name}</span>
                {items.map((it) => (
                  <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                    <span>{it.name}</span>
                    <span style={{ color: 'var(--kova-text-2)' }}>{it.scheme} · {it.w}</span>
                  </div>
                ))}
                <span style={{ fontSize: 13, color: 'var(--kova-text-3)' }}>
                  {items.length} {items.length === 1 ? 'ejercicio' : 'ejercicios'} · empieza en el móvil o el reloj
                </span>
              </>
            ) : (
              <span style={{ fontSize: 15 }}>Hoy no tenés una rutina programada.</span>
            )}
            {active && (
              <span style={{ fontSize: 13, color: 'var(--kova-accent-text)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <i className="ph ph-record" aria-hidden />Sesión en curso · {active.name}{active.status === 'paused' ? ' (‖ en pausa)' : ''}
              </span>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 'auto', paddingTop: 8, flexWrap: 'wrap' }}>
              <Link className="btn btn-primary btn-lg" href="/entrenamiento">{plan ? 'Ver rutina' : 'Ver rutinas'}</Link>
              {plan ? <Link className="btn btn-ghost" href="/entrenamiento">Editar</Link> : null}
            </div>
          </div>
        </div>
        <div style={{ flex: '2 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h3 className="kova-section-title">Kova Health ve hoy</h3>
            <Link className="btn btn-ghost" href="/coach">Todo el Coach</Link>
          </div>
          {insights.length === 0 ? (
            <EmptyState icon="ph ph-lightbulb-filament" title="Nada por ahora">
              Cuando haya suficientes días de sueño, entrenamiento y comida, Kova Health te va a mostrar acá hechos y patrones de tus datos.
            </EmptyState>
          ) : (
            insights.slice(0, 4).map((i) => (
              <InsightCard key={i.key} insight={i} compact onFeedback={(v) => kova().insights.feedback(i.key, today, v).catch(() => undefined)} />
            ))
          )}
        </div>
      </section>

      <section id="progreso" aria-labelledby="progreso-t" style={{ display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 24 }}>
        <h3 id="progreso-t" className="kova-section-title">Progreso de hoy</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {tiles.map((tile) => (
            <Link key={tile.name} href={tile.href} className="kova-tile"
              style={{ padding: 20, borderRadius: 'var(--kova-radius-xl)', background: 'var(--color-surface)', border: '1px solid transparent', color: 'var(--color-text)', textAlign: 'left', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <i className={tile.icon} aria-hidden style={{ fontSize: 20, color: 'var(--kova-accent-text)' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{tile.name}</span>
                <span style={{ fontSize: 13, color: 'var(--kova-text-3)' }}>{tile.period}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                {tile.value != null ? (
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontSize: 'var(--kova-fs-metric)', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-.015em' }}>{tile.value}</span>
                    <span style={{ fontSize: 13, color: 'var(--kova-text-2)' }}>{tile.unit}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--kova-text-2)' }}>{tile.emptyTxt}</span>
                )}
                <span style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36, flex: 'none' }} aria-hidden>
                  {tile.spark.map((b, i) => (
                    <span key={i} style={{ width: 8, height: b.h, borderRadius: '3px 3px 1px 1px',
                      background: i === tile.spark.length - 1 && tile.state ? (tile.state === 'ok' ? 'var(--kova-ok)' : 'var(--kova-warn)') : b.bg }} />
                  ))}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: 1.35, color: tile.cmpFg ?? 'var(--kova-text-2)', fontWeight: tile.state ? 600 : 400 }}>
                {tile.state === 'ok' ? <span aria-hidden>✓</span> : tile.state === 'warn' ? <span aria-hidden>△</span> : tile.cmpIcon ? <i className={tile.cmpIcon} aria-hidden style={{ fontSize: 14, flex: 'none' }} /> : null}
                {tile.cmp}
              </span>
            </Link>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>Barras: últimos 7 días. Los días sin datos aparecen vacíos.</span>
      </section>

      <section aria-labelledby="semana-t" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h3 id="semana-t" className="kova-section-title">La semana en números</h3>
          <span style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>△ fuera de tu objetivo o de tu media · — sin dato</span>
        </div>
        <div style={{ padding: '8px 20px 12px', borderRadius: 'var(--kova-radius-xl)', background: 'var(--color-surface)', overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', minWidth: 860 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>Métrica</th>
                {days.map((d, i) => <th scope="col" key={d.local_date} style={{ textAlign: 'right', fontWeight: i === todayCol ? 700 : 500, color: i === todayCol ? 'var(--color-text)' : undefined }}>{dayShort(d.local_date, today)}</th>)}
                <th scope="col" style={{ textAlign: 'right' }}>Media</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" style={{ textAlign: 'left', fontSize: 14, fontWeight: 400, color: 'var(--kova-text-2)', whiteSpace: 'nowrap' }}>{r.label}</th>
                  {r.cells.map((c, i) => (
                    <td key={i} style={{ textAlign: 'right', color: c.fg, whiteSpace: 'nowrap', fontWeight: c.warn ? 600 : i === todayCol ? 700 : 400 }}>{c.v}</td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
