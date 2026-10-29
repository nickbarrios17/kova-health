'use client';
/** "Entrenamiento" — markup ported from design/prototypes/VIDA Web v2.dc.html (isTrain), on real data. */
import { draftFromRoutine, emptyDraft, formatWeight, newId, toDisplayWeight, weekStart, type RoutineDraft, type WeightUnit } from '@kova/domain';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorNotice, Loading } from '@/components/EmptyState';
import { RoutineEditor } from '@/components/RoutineEditor';
import { kova } from '@/lib/client';
import { chip, dayMonth, dur, hm, isoDays, nf, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { exerciseName, lastWeights, routineItems, type ExerciseRow, type HistoryRow, type RoutineRow } from '@/lib/training';
import { ExerciseDetail } from '@/components/ExerciseDetail';
import { useAsync } from '@/lib/useAsync';

interface SummaryRow {
  session_id: string;
  name: string;
  status: string;
  local_date: string;
  active_duration_s: number;
  volume_kg: number | string;
  energy_kcal: number | string | null;
  energy_is_estimated: boolean;
}

export default function EntrenamientoPage() {
  const { prefs } = useSession();
  const units: WeightUnit = prefs!.weight_unit;
  const fw = (kg: number) => formatWeight(kg, units);
  const [ex, setEx] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoutineDraft | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [howTo, setHowTo] = useState<{ id: string; name: string } | null>(null);

  const q = useAsync(async () => {
    const c = kova();
    const [routines, exercises, history, records, active, summaries] = await Promise.all([
      c.routines.list(),
      c.exercises.catalog(),
      c.workouts.recentHistory(500),
      c.workouts.personalRecords(),
      c.workouts.active(),
      c.workouts.summaries(20),
    ]);
    const done = (summaries as SummaryRow[]).filter((s) => s.status === 'completed');
    const dates = done.map((s) => s.local_date).sort();
    const [details, sleep] = await Promise.all([
      c.workouts.sessionDetails(done.map((s) => s.session_id)),
      dates.length ? c.health.series('sleep_session', dates[0]!, dates[dates.length - 1]!) : Promise.resolve([]),
    ]);
    const sleepByDay = new Map<string, number>();
    for (const o of sleep as Array<{ local_date: string; value: number | string }>) {
      sleepByDay.set(o.local_date, Math.max(sleepByDay.get(o.local_date) ?? 0, Number(o.value)));
    }
    return {
      routines: routines as RoutineRow[],
      exercises: exercises as ExerciseRow[],
      history: history as HistoryRow[],
      records: records as Array<{ exercise_id: string; total_sets: number }>,
      active,
      done,
      details: new Map((details as Array<{ id: string; notes: string | null; tags: string[]; avg_hr: number | null }>).map((d) => [d.id, d])),
      sleepByDay,
    };
  }, []);

  const withHistory = q.data?.records.map((r) => r.exercise_id) ?? [];
  useEffect(() => {
    if (!ex && withHistory.length) setEx(withHistory[0]!);
  }, [ex, withHistory]);

  const series = useAsync(async () => (ex ? ((await kova().workouts.history(ex, 1000)) as HistoryRow[]) : []), [ex]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  const { routines, exercises, history, active, done, details, sleepByDay } = q.data!;
  const lastW = lastWeights(history);

  // Weekly best e1RM over the last 8 ISO weeks (weeks without this exercise are skipped).
  const weeks: string[] = [];
  const thisWeek = weekStart(new Date().toISOString().slice(0, 10));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisWeek + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const best = new Map<string, number>();
  for (const h of series.data ?? []) {
    if (h.e1rm_kg == null) continue;
    const w = weekStart(h.local_date);
    best.set(w, Math.max(best.get(w) ?? 0, Number(h.e1rm_kg)));
  }
  const e1 = weeks.map((w, i) => ({ i, w, v: best.get(w) })).filter((p): p is { i: number; w: string; v: number } => p.v != null);
  const disp = (kg: number) => (units === 'kg' ? kg : toDisplayWeight(kg, 'lb'));
  const lo = Math.min(...e1.map((p) => p.v)) * 0.97;
  const hi = Math.max(...e1.map((p) => p.v)) * 1.01;
  const pts = e1.map((p) => [(p.i / 7) * 600, 165 - ((p.v - lo) / (hi - lo || 1)) * 150] as const);

  return (
    <div data-screen-label="Entrenamiento" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {active && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', boxShadow: '0 0 10px var(--color-accent)' }} />
          <span style={{ flex: 1, fontSize: 14 }}>Sesión en curso · {active.name}{active.status === 'paused' ? ' (en pausa)' : ''}</span>
          <button className="btn btn-ghost" onClick={q.reload} style={{ fontSize: 12 }}><i className="ph ph-arrow-clockwise" />Actualizar</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editing ? (
            <RoutineEditor key={editing.id} initial={editing} exercises={exercises} units={units}
              onClose={(changed) => { setEditing(null); if (changed) q.reload(); }} />
          ) : (
          <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setEditing(emptyDraft())}><i className="ph ph-plus" />Nueva rutina</button>
            <Link className="btn btn-secondary" href="/importar"><i className="ph ph-upload-simple" />Importar</Link>
          </div>
          {routines.length === 0 ? (
            <EmptyState icon="ph ph-barbell" title="Aún no tienes rutinas">Importa tu planilla (Excel, CSV o JSON) y aparecerán aquí, en el teléfono y en el reloj.</EmptyState>
          ) : (
            routines.map((r) => (
              <div key={r.id} style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 17, fontWeight: 500 }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{isoDays(r.schedule_days)}</span>
                </div>
                {r.assigned_by && <span style={{ fontSize: 12, color: 'var(--color-accent-300, #d2cefd)' }}>De tu coach</span>}
                {routineItems(r, exercises, lastW, fw).map((it) => (
                  <button key={it.key} type="button" className="kova-exercise-row" title="Cómo se hace" onClick={() => setHowTo({ id: it.exerciseId, name: it.name })}>
                    <span style={{ color: 'var(--color-neutral-300)', flex: 1, textAlign: 'left' }}>{it.name}</span>
                    <span style={{ color: 'var(--color-neutral-400)' }}>{it.scheme} · {it.w}</span>
                    <i className="ph ph-info" style={{ color: 'var(--color-accent)' }} aria-hidden />
                  </button>
                ))}
                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 13 }}
                    onClick={() => setEditing(draftFromRoutine(r, Object.fromEntries(exercises.map((e) => [e.id, e.name]))))}>
                    <i className="ph ph-pencil-simple" />Editar
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 13 }} disabled={copying === r.id}
                    onClick={async () => {
                      setCopying(r.id);
                      try { await kova().routines.duplicate(r.id, newId(), (r.name + ' (copia)').slice(0, 80)); q.reload(); } finally { setCopying(null); }
                    }}>
                    <i className={copying === r.id ? 'ph ph-circle-notch kova-spin' : 'ph ph-copy'} />Duplicar
                  </button>
                </div>
              </div>
            ))
          )}
          <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--color-neutral-400)', display: 'flex', gap: 6, textWrap: 'pretty' }}>
            <i className="ph ph-device-mobile" style={{ marginTop: 2 }} />Las rutinas se sincronizan con el teléfono y el reloj.
          </span>
          </>
          )}
        </div>

        <div style={{ flex: '2 1 440px', minWidth: 0, padding: '16px 18px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>1RM estimado · 8 semanas</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {withHistory.map((id) => (
                <button key={id} onClick={() => setEx(id)} aria-pressed={ex === id}
                  style={{ height: 28, padding: '0 10px', borderRadius: 14, border: '1px solid', fontSize: 12, cursor: 'pointer', ...chip(ex === id) }}>
                  {exerciseName(exercises, id)}
                </button>
              ))}
            </div>
          </div>
          {withHistory.length === 0 ? (
            <EmptyState icon="ph ph-chart-line" title="Aún no hay sesiones completadas">
              Completa tu primer entrenamiento y verás aquí cómo evoluciona tu fuerza. Usamos la fórmula de Epley con series de 1 a 12 repeticiones.
            </EmptyState>
          ) : series.loading ? (
            <Loading />
          ) : e1.length < 2 ? (
            <EmptyState icon="ph ph-chart-line" title="Falta una semana más">
              Necesitamos al menos dos semanas con este ejercicio para dibujar la tendencia.
              {e1.length === 1 && <> Esta semana: {nf(disp(e1[0]!.v), 1)} {units}.</>}
            </EmptyState>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.02em' }}>{fw(e1[e1.length - 1]!.v)}</span>
                <span style={{ fontSize: 13, color: 'var(--color-accent-300)' }}>
                  {(() => {
                    const d = e1[e1.length - 1]!.v - e1[0]!.v;
                    return (d >= 0 ? '+' : '−') + fw(Math.abs(d)) + ' desde el ' + shortDate(e1[0]!.w);
                  })()}
                </span>
              </div>
              <svg viewBox="0 0 600 180" preserveAspectRatio="none" style={{ width: '100%', height: 180, display: 'block' }} role="img"
                aria-label={'1RM estimado por semana de ' + exerciseName(exercises, ex!)}>
                <line x1="0" y1="170" x2="600" y2="170" stroke="var(--color-divider)" vectorEffect="non-scaling-stroke" />
                <path d={'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ` L${pts[pts.length - 1]![0].toFixed(1)} 170 L${pts[0]![0].toFixed(1)} 170 Z`} fill="var(--color-accent-900)" />
                <polyline points={pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-neutral-400)' }}>
                <span>{shortDate(weeks[0]!)}</span><span>{shortDate(weeks[7]!)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 18px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Historial de sesiones</span>
        {done.length === 0 ? (
          <EmptyState icon="ph ph-clock-counter-clockwise" title="Sin sesiones todavía">
            Las sesiones que completes en el móvil o en el reloj aparecerán aquí con su duración, volumen y notas.
          </EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', minWidth: 720, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Fecha</th><th style={{ textAlign: 'left' }}>Rutina</th>
                  <th style={{ textAlign: 'right' }}>Duración</th><th style={{ textAlign: 'right' }}>Volumen</th>
                  <th style={{ textAlign: 'right' }}>kcal</th><th style={{ textAlign: 'right' }}>FC media</th>
                  <th style={{ textAlign: 'right' }}>Sueño previo</th><th style={{ textAlign: 'left' }}>Nota</th>
                </tr>
              </thead>
              <tbody>
                {done.map((s) => {
                  const d = details.get(s.session_id);
                  const sl = sleepByDay.get(s.local_date);
                  const vol = Number(s.volume_kg);
                  return (
                    <tr key={s.session_id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dayMonth(s.local_date)}</td>
                      <td>{s.name}</td>
                      <td style={{ textAlign: 'right' }}>{dur(s.active_duration_s)}</td>
                      <td style={{ textAlign: 'right' }}>{nf(units === 'kg' ? vol : toDisplayWeight(vol, 'lb'), 0) + ' ' + units}</td>
                      <td style={{ textAlign: 'right' }} title={s.energy_is_estimated ? 'Estimado' : undefined}>
                        {s.energy_kcal == null ? '—' : nf(Number(s.energy_kcal), 0) + (s.energy_is_estimated ? ' (est.)' : '')}
                      </td>
                      <td style={{ textAlign: 'right' }}>{d?.avg_hr != null ? d.avg_hr + ' lpm' : '—'}</td>
                      <td style={{ textAlign: 'right', color: sl != null && sl < 390 ? 'var(--kova-warn)' : 'var(--color-text)' }}>{sl != null ? hm(sl) : '—'}</td>
                      <td style={{ color: 'var(--color-neutral-400)', maxWidth: 280 }}>{d?.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {howTo && <ExerciseDetail exerciseId={howTo.id} name={howTo.name} catalog={exercises} onClose={() => setHowTo(null)} />}
    </div>
  );
}
