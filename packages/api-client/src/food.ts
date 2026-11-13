/**
 * Comidas, etapa 1 (docs/comidas.md): describe a meal, a plate photo or a label (food-ai function),
 * look up a barcode (food-barcode), and turn a product or a label into one of your own foods.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { KovaError, newId, type DescribedItem, type ReceiptItem, type ShopFood, type ShoppingLine } from '@kova/domain';

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

export interface FoodPreferences {
  diet: 'omnivora' | 'vegetariana' | 'vegana' | 'sin_tacc';
  dislikes: string[];
  allergies: string[];
  meals_per_day: number;
  cook_minutes: number;
  people: number;
  budget_week_ars: number | null;
  notes: string | null;
}

export interface PlanMeal {
  id: string;
  plan_id: string;
  local_date: string;
  slot: 'breakfast' | 'lunch' | 'afternoon_snack' | 'dinner' | 'snack';
  title: string;
  minutes: number | null;
  steps: string | null;
  ingredients: Array<{ food_id: string; grams: number }>;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string | null;
}

export interface MealPlan { id: string; week_start: string; targets: Array<Record<string, unknown>>; created_at: string; items: PlanMeal[] }
export interface ShoppingItem { id: string; list_id: string; name: string; aisle: string; grams: number | null; packages: number | null; package_label: string | null; position: number; checked_at: string | null }
export interface ShoppingList { id: string; title: string; plan_id: string | null; created_at: string; items: ShoppingItem[] }
export interface Pantry { id: string; name: string; grams: number | null; source: string; created_at: string }
export interface MealEvent { id: string; local_date: string; kind: 'asado' | 'salida' | 'cumple' | 'otro'; note: string | null }
export interface ImageInput { mime: string; data: string }
/** «¿Qué como ahora?»: one suggested meal, with grams already tuned to its target. */
export interface NowMeal {
  slot: 'breakfast' | 'lunch' | 'afternoon_snack' | 'dinner' | 'snack'; title: string; minutes: number; steps: string | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  ingredients: Array<{ food_id: string; grams: number; name: string; home: boolean }>;
}

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
  BUSY: 'El asistente está con mucha demanda. Probá de nuevo en un momento.',
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
        throw new KovaError(code === 'NOT_CONFIGURED' || code === 'BUSY' ? 'INTERNAL' : (code as 'RATE_LIMITED' | 'INVALID_INPUT' | 'NETWORK'), MESSAGES[code]);
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

  const num = (v: unknown) => Number(v);
  const toMeal = (r: Record<string, unknown>): PlanMeal => ({
    ...(r as unknown as PlanMeal), kcal: num(r.kcal), protein_g: num(r.protein_g), carbs_g: num(r.carbs_g), fat_g: num(r.fat_g),
  });

  return {
    /** Water through the day (a glass is 250 ml). Private: nobody else sees it. */
    water: {
      total: async (localDate: string) => {
        const rows = (await call(sb.from('water_logs').select('id, ml').eq('local_date', localDate).order('created_at'))) as Array<{ id: string; ml: number }>;
        return { ml: rows.reduce((a, r) => a + r.ml, 0), last_id: rows.at(-1)?.id ?? null };
      },
      add: (localDate: string, ml = 250) =>
        call(sb.from('water_logs').insert({ local_date: localDate, ml: Math.min(3000, Math.max(50, Math.round(ml))) })),
      /** Undo a glass logged by mistake. */
      remove: (id: string) => call(sb.from('water_logs').delete().eq('id', id)),
    },
    preferences: {
      get: async () => (await call(sb.from('food_preferences').select('*').maybeSingle())) as FoodPreferences | null,
      save: async (p: FoodPreferences) => {
        const row = {
          diet: p.diet, dislikes: p.dislikes.slice(0, 30).map((x) => x.slice(0, 60)), allergies: p.allergies.slice(0, 20).map((x) => x.slice(0, 60)),
          meals_per_day: Math.min(5, Math.max(3, Math.round(p.meals_per_day))), cook_minutes: Math.min(180, Math.max(5, Math.round(p.cook_minutes))),
          people: Math.min(10, Math.max(1, Math.round(p.people))), budget_week_ars: p.budget_week_ars, notes: p.notes?.slice(0, 300) ?? null,
        };
        return call(sb.from('food_preferences').upsert(row, { onConflict: 'user_id' }).select('*').single()) as Promise<FoodPreferences>;
      },
    },
    events: {
      list: (from: string, to: string) =>
        call(sb.from('meal_events').select('*').gte('local_date', from).lte('local_date', to).order('local_date')) as Promise<MealEvent[]>,
      add: (localDate: string, kind: MealEvent['kind'], note?: string) =>
        call(sb.from('meal_events').upsert({ local_date: localDate, kind, note: note?.slice(0, 120) ?? null }, { onConflict: 'user_id,local_date,kind' }).select('*').single()),
      remove: (id: string) => call(sb.from('meal_events').delete().eq('id', id)),
    },
    plan: {
      /** The active plan of a week (Monday), with its meals; null when there is none. */
      get: async (weekStart: string): Promise<MealPlan | null> => {
        const plan = (await call(sb.from('meal_plans').select('id, week_start, targets, created_at').eq('week_start', weekStart).is('archived_at', null).maybeSingle())) as Omit<MealPlan, 'items'> | null;
        if (!plan) return null;
        const items = (await call(sb.from('meal_plan_items').select('*').eq('plan_id', plan.id).order('local_date').order('slot'))) as Array<Record<string, unknown>>;
        return { ...plan, items: items.map(toMeal) };
      },
      /** Builds the week with the AI around the day targets; replaces that week's plan. */
      generate: (weekStart: string, days: Array<Record<string, unknown>>) =>
        invoke<{ plan_id: string; meals: number }>('food-ai', { mode: 'plan', week_start: weekStart, days }),
      /** Another meal of about the same calories for that slot; `wish`: «algo con pollo». */
      swap: async (itemId: string, wish?: string) => toMeal((await invoke<{ item: Record<string, unknown> }>('food-ai', { mode: 'swap', item_id: itemId, wish: wish?.slice(0, 200) })).item),
      markLogged: (itemId: string) => call(sb.from('meal_plan_items').update({ logged_at: new Date().toISOString() }).eq('id', itemId).select('id').single()),
    },
    /** How every catalog food is bought (for building the shopping list on the device). */
    catalogShop: async () =>
      ((await call(sb.from('foods').select('id, name, shop').is('owner_id', null).not('shop', 'is', null).limit(500))) as ShopFood[]),
    shopping: {
      /** The latest list that is not finished, with its items; null when there is none. */
      current: async (): Promise<ShoppingList | null> => {
        const list = (await call(sb.from('shopping_lists').select('id, title, plan_id, created_at').is('archived_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle())) as Omit<ShoppingList, 'items'> | null;
        if (!list) return null;
        const items = (await call(sb.from('shopping_items').select('*').eq('list_id', list.id).order('position'))) as Array<Record<string, unknown>>;
        return { ...list, items: items.map((i) => ({ ...(i as unknown as ShoppingItem), grams: i.grams == null ? null : Number(i.grams) })) };
      },
      /** A new list (the previous unfinished one is archived); shared with the household when there is one. */
      create: async (title: string, lines: ShoppingLine[], planId: string | null) => {
        await call(sb.from('shopping_lists').update({ archived_at: new Date().toISOString() }).is('archived_at', null).select('id'));
        const house = (await call(sb.from('household_members').select('household_id').limit(1).maybeSingle())) as { household_id: string } | null;
        const id = newId();
        await call(sb.from('shopping_lists').insert({ id, title: title.slice(0, 80), plan_id: planId, household_id: house?.household_id ?? null }));
        if (lines.length) {
          await call(sb.from('shopping_items').insert(lines.slice(0, 300).map((l, position) => ({
            list_id: id, name: l.name.slice(0, 120), aisle: l.aisle.slice(0, 40), grams: l.grams, packages: l.packages, package_label: l.package_label, position,
          }))));
        }
        return id;
      },
      check: (itemId: string, checked: boolean) =>
        call(sb.from('shopping_items').update({ checked_at: checked ? new Date().toISOString() : null }).eq('id', itemId).select('id').single()),
      addItem: (listId: string, name: string, position: number) =>
        call(sb.from('shopping_items').insert({ list_id: listId, name: name.slice(0, 120), aisle: 'Otros', position }).select('*').single()),
      removeItem: (itemId: string) => call(sb.from('shopping_items').delete().eq('id', itemId)),
      /** Done shopping: the list is archived and what was bought goes to the pantry. */
      finish: async (list: ShoppingList) => {
        const bought = list.items.filter((i) => i.checked_at);
        if (bought.length) {
          await call(sb.from('pantry_items').insert(bought.map((i) => ({ name: i.name, grams: i.grams, source: 'lista' }))));
        }
        return call(sb.from('shopping_lists').update({ archived_at: new Date().toISOString() }).eq('id', list.id).select('id').single());
      },
    },
    household: {
      /** The household (with its invite code) and who is in it; null when not in one. */
      get: async () => {
        const h = (await call(sb.from('households').select('id, name, code').limit(1).maybeSingle())) as { id: string; name: string; code: string } | null;
        if (!h) return null;
        const people = (await call(sb.rpc('household_people'))) as Array<{ user_id: string; name: string; me: boolean }>;
        return { ...h, people };
      },
      create: (name: string) => call(sb.rpc('create_household', { p_name: name.slice(0, 60) })),
      join: (code: string) => call(sb.rpc('join_household', { p_code: code.trim().toUpperCase() })),
      leave: () => call(sb.rpc('leave_household')),
    },
    /** The meals left today from what you have (`have`, plus what is noted «En casa»). */
    now: (have: string, meals: Array<{ slot: string; kcal: number; protein_g: number }>) =>
      invoke<{ note: string | null; meals: NowMeal[] }>('food-ai', { mode: 'now', have: have.trim().slice(0, 600) || undefined, meals }),
    /** A photo of a restaurant menu → the dishes that best fit what is left of the day. */
    menu: async (img: ImageInput, left: { kcal: number | null; proteinG: number | null }) =>
      (await invoke<{ options: Array<{ name: string; why: string; kcal_low: number; kcal_high: number; protein_g: number }> }>('food-ai', {
        mode: 'menu', image: image(img), kcal_left: left.kcal, protein_left: left.proteinG,
      })).options,
    pantry: {
      list: () => call(sb.from('pantry_items').select('*').order('created_at', { ascending: false }).limit(300)) as Promise<Pantry[]>,
      add: (items: Array<{ name: string; grams: number | null }>, source: 'manual' | 'ticket' | 'foto') =>
        items.length
          ? call(sb.from('pantry_items').insert(items.slice(0, 100).map((i) => ({ name: i.name.slice(0, 120), grams: i.grams, source }))))
          : Promise.resolve(null),
      remove: (id: string) => call(sb.from('pantry_items').delete().eq('id', id)),
      clear: () => call(sb.from('pantry_items').delete().not('id', 'is', null)),
      /** A receipt or a photo of the fridge → what is at home (names match the list). */
      /** Reads a receipt or a fridge photo. With `list` (the shopping list's names) receipt lines are named like the list. */
      read: async (img: ImageInput, list: string[] = []) =>
        (await invoke<{ items: ReceiptItem[] }>('food-ai', { mode: 'pantry', image: image(img), list: list.slice(0, 80) })).items
          .map((i) => ({ ...i, kind: i.kind ?? 'comida', price: i.price ?? null })),
    },
    /** Names of foods by id (plan ingredients). */
    foodsByIds: (ids: string[]) =>
      ids.length ? call(sb.from('foods').select('id, name').in('id', ids.slice(0, 50))) : Promise.resolve([]),
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
