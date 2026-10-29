'use client';
/** Tendencias — 28-day charts from daily_summaries. Days without data are gaps, never zeros. */
import { addDays, dayShort, hm, localDate, nf, shortDate, toDisplayWeight } from '@kova/domain';
import { useState } from 'react';
import { EmptyState, ErrorNotice, Loading } from '@/components/EmptyState';
import { kova } from '@/lib/client';
import { chip } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';

type Metric = 'sleep_min' | 'steps' | 'weight_kg' | 'kcal' | 'protein_g' | 'hrv_rmssd_ms' | 'resting_hr_bpm' | 'mood';

const METRICS: Array<{ k: Metric; label: string; fmt: (v: number, unit: 'kg' | 'lb') => string; bars?: boolean }> = [
  { k: 'sleep_min', label: 'Sueño', fmt: (v) => hm(v), bars: true },
  { k: 'steps', label: 'Pasos', fmt: (v) => nf(v, 0), bars: true },
  { k: 'weight_kg', label: 'Peso', fmt: (v, u) => nf(u === 'kg' ? v : toDisplayWeight(v, 'lb'), 1) + ' ' + u },
  { k: 'kcal', label: 'Calorías', fmt: (v) => nf(Math.round(v), 0) + ' kcal', bars: true },
  { k: 'protein_g', label: 'Proteína', fmt: (v) => Math.round(v) + ' g', bars: true },
  { k: 'hrv_rmssd_ms', label: 'HRV', fmt: (v) => nf(v, 0) + ' ms' },
  { k: 'resting_hr_bpm', label: 'FC reposo', fmt: (v) => nf(v, 0) + ' lpm' },
  { k: 'mood', label: 'Ánimo', fmt: (v) => nf(v, 1) + ' / 5', bars: true },
];

export default function TendenciasPage() {
  const { prefs } = useSession();
  const units = prefs!.weight_unit;
  const today = localDate(new Date(), prefs!.time_zone);
  const [metric, setMetric] = useState<Metric>('sleep_min');
  const q = useAsync(() => kova().summaries.daily(addDays(today, -27), today), [today]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  const m = METRICS.find((x) => x.k === metric)!;
  const pts = q.data!.map((d) => ({ date: String(d.local_date), v: d[metric] == null ? null : Number(d[metric]) }));
  const vals = pts.filter((p): p is { date: string; v: number } => p.v != null);
  const avg = vals.length ? vals.reduce((a, p) => a + p.v, 0) / vals.length : null;
  const lo = vals.length ? Math.min(...vals.map((p) => p.v)) : 0;
  const hi = vals.length ? Math.max(...vals.map((p) => p.v)) : 1;
  const base = m.bars ? 0 : lo - (hi - lo || 1) * 0.15;
  const top = hi + (hi - lo || 1) * 0.1;
  const y = (v: number) => 170 - ((v - base) / (top - base || 1)) * 155;
  const x = (i: number) => (i / 27) * 600;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {METRICS.map((x) => (
          <button key={x.k} onClick={() => setMetric(x.k)} aria-pressed={metric === x.k}
            style={{ height: 30, padding: '0 12px', borderRadius: 15, border: '1px solid', fontSize: 13, cursor: 'pointer', ...chip(metric === x.k) }}>{x.label}</button>
        ))}
      </div>
      <div style={{ padding: '16px 18px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{m.label} · 28 días</span>
          <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
            {avg == null ? 'Sin datos' : `Media ${m.fmt(avg, units)} · ${vals.length} ${vals.length === 1 ? 'día' : 'días'} con datos`}
          </span>
        </div>
        {vals.length === 0 ? (
          <EmptyState icon="ph ph-chart-line" title={`Aún no hay datos de ${m.label.toLowerCase()}`}>
            {metric === 'kcal' || metric === 'protein_g' ? 'Registra tus comidas en el móvil o en Comida.'
              : metric === 'weight_kg' || metric === 'mood' ? 'Regístralo desde el móvil o el reloj.'
              : 'Llegan del reloj o de Health Connect / HealthKit cuando los conectes.'}
          </EmptyState>
        ) : (
          <>
            <svg viewBox="0 0 600 180" preserveAspectRatio="none" style={{ width: '100%', height: 200, display: 'block' }} role="img"
              aria-label={`${m.label} de los últimos 28 días`}>
              <line x1="0" y1="170" x2="600" y2="170" stroke="var(--color-divider)" vectorEffect="non-scaling-stroke" />
              {avg != null && <line x1="0" x2="600" y1={y(avg)} y2={y(avg)} stroke="var(--color-neutral-600)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
              {m.bars
                ? pts.map((p, i) => p.v == null ? null : (
                    <rect key={p.date} x={x(i) - 7} width="14" y={y(p.v)} height={170 - y(p.v)} rx="2"
                      fill={p.date === today ? 'var(--color-accent)' : 'var(--color-neutral-700)'}><title>{dayShort(p.date) + ': ' + m.fmt(p.v, units)}</title></rect>
                  ))
                : (
                  <polyline fill="none" stroke="var(--color-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"
                    points={pts.map((p, i) => (p.v == null ? null : `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)).filter(Boolean).join(' ')} />
                )}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-neutral-400)' }}>
              <span>{shortDate(pts[0]!.date)}</span><span>Línea discontinua: tu media</span><span>Hoy</span>
            </div>
          </>
        )}
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Los días sin registro no se dibujan: no rellenamos huecos con ceros ni estimaciones.</span>
    </div>
  );
}
