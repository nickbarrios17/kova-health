// Comidas, etapa 1 (docs/comidas.md): a product by its barcode, from Open Food Facts (ODbL).
// Products are cached in public.off_products (also "not found", for a week) so the public API is not
// hit for every scan. The app shows "© Open Food Facts contributors" wherever this data appears.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Open Food Facts asks every app to identify itself with a name, a version and a contact.
const USER_AGENT = Deno.env.get('OFF_USER_AGENT') ?? 'KovaHealth/1.0 (https://kova-health.vercel.app)';
const FIELDS = 'code,product_name,product_name_es,brands,quantity,serving_quantity,nutriments,categories_tags,labels_tags,nutrition_data_per';
const FRESH_DAYS = 30, MISS_DAYS = 7;

const n = (v: unknown, hi: number) => {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= hi ? Math.round(x * 100) / 100 : null;
};

function normalize(code: string, p: any) {
  const m = p?.nutriments ?? {};
  const kcal = n(m['energy-kcal_100g'], 900) ?? (n(m['energy_100g'], 4000) != null ? Math.round(n(m['energy_100g'], 4000)! / 4.184) : null);
  const name = (p?.product_name_es || p?.product_name || '').trim().slice(0, 200) || null;
  const liquid = /\b(ml|l|cl)\b/i.test(String(p?.quantity ?? '')) || p?.nutrition_data_per === '100ml';
  return {
    barcode: code,
    found: !!name && kcal != null,
    name,
    brand: String(p?.brands ?? '').split(',')[0]?.trim().slice(0, 120) || null,
    quantity_label: String(p?.quantity ?? '').slice(0, 60) || null,
    serving_g: n(p?.serving_quantity, 2000) || null,
    kcal_100: kcal,
    protein_100: n(m['proteins_100g'], 100),
    carbs_100: n(m['carbohydrates_100g'], 100),
    fat_100: n(m['fat_100g'], 100),
    fiber_100: n(m['fiber_100g'], 100),
    sugars_100: n(m['sugars_100g'], 100),
    sat_fat_100: n(m['saturated-fat_100g'], 100),
    sodium_mg_100: n(m['sodium_100g'], 40) != null ? Math.round(n(m['sodium_100g'], 40)! * 1000 * 10) / 10 : null,
    liquid,
    category: (Array.isArray(p?.categories_tags) ? p.categories_tags.at(-1) : null)?.slice(0, 120) ?? null,
    labels: Array.isArray(p?.labels_tags) ? p.labels_tags.slice(0, 30).map((s: string) => String(s).slice(0, 80)) : [],
    fetched_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const authorization = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!, anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const sb = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: who } = await sb.auth.getUser();
  if (!who?.user) return json(401, { code: 'UNAUTHENTICATED', message: 'sign in' });

  let code = '';
  try { code = String((await req.json())?.code ?? '').replace(/\D/g, ''); } catch { /* empty */ }
  if (!/^[0-9]{8,14}$/.test(code)) return json(400, { code: 'INVALID_INPUT', message: 'barcode' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: cached } = await admin.from('off_products').select('*').eq('barcode', code).maybeSingle();
  if (cached) {
    const age = (Date.now() - Date.parse(cached.fetched_at)) / 86400_000;
    if (age < (cached.found ? FRESH_DAYS : MISS_DAYS)) return json(200, { product: cached.found ? cached : null, cached: true });
  }

  let product = null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
    });
    if (res.status === 429) return json(429, { code: 'RATE_LIMITED', message: 'open food facts' });
    const body = await res.json().catch(() => null);
    product = normalize(code, body?.status === 1 ? body.product : null);
  } catch (e) {
    console.error('off', String(e));
    if (cached?.found) return json(200, { product: cached, cached: true });
    return json(502, { code: 'NETWORK', message: 'open food facts' });
  }
  await admin.from('off_products').upsert(product, { onConflict: 'barcode' });
  return json(200, { product: product.found ? product : null, cached: false });
});
