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

/**
 * Lines of the list. Foods without shopping info go to «Otros» by their name. A pantry entry with grams
 * subtracts them; without grams it means «tengo» and the line goes away.
 */
export function buildShoppingList(ingredients: PlanIngredient[], foods: ShopFood[], pantry: PantryItem[] = []): ShoppingLine[] {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const byName = new Map(foods.map((f) => [f.name, f]));
  const acc = new Map<string, { name: string; aisle: string; grams: number; pkg?: number; label?: string }>();

  const add = (f: ShopFood, grams: number, depth = 0) => {
    const s = f.shop;
    if (s?.parts && depth < 2) {
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

  for (const p of pantry) {
    const cur = acc.get(fold(p.name));
    if (!cur) continue;
    if (p.grams == null) acc.delete(fold(p.name));
    else cur.grams = Math.max(0, cur.grams - p.grams);
  }

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
