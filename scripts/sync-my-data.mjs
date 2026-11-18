#!/usr/bin/env node
// Copies one person's data from the official database to the test one (Kova Health → Kova Health Prueba),
// so what they log in the official app is also there to try new features with. One way only: the test
// database runs ahead of the official one (new tables and columns), and the official data is never touched.
//
// - Same ids on both sides (client UUIDs), so re-running never duplicates; a row that changed in the
//   official database is updated in the test one. Rows that exist only in the test database are kept.
// - The person's id differs per database (found by email). System exercises have different ids too
//   (matched by slug); system foods share ids.
// - Hourly runs copy what changed in the last SINCE_HOURS; FULL=1 copies everything.
// - The repository is public: this prints counts only, never data, emails or ids.
//
// Env: SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL, TARGET_SERVICE_KEY, SYNC_EMAIL, [FULL=1], [SINCE_HOURS=3]
import { createClient } from '@supabase/supabase-js';

const env = (k) => {
  const v = process.env[k];
  if (!v) { console.error('Falta ' + k); process.exit(1); }
  return v;
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const src = createClient(env('SOURCE_URL'), env('SOURCE_SERVICE_KEY'), opts);
const dst = createClient(env('TARGET_URL'), env('TARGET_SERVICE_KEY'), opts);
const email = env('SYNC_EMAIL').trim().toLowerCase();
const FULL = process.env.FULL === '1';
const since = new Date(Date.now() - Number(process.env.SINCE_HOURS || 3) * 3600_000).toISOString();

async function userId(sb, side) {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(side + ': no pude listar usuarios (' + error.message + ')');
    const u = data.users.find((x) => (x.email ?? '').toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  throw new Error('No hay una cuenta con ese correo en la base ' + side + '. Creala primero en esa app.');
}

/** Every row of a query, 1000 at a time. */
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const srcUser = await userId(src, 'oficial');
const dstUser = await userId(dst, 'de prueba');

// System exercises: same slug, different id.
const slugs = async (sb) => all(() => sb.from('exercises').select('id, slug').is('owner_id', null).order('id'));
const dstBySlug = new Map((await slugs(dst)).map((e) => [e.slug, e.id]));
const exMap = new Map((await slugs(src)).flatMap((e) => (dstBySlug.has(e.slug) ? [[e.id, dstBySlug.get(e.slug)]] : [])));
const mapEx = (id) => (id == null ? id : exMap.get(id) ?? id);

/**
 * In copy order (parents first). `by`: the column that says whose row it is. `when`: the column that
 * says it changed (absent: small table, always copied). `on`: upsert key. `fix`: per-row changes.
 */
const TABLES = [
  { t: 'user_preferences', by: 'user_id', on: 'user_id', when: 'updated_at' },
  { t: 'food_preferences', by: 'user_id', on: 'user_id', when: 'updated_at' },
  { t: 'nutrition_goals', by: 'user_id', when: 'updated_at' },
  { t: 'goals', by: 'user_id', when: 'updated_at' },
  { t: 'devices', by: 'user_id', when: 'updated_at' },
  { t: 'foods', by: 'owner_id', when: 'updated_at' },
  { t: 'exercises', by: 'owner_id', when: 'updated_at', fix: (r) => ({ ...r, variation_of: mapEx(r.variation_of) }) },
  { t: 'recipes', by: 'user_id', when: 'updated_at' },
  { t: 'recipe_ingredients', by: 'user_id', when: 'updated_at' },
  { t: 'routines', by: 'user_id', when: 'updated_at' },
  { t: 'routine_exercises', by: 'user_id', when: 'updated_at', fix: (r) => ({ ...r, exercise_id: mapEx(r.exercise_id) }) },
  { t: 'workout_sessions', by: 'user_id', when: 'updated_at' },
  { t: 'workout_session_exercises', by: 'user_id', when: 'updated_at', fix: (r) => ({ ...r, exercise_id: mapEx(r.exercise_id) }) },
  { t: 'workout_sets', by: 'user_id', when: 'updated_at' },
  { t: 'meals', by: 'user_id', when: 'updated_at' },
  { t: 'meal_items', by: 'user_id', when: 'updated_at' },
  { t: 'meal_events', by: 'user_id' },
  { t: 'meal_plans', by: 'user_id' },
  { t: 'meal_plan_items', by: 'user_id' },
  { t: 'pantry_items', by: 'user_id' },
  // A list shared with a household is personal in the test database (the household is not copied).
  { t: 'shopping_lists', by: 'user_id', fix: (r) => ({ ...r, household_id: null }) },
  { t: 'shopping_items', by: 'user_id' },
  { t: 'habits', by: 'user_id', when: 'updated_at' },
  { t: 'habit_schedules', by: 'user_id', when: 'updated_at' },
  { t: 'habit_logs', by: 'user_id', when: 'updated_at' },
  { t: 'body_measurements', by: 'user_id', when: 'updated_at' },
  { t: 'health_observations', by: 'user_id', when: 'updated_at' },
  { t: 'water_logs', by: 'user_id' },
  { t: 'bike_routes', by: 'user_id', when: 'updated_at' },
];

// Columns the test database has for each table (it may have more than the official one, never fewer
// once a release is out; a column it lacks is dropped instead of failing).
async function columns(t) {
  const { data } = await dst.from(t).select('*').limit(1);
  return data && data[0] ? new Set(Object.keys(data[0])) : null;
}

// A meal the test app already has for that day and slot keeps its id: the copied items go into it.
const mealIds = new Map();
async function mapMeals(rows) {
  const days = [...new Set(rows.map((r) => r.local_date))];
  if (!days.length) return;
  const have = await all(() => dst.from('meals').select('id, local_date, slot').eq('user_id', dstUser).is('deleted_at', null).in('local_date', days).order('id'));
  const key = new Map(have.map((m) => [m.local_date + '|' + m.slot, m.id]));
  for (const r of rows) {
    const there = key.get(r.local_date + '|' + r.slot);
    if (!r.deleted_at && there && there !== r.id) mealIds.set(r.id, there);
  }
}

// Health Connect rows the test app imported itself have the same (source, external_id) under other ids:
// the copy updates those rows instead of colliding with them.
async function externalIds(t) {
  const have = await all(() => dst.from(t).select('id, source, external_id').eq('user_id', dstUser).not('external_id', 'is', null).order('id'));
  return new Map(have.map((r) => [r.source + '|' + r.external_id, r.id]));
}

// Why rows were skipped: the error code and constraint only (the repository is public, no values).
const reasons = new Map();
const why = (e) => {
  const c = (e.message ?? '').match(/constraint "([^"]+)"/)?.[1];
  const k = (e.code ?? '?') + (c ? ' ' + c : '');
  reasons.set(k, (reasons.get(k) ?? 0) + 1);
};

/** Upserts rows; a batch that fails is split in halves until the bad rows are alone (and skipped). */
async function put(t, rows, on) {
  if (!rows.length) return { ok: 0, bad: 0 };
  const { error } = await dst.from(t).upsert(rows, { onConflict: on });
  if (!error) return { ok: rows.length, bad: 0 };
  if (rows.length === 1) { why(error); return { ok: 0, bad: 1 }; }
  const mid = Math.ceil(rows.length / 2);
  const a = await put(t, rows.slice(0, mid), on), b = await put(t, rows.slice(mid), on);
  return { ok: a.ok + b.ok, bad: a.bad + b.bad };
}

let total = 0, skipped = 0;
for (const spec of TABLES) {
  let rows = await all(() => {
    let q = src.from(spec.t).select('*').eq(spec.by, srcUser);
    if (!FULL && spec.when) q = q.gte(spec.when, since);
    return q.order(spec.on ?? 'id');
  });
  if (!rows.length) continue;
  if (spec.t === 'meals') await mapMeals(rows);
  const cols = await columns(spec.t);
  const ext = spec.t === 'health_observations' || spec.t === 'body_measurements' ? await externalIds(spec.t) : null;
  rows = rows.map((r) => {
    let x = { ...r, [spec.by]: dstUser };
    if (spec.fix) x = spec.fix(x);
    if (spec.t === 'meals' && mealIds.has(x.id)) return null; // already there under its own id
    if (spec.t === 'meal_items' && mealIds.has(x.meal_id)) x.meal_id = mealIds.get(x.meal_id);
    if (ext && x.external_id != null) x.id = ext.get(x.source + '|' + x.external_id) ?? x.id;
    if (cols) for (const k of Object.keys(x)) if (!cols.has(k)) delete x[k];
    return x;
  }).filter(Boolean);
  let ok = 0;
  for (let i = 0; i < rows.length; i += 500) {
    // One bad row (the test app already has the same thing under another id) must not stop the rest.
    const r = await put(spec.t, rows.slice(i, i + 500), spec.on ?? 'id');
    ok += r.ok;
    skipped += r.bad;
  }
  total += ok;
  console.log(spec.t.padEnd(26) + ok + ' de ' + rows.length);
}

// The profile (name, height, goals) lives on the row whose id is the person.
const { data: prof } = await src.from('profiles').select('*').eq('id', srcUser).maybeSingle();
if (prof) {
  const { id: _id, created_at: _c, ...rest } = prof;
  const cols = await columns('profiles');
  if (cols) for (const k of Object.keys(rest)) if (!cols.has(k)) delete rest[k];
  const { error } = await dst.from('profiles').update(rest).eq('id', dstUser);
  console.log('profiles'.padEnd(26) + (error ? 'no se pudo' : '1'));
}

for (const [k, n] of reasons) console.log('  salteadas por ' + k + ': ' + n);
console.log((FULL ? 'Copia completa' : 'Cambios desde hace ' + (process.env.SINCE_HOURS || 3) + ' h') + ': ' + total + ' filas copiadas' + (skipped ? ', ' + skipped + ' salteadas (ya existían de otra forma en Prueba)' : '') + '.');
