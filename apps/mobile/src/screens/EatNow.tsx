/**
 * «¿Qué como ahora?»: you say what you have, and Kova proposes the meals still left today so the day
 * closes on your target. If only the dinner is left, one meal; at breakfast time, the whole day.
 * Grams come from the catalog and are tuned to each meal's target; what you have to buy is marked.
 */
import { MEAL_SLOTS, mealsLeft, newId, nf, KovaError, type MealLeft } from '@kova/domain';
import type { NowMeal } from '@kova/api-client';
import { Check, Sparkle, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { kova, outbox } from '../client';
import { c, rad } from '../theme';
import { useAsync } from '../useAsync';
import { Banner, Button, Chip, Field, KeyboardRoom, Loading, Row, T } from '../ui';

const SLOT_LABEL = Object.fromEntries(MEAL_SLOTS) as Record<string, string>;
const msg = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');
const n = (v: unknown) => Number(v ?? 0);

export function EatNow({ day, deviceId, onClose, onLogged }: { day: string; deviceId: string | null; onClose: () => void; onLogged: () => void }) {
  const q = useAsync(async () => {
    const [energy, sum, meals, prefs, pantry] = await Promise.all([
      kova.energy.today(day).catch(() => null), kova.summaries.daily(day, day).catch(() => []), kova.nutrition.day(day),
      kova.food.preferences.get().catch(() => null), kova.food.pantry.list().catch(() => []),
    ]);
    const s = (sum[0] ?? {}) as Record<string, unknown>;
    const eaten = { kcal: n(s.kcal), protein: n(s.protein_g), carbs: n(s.carbs_g), fat: n(s.fat_g) };
    const goal = energy?.kcal != null && energy.proteinG != null ? energy : null;
    const logged = (meals as Array<{ slot: string; meal_items: unknown[] }>).filter((m) => m.meal_items.length).map((m) => m.slot);
    const left = goal ? {
      kcal: Math.max(0, goal.kcal! - eaten.kcal), proteinG: Math.max(0, goal.proteinG! - eaten.protein),
      carbsG: goal.carbsG == null ? null : Math.max(0, goal.carbsG - eaten.carbs), fatG: goal.fatG == null ? null : Math.max(0, goal.fatG - eaten.fat),
    } : null;
    const pending = left ? mealsLeft({ mealsPerDay: prefs?.meals_per_day ?? 4, logged, left, hour: new Date().getHours(), goalKcal: goal?.kcal ?? undefined }) : [];
    return { goal, eaten, left, pending, pantry: pantry.map((p) => p.name) };
  }, [day]);

  const [off, setOff] = useState<string[]>([]);
  const [have, setHave] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ note: string | null; meals: NowMeal[] } | null>(null);
  const [eatenIds, setEatenIds] = useState<string[]>([]);

  const d = q.data;
  const chosen: MealLeft[] = (d?.pending ?? []).filter((m) => !off.includes(m.slot));

  const ask = async () => {
    setBusy('ask');
    setError(null);
    try {
      const out = await kova.food.now(have, chosen.map((m) => ({ slot: m.slot, kcal: m.kcal, protein_g: m.proteinG })));
      if (!out.meals.length) setError('No pudimos armar comidas con eso. Probá contarlo con otras palabras.');
      else setRes(out);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  const eat = async (m: NowMeal) => {
    setBusy(m.slot);
    setError(null);
    try {
      for (const ing of m.ingredients) {
        await outbox.enqueue({ kind: 'log_food', input: { id: newId(), local_date: day, slot: m.slot, quantity: ing.grams, food_id: ing.food_id, device_id: deviceId } });
      }
      await outbox.flush().catch(() => undefined);
      setEatenIds((x) => [...x, m.slot]);
      onLogged();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  const sum = (k: 'kcal' | 'protein_g') => (res?.meals ?? []).reduce((a, m) => a + m[k], 0);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardRoom modal style={{ backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <T size={17} w="semibold" style={{ flex: 1 }}>¿Qué como ahora?</T>
        </Row>
        <ScrollView keyboardShouldPersistTaps="handled" disableScrollViewPanResponder contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14 }}>
          {q.loading && !d ? <Loading /> : !d?.goal || !d.left ? (
            <Banner tone="warn" text="Para saber qué te falta necesito tu meta del día. Calculala en Ajustes → Recalcular meta." />
          ) : !d.pending.length ? (
            <Banner tone="ok" title="Ya llegaste a tu meta de hoy" text={'Comiste ' + nf(Math.round(d.eaten.kcal), 0) + ' de ' + nf(d.goal.kcal!, 0) + ' kcal. Si tenés hambre, algo liviano: fruta, yogur o verduras.'} />
          ) : !res ? (
            <>
              <View style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 8 }}>
                <T size={13} w="medium" color={c.n300}>Te falta para hoy</T>
                <Row style={{ alignItems: 'baseline', gap: 6 }}>
                  <T size={26} w="medium">{nf(d.left.kcal, 0)}</T>
                  <T size={13} color={c.n400}>kcal · {nf(d.left.proteinG, 0)} g proteína{d.left.carbsG != null ? ' · ' + nf(d.left.carbsG, 0) + ' g carbos' : ''}{d.left.fatG != null ? ' · ' + nf(d.left.fatG, 0) + ' g grasa' : ''}</T>
                </Row>
                {d.pending.reduce((a, m) => a + m.kcal, 0) < d.left.kcal - 150 ? (
                  <T size={13} color={c.n400}>No hace falta compensar todo de golpe: te armo {d.pending.length === 1 ? 'una comida completa' : 'comidas completas'}, sin pasarte. Si hoy no llegás a la meta, no pasa nada.</T>
                ) : null}
                <T size={13} color={c.n400}>{d.pending.length === 1 ? 'Te queda una comida:' : 'Te quedan ' + d.pending.length + ' comidas. Tocá las que querés que arme:'}</T>
                <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                  {d.pending.map((m) => (
                    <Chip key={m.slot} label={SLOT_LABEL[m.slot] + ' · ' + nf(m.kcal, 0) + ' kcal'} selected={!off.includes(m.slot)}
                      onPress={d.pending.length > 1 ? () => setOff((o) => (o.includes(m.slot) ? o.filter((x) => x !== m.slot) : [...o, m.slot])) : undefined} />
                  ))}
                </Row>
              </View>
              <Field label="¿Qué tenés?" value={have} onChangeText={setHave} multiline
                placeholder="Ej.: pechuga de pollo, arroz, huevos, tomate y queso" />
              {d.pantry.length ? <T size={12} color={c.n500}>También uso lo que anotaste en casa: {d.pantry.slice(0, 12).join(', ')}{d.pantry.length > 12 ? '…' : ''}</T> : null}
              {error ? <Banner tone="warn" text={error} /> : null}
              <Button large label={chosen.length > 1 ? 'Armame las ' + chosen.length + ' comidas' : 'Armame la comida'} icon={Sparkle} onPress={ask}
                busy={busy === 'ask'} disabled={!chosen.length || (!have.trim() && !d.pantry.length)} />
              {!have.trim() && !d.pantry.length ? <T size={12} color={c.n500}>Contame qué tenés y lo armo con eso.</T> : null}
            </>
          ) : (
            <>
              {res.note ? <Banner tone="info" text={res.note} /> : null}
              {res.meals.map((m) => {
                const done = eatenIds.includes(m.slot);
                const buy = m.ingredients.filter((i) => !i.home);
                return (
                  <View key={m.slot} style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 8 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T size={13} w="semibold" color={c.n300}>{SLOT_LABEL[m.slot]}</T>
                      <T size={12} color={c.n400}>{m.minutes} min</T>
                    </Row>
                    <T size={17} w="semibold">{m.title}</T>
                    <T size={13} color={c.n300}>{nf(m.kcal, 0)} kcal · {nf(m.protein_g, 0)} g proteína · {nf(m.carbs_g, 0)} g carbos · {nf(m.fat_g, 0)} g grasa</T>
                    <View style={{ gap: 2 }}>
                      {m.ingredients.map((i) => (
                        <T key={i.food_id} size={14} color={i.home ? c.text : c.n400}>• {nf(i.grams, 0)} g {i.name.replace(/\s*\(.*\)\s*$/, '')}{i.home ? '' : ' · a comprar'}</T>
                      ))}
                    </View>
                    {m.steps ? <T size={13} color={c.n400}>{m.steps}</T> : null}
                    {buy.length ? <T size={12} color={c.n500}>Te falta: {buy.map((i) => i.name.replace(/\s*\(.*\)\s*$/, '')).join(', ')}.</T> : null}
                    {done ? <T size={14} w="semibold" color={c.ok}>✓ Anotado en {SLOT_LABEL[m.slot]}</T> : (
                      <Button label="Lo comí: anotarlo" icon={Check} onPress={() => eat(m)} busy={busy === m.slot} disabled={busy != null && busy !== m.slot} />
                    )}
                  </View>
                );
              })}
              <T size={13} color={c.n300}>
                Con esto sumás {nf(Math.round(sum('kcal')), 0)} kcal y {nf(Math.round(sum('protein_g')), 0)} g de proteína: cerrás el día en {nf(Math.round(d.eaten.kcal + sum('kcal')), 0)} de {nf(d.goal.kcal!, 0)} kcal.
              </T>
              {error ? <Banner tone="warn" text={error} /> : null}
              <Button variant="secondary" label="Probar con otra cosa" onPress={() => { setRes(null); setEatenIds([]); }} />
              <T size={11} color={c.n500}>Valores del catálogo de Kova; los gramos se ajustan para que cada comida llegue a lo que te falta.</T>
            </>
          )}
        </ScrollView>
      </KeyboardRoom>
    </Modal>
  );
}
