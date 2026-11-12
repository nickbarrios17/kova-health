/**
 * Comidas, etapa 1 (docs/comidas.md): «Contame qué comiste», foto del plato y código de barras.
 * The AI splits and estimates; the person reviews every item before anything is saved. Catalog values
 * win when the food is there; otherwise the estimate is saved as 'estimated'.
 */
import {
  amountLabel, argentineSeals, betterAlternative, estimateMidpoint, kcalRange, MEAL_SLOTS, newId, nf, scaleFood, SEAL_LABEL,
  usableCandidate, KovaError, type CatalogFood, type DescribedItem,
} from '@kova/domain';
import type { OffProduct, ReadLabel } from '@kova/api-client';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Barcode, Camera, Check, ForkKnife, PaperPlaneRight, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { kova, outbox } from '../client';
import { c, font, rad } from '../theme';
import { Banner, Button, Chip, Field, Row, T, KeyboardRoom } from '../ui';

type Slot = (typeof MEAL_SLOTS)[number][0];

/** The meal that fits the time of day (the person can change it before saving). */
export function slotNow(d = new Date()): Slot {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 19 ? 'afternoon_snack' : 'dinner';
}

const msg = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');

/** Photo from the camera or the gallery, compressed, as base64 (never stored). */
async function pickImage(fromCamera: boolean) {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, base64: true, allowsEditing: false, exif: false };
  if (fromCamera && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new KovaError('FORBIDDEN', 'Sin permiso de cámara. Podés elegir una foto de la galería.');
  }
  const res = fromCamera && Platform.OS !== 'web' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  if (!a?.base64) return null;
  return { mime: a.mimeType && /^image\/(jpeg|png|webp)$/.test(a.mimeType) ? a.mimeType : 'image/jpeg', data: a.base64 };
}

// ── The box at the top of Comida ─────────────────────────────────────────────────────────────

export function FoodAssistant({ day, deviceId, onLogged }: { day: string; deviceId: string | null; onLogged: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'text' | 'photo' | 'menu'>(null);
  const [menu, setMenu] = useState<MenuOption[] | null>(null);

  const runMenu = async () => {
    setError(null);
    try {
      const img = await pickImage(true);
      if (!img) return;
      setBusy('menu');
      // What is left of today, so the suggestions fit it.
      const [energy, sum] = await Promise.all([kova.energy.today(day).catch(() => null), kova.summaries.daily(day, day).catch(() => [])]);
      const s = (sum[0] ?? {}) as Record<string, unknown>;
      const left = {
        kcal: energy?.kcal != null ? Math.max(0, energy.kcal - Number(s.kcal ?? 0)) : null,
        proteinG: energy?.proteinG != null ? Math.max(0, energy.proteinG - Number(s.protein_g ?? 0)) : null,
      };
      const options = await kova.food.menu(img, left);
      if (!options.length) setError('No pudimos leer la carta. Probá con más luz y la carta derecha.');
      else setMenu(options);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ items: DescribedItem[]; unclear: string | null } | null>(null);
  const [scan, setScan] = useState(false);

  const run = async (kind: 'text' | 'photo') => {
    setError(null);
    try {
      let res;
      if (kind === 'text') {
        setBusy('text');
        res = await kova.food.describe(text);
      } else {
        const img = await pickImage(true);
        if (!img) return;
        setBusy('photo');
        res = await kova.food.photo(img, text || undefined);
      }
      if (!res.items.length) setError(res.unclear ?? 'No encontramos comida en eso. Probá contarlo con otras palabras.');
      else setReview(res);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ padding: 16, borderRadius: rad.sheet, backgroundColor: c.surface, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <T size={17} w="semibold">Contame qué comiste</T>
        <T size={13} color={c.n400}>Escribilo o dictalo con el micrófono del teclado. También podés sacarle una foto al plato o escanear un código.</T>
      </View>
      <TextInput value={text} onChangeText={setText} multiline placeholder="Ej.: 2 empanadas de carne y una ensalada" placeholderTextColor={c.n600}
        accessibilityLabel="Contame qué comiste" maxLength={600}
        style={{ minHeight: 72, maxHeight: 140, padding: 12, borderRadius: rad.control, borderWidth: 1, borderColor: c.divider, backgroundColor: c.bg, color: c.text, fontFamily: font.regular, fontSize: 16, textAlignVertical: 'top' }} />
      {error ? <Banner tone="warn" text={error} /> : null}
      <Row style={{ gap: 8 }}>
        <Button label="Entender" icon={PaperPlaneRight} onPress={() => run('text')} busy={busy === 'text'} disabled={!text.trim() || !!busy} style={{ flex: 1 }} />
        <Button variant="secondary" label="Foto" icon={Camera} onPress={() => run('photo')} busy={busy === 'photo'} disabled={!!busy} accessibilityLabel="Sacar una foto del plato" />
        <Button variant="secondary" label="Código" icon={Barcode} onPress={() => setScan(true)} disabled={!!busy} accessibilityLabel="Escanear un código de barras" />
      </Row>
      <Button variant="text" label="¿Comés afuera? Sacale una foto a la carta" icon={ForkKnife} onPress={() => runMenu()} busy={busy === 'menu'} disabled={!!busy} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <T size={11} color={c.n500}>Las estimaciones se marcan como estimadas. Las fotos no se guardan.</T>
      {menu ? <MenuSheet options={menu} day={day} deviceId={deviceId} onClose={() => setMenu(null)} onSaved={() => { setMenu(null); onLogged(); }} /> : null}
      {review ? (
        <Review items={review.items} unclear={review.unclear} day={day} deviceId={deviceId}
          onClose={() => setReview(null)} onSaved={() => { setReview(null); setText(''); onLogged(); }} />
      ) : null}
      {scan ? <BarcodeFlow day={day} deviceId={deviceId} onClose={() => setScan(false)} onSaved={() => { setScan(false); onLogged(); }} /> : null}
    </View>
  );
}

// ── Review: every item, catalog or estimate, before saving ────────────────────────────────────

interface Row_ { item: DescribedItem; on: boolean; grams: number; useCatalog: CatalogFood | null }

function Review({ items, unclear, day, deviceId, onClose, onSaved }: {
  items: DescribedItem[]; unclear: string | null; day: string; deviceId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row_[]>(() => items.map((item) => ({ item, on: true, grams: Math.round(item.grams), useCatalog: usableCandidate(item) })));
  const [slot, setSlot] = useState<Slot>(slotNow());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = (r: Row_) => {
    if (r.useCatalog) return { ...scaleFood(r.useCatalog, r.grams), estimated: r.useCatalog.data_source !== 'verified' && r.useCatalog.data_source !== 'label' };
    const k = r.grams / r.item.grams;
    const m = estimateMidpoint(r.item);
    return { kcal: Math.round(m.kcal * k), protein_g: Math.round(m.protein_g * k * 10) / 10, carbs_g: Math.round(m.carbs_g * k * 10) / 10, fat_g: Math.round(m.fat_g * k * 10) / 10, estimated: true };
  };
  const total = rows.filter((r) => r.on).reduce((a, r) => a + values(r).kcal, 0);
  const set = (i: number, p: Partial<Row_>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const r of rows.filter((x) => x.on && x.grams > 0)) {
        const v = values(r);
        await outbox.enqueue({
          kind: 'log_food',
          input: r.useCatalog
            ? { id: newId(), local_date: day, slot, quantity: r.grams, food_id: r.useCatalog.id, device_id: deviceId }
            : { id: newId(), local_date: day, slot, quantity: 1, name: r.item.name + ' (' + nf(r.grams, 0) + ' g)', kcal: v.kcal, protein_g: v.protein_g, carbs_g: v.carbs_g, fat_g: v.fat_g, estimated: true, device_id: deviceId },
        });
      }
      await outbox.flush().catch(() => undefined);
      onSaved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardRoom modal style={{ backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <T size={17} w="semibold" style={{ flex: 1 }}>Revisá antes de guardar</T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12 }} keyboardShouldPersistTaps="handled">
          {unclear ? <Banner tone="info" glyph="?" text={unclear} /> : null}
          {rows.map((r, i) => {
            const v = values(r);
            return (
              <View key={i} style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 8, opacity: r.on ? 1 : 0.55 }}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T size={15} w="semibold">{r.useCatalog ? r.useCatalog.name : r.item.name}</T>
                    <T size={13} color={c.n400}>
                      {r.useCatalog
                        ? nf(v.kcal, 0) + ' kcal · ' + nf(v.protein_g, 0) + ' g prot · del catálogo' + (v.estimated ? ' (estimado)' : '')
                        : kcalRange(r.item.kcal_low * r.grams / r.item.grams, r.item.kcal_high * r.grams / r.item.grams) + ' · se guarda ≈ ' + nf(v.kcal, 0) + ' kcal (estimado)'}
                    </T>
                  </View>
                  <Pressable onPress={() => set(i, { on: !r.on })} accessibilityRole="checkbox" accessibilityState={{ checked: r.on }}
                    accessibilityLabel={(r.on ? 'Quitar ' : 'Incluir ') + r.item.name}
                    style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: r.on ? c.a700 : c.divider, backgroundColor: r.on ? c.a700 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={18} weight="bold" color={r.on ? c.white : c.n500} />
                  </Pressable>
                </Row>
                <Row style={{ gap: 8 }}>
                  <View style={{ width: 110 }}>
                    <Field label="Gramos" value={String(r.grams)} keyboardType="number-pad"
                      onChangeText={(t) => set(i, { grams: Math.max(0, Math.min(3000, Number(t.replace(/\D/g, '')) || 0)) })} />
                  </View>
                  <T size={12} color={c.n500} style={{ flex: 1, marginTop: 18 }}>
                    {amountLabel(r.item.amount, r.item.unit)} según lo que contaste
                  </T>
                </Row>
                {r.item.candidates.filter((x) => x.ref_unit !== 'serving').length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {r.item.candidates.filter((x) => x.ref_unit !== 'serving').map((cand) => (
                      <Chip key={cand.id} label={cand.name} selected={r.useCatalog?.id === cand.id} onPress={() => set(i, { useCatalog: cand })} />
                    ))}
                    <Chip label="Usar la estimación" selected={!r.useCatalog} onPress={() => set(i, { useCatalog: null })} />
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
          <View style={{ gap: 8 }}>
            <T size={13} w="medium" color={c.n400}>¿En qué comida?</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {MEAL_SLOTS.map(([s, l]) => <Chip key={s} label={l} selected={slot === s} onPress={() => setSlot(s)} />)}
            </ScrollView>
          </View>
          {error ? <Banner tone="crit" text={error} /> : null}
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: 24, backgroundColor: c.navBg, borderTopWidth: 1, borderTopColor: c.borderSubtle, gap: 6 }}>
          <T size={13} color={c.n400} style={{ textAlign: 'center' }}>Total ≈ {nf(total, 0)} kcal</T>
          <Button large label="Guardar" icon={Check} onPress={save} busy={busy} disabled={!rows.some((r) => r.on && r.grams > 0)} />
        </View>
      </KeyboardRoom>
    </Modal>
  );
}

// ── Barcode: scan, show seals, save as your food, log ─────────────────────────────────────────

function Seals({ product, labelSeals }: { product: OffProduct | (ReadLabel & { labels?: string[] }); labelSeals?: string[] }) {
  const { seals, from } = argentineSeals({ ...product, labels: 'labels' in product ? product.labels : [] }, labelSeals);
  if (from === 'none') return null;
  if (!seals.length) return <T size={13} color={c.ok}>✓ Sin sellos de exceso{from === 'table' ? ' (según la tabla)' : ''}</T>;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {seals.map((s) => (
          <View key={s} accessibilityLabel={SEAL_LABEL[s]} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#000', borderWidth: 1, borderColor: c.white }}>
            <T size={11} w="semibold" color={c.white}>{SEAL_LABEL[s].toUpperCase()}</T>
          </View>
        ))}
      </Row>
      {from === 'table' ? <T size={11} color={c.n500}>Calculado con la tabla nutricional; el envase puede variar.</T> : null}
    </View>
  );
}

function BarcodeFlow({ day, deviceId, onClose, onSaved }: { day: string; deviceId: string | null; onClose: () => void; onSaved: () => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [alt, setAlt] = useState<OffProduct | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [label, setLabel] = useState<ReadLabel | null>(null);
  const [grams, setGrams] = useState('');
  const [slot, setSlot] = useState<Slot>(slotNow());

  const lookup = async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (busy || digits.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const p = await kova.food.barcode(digits);
      if (!p) { setMissing(digits); return; }
      setProduct(p);
      setGrams(String(Math.round(p.serving_g ?? 100)));
      if (p.category) kova.food.sameCategory(p.category).then((list) => setAlt(betterAlternative(p, list))).catch(() => undefined);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const readLabel = async () => {
    setError(null);
    try {
      const img = await pickImage(true);
      if (!img) return;
      setBusy(true);
      const l = await kova.food.readLabel(img);
      if (!l) setError('No pudimos leer la tabla con seguridad. Probá con más luz y la tabla derecha, o cargalo a mano.');
      else { setLabel(l); setGrams(String(Math.round(l.serving_g ?? 100))); }
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const src = product ?? label;
    if (!src) return;
    setBusy(true);
    setError(null);
    try {
      const food = await kova.food.saveAsFood({
        barcode: product?.barcode ?? missing, name: src.name ?? 'Producto escaneado', brand: src.brand, liquid: src.liquid, serving_g: src.serving_g,
        kcal_100: src.kcal_100, protein_100: src.protein_100, carbs_100: src.carbs_100, fat_100: src.fat_100, fiber_100: src.fiber_100,
      });
      await outbox.enqueue({ kind: 'log_food', input: { id: newId(), local_date: day, slot, quantity: Number(grams) || 100, food_id: String(food.id), device_id: deviceId } });
      await outbox.flush().catch(() => undefined);
      onSaved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = product ?? label;
  const g = Number(grams) || 0;
  const unit = shown?.liquid ? 'ml' : 'g';

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardRoom modal style={{ backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <T size={17} w="semibold" style={{ flex: 1 }}>Código de barras</T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12 }} keyboardShouldPersistTaps="handled">
          {!shown && !missing ? (
            <>
              {Platform.OS !== 'web' ? (
                perm?.granted ? (
                  <View style={{ height: 260, borderRadius: rad.card, overflow: 'hidden', backgroundColor: c.surface }}>
                    <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                      onBarcodeScanned={busy ? undefined : (r) => lookup(r.data)} />
                  </View>
                ) : (
                  <Button large label="Permitir la cámara" icon={Camera} onPress={requestPerm} />
                )
              ) : null}
              <T size={13} color={c.n400}>{Platform.OS !== 'web' ? 'Apuntá al código. Si no lo lee, escribí los números:' : 'Escribí los números del código:'}</T>
              <Row style={{ gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}><Field label="Número del código" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={14} /></View>
                <Button label="Buscar" onPress={() => lookup(code)} busy={busy} disabled={code.replace(/\D/g, '').length < 8} />
              </Row>
            </>
          ) : null}

          {missing && !label ? (
            <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 10 }}>
              <T size={16} w="semibold">Todavía nadie cargó este producto</T>
              <T size={14} color={c.n400}>Sacale una foto a la tabla nutricional y la leemos por vos. Se guarda como «etiqueta» en tus alimentos.</T>
              <Button large label="Foto de la etiqueta" icon={Camera} onPress={readLabel} busy={busy} />
            </View>
          ) : null}

          {shown ? (
            <View style={{ padding: 16, borderRadius: rad.card, backgroundColor: c.surface, gap: 10 }}>
              <View style={{ gap: 2 }}>
                <T size={17} w="semibold">{shown.name ?? 'Producto'}</T>
                <T size={13} color={c.n400}>{[shown.brand, product?.quantity_label].filter(Boolean).join(' · ')}</T>
              </View>
              <T size={13} color={c.n300}>
                Cada 100 {unit}: {nf(shown.kcal_100, 0)} kcal · {nf(shown.protein_100 ?? 0, 1)} g prot · {nf(shown.carbs_100 ?? 0, 1)} g carbos · {nf(shown.fat_100 ?? 0, 1)} g grasa
              </T>
              <Seals product={product ?? { ...label!, labels: [] }} labelSeals={label?.seals} />
              {alt ? (
                <Banner tone="ok" glyph="↔" title="Otra opción de la misma góndola" text={alt.name + (alt.brand ? ' · ' + alt.brand : '') + ' tiene menos sellos.'} />
              ) : null}
              <Row style={{ gap: 8, alignItems: 'flex-end' }}>
                <View style={{ width: 120 }}><Field label={'Cantidad (' + unit + ')'} value={grams} onChangeText={(t) => setGrams(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" /></View>
                {shown.serving_g ? <Chip label={'1 porción · ' + nf(shown.serving_g, 0) + ' ' + unit} selected={g === Math.round(shown.serving_g)} onPress={() => setGrams(String(Math.round(shown.serving_g!)))} /> : null}
              </Row>
              <T size={14} w="medium">≈ {nf(scaleFood({ ref_amount: 100, kcal: shown.kcal_100, protein_g: shown.protein_100 ?? 0, carbs_g: shown.carbs_100 ?? 0, fat_g: shown.fat_100 ?? 0 }, g).kcal, 0)} kcal</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {MEAL_SLOTS.map(([s, l]) => <Chip key={s} label={l} selected={slot === s} onPress={() => setSlot(s)} />)}
              </ScrollView>
              <Button large label="Agregar" icon={Check} onPress={save} busy={busy} disabled={g <= 0} />
              {product ? <T size={11} color={c.n500}>Datos: © Open Food Facts contributors (ODbL).</T> : <T size={11} color={c.n500}>Leído de la etiqueta. Revisá que los números coincidan.</T>}
            </View>
          ) : null}
          {error ? <Banner tone="crit" text={error} /> : null}
          {shown || missing ? <Button variant="secondary" label="Escanear otro" onPress={() => { setProduct(null); setLabel(null); setMissing(null); setAlt(null); setCode(''); }} /> : null}
        </ScrollView>
      </KeyboardRoom>
    </Modal>
  );
}


type MenuOption = { name: string; why: string; kcal_low: number; kcal_high: number; protein_g: number };

function MenuSheet({ options, day, deviceId, onClose, onSaved }: { options: MenuOption[]; day: string; deviceId: string | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (o: MenuOption, k: number) => {
    setBusy(k);
    setError(null);
    try {
      const kcal = Math.round((o.kcal_low + o.kcal_high) / 2);
      // Restaurant dishes are estimates: carbs and fat split the rest of the calories evenly.
      const rest = Math.max(0, kcal - o.protein_g * 4);
      await outbox.enqueue({ kind: 'log_food', input: {
        id: newId(), local_date: day, slot: slotNow(), quantity: 1, name: o.name.slice(0, 120), kcal, protein_g: o.protein_g,
        carbs_g: Math.round(rest / 2 / 4), fat_g: Math.round(rest / 2 / 9), estimated: true, device_id: deviceId,
      } });
      await outbox.flush().catch(() => undefined);
      onSaved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardRoom modal style={{ backgroundColor: c.bg }}>
        <Row style={{ padding: 12 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={c.text} /></Pressable>
          <T size={17} w="semibold" style={{ flex: 1 }}>Lo que mejor te queda hoy</T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12 }}>
          {options.map((o, k) => (
            <View key={k} style={{ padding: 14, borderRadius: rad.card, backgroundColor: c.surface, gap: 6 }}>
              <T size={16} w="semibold">{o.name}</T>
              <T size={13} color={c.n400}>{kcalRange(o.kcal_low, o.kcal_high)} · ≈ {nf(o.protein_g, 0)} g proteína (estimado)</T>
              <T size={14}>{o.why}</T>
              <Button label="Lo pedí: registrarlo" icon={Check} onPress={() => save(o, k)} busy={busy === k} disabled={busy != null && busy !== k} />
            </View>
          ))}
          {error ? <Banner tone="crit" text={error} /> : null}
          <T size={11} color={c.n500}>Las porciones de restaurante varían: se guarda como estimado.</T>
        </ScrollView>
      </KeyboardRoom>
    </Modal>
  );
}
