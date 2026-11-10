/**
 * Comidas, etapa 2 (docs/comidas.md): «Tu semana». Preferences, a weekly plan built around the person's
 * training and events, today's meals with «Lo comí» (logs them) and «Cambiar» (another meal like it).
 */
import { addDays, isoWeekday, MEAL_SLOTS, newId, nf, weekStartOf, weekTargets, KovaError, type DayTarget } from '@kova/domain';
import type { FoodPreferences, MealEvent, MealPlan, PlanMeal } from '@kova/api-client';
import { ArrowsClockwise, CalendarPlus, Check, CookingPot, ForkKnife, GearSix, Pause, Play, Sparkle, X } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { kova, outbox } from '../client';
import { c, rad } from '../theme';
import { loadTraining } from '../training';
import { useAsync } from '../useAsync';
import { Banner, Button, Chip, Field, Row, Seg, Sheet, Skeleton, T } from '../ui';

const SLOT_LABEL = Object.fromEntries(MEAL_SLOTS) as Record<string, string>;
const DAY_LETTER = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const KIND_LABEL: Record<DayTarget['kind'], string> = { fuerza: 'Día de fuerza', descanso: 'Día de descanso', evento: 'Día con evento' };
const EVENT_LABEL: Record<MealEvent['kind'], string> = { asado: 'Asado', salida: 'Salida a comer', cumple: 'Cumpleaños', otro: 'Otro evento' };
const msg = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');
const DEFAULT_PREFS: FoodPreferences = { diet: 'omnivora', dislikes: [], allergies: [], meals_per_day: 4, cook_minutes: 30, people: 1, budget_week_ars: null, notes: null };

/** The week's day targets from today's energy target, the routines and the events. */
async function targetsFor(weekStart: string, today: string, events: MealEvent[]) {
  const [energy, training] = await Promise.all([kova.energy.today(today).catch(() => null), loadTraining()]);
  if (!energy?.kcal || !energy.proteinG || !energy.fatG) return null;
  const d = energy.day;
  // A normal day: resting energy + the usual steps, without the workout (it is added on routine days).
  const adjust = d?.adjust ?? 0;
  const baseKcal = d ? Math.round(((d.base + Math.min(1200, d.stepsKcal * 0.7)) * (1 + adjust)) / 10) * 10 : energy.kcal;
  // ~1 h of strength: from today's workout if there was one, else a typical 250 kcal (an estimate).
  const trainingKcal = d && d.workoutMinutes > 0 ? Math.round(((d.workoutKcal / d.workoutMinutes) * 60 * 0.7 * (1 + adjust)) / 10) * 10 : 250;
  const trainingDays = [...new Set(training.routines.flatMap((r) => r.schedule_days))];
  return weekTargets({ weekStart, baseKcal, proteinG: energy.proteinG, fatG: energy.fatG, trainingDays, trainingKcal, events: events.map((e) => ({ date: e.local_date, kind: e.kind })), floorKcal: 1200 });
}

export function MealPlanCard({ today, deviceId, onLogged }: { today: string; deviceId: string | null; onLogged: () => void }) {
  const weekStart = weekStartOf(today);
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [open, setOpen] = useState<PlanMeal | null>(null);
  const [cook, setCook] = useState(false);

  const q = useAsync(async () => {
    const [prefs, plan, events] = await Promise.all([
      kova.food.preferences.get(), kova.food.plan.get(weekStart), kova.food.events.list(weekStart, addDays(weekStart, 6)),
    ]);
    return { prefs, plan, events };
  }, [weekStart]);

  const generate = async () => {
    setBusy('plan');
    setError(null);
    try {
      const days = await targetsFor(weekStart, today, q.data?.events ?? []);
      if (!days) throw new KovaError('INVALID_INPUT', 'Primero calculá tu meta en Ajustes → Recalcular meta.');
      await kova.food.plan.generate(weekStart, days as unknown as Array<Record<string, unknown>>);
      q.reload();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  const eat = async (m: PlanMeal) => {
    setBusy(m.id);
    setError(null);
    try {
      for (const ing of m.ingredients) {
        await outbox.enqueue({ kind: 'log_food', input: { id: newId(), local_date: m.local_date, slot: m.slot, quantity: ing.grams, food_id: ing.food_id, device_id: deviceId } });
      }
      await outbox.flush().catch(() => undefined);
      await kova.food.plan.markLogged(m.id);
      q.reload();
      onLogged();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  const swap = async (m: PlanMeal) => {
    setBusy('swap:' + m.id);
    setError(null);
    try {
      await kova.food.plan.swap(m.id);
      q.reload();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  if (q.loading && !q.data) return <Skeleton height={180} radius={rad.sheet} />;
  const { prefs, plan, events } = q.data ?? { prefs: null, plan: null, events: [] as MealEvent[] };
  const target = (plan?.targets as unknown as DayTarget[] | undefined)?.find((t) => t.date === day);
  const meals = (plan?.items ?? []).filter((m) => m.local_date === day).sort((a, b) => MEAL_SLOTS.findIndex(([s]) => s === a.slot) - MEAL_SLOTS.findIndex(([s]) => s === b.slot));
  const dayEvents = events.filter((e) => e.local_date === day);

  return (
    <View style={{ padding: 16, borderRadius: rad.sheet, backgroundColor: c.surface, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={17} w="semibold" accessibilityRole="header">Tu semana</T>
        <Row style={{ gap: 4 }}>
          <Button variant="text" label="Evento" icon={CalendarPlus} onPress={() => setEventOpen(true)} accessibilityLabel="Agregar un evento, como un asado" />
          <Button variant="text" label="" icon={GearSix} onPress={() => setPrefsOpen(true)} accessibilityLabel="Preferencias de comida" />
        </Row>
      </Row>

      {!plan ? (
        <View style={{ gap: 10 }}>
          <T size={14} color={c.n400}>
            Te armo las comidas de la semana alrededor de tus entrenamientos: más carbohidratos los días de fuerza y, si tenés un asado, el resto de la semana lo compensa.
          </T>
          {!prefs ? <Button variant="secondary" label="Contame qué te gusta" icon={ForkKnife} onPress={() => setPrefsOpen(true)} /> : null}
          <Button large label="Armar mi semana" icon={Sparkle} onPress={generate} busy={busy === 'plan'} />
          {busy === 'plan' ? <T size={12} color={c.n500}>Puede tardar hasta un minuto.</T> : null}
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {Array.from({ length: 7 }, (_, k) => addDays(weekStart, k)).map((d) => (
              <Chip key={d} label={DAY_LETTER[isoWeekday(d) - 1] + ' ' + Number(d.slice(8))} selected={d === day} onPress={() => setDay(d)}
                accessibilityLabel={d === today ? 'Hoy' : d} />
            ))}
          </ScrollView>
          {target ? (
            <T size={13} color={c.n400}>{KIND_LABEL[target.kind]} · ≈ {nf(target.kcal, 0)} kcal · {target.proteinG} g proteína{target.note ? '. ' + target.note : ''}</T>
          ) : null}
          {dayEvents.map((e) => <Banner key={e.id} tone="info" glyph="✦" text={EVENT_LABEL[e.kind] + (e.note ? ' · ' + e.note : '')} />)}
          {meals.map((m) => (
            <View key={m.id} style={{ padding: 12, borderRadius: rad.card, backgroundColor: c.raised, gap: 6 }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={12} w="medium" color={c.n400}>{SLOT_LABEL[m.slot]}{m.minutes ? ' · ' + m.minutes + ' min' : ''}</T>
                  <T size={15} w="semibold" onPress={() => setOpen(m)}>{m.title}</T>
                  <T size={12} color={c.n400}>{nf(m.kcal, 0)} kcal · {nf(m.protein_g, 0)} g prot</T>
                </View>
                {m.logged_at ? <T size={13} w="semibold" color={c.ok}>✓ Comido</T> : null}
              </Row>
              {!m.logged_at ? (
                <Row style={{ gap: 8 }}>
                  <Button label="Lo comí" icon={Check} onPress={() => eat(m)} busy={busy === m.id} disabled={!!busy && busy !== m.id} style={{ flex: 1, minHeight: 44 }} />
                  <Button variant="secondary" label="Cambiar" icon={ArrowsClockwise} onPress={() => swap(m)} busy={busy === 'swap:' + m.id} disabled={!!busy && busy !== 'swap:' + m.id} style={{ minHeight: 44 }} />
                </Row>
              ) : null}
            </View>
          ))}
          <Row style={{ gap: 4, flexWrap: 'wrap' }}>
            <Button variant="secondary" label="Cocinar para varios días" icon={CookingPot} onPress={() => setCook(true)} />
            <Button variant="text" label="Rehacer la semana" icon={Sparkle} onPress={generate} busy={busy === 'plan'} />
          </Row>
        </>
      )}
      {error ? <Banner tone="crit" text={error} /> : null}
      <T size={11} color={c.n500}>Los valores salen del catálogo; los platos los propone la IA. No reemplaza a un profesional.</T>

      {prefsOpen ? <PrefsSheet initial={prefs ?? DEFAULT_PREFS} onClose={() => setPrefsOpen(false)} onSaved={() => { setPrefsOpen(false); q.reload(); }} /> : null}
      {eventOpen ? <EventSheet weekStart={weekStart} today={today} events={events} onClose={() => setEventOpen(false)} onChanged={() => q.reload()} hasPlan={!!plan} onRedo={() => { setEventOpen(false); generate(); }} /> : null}
      {cook && plan ? <CookSession plan={plan} today={today} onClose={() => setCook(false)} /> : null}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open ? <MealDetail meal={open} /> : null}
      </Sheet>
    </View>
  );
}

function MealDetail({ meal }: { meal: PlanMeal }) {
  return (
    <View style={{ gap: 8 }}>
      <T size={13} color={c.n400}>{SLOT_LABEL[meal.slot]}{meal.minutes ? ' · ' + meal.minutes + ' min' : ''} · {nf(meal.kcal, 0)} kcal · {nf(meal.protein_g, 0)} g prot · {nf(meal.carbs_g, 0)} g carbos · {nf(meal.fat_g, 0)} g grasa</T>
      {meal.steps ? <T size={14}>{meal.steps}</T> : null}
      <IngredientList meal={meal} />
    </View>
  );
}

function IngredientList({ meal }: { meal: PlanMeal }) {
  const q = useAsync(async () => {
    const rows = (await kova.food.foodsByIds(meal.ingredients.map((i) => i.food_id))) as Array<{ id: string; name: string }>;
    return new Map(rows.map((r) => [r.id, r.name]));
  }, [meal.id]);
  return (
    <View style={{ gap: 4 }}>
      {meal.ingredients.map((i) => (
        <T key={i.food_id} size={14}>· {q.data?.get(i.food_id) ?? 'Ingrediente'}: {nf(i.grams, 0)} g</T>
      ))}
    </View>
  );
}

function PrefsSheet({ initial, onClose, onSaved }: { initial: FoodPreferences; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(initial);
  const [dislikes, setDislikes] = useState(initial.dislikes.join(', '));
  const [allergies, setAllergies] = useState(initial.allergies.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await kova.food.preferences.save({ ...p, dislikes: list(dislikes), allergies: list(allergies) });
      onSaved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} title="Qué te gusta">
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <T size={13} w="medium" color={c.n400}>Cómo comés</T>
        <Seg stretch value={p.diet} onChange={(diet) => setP({ ...p, diet })} label="Tipo de alimentación"
          options={[['omnivora', 'De todo'], ['vegetariana', 'Vegetariana'], ['vegana', 'Vegana'], ['sin_tacc', 'Sin TACC']]} />
        <T size={13} w="medium" color={c.n400}>Comidas por día</T>
        <Seg stretch value={String(p.meals_per_day) as '3' | '4' | '5'} onChange={(v) => setP({ ...p, meals_per_day: Number(v) })} label="Comidas por día"
          options={[['3', '3'], ['4', '4 (con merienda)'], ['5', '5']]} />
        <T size={13} w="medium" color={c.n400}>Tiempo para cocinar</T>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {[15, 30, 45, 60].map((m) => <Chip key={m} label={'Hasta ' + m + ' min'} selected={p.cook_minutes === m} onPress={() => setP({ ...p, cook_minutes: m })} />)}
        </Row>
        <T size={13} w="medium" color={c.n400}>¿Para cuántos cocinás?</T>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {[1, 2, 3, 4].map((n) => <Chip key={n} label={n === 1 ? 'Solo para mí' : n + ' personas'} selected={p.people === n} onPress={() => setP({ ...p, people: n })} />)}
        </Row>
        <Field label="Lo que no te gusta (separado por comas)" value={dislikes} onChangeText={setDislikes} placeholder="Ej.: hígado, berenjena" />
        <Field label="Alergias o intolerancias" value={allergies} onChangeText={setAllergies} placeholder="Ej.: maní, lactosa" />
        <Chip label="Presupuesto ajustado" selected={p.budget_week_ars != null} onPress={() => setP({ ...p, budget_week_ars: p.budget_week_ars == null ? 1 : null })} />
        {error ? <Banner tone="crit" text={error} /> : null}
        <Button large label="Guardar" icon={Check} onPress={save} busy={busy} />
      </ScrollView>
    </Sheet>
  );
}

function EventSheet({ weekStart, today, events, onClose, onChanged, hasPlan, onRedo }: {
  weekStart: string; today: string; events: MealEvent[]; onClose: () => void; onChanged: () => void; hasPlan: boolean; onRedo: () => void;
}) {
  const [kind, setKind] = useState<MealEvent['kind']>('asado');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const days = Array.from({ length: 7 }, (_, k) => addDays(weekStart, k)).filter((d) => d >= today);
  const add = async () => {
    setBusy(true);
    try {
      await kova.food.events.add(date, kind);
      setAdded(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} title="Tengo un evento">
      <T size={14} color={c.n400}>Ese día sumamos lo que suele traer el evento y el resto de la semana lo compensa un poco (como mucho un 10 % por día).</T>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {(Object.keys(EVENT_LABEL) as MealEvent['kind'][]).map((k) => <Chip key={k} label={EVENT_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />)}
      </Row>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {days.map((d) => <Chip key={d} label={DAY_LETTER[isoWeekday(d) - 1] + ' ' + Number(d.slice(8))} selected={date === d} onPress={() => setDate(d)} />)}
      </Row>
      {events.map((e) => (
        <Row key={e.id} style={{ justifyContent: 'space-between' }}>
          <T size={14}>{EVENT_LABEL[e.kind]} · {DAY_LETTER[isoWeekday(e.local_date) - 1]} {Number(e.local_date.slice(8))}</T>
          <Button variant="text" label="Quitar" onPress={() => { kova.food.events.remove(e.id).then(onChanged).catch(() => undefined); }} />
        </Row>
      ))}
      {added && hasPlan ? (
        <Button large label="Rehacer la semana con el evento" icon={Sparkle} onPress={onRedo} />
      ) : (
        <Button large label="Agregar" icon={CalendarPlus} onPress={add} busy={busy} disabled={!days.length} />
      )}
    </Sheet>
  );
}

/**
 * «Cocinar para varios días»: the lunches and dinners of the next days, the ingredients all together,
 * a timer per dish and, at the end, which container goes to which day.
 */
function CookSession({ plan, today, onClose }: { plan: MealPlan; today: string; onClose: () => void }) {
  const [days, setDays] = useState(3);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [timer, setTimer] = useState<{ id: string; left: number; running: boolean } | null>(null);
  const meals = plan.items
    .filter((m) => m.local_date >= today && m.local_date < addDays(today, days) && (m.slot === 'lunch' || m.slot === 'dinner') && !m.logged_at)
    .sort((a, b) => a.local_date.localeCompare(b.local_date) || (a.slot === 'lunch' ? 0 : 1) - (b.slot === 'lunch' ? 0 : 1));
  const names = useAsync(async () => {
    const ids = [...new Set(meals.flatMap((m) => m.ingredients.map((i) => i.food_id)))];
    return new Map(((await kova.food.foodsByIds(ids)) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));
  }, [days, plan.id]);
  const totals = new Map<string, number>();
  for (const m of meals) for (const i of m.ingredients) totals.set(i.food_id, (totals.get(i.food_id) ?? 0) + i.grams);

  useEffect(() => {
    if (!timer?.running) return;
    const iv = setInterval(() => setTimer((t) => (t && t.running ? (t.left <= 1 ? { ...t, left: 0, running: false } : { ...t, left: t.left - 1 }) : t)), 1000);
    return () => clearInterval(iv);
  }, [timer?.running]);
  const clock = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const allDone = meals.length > 0 && meals.every((m) => done[m.id]);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <T size={17} w="semibold" style={{ flex: 1 }}>Cocinar para varios días</T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14 }}>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {[2, 3, 4, 5].map((n) => <Chip key={n} label={n + ' días'} selected={days === n} onPress={() => setDays(n)} />)}
          </Row>
          {!meals.length ? <T size={14} color={c.n400}>No quedan almuerzos ni cenas para esos días.</T> : null}
          {meals.length ? (
            <View style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 4 }}>
              <T size={15} w="semibold">Todo junto</T>
              {[...totals.entries()].map(([id, g]) => <T key={id} size={14} color={c.n400}>· {names.data?.get(id) ?? 'Ingrediente'}: {nf(g, 0)} g</T>)}
            </View>
          ) : null}
          {meals.map((m) => (
            <View key={m.id} style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 6, opacity: done[m.id] ? 0.6 : 1 }}>
              <T size={12} color={c.n400}>{DAY_LETTER[isoWeekday(m.local_date) - 1]} {Number(m.local_date.slice(8))} · {SLOT_LABEL[m.slot]}{m.minutes ? ' · ' + m.minutes + ' min' : ''}</T>
              <T size={15} w="semibold">{m.title}</T>
              {m.steps ? <T size={13} color={c.n400}>{m.steps}</T> : null}
              <Row style={{ gap: 8 }}>
                {m.minutes ? (
                  timer?.id === m.id ? (
                    <Button variant="secondary" label={(timer.left === 0 ? '¡Listo! ' : '') + clock(timer.left)} icon={timer.running ? Pause : Play}
                      onPress={() => setTimer({ ...timer, running: !timer.running && timer.left > 0 })} accessibilityLabel={'Temporizador ' + clock(timer.left)} />
                  ) : (
                    <Button variant="secondary" label={'Temporizador ' + m.minutes + ' min'} icon={Play} onPress={() => setTimer({ id: m.id, left: (m.minutes ?? 0) * 60, running: true })} />
                  )
                ) : null}
                <Button label={done[m.id] ? 'Hecho' : 'Listo'} icon={Check} variant={done[m.id] ? 'secondary' : 'primary'} onPress={() => setDone((cur) => ({ ...cur, [m.id]: !cur[m.id] }))} />
              </Row>
            </View>
          ))}
          {allDone ? (
            <View style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.okSoft, gap: 4 }}>
              <T size={15} w="semibold" color={c.ok}>✓ Repartí en táperes</T>
              {meals.map((m, k) => <T key={m.id} size={14}>Táper {k + 1}: {DAY_LETTER[isoWeekday(m.local_date) - 1]} {Number(m.local_date.slice(8))}, {SLOT_LABEL[m.slot].toLowerCase()} · {m.title}</T>)}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
