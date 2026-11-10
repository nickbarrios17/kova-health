// Comidas, etapa 1 (docs/comidas.md): understand a meal from text, a plate photo or a nutrition label.
// Gemini only reads and splits; numbers come from the Kova catalog when the food is there. When it is
// not, the estimate travels as a range and is saved as 'estimated' only after the person confirms it.
// The key lives only here (secret GEMINI_API_KEY). Each person has a daily cap of AI calls.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json(status, { code, message });

const DAILY_CAP = Number(Deno.env.get('AI_DAILY_CAP') ?? '40');
// Google retires model names often: an explicit GEMINI_MODEL wins, then the rolling Flash alias, then
// known names; if none exists any more, the function asks the API which Flash models it has.
// Flash-Lite first: answers in a few seconds and is enough to split a meal or read a label.
const MODELS = [Deno.env.get('GEMINI_MODEL'), 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.8-flash']
  .filter(Boolean) as string[];
let discovered: string | null = null;
const BUSY = Symbol('busy');
const MAX_IMAGE_BYTES = 4_000_000;

type Mode = 'describe' | 'photo' | 'label';

const ITEMS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Nombre corto en español rioplatense, sin marca salvo que se diga' },
          search: { type: 'STRING', description: 'Palabras para buscar el alimento en un catálogo (ej. "empanada carne")' },
          amount: { type: 'NUMBER', description: 'Cantidad dicha o vista (ej. 2)' },
          unit: { type: 'STRING', enum: ['g', 'ml', 'unidad', 'porcion', 'taza', 'cucharada', 'vaso', 'plato', 'rebanada'] },
          grams: { type: 'NUMBER', description: 'Peso total estimado en gramos (o ml) de lo comido' },
          kcal_low: { type: 'NUMBER' }, kcal_high: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' }, carbs_g: { type: 'NUMBER' }, fat_g: { type: 'NUMBER' },
        },
        required: ['name', 'search', 'amount', 'unit', 'grams', 'kcal_low', 'kcal_high', 'protein_g', 'carbs_g', 'fat_g'],
      },
    },
    unclear: { type: 'STRING', description: 'Si algo no se entiende, una pregunta corta para la persona; si no, vacío' },
  },
  required: ['items'],
};

const LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    readable: { type: 'BOOLEAN' },
    name: { type: 'STRING' }, brand: { type: 'STRING' },
    liquid: { type: 'BOOLEAN' },
    serving_g: { type: 'NUMBER' },
    kcal_100: { type: 'NUMBER' }, protein_100: { type: 'NUMBER' }, carbs_100: { type: 'NUMBER' }, fat_100: { type: 'NUMBER' },
    fiber_100: { type: 'NUMBER' }, sugars_100: { type: 'NUMBER' }, sat_fat_100: { type: 'NUMBER' }, sodium_mg_100: { type: 'NUMBER' },
    seals: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Sellos negros visibles, ej. "EXCESO EN AZÚCARES"' },
  },
  required: ['readable'],
};

const PROMPT: Record<Mode, string> = {
  describe:
    'Sos un asistente de nutrición en Argentina. La persona cuenta qué comió. Separá cada alimento o plato, ' +
    'con la cantidad que dijo. Si no dijo cantidad, usá una porción típica argentina. Estimá los gramos y un ' +
    'rango honesto de kcal (bajo y alto) y los macros para esa cantidad. No inventes marcas ni alimentos que ' +
    'no mencionó. Si algo es ambiguo, poné una pregunta corta en "unclear".',
  photo:
    'Sos un asistente de nutrición en Argentina. Mirá la foto del plato. Identificá cada alimento visible y ' +
    'estimá la porción en gramos usando referencias del plato y los cubiertos. Dá un rango honesto de kcal ' +
    '(bajo y alto) y los macros. Si la foto no muestra comida o no se ve bien, devolvé items vacío y explicá en "unclear".',
  label:
    'Leé la tabla nutricional de esta etiqueta argentina. Devolvé los valores por 100 g (o 100 ml si es bebida). ' +
    'Si la tabla está por porción, convertí a 100 g con el tamaño de la porción. Copiá los sellos negros visibles. ' +
    'Si no se puede leer con seguridad, readable=false. Nunca adivines números que no se ven.',
};

async function gemini(mode: Mode, text: string | null, image: { mime: string; data: string } | null) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY missing'), { code: 'NOT_CONFIGURED' });
  const parts: unknown[] = [{ text: PROMPT[mode] }];
  if (text) parts.push({ text: 'Lo que contó la persona: ' + text });
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  const config = {
    responseMimeType: 'application/json', responseSchema: mode === 'label' ? LABEL_SCHEMA : ITEMS_SCHEMA, temperature: 0.2,
  };
  const call = (model: string, think: boolean) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(40000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        // Least "thinking": answers in seconds; the task does not need long reasoning.
        generationConfig: think ? { ...config, thinkingConfig: { thinkingBudget: 0 } } : config,
      }),
    });

  const tryModel = async (model: string) => {
    let res = await call(model, true);
    // Models that do not accept a zero thinking budget answer 400: ask again without it.
    if (res.status === 400) res = await call(model, false);
    if (res.status === 404) { console.warn('gemini model not found', model); return undefined; }
    if (res.status === 429) throw Object.assign(new Error('gemini rate limited'), { code: 'RATE_LIMITED' });
    // Overloaded or failing right now ("high demand"): try the next model instead of giving up.
    if (res.status >= 500) { console.warn('gemini busy', model, res.status); return BUSY; }
    if (!res.ok) { console.error('gemini', model, res.status, (await res.text()).slice(0, 300)); throw Object.assign(new Error('gemini failed'), { code: 'UPSTREAM' }); }
    const out = await res.json();
    const raw = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('bad json'), { code: 'UPSTREAM' }); }
  };

  const order = discovered ? [discovered, ...MODELS.filter((m) => m !== discovered)] : MODELS;
  let busy = false;
  for (const model of order) {
    const t0 = Date.now();
    const r = await tryModel(model);
    console.log('gemini', model, r === undefined ? 'missing' : r === BUSY ? 'busy' : 'ok', Date.now() - t0, 'ms');
    if (r === BUSY) { busy = true; continue; }
    if (r !== undefined) { discovered = model; return r; }
  }
  if (busy) throw Object.assign(new Error('gemini busy'), { code: 'BUSY' });
  // None of the known names exists: pick the newest Flash model the API lists.
  const list = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } })
    .then((r) => r.json()).catch(() => null);
  const flash = (list?.models ?? [])
    .filter((m: any) => /flash/.test(m.name) && !/image|tts|live|audio|embedding|preview/.test(m.name) && (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .sort().reverse();
  console.warn('gemini discovered flash models', flash.slice(0, 5).join(','));
  for (const model of flash.slice(0, 3)) {
    const r = await tryModel(model);
    if (r !== undefined && r !== BUSY) { discovered = model; return r; }
  }
  throw Object.assign(new Error('no gemini model available'), { code: 'UPSTREAM' });
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Keeps only items whose numbers make sense; the range always has low ≤ high. */
function cleanItems(raw: any) {
  const items = Array.isArray(raw?.items) ? raw.items.slice(0, 12) : [];
  return items.flatMap((it: any) => {
    const name = str(it.name, 120), grams = num(it.grams, 1, 3000);
    const lo = num(it.kcal_low, 0, 5000), hi = num(it.kcal_high, 0, 5000);
    const p = num(it.protein_g, 0, 500), c = num(it.carbs_g, 0, 800), f = num(it.fat_g, 0, 400);
    if (!name || grams == null || lo == null || hi == null || p == null || c == null || f == null) return [];
    return [{
      name: name.charAt(0).toUpperCase() + name.slice(1), search: str(it.search, 80) ?? name, amount: num(it.amount, 0, 1000) ?? 1,
      unit: str(it.unit, 20) ?? 'porcion', grams, kcal_low: Math.min(lo, hi), kcal_high: Math.max(lo, hi),
      protein_g: p, carbs_g: c, fat_g: f,
    }];
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'INVALID_INPUT', 'POST only');
  const authorization = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!, anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: who } = await sb.auth.getUser();
  if (!who?.user) return fail(401, 'UNAUTHENTICATED', 'sign in');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'INVALID_INPUT', 'json body'); }
  const mode: Mode = body?.mode === 'photo' || body?.mode === 'label' ? body.mode : 'describe';
  const text = str(body?.text, 600);
  let image: { mime: string; data: string } | null = null;
  if (mode !== 'describe') {
    const mime = str(body?.image?.mime, 40), data = typeof body?.image?.data === 'string' ? body.image.data : null;
    if (!mime || !/^image\/(jpeg|png|webp|heic)$/.test(mime) || !data) return fail(400, 'INVALID_INPUT', 'image');
    if (data.length * 0.75 > MAX_IMAGE_BYTES) return fail(400, 'INVALID_INPUT', 'image too large');
    image = { mime, data };
  } else if (!text) return fail(400, 'INVALID_INPUT', 'text');

  // Daily cap per person (the photo is not stored anywhere).
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from('ai_requests').select('id', { count: 'exact', head: true })
    .eq('user_id', who.user.id).gte('created_at', since);
  if ((count ?? 0) >= DAILY_CAP) return fail(429, 'RATE_LIMITED', 'daily AI limit');

  let raw: any;
  try {
    raw = await gemini(mode, text, image);
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'UPSTREAM';
    await admin.from('ai_requests').insert({ user_id: who.user.id, kind: mode, ok: false });
    return fail(code === 'RATE_LIMITED' ? 429 : code === 'NOT_CONFIGURED' || code === 'BUSY' ? 503 : 502, code === 'UPSTREAM' ? 'INTERNAL' : code, 'ai');
  }
  await admin.from('ai_requests').insert({ user_id: who.user.id, kind: mode, ok: true });

  if (mode === 'label') {
    if (!raw?.readable) return json(200, { label: null });
    const v = (k: string, hi: number) => num(raw[k], 0, hi);
    const label = {
      name: str(raw.name, 120), brand: str(raw.brand, 80), liquid: raw.liquid === true, serving_g: num(raw.serving_g, 1, 2000),
      kcal_100: v('kcal_100', 900), protein_100: v('protein_100', 100), carbs_100: v('carbs_100', 100), fat_100: v('fat_100', 100),
      fiber_100: v('fiber_100', 100), sugars_100: v('sugars_100', 100), sat_fat_100: v('sat_fat_100', 100), sodium_mg_100: v('sodium_mg_100', 40000),
      seals: Array.isArray(raw.seals) ? raw.seals.filter((s: unknown) => typeof s === 'string').slice(0, 6).map((s: string) => s.slice(0, 40)) : [],
    };
    if (label.kcal_100 == null || label.protein_100 == null || label.carbs_100 == null || label.fat_100 == null) return json(200, { label: null });
    return json(200, { label });
  }

  // Match every item against the catalog the person can see; the client shows both.
  const items = cleanItems(raw);
  const matched = await Promise.all(items.map(async (it: ReturnType<typeof cleanItems>[number]) => {
    // The AI's search words can be too many («ensalada mixta lechuga tomate»): fall back to the
    // name, then to its first two words, until the catalog answers.
    let data: any[] | null = null;
    for (const q of [it.search, it.name, it.name.split(/\s+/).slice(0, 2).join(' ')]) {
      ({ data } = await sb.rpc('search_foods', { p_q: q, p_limit: 3 }));
      if (data?.length) break;
    }
    const candidates = (data ?? []).map((f: any) => ({
      id: f.id, name: f.name, ref_amount: Number(f.ref_amount), ref_unit: f.ref_unit, data_source: f.data_source,
      kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g),
    }));
    return { ...it, candidates };
  }));
  return json(200, { items: matched, unclear: str(raw?.unclear, 200) });
});
