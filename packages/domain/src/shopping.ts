/**
 * Comidas, etapa 3 (docs/comidas.md): the shopping list from a week's plan. Plan grams become bought
 * grams (cooked → raw, dishes → their ingredients), then real packages, minus what is already at home.
 */

export interface ShopInfo {
  aisle: string;
  /** Name on the list when it differs from the catalog name («Arroz blanco» for «Arroz blanco (cocido)»). */
  name?: string;
  /** Plan grams × factor = bought grams. */
  factor?: number;
  package_g?: number;
  package_label?: string;
  /** Typical dish: bought as these catalog foods (share of the dish's grams). */
  parts?: Array<{ name: string; share: number }>;
}

export interface ShopFood { id: string; name: string; shop: ShopInfo | null }
export interface PlanIngredient { food_id: string; grams: number }
export interface PantryItem { name: string; grams: number | null }

export interface ShoppingLine {
  name: string;
  aisle: string;
  /** Grams (or ml) to buy, after the pantry. */
  grams: number;
  packages: number | null;
  package_label: string | null;
}

/** Order of the aisles in a usual Argentine supermarket walk. */
export const AISLE_ORDER = ['Verdulería', 'Carnicería', 'Pollería', 'Pescadería', 'Fiambrería', 'Lácteos y huevos', 'Panadería', 'Almacén', 'Congelados', 'Bebidas', 'Otros'];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*\(.*\)\s*/g, ' ').trim();
/** «Pan francés» from «Pan francés», «Papa» from «Papa (cruda)». */
const baseName = (f: ShopFood) => f.shop?.name ?? f.name.replace(/\s*\(.*\)\s*$/, '');

const stemEq = (a: string, b: string) => a === b || (a.startsWith(b) && a.length - b.length <= 2) || (b.startsWith(a) && b.length - a.length <= 2);
const nameWords = (x: string) => fold(x).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 || /^(aji|te|ajo)$/.test(w));

/**
 * What you wrote you have at home is this list line: the same name, or the same words allowing plurals
 * and a missing detail («pechugas de pollo» ↔ «Pechuga de pollo», «morrón» ↔ «Morrón rojo»), always
 * starting with the same food word («Leche» is not «Dulce de leche»).
 */
export function pantryMatches(pantryName: string, lineName: string): boolean {
  if (fold(pantryName) === fold(lineName)) return true;
  const pw = nameWords(pantryName), lw = nameWords(lineName);
  if (!pw.length || !lw.length || !stemEq(pw[0]!, lw[0]!)) return false;
  return pw.every((w) => lw.some((x) => stemEq(w, x))) && lw.length - pw.length <= 1;
}

export interface ShoppingPlan {
  lines: ShoppingLine[];
  /** What you have at home that the week uses (by the name you gave it). */
  fromHome: string[];
  /** What you have at home that this week does not use. */
  unused: string[];
}

/** The list for the week, and which of the things at home it uses. */
export function shoppingFromPlan(ingredients: PlanIngredient[], foods: ShopFood[], pantry: PantryItem[] = []): ShoppingPlan {
  const used = new Set<number>();
  const lines = listLines(ingredients, foods, pantry, used);
  return { lines, fromHome: pantry.filter((_, k) => used.has(k)).map((p) => p.name), unused: pantry.filter((_, k) => !used.has(k)).map((p) => p.name) };
}

/**
 * Lines of the list. Foods without shopping info go to «Otros» by their name. A pantry entry with grams
 * subtracts them; without grams it means «tengo» and the line goes away. Having a dish at home
 * («milanesas») covers the dish: its ingredients are not added.
 */
export function buildShoppingList(ingredients: PlanIngredient[], foods: ShopFood[], pantry: PantryItem[] = []): ShoppingLine[] {
  return listLines(ingredients, foods, pantry, new Set());
}

function listLines(ingredients: PlanIngredient[], foods: ShopFood[], pantry: PantryItem[], used: Set<number>): ShoppingLine[] {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const byName = new Map(foods.map((f) => [f.name, f]));
  const acc = new Map<string, { name: string; aisle: string; grams: number; pkg?: number; label?: string }>();

  const add = (f: ShopFood, grams: number, depth = 0) => {
    const s = f.shop;
    if (s?.parts && depth < 2) {
      const have = pantry.findIndex((p) => pantryMatches(p.name, f.name) || pantryMatches(p.name, baseName(f)));
      if (have >= 0) { used.add(have); return; }
      for (const p of s.parts) {
        const part = byName.get(p.name);
        if (part) add(part, grams * p.share, depth + 1);
      }
      return;
    }
    const name = baseName(f);
    const key = fold(name);
    const cur = acc.get(key) ?? { name, aisle: s?.aisle ?? 'Otros', grams: 0, pkg: s?.package_g, label: s?.package_label };
    cur.grams += grams * (s?.factor ?? 1);
    acc.set(key, cur);
  };
  for (const ing of ingredients) {
    const f = byId.get(ing.food_id);
    if (f && ing.grams > 0) add(f, ing.grams);
  }

  pantry.forEach((p, k) => {
    const key = acc.has(fold(p.name)) ? fold(p.name) : [...acc.keys()].find((x) => pantryMatches(p.name, acc.get(x)!.name));
    if (!key) return;
    used.add(k);
    const cur = acc.get(key)!;
    if (p.grams == null) acc.delete(key);
    else cur.grams = Math.max(0, cur.grams - p.grams);
  });

  return [...acc.values()]
    .filter((x) => x.grams >= 5)
    .map((x) => x.pkg
      ? { name: x.name, aisle: x.aisle, grams: Math.round(x.grams), packages: Math.max(1, Math.ceil(x.grams / x.pkg - 0.1)), package_label: x.label ?? null }
      // Sold by weight: round up to 100 g (the butcher and the greengrocer weigh in hundreds).
      : { name: x.name, aisle: x.aisle, grams: Math.max(100, Math.ceil(x.grams / 100) * 100), packages: null, package_label: null })
    .sort((a, b) => (AISLE_ORDER.indexOf(a.aisle) + 100) % 100 - (AISLE_ORDER.indexOf(b.aisle) + 100) % 100 || a.name.localeCompare(b.name, 'es'));
}

/** «2 × paquete de 500 g», «1,2 kg», «300 g». */
export function lineAmount(l: Pick<ShoppingLine, 'grams' | 'packages' | 'package_label'>): string {
  if (l.packages && l.package_label) return l.packages + ' × ' + l.package_label;
  return l.grams >= 1000 ? (Math.round(l.grams / 100) / 10).toLocaleString('es-AR') + ' kg' : l.grams + ' g';
}

// ── Receipt review ─────────────────────────────────────────────────────────────

/**
 * What a receipt line is, as the photo reading classifies it. «comida» is plain food; the rest are things
 * the plan does not count on (treats, sugary drinks, alcohol, ultra-processed) or not food at all.
 */
export type ReceiptKind = 'comida' | 'snack' | 'bebida_azucarada' | 'alcohol' | 'ultraprocesado' | 'no_comida';
export interface ReceiptItem { name: string; grams: number | null; kind: ReceiptKind; price?: number | null }

export const RECEIPT_KIND_LABEL: Record<Exclude<ReceiptKind, 'comida' | 'no_comida'>, string> = {
  snack: 'Snack o golosina', bebida_azucarada: 'Bebida con azúcar', alcohol: 'Alcohol', ultraprocesado: 'Ultraprocesado',
};

export interface ReceiptReview {
  /** On the list: bought as planned. `listName` is the list line it matched. */
  onList: Array<ReceiptItem & { listName: string }>;
  /** Plain food that was not on the list (fine, but outside what the week needed). */
  offList: ReceiptItem[];
  /** Outside the plan: treats, sugary drinks, alcohol, ultra-processed. */
  offPlan: ReceiptItem[];
  /** On the list and not on the receipt. */
  missing: string[];
  /** Cleaning products and the like: not part of the review. */
  other: ReceiptItem[];
}

const words = (s: string) => fold(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2);

/** Same food: equal names, or both start with the same food word («Leche» ↔ «Leche entera La Serenísima 1 l»). */
export function sameFood(receiptName: string, listName: string): boolean {
  const a = fold(receiptName), b = fold(listName);
  if (a === b) return true;
  const lw = words(listName), rw = words(receiptName);
  if (!lw.length || !rw.length) return false;
  // The first word of each decides (it is the food: «Pechuga de pollo» → pechuga, «Arroz con leche» is
  // arroz, not leche); a stem match allows plurals («Bananas» ↔ «Banana»).
  const head = lw[0]!, w = rw[0]!;
  return w === head || (w.startsWith(head) && w.length - head.length <= 2) || (head.startsWith(w) && head.length - w.length <= 2);
}

/** Compares a receipt with the shopping list: what matched, what was extra, what is outside the plan and what is missing. */
export function reviewReceipt(items: ReceiptItem[], listNames: string[]): ReceiptReview {
  const out: ReceiptReview = { onList: [], offList: [], offPlan: [], missing: [], other: [] };
  const used = new Set<string>();
  for (const it of items) {
    if (it.kind === 'no_comida') { out.other.push(it); continue; }
    if (it.kind !== 'comida') { out.offPlan.push(it); continue; }
    const match = listNames.find((n) => !used.has(n) && sameFood(it.name, n)) ?? listNames.find((n) => sameFood(it.name, n));
    if (match) { used.add(match); out.onList.push({ ...it, listName: match }); }
    else out.offList.push(it);
  }
  out.missing = listNames.filter((n) => !used.has(n));
  return out;
}

/** «milanesas, cebolla, morrón y 6 huevos» → ['Milanesas', 'Cebolla', 'Morrón', '6 huevos']. */
export function splitFoods(text: string): string[] {
  return [...new Set(text.split(/[,;\n]+|\s+y\s+|\s+e\s+/i).map((x) => x.trim().replace(/[.]+$/, '')).filter((x) => x.length >= 2)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1)).slice(0, 30))];
}
