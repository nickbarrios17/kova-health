'use client';
/**
 * Comidas, etapa 1 (docs/comidas.md), web: «Contame qué comiste», a plate photo and a barcode number.
 * Same rules as the phone: review every item before saving; estimates are saved as 'estimated'.
 */
import {
  argentineSeals, estimateMidpoint, kcalRange, MEAL_SLOTS, newId, nf, scaleFood, SEAL_LABEL, usableCandidate, KovaError,
  type CatalogFood, type DescribedItem,
} from '@kova/domain';
import type { OffProduct } from '@kova/api-client';
import { useRef, useState } from 'react';
import { kova } from '@/lib/client';
import { Banner } from '@/components/ui';

type Slot = (typeof MEAL_SLOTS)[number][0];
const slotNow = (d = new Date()): Slot => { const h = d.getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 19 ? 'afternoon_snack' : 'dinner'; };
const msg = (e: unknown) => (e instanceof KovaError ? e.message : 'Algo salió mal. Probá de nuevo.');

/** A file from the browser, scaled to at most 1600 px and sent as JPEG base64 (not stored). */
async function fileToImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.7) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Row { item: DescribedItem; on: boolean; grams: number; useCatalog: CatalogFood | null }

export function FoodAssistant({ day, onLogged }: { day: string; onLogged: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'text' | 'photo' | 'code' | 'save'>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unclear, setUnclear] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>(slotNow());
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [grams, setGrams] = useState('100');
  const file = useRef<HTMLInputElement>(null);

  const show = (res: { items: DescribedItem[]; unclear: string | null }) => {
    if (!res.items.length) { setError(res.unclear ?? 'No encontramos comida en eso. Probá contarlo con otras palabras.'); return; }
    setUnclear(res.unclear);
    setRows(res.items.map((item) => ({ item, on: true, grams: Math.round(item.grams), useCatalog: usableCandidate(item) })));
  };
  const describe = async () => {
    setBusy('text'); setError(null);
    try { show(await kova().food.describe(text)); } catch (e) { setError(msg(e)); } finally { setBusy(null); }
  };
  const photo = async (f: File | undefined) => {
    if (!f) return;
    setBusy('photo'); setError(null);
    try { show(await kova().food.photo(await fileToImage(f), text || undefined)); } catch (e) { setError(msg(e)); } finally { setBusy(null); if (file.current) file.current.value = ''; }
  };
  const lookup = async () => {
    setBusy('code'); setError(null); setProduct(null);
    try {
      const p = await kova().food.barcode(code);
      if (!p) setError('Todavía nadie cargó este producto. Desde el celular podés sacarle una foto a la etiqueta.');
      else { setProduct(p); setGrams(String(Math.round(p.serving_g ?? 100))); }
    } catch (e) { setError(msg(e)); } finally { setBusy(null); }
  };

  const values = (r: Row) => {
    if (r.useCatalog) return { ...scaleFood(r.useCatalog, r.grams), estimated: r.useCatalog.data_source === 'estimated' };
    const k = r.grams / r.item.grams, m = estimateMidpoint(r.item);
    return { kcal: Math.round(m.kcal * k), protein_g: Math.round(m.protein_g * k * 10) / 10, carbs_g: Math.round(m.carbs_g * k * 10) / 10, fat_g: Math.round(m.fat_g * k * 10) / 10, estimated: true };
  };
  const saveRows = async () => {
    if (!rows) return;
    setBusy('save'); setError(null);
    try {
      for (const r of rows.filter((x) => x.on && x.grams > 0)) {
        const v = values(r);
        await kova().nutrition.logFood(r.useCatalog
          ? { id: newId(), local_date: day, slot, quantity: r.grams, food_id: r.useCatalog.id }
          : { id: newId(), local_date: day, slot, quantity: 1, name: r.item.name + ' (' + nf(r.grams, 0) + ' g)', kcal: v.kcal, protein_g: v.protein_g, carbs_g: v.carbs_g, fat_g: v.fat_g, estimated: true });
      }
      setRows(null); setText(''); onLogged();
    } catch (e) { setError(msg(e)); } finally { setBusy(null); }
  };
  const saveProduct = async () => {
    if (!product) return;
    setBusy('save'); setError(null);
    try {
      const food = await kova().food.saveAsFood({ ...product, name: product.name });
      await kova().nutrition.logFood({ id: newId(), local_date: day, slot, quantity: Number(grams) || 100, food_id: String(food.id) });
      setProduct(null); setCode(''); onLogged();
    } catch (e) { setError(msg(e)); } finally { setBusy(null); }
  };
  const set = (i: number, p: Partial<Row>) => setRows(rows!.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const slots = (
    <div role="radiogroup" aria-label="Comida" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {MEAL_SLOTS.map(([s, l]) => <button key={s} type="button" className="kova-chip" aria-pressed={slot === s} onClick={() => setSlot(s)}>{slot === s ? '✓ ' : ''}{l}</button>)}
    </div>
  );
  const seals = product ? argentineSeals(product) : null;

  return (
    <section aria-labelledby="fa-t" className="kova-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 id="fa-t" className="kova-section-title">Contame qué comiste</h3>
        <span className="kova-muted" style={{ fontSize: 14 }}>Escribilo, subí una foto del plato o buscá un producto por su código de barras.</span>
      </div>
      <label className="kova-label" htmlFor="fa-text">Lo que comiste</label>
      <textarea id="fa-text" className="input" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: 2 empanadas de carne y una ensalada" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={describe} disabled={!text.trim() || !!busy} aria-busy={busy === 'text'}>
          <i className={busy === 'text' ? 'ph ph-circle-notch kova-spin' : 'ph ph-paper-plane-right'} />Entender
        </button>
        <button className="btn btn-secondary" onClick={() => file.current?.click()} disabled={!!busy} aria-busy={busy === 'photo'}>
          <i className={busy === 'photo' ? 'ph ph-circle-notch kova-spin' : 'ph ph-camera'} />Foto del plato
        </button>
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => photo(e.target.files?.[0])} />
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="input" style={{ width: 170, minHeight: 40 }} inputMode="numeric" aria-label="Código de barras" placeholder="Código de barras"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 14))} />
          <button className="btn btn-secondary" onClick={lookup} disabled={code.length < 8 || !!busy} aria-busy={busy === 'code'}><i className="ph ph-barcode" />Buscar</button>
        </span>
      </div>
      <span className="kova-faint" style={{ fontSize: 12 }}>Las estimaciones se marcan como estimadas. Las fotos no se guardan.</span>
      {error && <Banner tone="warn">{error}</Banner>}

      {rows && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unclear && <Banner glyph="?">{unclear}</Banner>}
          {rows.map((r, i) => {
            const v = values(r);
            return (
              <div key={i} style={{ padding: 14, borderRadius: 'var(--kova-radius-lg)', background: 'var(--kova-surface-raised)', display: 'flex', flexDirection: 'column', gap: 8, opacity: r.on ? 1 : 0.55 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1, cursor: 'pointer' }}>
                    <input type="checkbox" checked={r.on} onChange={() => set(i, { on: !r.on })} style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--kova-accent-strong)' }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong style={{ fontWeight: 600 }}>{r.useCatalog ? r.useCatalog.name : r.item.name}</strong>
                      <span className="kova-muted" style={{ fontSize: 13 }}>
                        {r.useCatalog
                          ? `${nf(v.kcal, 0)} kcal · ${nf(v.protein_g, 0)} g prot · del catálogo${v.estimated ? ' (estimado)' : ''}`
                          : `${kcalRange(r.item.kcal_low * r.grams / r.item.grams, r.item.kcal_high * r.grams / r.item.grams)} · se guarda ≈ ${nf(v.kcal, 0)} kcal (estimado)`}
                      </span>
                    </span>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }} className="kova-muted">
                    Gramos
                    <input className="input" style={{ width: 90, minHeight: 40 }} inputMode="numeric" value={r.grams}
                      onChange={(e) => set(i, { grams: Math.min(3000, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
                  </label>
                </div>
                {r.item.candidates.some((x) => x.ref_unit !== 'serving') && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {r.item.candidates.filter((x) => x.ref_unit !== 'serving').map((cand) => (
                      <button key={cand.id} type="button" className="kova-chip" aria-pressed={r.useCatalog?.id === cand.id} onClick={() => set(i, { useCatalog: cand })}>
                        {r.useCatalog?.id === cand.id ? '✓ ' : ''}{cand.name}
                      </button>
                    ))}
                    <button type="button" className="kova-chip" aria-pressed={!r.useCatalog} onClick={() => set(i, { useCatalog: null })}>{!r.useCatalog ? '✓ ' : ''}Usar la estimación</button>
                  </div>
                )}
              </div>
            );
          })}
          {slots}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={saveRows} disabled={!rows.some((r) => r.on && r.grams > 0) || !!busy} aria-busy={busy === 'save'}><i className="ph ph-check" />Guardar</button>
            <button className="btn btn-ghost" onClick={() => setRows(null)}>Cancelar</button>
            <span className="kova-muted" style={{ marginLeft: 'auto', fontSize: 14 }}>Total ≈ {nf(rows.filter((r) => r.on).reduce((a, r) => a + values(r).kcal, 0), 0)} kcal</span>
          </div>
        </div>
      )}

      {product && (
        <div style={{ padding: 16, borderRadius: 'var(--kova-radius-lg)', background: 'var(--kova-surface-raised)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <strong style={{ fontWeight: 600, fontSize: 17 }}>{product.name}</strong>
            <div className="kova-muted" style={{ fontSize: 13 }}>{[product.brand, product.quantity_label].filter(Boolean).join(' · ')}</div>
          </div>
          <span style={{ fontSize: 14 }}>
            Cada 100 {product.liquid ? 'ml' : 'g'}: {nf(product.kcal_100, 0)} kcal · {nf(product.protein_100 ?? 0, 1)} g prot · {nf(product.carbs_100 ?? 0, 1)} g carbos · {nf(product.fat_100 ?? 0, 1)} g grasa
          </span>
          {seals && seals.from !== 'none' && (seals.seals.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {seals.seals.map((s) => <span key={s} style={{ background: '#000', color: '#fff', border: '1px solid #fff', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>{SEAL_LABEL[s].toUpperCase()}</span>)}
              {seals.from === 'table' && <span className="kova-faint" style={{ fontSize: 12 }}>Calculado con la tabla nutricional.</span>}
            </div>
          ) : <span style={{ color: 'var(--kova-ok)', fontSize: 13 }}>✓ Sin sellos de exceso</span>)}
          <label className="kova-muted" style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            Cantidad ({product.liquid ? 'ml' : 'g'})
            <input className="input" style={{ width: 100, minHeight: 40 }} inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            ≈ {nf(scaleFood({ ref_amount: 100, kcal: product.kcal_100, protein_g: product.protein_100 ?? 0, carbs_g: product.carbs_100 ?? 0, fat_g: product.fat_100 ?? 0 }, Number(grams) || 0).kcal, 0)} kcal
          </label>
          {slots}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={saveProduct} disabled={!Number(grams) || !!busy} aria-busy={busy === 'save'}><i className="ph ph-check" />Agregar</button>
            <button className="btn btn-ghost" onClick={() => setProduct(null)}>Cancelar</button>
          </div>
          <span className="kova-faint" style={{ fontSize: 12 }}>Datos: © Open Food Facts contributors (ODbL).</span>
        </div>
      )}
    </section>
  );
}
