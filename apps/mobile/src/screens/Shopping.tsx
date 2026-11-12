/**
 * Comidas, etapa 3 (docs/comidas.md): the shopping list from «Tu semana» (by aisle, real packages, minus
 * what is at home) and the pantry, filled by hand, from a receipt or from a photo of the fridge.
 */
import { AISLE_ORDER, buildShoppingList, lineAmount, nf, shoppingFromPlan, RECEIPT_KIND_LABEL, reviewReceipt, weekStartOf, KovaError, type ReceiptItem } from '@kova/domain';
import type { Pantry, ShoppingList } from '@kova/api-client';
import * as ImagePicker from 'expo-image-picker';
import { Basket, Camera, Check, House, Plus, Receipt, ShareNetwork, ShoppingCart, Trash, UsersThree, Warning, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { kova } from '../client';
import { c, rad } from '../theme';
import { useAsync } from '../useAsync';
import { Banner, Button, Field, Row, Sheet, Skeleton, T, KeyboardRoom } from '../ui';

const msg = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');

async function photo() {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true, exif: false };
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new KovaError('FORBIDDEN', 'Sin permiso de cámara.');
  }
  const res = Platform.OS !== 'web' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  return a?.base64 ? { mime: a.mimeType && /^image\/(jpeg|png|webp)$/.test(a.mimeType) ? a.mimeType : 'image/jpeg', data: a.base64 } : null;
}

export function ShoppingCard({ today }: { today: string }) {
  const weekStart = weekStartOf(today);
  const [open, setOpen] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [houseOpen, setHouseOpen] = useState(false);
  const q = useAsync(async () => {
    const [list, plan, pantry, house, foods, prefs] = await Promise.all([
      kova.food.shopping.current(), kova.food.plan.get(weekStart), kova.food.pantry.list(), kova.food.household.get().catch(() => null),
      kova.food.catalogShop().catch(() => []), kova.food.preferences.get().catch(() => null),
    ]);
    // What the rest of the week needs, minus what is at home: shown before making the list.
    const preview = plan && foods.length
      ? shoppingFromPlan(plan.items.filter((m) => m.local_date >= today && !m.logged_at).flatMap((m) => m.ingredients)
          .map((i) => ({ ...i, grams: i.grams * (prefs?.people ?? 1) })), foods, pantry.map((p) => ({ name: p.name, grams: p.grams })))
      : null;
    return { list, plan, pantry, house, preview };
  }, [weekStart]);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const plan = q.data?.plan;
      if (!plan) throw new KovaError('INVALID_INPUT', 'Primero armá tu semana.');
      const [foods, prefs] = await Promise.all([kova.food.catalogShop(), kova.food.preferences.get()]);
      // From today to the end of the week, without the meals already eaten; portions for everyone at home.
      const people = prefs?.people ?? 1;
      const ingredients = plan.items.filter((m) => m.local_date >= today && !m.logged_at).flatMap((m) => m.ingredients)
        .map((i) => ({ ...i, grams: i.grams * people }));
      const lines = buildShoppingList(ingredients, foods, (q.data?.pantry ?? []).map((p) => ({ name: p.name, grams: p.grams })));
      await kova.food.shopping.create('Compras de la semana', lines, plan.id);
      q.reload();
      setOpen(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  if (q.loading && !q.data) return <Skeleton height={120} radius={rad.sheet} />;
  const { list, plan, pantry, house, preview } = q.data ?? { list: null, plan: null, pantry: [] as Pantry[], house: null, preview: null };
  const others = house?.people.filter((p) => !p.me).map((p) => p.name) ?? [];
  const done = list?.items.filter((i) => i.checked_at).length ?? 0;

  return (
    <View style={{ padding: 16, borderRadius: rad.sheet, backgroundColor: c.surface, gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={17} w="semibold" accessibilityRole="header">Compras</T>
        <Row style={{ gap: 0 }}>
          <Button variant="text" label={'En casa' + (pantry.length ? ' (' + pantry.length + ')' : '')} icon={House} onPress={() => setPantryOpen(true)} />
          <Button variant="text" label="" icon={UsersThree} onPress={() => setHouseOpen(true)} accessibilityLabel="Compartir la lista con tu casa" />
        </Row>
      </Row>
      {others.length ? <T size={12} color={c.n400}>Compartida con {others.join(', ')}</T> : null}
      {list ? (
        <>
          <T size={14} color={c.n400}>{list.items.length} cosas por comprar · {done} en el carrito</T>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' }}>
            <View style={{ height: 6, width: `${list.items.length ? (done / list.items.length) * 100 : 0}%`, backgroundColor: c.accent }} />
          </View>
          <Button large label="Ver la lista" icon={ShoppingCart} onPress={() => setOpen(true)} />
          <Button variant="secondary" label="Revisar el ticket" icon={Receipt} onPress={() => setPantryOpen(true)} />
          {plan ? <Button variant="text" label="Rehacer la lista con el plan" onPress={build} busy={busy} style={{ alignSelf: 'flex-start' }} /> : null}
        </>
      ) : (
        <>
          {preview ? <HomeSummary preview={preview} /> : (
            <T size={14} color={c.n400}>
              {plan ? 'Armo la lista con las comidas que te quedan de la semana, por góndola y en envases reales, sin lo que ya tenés en casa.' : 'Cuando armes tu semana, te hago la lista de compras.'}
            </T>
          )}
          <Button large label="Armar la lista de compras" icon={Basket} onPress={build} busy={busy} disabled={!plan} />
        </>
      )}
      {error ? <Banner tone="crit" text={error} /> : null}
      {open && list ? <ListModal list={list} onClose={() => { setOpen(false); q.reload(); }} /> : null}
      {pantryOpen ? <PantrySheet items={pantry} list={list} onClose={() => setPantryOpen(false)} onChanged={q.reload} /> : null}
      {houseOpen ? <HouseSheet house={house} onClose={() => setHouseOpen(false)} onChanged={q.reload} /> : null}
    </View>
  );
}

function ListModal({ list: initial, onClose }: { list: ShoppingList; onClose: () => void }) {
  const [list, setList] = useState(initial);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = async (id: string) => {
    // Functional update: quick taps on different items must not overwrite each other.
    const checked = !list.items.find((i) => i.id === id)?.checked_at;
    setList((cur) => ({ ...cur, items: cur.items.map((i) => (i.id === id ? { ...i, checked_at: checked ? new Date().toISOString() : null } : i)) }));
    kova.food.shopping.check(id, checked).catch(() => undefined);
  };
  const add = async () => {
    if (!extra.trim()) return;
    const row = (await kova.food.shopping.addItem(list.id, extra.trim(), list.items.length).catch(() => null)) as ShoppingList['items'][number] | null;
    if (row) setList((cur) => ({ ...cur, items: [...cur.items, row] }));
    setExtra('');
  };
  const remove = async (id: string) => {
    setList((cur) => ({ ...cur, items: cur.items.filter((i) => i.id !== id) }));
    kova.food.shopping.removeItem(id).catch(() => undefined);
  };
  const finish = async () => {
    setBusy(true);
    try { await kova.food.shopping.finish(list); onClose(); } finally { setBusy(false); }
  };
  const aisles = [...new Set(list.items.map((i) => i.aisle))].sort((a, b) => (AISLE_ORDER.indexOf(a) + 100) % 100 - (AISLE_ORDER.indexOf(b) + 100) % 100);
  const done = list.items.filter((i) => i.checked_at).length;

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardRoom modal style={{ backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <View style={{ flex: 1 }}>
            <T size={17} w="semibold">{list.title}</T>
            <T size={12} color={c.n400}>{done} de {list.items.length} en el carrito</T>
          </View>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14 }} keyboardShouldPersistTaps="handled">
          {aisles.map((aisle) => (
            <View key={aisle} style={{ gap: 4 }}>
              <T size={13} w="semibold" color={c.n400}>{aisle}</T>
              {list.items.filter((i) => i.aisle === aisle).map((i) => (
                <Row key={i.id} style={{ minHeight: 52, gap: 12 }}>
                  <Pressable onPress={() => toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: !!i.checked_at }}
                    accessibilityLabel={i.name + (i.grams || i.packages ? ', ' + lineAmount({ grams: i.grams ?? 0, packages: i.packages, package_label: i.package_label }) : '')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minHeight: 48 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: i.checked_at ? c.a700 : c.borderStrong, backgroundColor: i.checked_at ? c.a700 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {i.checked_at ? <Check size={16} weight="bold" color={c.white} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T size={15} color={i.checked_at ? c.n500 : c.text} style={i.checked_at ? { textDecorationLine: 'line-through' } : undefined}>{i.name}</T>
                      {i.grams || i.packages ? <T size={12} color={c.n500}>{lineAmount({ grams: i.grams ?? 0, packages: i.packages, package_label: i.package_label })}</T> : null}
                    </View>
                  </Pressable>
                  <Pressable onPress={() => remove(i.id)} accessibilityRole="button" accessibilityLabel={'Quitar ' + i.name} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Trash size={18} color={c.n500} />
                  </Pressable>
                </Row>
              ))}
            </View>
          ))}
          <Row style={{ gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="Agregar algo más" value={extra} onChangeText={setExtra} placeholder="Ej.: yerba" onSubmitEditing={add} /></View>
            <Button label="Agregar" icon={Plus} onPress={add} disabled={!extra.trim()} />
          </Row>
          <T size={11} color={c.n500}>Las cantidades salen de tu plan: lo cocido se convierte a crudo o seco y se redondea al envase más común.</T>
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: 24, backgroundColor: c.navBg, borderTopWidth: 1, borderTopColor: c.borderSubtle, gap: 6 }}>
          <Button large label="Terminé de comprar" icon={Check} onPress={finish} busy={busy} />
          <T size={12} color={c.n500} style={{ textAlign: 'center' }}>Lo que tildaste pasa a «En casa».</T>
        </View>
      </KeyboardRoom>
    </Modal>
  );
}

function PantrySheet({ items, list, onClose, onChanged }: { items: Pantry[]; list: ShoppingList | null; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState<Array<ReceiptItem & { on: boolean }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only what is still unticked on the list is compared with the receipt.
  const open = list?.items.filter((i) => !i.checked_at) ?? [];
  const review = read && (open.length || read.some((r) => r.kind !== 'comida')) ? reviewReceipt(read, open.map((i) => i.name)) : null;
  const scan = async () => {
    setError(null);
    try {
      const img = await photo();
      if (!img) return;
      setBusy(true);
      const found = await kova.food.pantry.read(img, open.map((i) => i.name));
      if (!found.length) setError('No encontramos alimentos en la foto. Probá con más luz o el ticket derecho.');
      // Cleaning products and the like are shown in the review but never go to «En casa».
      else setRead(found.map((f) => ({ ...f, on: f.kind !== 'no_comida' })));
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const saveRead = async () => {
    if (!read) return;
    setBusy(true);
    try {
      await kova.food.pantry.add(read.filter((r) => r.on && r.kind !== 'no_comida').map(({ name: n, grams }) => ({ name: n, grams })), 'ticket');
      // What the receipt shows was bought gets ticked on the list.
      if (review) await Promise.all(review.onList.flatMap((x) => open.filter((i) => i.name === x.listName).map((i) => kova.food.shopping.check(i.id, true)))).catch(() => undefined);
      setRead(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const addOne = async () => {
    if (!name.trim()) return;
    await kova.food.pantry.add([{ name: name.trim(), grams: null }], 'manual').catch(() => undefined);
    setName('');
    onChanged();
  };
  return (
    <Sheet visible onClose={onClose} title="En casa">
      <View style={{ gap: 10 }}>
        <T size={14} color={c.n400}>Lo que tenés en casa no entra en la lista de compras.</T>
        {read ? (
          <View style={{ gap: 6 }}>
            {review ? <ReceiptSummary review={review} withList={open.length > 0} /> : null}
            <T size={13} w="semibold" color={c.n400}>Esto va a «En casa». Destildá lo que no va.</T>
            {read.map((r, k) => r.kind === 'no_comida' ? null : (
              <Pressable key={k} onPress={() => setRead(read.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: r.on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: r.on ? c.a700 : c.borderStrong, backgroundColor: r.on ? c.a700 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {r.on ? <Check size={14} weight="bold" color={c.white} /> : null}
                </View>
                <T size={14} style={{ flex: 1 }}>{r.name}{r.grams ? ' · ' + (r.grams >= 1000 ? r.grams / 1000 + ' kg' : r.grams + ' g') : ''}</T>
              </Pressable>
            ))}
            <Button large label={review?.onList.length ? 'Guardar y tildar en la lista' : 'Guardar en «En casa»'} icon={Check} onPress={saveRead} busy={busy} />
            <Button variant="text" label="Cancelar" onPress={() => setRead(null)} />
          </View>
        ) : (
          <>
            <Button large label="Foto del ticket o la heladera" icon={Camera} onPress={scan} busy={busy} />
            {open.length ? <T size={12} color={c.n500}>Con el ticket te muestro qué compraste de la lista, qué te faltó y qué quedó fuera del plan.</T> : null}
            <Row style={{ gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Field label="Agregar a mano" value={name} onChangeText={setName} placeholder="Ej.: Arroz blanco" onSubmitEditing={addOne} /></View>
              <Button label="Agregar" icon={Plus} onPress={addOne} disabled={!name.trim()} />
            </Row>
            {items.map((i) => (
              <Row key={i.id} style={{ justifyContent: 'space-between', minHeight: 44 }}>
                <T size={14} style={{ flex: 1 }}>{i.name}{i.grams ? ' · ' + (i.grams >= 1000 ? Number(i.grams) / 1000 + ' kg' : Number(i.grams) + ' g') : ''}</T>
                <Pressable onPress={() => { kova.food.pantry.remove(i.id).then(onChanged).catch(() => undefined); }} accessibilityRole="button" accessibilityLabel={'Quitar ' + i.name} hitSlop={8}
                  style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Trash size={18} color={c.n500} />
                </Pressable>
              </Row>
            ))}
            {items.length ? <Button variant="danger" label="Vaciar «En casa»" onPress={() => { kova.food.pantry.clear().then(onChanged).catch(() => undefined); }} /> : null}
          </>
        )}
        {error ? <Banner tone="warn" text={error} /> : null}
      </View>
    </Sheet>
  );
}

type House = { id: string; name: string; code: string; people: Array<{ user_id: string; name: string; me: boolean }> } | null;

function HouseSheet({ house, onClose, onChanged }: { house: House; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState('Mi casa');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title="Tu casa">
      <T size={14} color={c.n400}>Con tu casa comparten la lista de compras: cualquiera la ve, tilda y agrega. El resto de tus datos sigue siendo tuyo.</T>
      {house ? (
        <View style={{ gap: 10 }}>
          <T size={15} w="semibold">{house.name}</T>
          {house.people.map((p) => <T key={p.user_id} size={14}>· {p.name}{p.me ? ' (vos)' : ''}</T>)}
          <View style={{ padding: 12, borderRadius: rad.card, backgroundColor: c.raised, gap: 4 }}>
            <T size={13} color={c.n400}>Código para sumar a alguien (se usa una vez)</T>
            <T size={24} w="semibold" style={{ letterSpacing: 4 }}>{house.code}</T>
          </View>
          <Button label="Compartir el código" icon={ShareNetwork} onPress={() => Share.share({ message: 'Sumate a mi casa en Kova Health con este código: ' + house.code })} />
          <Button variant="danger" label="Salir de la casa" onPress={() => run(() => kova.food.household.leave())} busy={busy} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Field label="Nombre de la casa" value={name} onChangeText={setName} />
          <Button large label="Crear mi casa" icon={House} onPress={() => run(() => kova.food.household.create(name))} busy={busy} />
          <T size={13} color={c.n400} style={{ textAlign: 'center' }}>o</T>
          <Field label="Tengo un código" value={code} onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))} autoCapitalize="characters" placeholder="Ej.: K7MQ2X" />
          <Button variant="secondary" label="Sumarme" onPress={() => run(() => kova.food.household.join(code))} busy={busy} disabled={code.length !== 6} />
        </View>
      )}
      {error ? <Banner tone="crit" text={error} /> : null}
    </Sheet>
  );
}

/** The receipt against the list and the plan. Plain facts, no scolding: the person decides. */
function ReceiptSummary({ review, withList }: { review: ReturnType<typeof reviewReceipt>; withList: boolean }) {
  const offPlanSpent = review.offPlan.reduce((a, x) => a + (x.price ?? 0), 0);
  const group = (title: string, color: string, rows: Array<{ key: string; text: string; note?: string }>) => rows.length ? (
    <View style={{ gap: 4 }}>
      <T size={13} w="semibold" color={color}>{title}</T>
      {rows.map((r) => (
        <Row key={r.key} style={{ justifyContent: 'space-between', gap: 8 }}>
          <T size={14} style={{ flex: 1 }}>{r.text}</T>
          {r.note ? <T size={12} color={c.n400}>{r.note}</T> : null}
        </Row>
      ))}
    </View>
  ) : null;
  return (
    <View style={{ gap: 12, padding: 12, borderRadius: rad.card, backgroundColor: c.bg }}>
      <Row style={{ gap: 8 }}>
        <Receipt size={18} color={c.accent} />
        <T size={15} w="semibold">Tu ticket</T>
      </Row>
      {withList ? (
        <T size={13} color={c.n400}>
          {review.onList.length} de {review.onList.length + review.missing.length} cosas de la lista
          {review.offPlan.length ? ' · ' + review.offPlan.length + ' fuera del plan' : ''}
          {offPlanSpent ? ' ($ ' + nf(offPlanSpent, 0) + ')' : ''}
        </T>
      ) : null}
      {group('Fuera del plan', c.warn, review.offPlan.map((x, k) => ({ key: 'p' + k, text: x.name, note: RECEIPT_KIND_LABEL[x.kind as keyof typeof RECEIPT_KIND_LABEL] + (x.price ? ' · $ ' + nf(x.price, 0) : '') })))}
      {withList ? group('Te faltó', c.n300, review.missing.map((n, k) => ({ key: 'm' + k, text: n }))) : null}
      {withList ? group('No estaba en la lista', c.n300, review.offList.map((x, k) => ({ key: 'o' + k, text: x.name, note: x.price ? '$ ' + nf(x.price, 0) : undefined }))) : null}
      {withList ? group('De la lista', c.accent, review.onList.map((x, k) => ({ key: 'l' + k, text: x.listName }))) : null}
      {review.offPlan.length ? (
        <Row style={{ gap: 6, alignItems: 'flex-start' }}>
          <Warning size={14} color={c.n500} />
          <T size={12} color={c.n500} style={{ flex: 1 }}>«Fuera del plan» no es un reto: tu semana no cuenta con eso. Si lo comés, anotalo y ajusto el resto.</T>
        </Row>
      ) : null}
    </View>
  );
}

/** «Tenés esto, te falta comprar esto otro», before the list is made. */
function HomeSummary({ preview }: { preview: ReturnType<typeof shoppingFromPlan> }) {
  const { fromHome, lines, unused } = preview;
  return (
    <View style={{ gap: 8 }}>
      {fromHome.length ? (
        <View style={{ gap: 2 }}>
          <T size={13} w="semibold" color={c.ok}>Usás lo que tenés</T>
          <T size={14}>{fromHome.join(', ')}</T>
        </View>
      ) : null}
      <View style={{ gap: 2 }}>
        <T size={13} w="semibold" color={c.n300}>{lines.length ? 'Te falta comprar ' + lines.length + (lines.length === 1 ? ' cosa' : ' cosas') : 'No te falta nada'}</T>
        {lines.length ? <T size={14} color={c.n400}>{lines.slice(0, 8).map((l) => l.name).join(', ')}{lines.length > 8 ? ' y ' + (lines.length - 8) + ' más' : ''}</T> : null}
      </View>
      {unused.length ? <T size={12} color={c.n500}>Esta semana no usa: {unused.join(', ')}.</T> : null}
    </View>
  );
}
