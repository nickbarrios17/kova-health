/**
 * Comidas, etapa 1 (docs/comidas.md): describe a meal, a plate photo or a label (food-ai function),
 * look up a barcode (food-barcode), and turn a product or a label into one of your own foods.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { KovaError, newId, type DescribedItem } from '@kova/domain';

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  quantity_label: string | null;
  serving_g: number | null;
  kcal_100: number;
  protein_100: number | null;
  carbs_100: number | null;
  fat_100: number | null;
  fiber_100: number | null;
  sugars_100: number | null;
  sat_fat_100: number | null;
  sodium_mg_100: number | null;
  liquid: boolean;
  category: string | null;
  labels: string[];
}

export interface ReadLabel {
  name: string | null;
  brand: string | null;
  liquid: boolean;
  serving_g: number | null;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  fiber_100: number | null;
  sugars_100: number | null;
  sat_fat_100: number | null;
  sodium_mg_100: number | null;
  seals: string[];
}

export interface Described { items: DescribedItem[]; unclear: string | null }
export interface ImageInput { mime: string; data: string }

interface FoodDeps {
  sb: SupabaseClient;
  call: <R extends { data: unknown; error: unknown }>(p: PromiseLike<R>) => Promise<NonNullable<R['data']>>;
  toKovaError: (e: unknown, status?: number) => KovaError;
}

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Llegaste al límite de consultas de hoy. Probá de nuevo mañana o cargalo a mano.',
  NOT_CONFIGURED: 'El asistente de comidas todavía no está activado.',
  INVALID_INPUT: 'No pudimos leer eso. Probá con otra foto o escribilo.',
  NETWORK: 'No pudimos consultar el código. Revisá tu conexión.',
};

export function createFood({ sb, call, toKovaError }: FoodDeps) {
  const invoke = async <T>(fn: 'food-ai' | 'food-barcode', body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      let payload: { code?: string } | null = null;
      try { payload = ctx && typeof ctx.json === 'function' ? await ctx.clone().json() : null; } catch { /* not JSON */ }
      const code = payload?.code;
      if (code && MESSAGES[code]) {
        throw new KovaError(code === 'NOT_CONFIGURED' ? 'INTERNAL' : (code as 'RATE_LIMITED' | 'INVALID_INPUT' | 'NETWORK'), MESSAGES[code]);
      }
      const e = toKovaError(error, ctx?.status);
      // Say what failed: the assistant, not the whole app.
      if (e.code === 'NETWORK') throw new KovaError('NETWORK', fn === 'food-ai' ? 'No pudimos hablar con el asistente. Revisá tu conexión y probá de nuevo.' : MESSAGES.NETWORK);
      throw e;
    }
    return data as T;
  };

  /** Up to 1600 px on the long side keeps photos small; the caller already compressed it. */
  const image = (img: ImageInput) => ({ mime: img.mime, data: img.data.replace(/^data:[^,]+,/, '') });

  return {
    /** «comí 2 empanadas de carne y una ensalada» → items with catalog candidates and an estimate range. */
    describe: (text: string) => invoke<Described>('food-ai', { mode: 'describe', text: text.trim().slice(0, 600) }),
    /** A photo of the plate; `text` can add context («era media porción»). */
    photo: (img: ImageInput, text?: string) => invoke<Described>('food-ai', { mode: 'photo', image: image(img), text: text?.trim().slice(0, 300) || undefined }),
    /** A photo of a nutrition table. Null when it cannot be read with confidence. */
    readLabel: async (img: ImageInput) => (await invoke<{ label: ReadLabel | null }>('food-ai', { mode: 'label', image: image(img) })).label,
    /** A packaged product by barcode (Open Food Facts). Null when nobody has loaded it yet. */
    barcode: async (code: string) => (await invoke<{ product: OffProduct | null }>('food-barcode', { code })).product,
    /** Products already scanned in the same category, to suggest one with fewer seals. */
    sameCategory: (category: string) =>
      call(sb.from('off_products').select('*').eq('category', category).eq('found', true).limit(40)) as Promise<OffProduct[]>,
    /**
     * One of your own foods from a scanned product or a read label (per 100 g/ml, data_source 'label').
     * Returns the existing one when you already have that barcode.
     */
    saveAsFood: async (p: { barcode?: string | null; name: string; brand?: string | null; liquid: boolean; serving_g?: number | null;
      kcal_100: number; protein_100: number | null; carbs_100: number | null; fat_100: number | null; fiber_100?: number | null }) => {
      if (p.barcode) {
        const mine = await call(sb.from('foods').select('*').eq('barcode', p.barcode).not('owner_id', 'is', null).maybeSingle());
        if (mine) return mine as Record<string, unknown>;
      }
      const row = {
        id: newId(), name: p.name.slice(0, 120), brand: p.brand?.slice(0, 80) ?? null, barcode: p.barcode ?? null,
        ref_amount: 100, ref_unit: p.liquid ? 'ml' : 'g',
        serving_label: p.serving_g ? '1 porción' : null, default_quantity: p.serving_g ?? null,
        kcal: Math.round(p.kcal_100 * 10) / 10, protein_g: p.protein_100 ?? 0, carbs_g: p.carbs_100 ?? 0, fat_g: p.fat_100 ?? 0,
        fiber_g: p.fiber_100 ?? null, data_source: 'label',
      };
      await call(sb.from('foods').insert(row));
      return call(sb.from('foods').select('*').eq('id', row.id).single()) as Promise<Record<string, unknown>>;
    },
  };
}
