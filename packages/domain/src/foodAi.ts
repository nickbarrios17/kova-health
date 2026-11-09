/**
 * Comidas, etapa 1 (docs/comidas.md): pure helpers for describing meals, barcodes and labels.
 * The AI only splits and estimates; numbers come from the catalog whenever the food is there.
 */

export interface CatalogFood {
  id: string;
  name: string;
  ref_amount: number;
  ref_unit: 'g' | 'ml' | 'serving';
  data_source: 'verified' | 'label' | 'user' | 'estimated';
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DescribedItem {
  name: string;
  search: string;
  amount: number;
  unit: string;
  grams: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  candidates: CatalogFood[];
}

export interface MealNutrients { kcal: number; protein_g: number; carbs_g: number; fat_g: number }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrients of `grams` of a catalog food given per `ref_amount` g/ml. Serving-based foods scale by servings. */
export function scaleFood(f: Pick<CatalogFood, 'ref_amount' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>, quantity: number): MealNutrients {
  const k = quantity / f.ref_amount;
  return { kcal: Math.round(f.kcal * k), protein_g: r1(f.protein_g * k), carbs_g: r1(f.carbs_g * k), fat_g: r1(f.fat_g * k) };
}

/** A catalog candidate is used only when it is measured by weight or volume (grams are comparable). */
export function usableCandidate(item: DescribedItem): CatalogFood | null {
  return item.candidates.find((c) => c.ref_unit === 'g' || c.ref_unit === 'ml') ?? null;
}

/** «≈ 550–700 kcal», rounded to tens, or a single number when the range is tight. */
export function kcalRange(low: number, high: number): string {
  const lo = Math.round(low / 10) * 10, hi = Math.round(high / 10) * 10;
  return lo === hi || hi - lo < 20 ? `≈ ${Math.round((low + high) / 2)} kcal` : `≈ ${lo.toLocaleString('es-AR')}–${hi.toLocaleString('es-AR')} kcal`;
}

/** Middle of the AI estimate, saved only as 'estimated' and only after the person confirms it. */
export function estimateMidpoint(item: Pick<DescribedItem, 'kcal_low' | 'kcal_high' | 'protein_g' | 'carbs_g' | 'fat_g'>): MealNutrients {
  return { kcal: Math.round((item.kcal_low + item.kcal_high) / 2), protein_g: r1(item.protein_g), carbs_g: r1(item.carbs_g), fat_g: r1(item.fat_g) };
}

/** Macros that do not add up to the calories (4/4/9 kcal per g, ±35 %) are flagged for a second look. */
export function macrosConsistent(n: MealNutrients): boolean {
  const fromMacros = n.protein_g * 4 + n.carbs_g * 4 + n.fat_g * 9;
  if (n.kcal < 30) return fromMacros < 60;
  return Math.abs(fromMacros - n.kcal) / n.kcal <= 0.35;
}

// ── Argentine front-of-pack warning seals (Ley 27.642) ─────────────────────────────────────────

export type Seal = 'azucares' | 'grasas_totales' | 'grasas_saturadas' | 'sodio' | 'calorias';

export const SEAL_LABEL: Record<Seal, string> = {
  azucares: 'Exceso en azúcares',
  grasas_totales: 'Exceso en grasas totales',
  grasas_saturadas: 'Exceso en grasas saturadas',
  sodio: 'Exceso en sodio',
  calorias: 'Exceso en calorías',
};

export interface PackagedProduct {
  liquid: boolean;
  kcal_100: number | null;
  fat_100: number | null;
  sat_fat_100: number | null;
  sugars_100: number | null;
  sodium_mg_100: number | null;
  labels?: string[];
}

const TAG_TO_SEAL: Array<[RegExp, Seal]> = [
  [/exceso-en-azucares|excess-sugar/, 'azucares'],
  [/exceso-en-grasas-totales|excess-fat/, 'grasas_totales'],
  [/exceso-en-grasas-saturadas|excess-saturated-fat/, 'grasas_saturadas'],
  [/exceso-en-sodio|excess-sodium|excess-salt/, 'sodio'],
  [/exceso-en-calorias|excess-calories/, 'calorias'],
];

/**
 * The seals a product carries. When the package's own seals are known (Open Food Facts label tags or
 * a label photo) those win (`from: 'label'`). Otherwise they are computed from the nutrition table with
 * the law's thresholds (`from: 'table'`) — an approximation, because the law counts free sugars and only
 * applies when sugar, fat or sodium were added, which a table does not say.
 */
export function argentineSeals(p: PackagedProduct, labelSeals: string[] = []): { seals: Seal[]; from: 'label' | 'table' | 'none' } {
  const fromLabel = new Set<Seal>();
  for (const t of [...(p.labels ?? []), ...labelSeals.map((s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'))]) {
    for (const [re, seal] of TAG_TO_SEAL) if (re.test(t)) fromLabel.add(seal);
  }
  if (fromLabel.size) return { seals: [...fromLabel], from: 'label' };
  const kcal = p.kcal_100;
  if (kcal == null || kcal <= 0) return { seals: [], from: 'none' };
  const seals: Seal[] = [];
  if (p.sugars_100 != null && (p.sugars_100 * 4) / kcal >= 0.1) seals.push('azucares');
  if (p.fat_100 != null && (p.fat_100 * 9) / kcal >= 0.3) seals.push('grasas_totales');
  if (p.sat_fat_100 != null && (p.sat_fat_100 * 9) / kcal >= 0.1) seals.push('grasas_saturadas');
  if (p.sodium_mg_100 != null && (p.sodium_mg_100 / kcal >= 1 || p.sodium_mg_100 >= 300)) seals.push('sodio');
  if (kcal >= (p.liquid ? 70 : 275)) seals.push('calorias');
  return { seals, from: 'table' };
}

/** A product with fewer seals in the same category, if one is known (the cache grows with every scan). */
export function betterAlternative<T extends PackagedProduct & { barcode: string; category: string | null }>(product: T, others: T[]): T | null {
  const mine = argentineSeals(product).seals.length;
  if (!product.category || mine === 0) return null;
  const pool = others
    .filter((o) => o.barcode !== product.barcode && o.category === product.category && o.kcal_100 != null)
    .map((o) => ({ o, n: argentineSeals(o).seals.length }))
    .filter((x) => x.n < mine)
    .sort((a, b) => a.n - b.n || (a.o.kcal_100 ?? 0) - (b.o.kcal_100 ?? 0));
  return pool[0]?.o ?? null;
}
