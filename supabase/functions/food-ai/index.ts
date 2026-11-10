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
  const parts: unknown[] = [{ text: PROMPT[mode] }];
  if (text) parts.push({ text: 'Lo que contó la persona: ' + text });
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  return geminiJson(parts, mode === 'label' ? LABEL_SCHEMA : ITEMS_SCHEMA, 0.2, 40000);
}

/** One JSON answer from the first Gemini model that exists and is not overloaded. */
async function geminiJson(parts: unknown[], schema: object, temperature: number, timeoutMs: number) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY missing'), { code: 'NOT_CONFIGURED' });
  const config = { responseMimeType: 'application/json', responseSchema: schema, temperature };
  const call = (model: string, think: boolean) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(timeoutMs),
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

// ── Etapa 2: weekly plan and swapping one meal ──────────────────────────────────────────────────

const SLOT_ES: Record<string, string> = { breakfast: 'desayuno', lunch: 'almuerzo', afternoon_snack: 'merienda', dinner: 'cena', snack: 'colación' };
const SLOTS = ['breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack'];
const DAY_SHARE: Record<string, number> = { breakfast: 0.22, lunch: 0.33, afternoon_snack: 0.13, dinner: 0.32, snack: 0.08 };

const MEAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    slot: { type: 'STRING', enum: SLOTS },
    title: { type: 'STRING', description: 'Nombre corto del plato, en español rioplatense' },
    minutes: { type: 'NUMBER', description: 'Minutos de preparación' },
    steps: { type: 'STRING', description: 'Cómo se hace, en 1 a 3 frases cortas' },
    ingredients: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { food: { type: 'NUMBER', description: 'Número del alimento en la lista' }, grams: { type: 'NUMBER' } }, required: ['food', 'grams'] },
    },
  },
  required: ['slot', 'title', 'minutes', 'steps', 'ingredients'],
};
const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: { days: { type: 'ARRAY', items: { type: 'OBJECT', properties: { date: { type: 'STRING' }, meals: { type: 'ARRAY', items: MEAL_SCHEMA } }, required: ['date', 'meals'] } } },
  required: ['days'],
};

interface Food { id: string; name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; ref_amount: number }
interface DayT { date: string; kind: string; kcal: number; proteinG: number; carbsG: number; fatG: number; note: string | null }

async function catalogAndPrefs(sb: any) {
  const [{ data: foods }, { data: prefs }] = await Promise.all([
    sb.from('foods').select('id, name, kcal, protein_g, carbs_g, fat_g, ref_amount, ref_unit').is('owner_id', null).is('archived_at', null)
      .in('ref_unit', ['g', 'ml']).order('name').limit(400),
    sb.from('food_preferences').select('*').maybeSingle(),
  ]);
  const list: Food[] = (foods ?? []).map((f: any) => ({
    id: f.id, name: f.name, kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g), ref_amount: Number(f.ref_amount),
  }));
  const p = prefs ?? { diet: 'omnivora', dislikes: [], allergies: [], meals_per_day: 4, cook_minutes: 30, people: 1, budget_week_ars: null, notes: null };
  return { list, p };
}

const catalogText = (list: Food[]) =>
  list.map((f, i) => i + '|' + f.name + '|' + Math.round(f.kcal) + 'kcal|P' + Math.round(f.protein_g) + '|C' + Math.round(f.carbs_g) + '|G' + Math.round(f.fat_g)).join('\n');

const prefsText = (p: any) =>
  [
    'Dieta: ' + p.diet + '.',
    p.dislikes?.length ? 'No le gusta: ' + p.dislikes.join(', ') + '.' : '',
    p.allergies?.length ? 'ALERGIAS (nunca usar): ' + p.allergies.join(', ') + '.' : '',
    'Tiempo para cocinar: hasta ' + p.cook_minutes + ' min por comida.',
    p.people > 1 ? 'Cocina para ' + p.people + ' personas (las porciones son de una).' : '',
    p.budget_week_ars ? 'Presupuesto ajustado: preferí alimentos económicos.' : '',
    p.notes ? 'Notas: ' + String(p.notes).slice(0, 300) : '',
  ].filter(Boolean).join(' ');

/** Nutrients of a meal from the catalog, with grams scaled so the meal lands on its kcal target. */
/**
 * Factors for the protein-rich ingredients (a) and the rest (b) so the meal lands on both its kcal and its
 * protein target: a·p1 + b·p2 = P, a·k1 + b·k2 = K. Falls back to one factor for kcal when the meal has
 * only one kind of ingredient or the system has no sensible answer. Factors stay between 0.5 and 1.8.
 */
function scaleFactors(p1: number, k1: number, p2: number, k2: number, kcal: number | null, protein: number | null) {
  const total = k1 + k2;
  const single = kcal && total > 0 ? Math.min(1.5, Math.max(0.6, kcal / total)) : 1;
  if (!kcal || !protein || k1 <= 0 || k2 <= 0) return { a: single, b: single };
  const det = p1 * k2 - p2 * k1;
  if (Math.abs(det) < 1e-6) return { a: single, b: single };
  const a = (protein * k2 - p2 * kcal) / det;
  const b = (p1 * kcal - protein * k1) / det;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return { a: single, b: single };
  const clamp = (x: number) => Math.min(1.8, Math.max(0.5, x));
  return { a: clamp(a), b: clamp(b) };
}

function cookMeal(raw: any, list: Food[], targetKcal: number | null, targetProtein: number | null = null) {
  const ings = (Array.isArray(raw?.ingredients) ? raw.ingredients : []).flatMap((x: any) => {
    const f = Number.isInteger(x?.food) ? list[x.food] : undefined;
    const g = num(x?.grams, 1, 1500);
    return f && g != null ? [{ f, g }] : [];
  }).slice(0, 12);
  if (!ings.length) return null;
  // Protein-rich: more than 30 % of its calories from protein (meat, fish, eggs, cheese, legumes…).
  const rich = (f: Food) => f.kcal > 0 && (f.protein_g * 4) / f.kcal > 0.3;
  const tot = (pick: (f: Food) => boolean, key: 'kcal' | 'protein_g') =>
    ings.filter((x: any) => pick(x.f)).reduce((a: number, x: any) => a + (x.f[key] * x.g) / x.f.ref_amount, 0);
  const { a: fa, b: fb } = scaleFactors(tot(rich, 'protein_g'), tot(rich, 'kcal'), tot((f) => !rich(f), 'protein_g'), tot((f) => !rich(f), 'kcal'), targetKcal, targetProtein);
  const ingredients = ings.map((x: any) => {
    const scale = rich(x.f) ? fa : fb;
    return { food_id: x.f.id as string, grams: Math.max(5, Math.round((x.g * scale) / 5) * 5), f: x.f as Food };
  });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const k = (key: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => r1(ingredients.reduce((a: number, x) => a + (x.f[key] * x.grams) / x.f.ref_amount, 0));
  return {
    title: str(raw.title, 120) ?? 'Comida', minutes: Math.round(num(raw.minutes, 0, 600) ?? 20), steps: str(raw.steps, 1200),
    ingredients: ingredients.map(({ food_id, grams }) => ({ food_id, grams })),
    kcal: k('kcal'), protein_g: k('protein_g'), carbs_g: k('carbs_g'), fat_g: k('fat_g'),
  };
}

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const invalid = (m: string) => Object.assign(new Error(m), { code: 'INVALID_INPUT' });
const upstream = (m: string) => Object.assign(new Error(m), { code: 'UPSTREAM' });

async function buildPlan(sb: any, body: any) {
  if (!isDate(body.week_start)) throw invalid('week_start');
  const days: DayT[] = (Array.isArray(body.days) ? body.days : []).filter((d: any) => isDate(d?.date) && num(d?.kcal, 900, 6000) != null).slice(0, 7);
  if (days.length !== 7) throw invalid('days');
  const { list, p } = await catalogAndPrefs(sb);
  const slots = p.meals_per_day <= 3 ? ['breakfast', 'lunch', 'dinner'] : p.meals_per_day === 4 ? ['breakfast', 'lunch', 'afternoon_snack', 'dinner'] : SLOTS;
  const total = slots.reduce((a, s) => a + DAY_SHARE[s]!, 0);

  const prompt =
    'Sos un nutricionista argentino. Armá un plan de comidas de 7 días con comida casera argentina, variada, rica y fácil. ' +
    'Usá SOLO alimentos de la lista (por su número) con gramos según diga el nombre (crudo o cocido). ' +
    'Cada día tiene estas comidas: ' + slots.map((s) => SLOT_ES[s]).join(', ') + '. ' +
    'Acercate a las kcal y proteínas de cada día (después afinamos las cantidades). Repetí ingredientes entre días para que la compra sea simple ' +
    'y aprovechá sobras (lo que sobra de una cena puede ser el almuerzo del día siguiente; el primer día no hay sobras). ' +
    'Repartí la proteína entre las comidas. Los días de fuerza, más carbohidratos. ' +
    'Los días de evento, comidas livianas fuera del evento. ' + prefsText(p) + '\n\nDías:\n' +
    days.map((d) => d.date + ' (' + d.kind + '): ' + d.kcal + ' kcal, ' + d.proteinG + ' g proteína' + (d.note ? ', ' + d.note : '')).join('\n') +
    '\n\nAlimentos (número|nombre|por 100 g):\n' + catalogText(list);
  const raw = await geminiJson([{ text: prompt }], PLAN_SCHEMA, 0.7, 55000);

  const items: any[] = [];
  days.forEach((d, idx) => {
    const rd = (raw?.days ?? []).find((x: any) => x?.date === d.date) ?? (raw?.days ?? [])[idx];
    for (const slot of slots) {
      const m = (rd?.meals ?? []).find((x: any) => x?.slot === slot);
      const cooked = m ? cookMeal(m, list, (d.kcal * DAY_SHARE[slot]!) / total, (d.proteinG * DAY_SHARE[slot]!) / total) : null;
      if (cooked) items.push({ local_date: d.date, slot, ...cooked });
    }
  });
  if (items.length < 7) throw upstream('plan too short');

  // One active plan per week: the new one replaces the old one (kept, archived).
  await sb.from('meal_plans').update({ archived_at: new Date().toISOString() }).eq('week_start', body.week_start).is('archived_at', null);
  const { data: plan, error } = await sb.from('meal_plans').insert({ week_start: body.week_start, targets: days }).select('id').single();
  if (error) throw upstream(error.message);
  const { error: e2 } = await sb.from('meal_plan_items').insert(items.map((it) => ({ ...it, plan_id: plan.id })));
  if (e2) throw upstream(e2.message);
  return { plan_id: plan.id, meals: items.length };
}

async function swapMeal(sb: any, body: any) {
  const { data: item } = await sb.from('meal_plan_items').select('*').eq('id', String(body.item_id ?? '')).maybeSingle();
  if (!item) throw invalid('item');
  const { list, p } = await catalogAndPrefs(sb);
  const wish = str(body.wish, 200);
  const { data: sameDay } = await sb.from('meal_plan_items').select('title').eq('plan_id', item.plan_id).eq('local_date', item.local_date).neq('id', item.id);
  const others = (sameDay ?? []).map((r: any) => r.title).join(', ');
  const prompt =
    'Sos un nutricionista argentino. Proponé UNA comida casera argentina para ' + SLOT_ES[item.slot] + ' que reemplace «' + item.title + '», ' +
    'distinta a esa' + (others ? ' y a las otras comidas del día (' + others + ')' : '') + ', de unas ' + Math.round(Number(item.kcal)) + ' kcal y ' + Math.round(Number(item.protein_g)) + ' g de proteína. ' +
    (wish ? 'La persona pidió: ' + wish + '. ' : '') + 'Usá SOLO alimentos de la lista por su número. ' + prefsText(p) +
    '\n\nAlimentos (número|nombre|por 100 g):\n' + catalogText(list);
  const raw = await geminiJson([{ text: prompt }], MEAL_SCHEMA, 0.9, 40000);
  const cooked = cookMeal(raw, list, Number(item.kcal), Number(item.protein_g));
  if (!cooked) throw upstream('no meal');
  await sb.from('meal_plan_items').delete().eq('id', item.id);
  const { data: fresh, error } = await sb.from('meal_plan_items')
    .insert({ plan_id: item.plan_id, local_date: item.local_date, slot: item.slot, ...cooked }).select('*').single();
  if (error) throw upstream(error.message);
  return { item: fresh };
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
  if (body?.mode === 'plan' || body?.mode === 'swap') {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await admin.from('ai_requests').select('id', { count: 'exact', head: true })
      .eq('user_id', who.user.id).gte('created_at', since);
    if ((count ?? 0) >= DAILY_CAP) return fail(429, 'RATE_LIMITED', 'daily AI limit');
    try {
      const out = body.mode === 'plan' ? await buildPlan(sb, body) : await swapMeal(sb, body);
      await admin.from('ai_requests').insert({ user_id: who.user.id, kind: 'plan', ok: true });
      return json(200, out);
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'UPSTREAM';
      await admin.from('ai_requests').insert({ user_id: who.user.id, kind: 'plan', ok: false });
      if (code === 'INVALID_INPUT') return fail(400, 'INVALID_INPUT', String((e as Error).message));
      console.error('plan', code, String((e as Error).message).slice(0, 200));
      return fail(code === 'RATE_LIMITED' ? 429 : code === 'NOT_CONFIGURED' || code === 'BUSY' ? 503 : 502, code === 'UPSTREAM' ? 'INTERNAL' : code, 'ai');
    }
  }
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
