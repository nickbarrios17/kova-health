/** Food log for today: meals by slot, totals vs goal, search + add (snapshotted on the server). */
import { addDays, localDate, MEAL_SLOTS, newId, nf, nutritionSourceLabel, scaleNutrients, VidaError, type NutritionSource } from '@vida/domain';
import { ForkKnife, MagnifyingGlass, Plus, Trash, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { outbox, vida } from '../client';
import { useSession } from '../session';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Empty, ErrorNote, Field, Loading, Notice, Row, Seg, T } from '../ui';

type Slot = (typeof MEAL_SLOTS)[number][0];
interface Food { id: string; name: string; brand: string | null; ref_amount: number; ref_unit: 'g' | 'ml' | 'serving'; serving_label: string | null; default_quantity: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; data_source: NutritionSource }
interface Item { id: string; name: string; quantity: number; unit: string; kcal: number; protein_g: number; data_source: NutritionSource }

const unitLabel = (f: Food) => (f.ref_unit === 'serving' ? (f.serving_label ?? 'porción') : f.ref_unit);
const n = (v: unknown) => Number(v);

export function Comida() {
  const { prefs, deviceId } = useSession();
  const today = localDate(new Date(), prefs!.time_zone);
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState<Slot | null>(null);

  const q = useAsync(async () => {
    const [meals, sum] = await Promise.all([vida.nutrition.day(day), vida.summaries.daily(day, day)]);
    return { meals: meals as Array<{ slot: Slot; meal_items: Item[] }>, s: (sum[0] ?? {}) as Record<string, unknown> };
  }, [day]);

  const remove = async (id: string) => {
    await vida.nutrition.removeItem(id).catch(() => undefined);
    q.reload();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} tintColor={c.accent} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={22} w="medium">Comida</T>
          <Seg options={[[addDays(today, -1), 'Ayer'], [today, 'Hoy']]} value={day} onChange={setDay} />
        </Row>
        {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : (
          <>
            <Card style={{ backgroundColor: c.a900 }}>
              <T size={13} w="medium" color={c.n300}>{day === today ? 'Hoy' : 'Ayer'}</T>
              <Row style={{ alignItems: 'baseline', gap: 6 }}>
                <T size={30} w="medium">{q.data!.s.kcal != null ? nf(Math.round(n(q.data!.s.kcal)), 0) : '0'}</T>
                <T size={13} color={c.n400}>{q.data!.s.kcal_goal != null ? 'de ' + nf(n(q.data!.s.kcal_goal), 0) + ' kcal' : 'kcal'}</T>
              </Row>
              <Row style={{ gap: 16 }}>
                {[['Proteína', 'protein_g', 'protein_goal_g'], ['Carbos', 'carbs_g', 'carbs_goal_g'], ['Grasa', 'fat_g', 'fat_goal_g']].map(([l, k, g]) => (
                  <View key={l} style={{ flex: 1 }}>
                    <T size={11} color={c.n400}>{l}</T>
                    <T size={14} w="medium">{Math.round(n(q.data!.s[k!] ?? 0))}{q.data!.s[g!] != null ? ' / ' + n(q.data!.s[g!]) : ''} g</T>
                  </View>
                ))}
              </Row>
              {q.data!.s.nutrition_has_unverified ? <Notice text="Incluye valores introducidos por ti o estimados." /> : null}
            </Card>

            {MEAL_SLOTS.map(([slot, label]) => {
              const items = q.data!.meals.find((m) => m.slot === slot)?.meal_items ?? [];
              return (
                <Card key={slot} style={{ gap: 8 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T size={16} w="medium">{label}</T>
                    <T size={13} color={c.n400}>{items.length ? nf(Math.round(items.reduce((a, i) => a + n(i.kcal), 0)), 0) + ' kcal' : ''}</T>
                  </Row>
                  {items.map((i) => (
                    <Row key={i.id}>
                      <View style={{ flex: 1 }}>
                        <T size={14}>{i.name}</T>
                        <T size={12} color={c.n400}>{nf(n(i.quantity), 1)} {i.unit === 'serving' ? '×' : i.unit} · {nf(Math.round(n(i.kcal)), 0)} kcal · {nf(n(i.protein_g), 0)} g prot · {nutritionSourceLabel(i.data_source)}</T>
                      </View>
                      <Pressable accessibilityLabel={'Quitar ' + i.name} onPress={() => remove(i.id)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Trash size={18} color={c.n400} /></Pressable>
                    </Row>
                  ))}
                  <Button variant="ghost" label="Añadir" icon={Plus} onPress={() => setAdding(slot)} style={{ alignSelf: 'flex-start' }} />
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
      {adding ? (
        <AddFood slot={adding} day={day} deviceId={deviceId} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); q.reload(); }} />
      ) : null}
    </View>
  );
}

function AddFood({ slot, day, deviceId, onClose, onAdded }: { slot: Slot; day: string; deviceId: string | null; onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState('');
  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState({ name: '', ref: '100', unit: 'g' as 'g' | 'serving', kcal: '', p: '', c: '', f: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useAsync(async () => (query.trim().length >= 2 ? ((await vida.nutrition.searchFoods(query)) as Food[]) : []), [query]);
  const label = MEAL_SLOTS.find(([s]) => s === slot)![1];

  const log = async (food: Food, quantity: number) => {
    setBusy(true);
    setError(null);
    try {
      await outbox.enqueue({ kind: 'log_food', input: { id: newId(), local_date: day, slot, quantity, food_id: food.id, device_id: deviceId } });
      await outbox.flush();
      onAdded();
    } catch (e) {
      setError(e instanceof VidaError ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  };

  const createAndLog = async () => {
    const num = (s: string) => Number(s.replace(',', '.'));
    setBusy(true);
    setError(null);
    try {
      const food = (await vida.nutrition.createFood({
        id: newId(), name: mf.name, ref_amount: mf.unit === 'serving' ? 1 : num(mf.ref), ref_unit: mf.unit,
        kcal: num(mf.kcal), protein_g: num(mf.p), carbs_g: num(mf.c), fat_g: num(mf.f), data_source: 'user',
      })) as Food;
      setManual(false);
      setPicked(food);
      setQty(String(food.ref_amount));
    } catch (e) {
      setError(e instanceof VidaError ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  };

  const qn = Number(qty.replace(',', '.'));
  const preview = picked && qn > 0 ? scaleNutrients({ ...picked, kcal: Number(picked.kcal), protein_g: Number(picked.protein_g), carbs_g: Number(picked.carbs_g), fat_g: Number(picked.fat_g), ref_amount: Number(picked.ref_amount) }, qn) : null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityLabel="Cerrar" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <T size={17} w="medium" style={{ flex: 1 }}>Añadir a {label}</T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {error ? <Notice tone="warn" text={error} /> : null}
          {picked ? (
            <Card>
              <T size={16} w="medium">{picked.name}</T>
              <T size={12} color={c.n400}>{nf(Number(picked.kcal), 0)} kcal por {nf(Number(picked.ref_amount), 1)} {unitLabel(picked)} · {nutritionSourceLabel(picked.data_source)}</T>
              <Field label={'Cantidad (' + (picked.ref_unit === 'serving' ? 'porciones' : picked.ref_unit) + ')'} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
              {preview ? <T size={13} color={c.n300}>{nf(preview.kcal, 0)} kcal · {nf(preview.protein_g, 1)} g proteína · {nf(preview.carbs_g, 1)} g carbos · {nf(preview.fat_g, 1)} g grasa</T> : null}
              <Button label="Añadir" icon={Plus} busy={busy} disabled={!(qn > 0)} onPress={() => log(picked, qn)} />
              <Button variant="ghost" label="Elegir otro alimento" onPress={() => setPicked(null)} />
            </Card>
          ) : manual ? (
            <Card>
              <T size={16} w="medium">Alimento nuevo</T>
              <Notice text="Copia los valores de la etiqueta. Se guardan como introducidos por ti." />
              <Field label="Nombre" value={mf.name} onChangeText={(v) => setMf({ ...mf, name: v })} />
              <Seg options={[['g', 'Por gramos'], ['serving', 'Por porción']]} value={mf.unit} onChange={(v) => setMf({ ...mf, unit: v })} />
              {mf.unit === 'g' ? <Field label="Valores por (g)" value={mf.ref} onChangeText={(v) => setMf({ ...mf, ref: v })} keyboardType="decimal-pad" /> : null}
              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="kcal" value={mf.kcal} onChangeText={(v) => setMf({ ...mf, kcal: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Proteína g" value={mf.p} onChangeText={(v) => setMf({ ...mf, p: v })} keyboardType="decimal-pad" /></View>
              </Row>
              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="Carbos g" value={mf.c} onChangeText={(v) => setMf({ ...mf, c: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Grasa g" value={mf.f} onChangeText={(v) => setMf({ ...mf, f: v })} keyboardType="decimal-pad" /></View>
              </Row>
              <Button label="Guardar alimento" busy={busy} disabled={!mf.name || !mf.kcal || !mf.p || !mf.c || !mf.f} onPress={createAndLog} />
              <Button variant="ghost" label="Volver a buscar" onPress={() => setManual(false)} />
            </Card>
          ) : (
            <>
              <Field label="Buscar alimento" value={query} onChangeText={setQuery} placeholder="Ej.: avena, pollo…" autoFocus />
              {results.loading && query.trim().length >= 2 ? <Loading /> : null}
              {(results.data ?? []).map((f) => (
                <Pressable key={f.id} onPress={() => { setPicked(f); setQty(String(f.default_quantity ?? f.ref_amount)); }}
                  style={{ padding: 12, borderRadius: r.md, backgroundColor: c.surface, gap: 2 }}>
                  <T size={14}>{f.name}{f.brand ? ' · ' + f.brand : ''}</T>
                  <T size={12} color={c.n400}>{nf(Number(f.kcal), 0)} kcal / {nf(Number(f.ref_amount), 1)} {unitLabel(f)} · {nutritionSourceLabel(f.data_source)}</T>
                </Pressable>
              ))}
              {query.trim().length >= 2 && !results.loading && (results.data ?? []).length === 0 ? (
                <Empty icon={MagnifyingGlass} title="Sin resultados">El catálogo verificado aún no está disponible. Crea el alimento con los datos de la etiqueta.</Empty>
              ) : null}
              {query.trim().length < 2 ? <Empty icon={ForkKnife} title="Busca o crea un alimento">Escribe al menos 2 letras. Si no aparece, créalo con los valores de la etiqueta.</Empty> : null}
              <Button variant="secondary" label="Crear alimento" icon={Plus} onPress={() => setManual(true)} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
