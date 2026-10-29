'use client';
/** Comida — today's meals, totals vs goal, and adding food with frozen nutrient snapshots. */
import {
  addDays, describeDailyTarget, localDate, MEAL_SLOTS, newId, nf, nutritionSourceLabel, scaleNutrients, KovaError, type NutritionSource,
} from '@kova/domain';
import { useState } from 'react';
import { EmptyState, ErrorNotice, Loading } from '@/components/EmptyState';
import { kova } from '@/lib/client';
import { seg } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';

type Slot = (typeof MEAL_SLOTS)[number][0];
interface Food { id: string; name: string; brand: string | null; ref_amount: number; ref_unit: 'g' | 'ml' | 'serving'; serving_label: string | null; default_quantity: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; data_source: NutritionSource }
interface Item { id: string; name: string; quantity: number; unit: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; data_source: NutritionSource }
const n = (v: unknown) => Number(v);

export default function ComidaPage() {
  const { prefs } = useSession();
  const today = localDate(new Date(), prefs!.time_zone);
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState<Slot | null>(null);
  const q = useAsync(async () => {
    const [meals, sum, energy] = await Promise.all([
      kova().nutrition.day(day), kova().summaries.daily(day, day),
      // Today's target follows today's activity; past days keep the saved plan.
      day === today ? kova().energy.today(today).catch(() => null) : Promise.resolve(null),
    ]);
    const dynamic = energy?.mode === 'dynamic' ? energy : null;
    const s = { ...(sum[0] ?? {}) } as Record<string, unknown>;
    if (dynamic) Object.assign(s, { kcal_goal: dynamic.kcal, protein_goal_g: dynamic.proteinG, carbs_goal_g: dynamic.carbsG, fat_goal_g: dynamic.fatG });
    return { meals: meals as Array<{ slot: Slot; meal_items: Item[] }>, s, dynamic };
  }, [day]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  const { meals, s, dynamic } = q.data!;
  const macro = (label: string, k: string, g: string) => (
    <div key={k} style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 500 }}>{Math.round(n(s[k] ?? 0))}{s[g] != null ? <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}> de {n(s[g])} g</span> : ' g'}</span>
      {s[g] != null && (
        <span style={{ height: 4, borderRadius: 2, background: 'var(--color-neutral-800)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: Math.min(100, (n(s[k] ?? 0) / n(s[g])) * 100) + '%', background: 'var(--color-accent)' }} />
        </span>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden', alignSelf: 'flex-start' }}>
        {[[addDays(today, -1), 'Ayer'], [today, 'Hoy']].map(([d, l]) => (
          <button key={d} onClick={() => setDay(d!)} aria-pressed={day === d} style={{ border: 0, fontSize: 13, padding: '7px 14px', cursor: 'pointer', ...seg(day === d) }}>{l}</button>
        ))}
      </div>
      <div style={{ padding: '18px 20px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(160deg, var(--color-accent-900), var(--color-surface) 70%)', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-300)' }}>Calorías</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 500 }}>{s.kcal != null ? nf(Math.round(n(s.kcal)), 0) : '0'}</span>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>{s.kcal_goal != null ? 'de ' + nf(n(s.kcal_goal), 0) + ' kcal' : 'kcal'}</span>
          </span>
        </div>
        {macro('Proteína', 'protein_g', 'protein_goal_g')}
        {macro('Carbohidratos', 'carbs_g', 'carbs_goal_g')}
        {macro('Grasa', 'fat_g', 'fat_goal_g')}
      </div>
      {dynamic?.day ? (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-300)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <i className="ph ph-lightning" style={{ marginTop: 2 }} />Meta de hoy según tu actividad: {describeDailyTarget(dynamic.day)} Se actualiza a medida que te movés.
        </span>
      ) : null}
      {Boolean(s.nutrition_has_unverified) && (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', display: 'flex', gap: 6, alignItems: 'center' }}><i className="ph ph-info" />Incluye valores introducidos por ti o estimados.</span>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
        {MEAL_SLOTS.map(([slot, label]) => {
          const items = meals.find((m) => m.slot === slot)?.meal_items ?? [];
          return (
            <div key={slot} style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>{items.length ? nf(Math.round(items.reduce((a, i) => a + n(i.kcal), 0)), 0) + ' kcal' : ''}</span>
              </div>
              {items.map((i) => (
                <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14 }}>{i.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                      {nf(n(i.quantity), 1)} {i.unit === 'serving' ? '×' : i.unit} · {nf(Math.round(n(i.kcal)), 0)} kcal · {nf(n(i.protein_g), 0)} g prot · {nutritionSourceLabel(i.data_source)}
                    </span>
                  </span>
                  <button className="btn btn-icon btn-secondary" aria-label={'Quitar ' + i.name} style={{ border: 0 }}
                    onClick={() => kova().nutrition.removeItem(i.id).then(q.reload)}><i className="ph ph-trash" /></button>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(slot)}><i className="ph ph-plus" />Añadir</button>
            </div>
          );
        })}
      </div>
      {adding && <AddFood slot={adding} day={day} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); q.reload(); }} />}
    </div>
  );
}

function AddFood({ slot, day, onClose, onAdded }: { slot: Slot; day: string; onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState('');
  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState({ name: '', ref: '100', unit: 'g' as 'g' | 'serving', kcal: '', p: '', c: '', f: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useAsync(async () => (query.trim().length >= 2 ? ((await kova().nutrition.searchFoods(query)) as Food[]) : []), [query]);
  const num = (x: string) => Number(x.replace(',', '.'));
  const qn = num(qty);
  const preview = picked && qn > 0
    ? scaleNutrients({ ...picked, ref_amount: n(picked.ref_amount), kcal: n(picked.kcal), protein_g: n(picked.protein_g), carbs_g: n(picked.carbs_g), fat_g: n(picked.fat_g) }, qn)
    : null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof KovaError ? e.message : 'Algo salió mal.'); } finally { setBusy(false); }
  };
  const label = MEAL_SLOTS.find(([s]) => s === slot)![1];
  const field = (l: string, v: string, on: (x: string) => void, mode: 'text' | 'decimal' = 'decimal') => (
    <div className="field" style={{ flex: 1 }}>
      <label>{l}</label>
      <input className="input" inputMode={mode} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={'Añadir a ' + label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(480px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="dialog-title" style={{ flex: 1 }}>Añadir a {label}</span>
          <button className="btn btn-icon btn-secondary" aria-label="Cerrar" style={{ border: 0 }} onClick={onClose}><i className="ph ph-x" /></button>
        </div>
        {error && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}
        {picked ? (
          <>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{picked.name}</span>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{nf(n(picked.kcal), 0)} kcal por {nf(n(picked.ref_amount), 1)} {picked.ref_unit === 'serving' ? picked.serving_label ?? 'porción' : picked.ref_unit} · {nutritionSourceLabel(picked.data_source)}</span>
            {field('Cantidad (' + (picked.ref_unit === 'serving' ? 'porciones' : picked.ref_unit) + ')', qty, setQty)}
            {preview && <span style={{ fontSize: 13, color: 'var(--color-neutral-300)' }}>{nf(preview.kcal, 0)} kcal · {nf(preview.protein_g, 1)} g proteína · {nf(preview.carbs_g, 1)} g carbos · {nf(preview.fat_g, 1)} g grasa</span>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setPicked(null)}>Elegir otro</button>
              <button className="btn btn-primary" disabled={busy || !(qn > 0)} onClick={() => run(async () => {
                await kova().nutrition.logFood({ id: newId(), local_date: day, slot, quantity: qn, food_id: picked.id });
                onAdded();
              })}><i className="ph ph-plus" />Añadir</button>
            </div>
          </>
        ) : manual ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Copia los valores de la etiqueta. Se guardan como introducidos por ti.</span>
            {field('Nombre', mf.name, (v) => setMf({ ...mf, name: v }), 'text')}
            <div style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden', alignSelf: 'flex-start' }}>
              {([['g', 'Por gramos'], ['serving', 'Por porción']] as const).map(([u, l]) => (
                <button key={u} onClick={() => setMf({ ...mf, unit: u })} aria-pressed={mf.unit === u} style={{ border: 0, fontSize: 12, padding: '7px 12px', cursor: 'pointer', ...seg(mf.unit === u) }}>{l}</button>
              ))}
            </div>
            {mf.unit === 'g' && field('Valores por (g)', mf.ref, (v) => setMf({ ...mf, ref: v }))}
            <div style={{ display: 'flex', gap: 8 }}>{field('kcal', mf.kcal, (v) => setMf({ ...mf, kcal: v }))}{field('Proteína g', mf.p, (v) => setMf({ ...mf, p: v }))}</div>
            <div style={{ display: 'flex', gap: 8 }}>{field('Carbos g', mf.c, (v) => setMf({ ...mf, c: v }))}{field('Grasa g', mf.f, (v) => setMf({ ...mf, f: v }))}</div>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setManual(false)}>Volver</button>
              <button className="btn btn-primary" disabled={busy || !mf.name || !mf.kcal || !mf.p || !mf.c || !mf.f} onClick={() => run(async () => {
                const food = (await kova().nutrition.createFood({
                  id: newId(), name: mf.name, ref_amount: mf.unit === 'serving' ? 1 : num(mf.ref), ref_unit: mf.unit,
                  kcal: num(mf.kcal), protein_g: num(mf.p), carbs_g: num(mf.c), fat_g: num(mf.f), data_source: 'user',
                })) as Food;
                setManual(false);
                setPicked(food);
                setQty(String(food.ref_amount));
              })}>Guardar alimento</button>
            </div>
          </>
        ) : (
          <>
            {field('Buscar alimento', query, setQuery, 'text')}
            {results.loading && query.trim().length >= 2 && <Loading />}
            {(results.data ?? []).map((f) => (
              <button key={f.id} className="btn btn-secondary" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => { setPicked(f); setQty(String(f.default_quantity ?? f.ref_amount)); }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontWeight: 400 }}>
                  <span>{f.name}{f.brand ? ' · ' + f.brand : ''}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{nf(n(f.kcal), 0)} kcal / {nf(n(f.ref_amount), 1)} {f.ref_unit === 'serving' ? f.serving_label ?? 'porción' : f.ref_unit} · {nutritionSourceLabel(f.data_source)}</span>
                </span>
              </button>
            ))}
            {query.trim().length >= 2 && !results.loading && (results.data ?? []).length === 0 && (
              <EmptyState icon="ph ph-magnifying-glass" title="Sin resultados">El catálogo verificado aún no está disponible. Crea el alimento con los datos de la etiqueta.</EmptyState>
            )}
            <button className="btn btn-secondary" onClick={() => setManual(true)}><i className="ph ph-plus" />Crear alimento</button>
          </>
        )}
      </div>
    </div>
  );
}
