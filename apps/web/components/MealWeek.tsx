'use client';
/**
 * Comidas, etapas 2 y 3 (docs/comidas.md), web: «Tu semana» (plan around training, «Lo comí», «Cambiar»)
 * and «Compras» (list by aisle from the plan, minus what is at home). Same data and rules as the phone.
 */
import {
  addDays, AISLE_ORDER, buildShoppingList, isoWeekday, lineAmount, MEAL_SLOTS, newId, nf, weekStartOf, weekTargets, KovaError, type DayTarget,
} from '@kova/domain';
import type { MealPlan, PlanMeal, ShoppingList } from '@kova/api-client';
import { useState } from 'react';
import { kova } from '@/lib/client';
import { useAsync } from '@/lib/useAsync';
import { Banner, Skeleton } from '@/components/ui';
import type { RoutineRow } from '@/lib/training';

const SLOT_LABEL = Object.fromEntries(MEAL_SLOTS) as Record<string, string>;
const DAY = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const KIND: Record<DayTarget['kind'], string> = { fuerza: 'Día de fuerza', descanso: 'Día de descanso', evento: 'Día con evento' };
const msg = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');

async function targetsFor(weekStart: string, today: string) {
  const c = kova();
  const [energy, routines, events] = await Promise.all([
    c.energy.today(today).catch(() => null), c.routines.list() as Promise<RoutineRow[]>, c.food.events.list(weekStart, addDays(weekStart, 6)),
  ]);
  if (!energy?.kcal || !energy.proteinG || !energy.fatG) return null;
  const d = energy.day;
  const adjust = d?.adjust ?? 0;
  const baseKcal = d ? Math.round(((d.base + Math.min(1200, d.stepsKcal * 0.7)) * (1 + adjust)) / 10) * 10 : energy.kcal;
  const trainingKcal = d && d.workoutMinutes > 0 ? Math.round(((d.workoutKcal / d.workoutMinutes) * 60 * 0.7 * (1 + adjust)) / 10) * 10 : 250;
  return weekTargets({
    weekStart, baseKcal, proteinG: energy.proteinG, fatG: energy.fatG, trainingDays: [...new Set(routines.flatMap((r) => r.schedule_days))],
    trainingKcal, events: events.map((e) => ({ date: e.local_date, kind: e.kind })), floorKcal: 1200,
  });
}

export function MealWeek({ today, onLogged }: { today: string; onLogged: () => void }) {
  const weekStart = weekStartOf(today);
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const q = useAsync(async () => {
    const c = kova();
    const [plan, list, pantry] = await Promise.all([c.food.plan.get(weekStart), c.food.shopping.current(), c.food.pantry.list()]);
    return { plan, list, pantry };
  }, [weekStart]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await fn(); q.reload(); } catch (e) { setError(msg(e)); } finally { setBusy(null); }
  };
  const generate = () => run('plan', async () => {
    const days = await targetsFor(weekStart, today);
    if (!days) throw new KovaError('INVALID_INPUT', 'Primero calculá tu meta en «Recalcular meta».');
    await kova().food.plan.generate(weekStart, days as unknown as Array<Record<string, unknown>>);
  });
  const eat = (m: PlanMeal) => run(m.id, async () => {
    for (const ing of m.ingredients) await kova().nutrition.logFood({ id: newId(), local_date: m.local_date, slot: m.slot, quantity: ing.grams, food_id: ing.food_id });
    await kova().food.plan.markLogged(m.id);
    onLogged();
  });
  const swap = (m: PlanMeal) => run('swap:' + m.id, () => kova().food.plan.swap(m.id));
  const buildList = (plan: MealPlan) => run('list', async () => {
    const foods = await kova().food.catalogShop();
    const ingredients = plan.items.filter((m) => m.local_date >= today && !m.logged_at).flatMap((m) => m.ingredients);
    const lines = buildShoppingList(ingredients, foods, (q.data?.pantry ?? []).map((p) => ({ name: p.name, grams: p.grams == null ? null : Number(p.grams) })));
    await kova().food.shopping.create('Compras de la semana', lines, plan.id);
  });

  if (q.loading && !q.data) return <Skeleton height={200} radius={20} />;
  const { plan, list, pantry } = q.data!;
  const target = (plan?.targets as unknown as DayTarget[] | undefined)?.find((t) => t.date === day);
  const meals = (plan?.items ?? []).filter((m) => m.local_date === day)
    .sort((a, b) => MEAL_SLOTS.findIndex(([s]) => s === a.slot) - MEAL_SLOTS.findIndex(([s]) => s === b.slot));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <section aria-labelledby="mw-t" className="kova-panel" style={{ flex: '2 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 id="mw-t" className="kova-section-title">Tu semana</h3>
        {!plan ? (
          <>
            <span className="kova-muted" style={{ fontSize: 14 }}>Te armo las comidas de la semana alrededor de tus entrenamientos. Las preferencias y los eventos se cargan desde el celular.</span>
            <button className="btn btn-primary btn-lg" style={{ alignSelf: 'flex-start' }} onClick={generate} disabled={!!busy} aria-busy={busy === 'plan'}>
              <i className={busy === 'plan' ? 'ph ph-circle-notch kova-spin' : 'ph ph-sparkle'} />Armar mi semana
            </button>
          </>
        ) : (
          <>
            <div role="tablist" aria-label="Día" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Array.from({ length: 7 }, (_, k) => addDays(weekStart, k)).map((d) => (
                <button key={d} role="tab" aria-selected={d === day} className="kova-chip" aria-pressed={d === day} onClick={() => setDay(d)}>
                  {DAY[isoWeekday(d) - 1]} {Number(d.slice(8))}{d === today ? ' · hoy' : ''}
                </button>
              ))}
            </div>
            {target && <span className="kova-muted" style={{ fontSize: 13 }}>{KIND[target.kind]} · ≈ {nf(target.kcal, 0)} kcal · {target.proteinG} g proteína{target.note ? '. ' + target.note : ''}</span>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {meals.map((m) => (
                <div key={m.id} style={{ padding: 14, borderRadius: 'var(--kova-radius-lg)', background: 'var(--kova-surface-raised)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="kova-faint" style={{ fontSize: 12 }}>{SLOT_LABEL[m.slot]}{m.minutes ? ' · ' + m.minutes + ' min' : ''}</span>
                  <button className="btn btn-ghost" style={{ padding: 0, minHeight: 0, justifyContent: 'flex-start', color: 'var(--color-text)', fontWeight: 600, fontSize: 15, textAlign: 'left' }}
                    onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>{m.title}</button>
                  <span className="kova-muted" style={{ fontSize: 13 }}>{nf(m.kcal, 0)} kcal · {nf(m.protein_g, 0)} g prot</span>
                  {open === m.id && m.steps && <span style={{ fontSize: 13 }}>{m.steps}</span>}
                  {m.logged_at ? <span style={{ color: 'var(--kova-ok)', fontSize: 13, fontWeight: 600 }}>✓ Comido</span> : (
                    <span style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                      <button className="btn btn-primary" onClick={() => eat(m)} disabled={!!busy} aria-busy={busy === m.id}><i className="ph ph-check" />Lo comí</button>
                      <button className="btn btn-secondary" onClick={() => swap(m)} disabled={!!busy} aria-busy={busy === 'swap:' + m.id}><i className="ph ph-arrows-clockwise" />Cambiar</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={generate} disabled={!!busy} aria-busy={busy === 'plan'}><i className="ph ph-sparkle" />Rehacer la semana</button>
          </>
        )}
        <span className="kova-faint" style={{ fontSize: 12 }}>Los valores salen del catálogo; los platos los propone la IA. No reemplaza a un profesional.</span>
      </section>

      <section aria-labelledby="sh-t" className="kova-panel" style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 id="sh-t" className="kova-section-title">Compras</h3>
        {list ? <ShoppingBox list={list} onChanged={q.reload} /> : (
          <>
            <span className="kova-muted" style={{ fontSize: 14 }}>{plan ? 'La lista sale de las comidas que te quedan, por góndola y en envases reales.' : 'Cuando armes tu semana, te hago la lista.'}</span>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => plan && buildList(plan)} disabled={!plan || !!busy} aria-busy={busy === 'list'}>
              <i className="ph ph-basket" />Armar la lista de compras
            </button>
          </>
        )}
        {pantry.length > 0 && <span className="kova-faint" style={{ fontSize: 12 }}>En casa: {pantry.map((p) => p.name).join(', ')}.</span>}
        {plan && list && <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => buildList(plan)} disabled={!!busy}>Rehacer la lista con el plan</button>}
      </section>
      {error && <div style={{ flexBasis: '100%' }}><Banner tone="crit">{error}</Banner></div>}
    </div>
  );
}

function ShoppingBox({ list: initial, onChanged }: { list: ShoppingList; onChanged: () => void }) {
  const [list, setList] = useState(initial);
  const toggle = (id: string) => {
    const checked = !list.items.find((i) => i.id === id)?.checked_at;
    setList((cur) => ({ ...cur, items: cur.items.map((i) => (i.id === id ? { ...i, checked_at: checked ? new Date().toISOString() : null } : i)) }));
    kova().food.shopping.check(id, checked).catch(() => undefined);
  };
  const aisles = [...new Set(list.items.map((i) => i.aisle))].sort((a, b) => (AISLE_ORDER.indexOf(a) + 100) % 100 - (AISLE_ORDER.indexOf(b) + 100) % 100);
  const done = list.items.filter((i) => i.checked_at).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="kova-muted" style={{ fontSize: 13 }}>{done} de {list.items.length} en el carrito</span>
      {aisles.map((a) => (
        <fieldset key={a} style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <legend className="kova-faint" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{a}</legend>
          {list.items.filter((i) => i.aisle === a).map((i) => (
            <label key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 36, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!i.checked_at} onChange={() => toggle(i.id)} style={{ width: 18, height: 18, accentColor: 'var(--kova-accent-strong)' }} />
              <span style={{ flex: 1, textDecoration: i.checked_at ? 'line-through' : 'none', color: i.checked_at ? 'var(--kova-text-3)' : undefined }}>{i.name}</span>
              <span className="kova-faint" style={{ fontSize: 12 }}>{i.grams || i.packages ? lineAmount({ grams: i.grams ?? 0, packages: i.packages, package_label: i.package_label }) : ''}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => kova().food.shopping.finish(list).then(onChanged).catch(() => undefined)}>
        <i className="ph ph-check" />Terminé de comprar
      </button>
    </div>
  );
}
