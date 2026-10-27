/**
 * Phase 4 end-to-end tests against a LOCAL Supabase stack. Skipped without SUPABASE_URL / SUPABASE_ANON_KEY.
 * Throwaway fake users only; they delete themselves at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dailyStreak, localDate, newId, type HabitDay } from '@vida/domain';
import { createVidaClient, type VidaClient } from '../src/index.js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const run = Boolean(URL && ANON);
const PASSWORD = 'test-pass-1234';

async function newUser(tag: string): Promise<VidaClient> {
  const c = createVidaClient({ url: URL!, anonKey: ANON!, retry: { baseDelayMs: 50 } });
  const email = `it-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@vida.test`;
  await c.auth.signUp(email, PASSWORD);
  await c.auth.signIn(email, PASSWORD);
  await c.profile.updatePreferences({ time_zone: 'Europe/Madrid' });
  return c;
}

describe.skipIf(!run)('VIDA phase 4 (local Supabase)', () => {
  let a: VidaClient;
  let b: VidaClient;
  const day = '2025-10-25';

  beforeAll(async () => {
    a = await newUser('t4a');
    b = await newUser('t4b');
  });

  afterAll(async () => {
    for (const c of [a, b]) {
      try {
        await c?.account.delete();
      } catch {
        /* already gone */
      }
    }
  });

  it('logs food offline-first with frozen snapshots and provenance', async () => {
    const yogurt = (await a.nutrition.createFood({
      id: newId(), name: 'Yogur griego natural', ref_amount: 170, ref_unit: 'g', kcal: 165, protein_g: 15, carbs_g: 6, fat_g: 9,
    })) as { id: string; data_source: string };
    expect(yogurt.data_source).toBe('user');

    // Watch quick-add queued offline, replayed twice.
    const outbox = a.createOutbox();
    const itemId = newId();
    await outbox.enqueue({ kind: 'log_food', input: { id: itemId, local_date: day, slot: 'afternoon_snack', quantity: 170, food_id: yogurt.id } });
    await outbox.flush();
    await a.nutrition.logFood({ id: itemId, local_date: day, slot: 'afternoon_snack', quantity: 170, food_id: yogurt.id });

    await a.nutrition.logFood({ id: newId(), local_date: day, slot: 'dinner', quantity: 1, name: 'Cena fuera', kcal: 700, protein_g: 35, carbs_g: 60, fat_g: 30 });

    const meals = (await a.nutrition.day(day)) as Array<{ slot: string; meal_items: Array<{ kcal: number; data_source: string }> }>;
    expect(meals.map((m) => m.slot).sort()).toEqual(['afternoon_snack', 'dinner']);
    expect(meals.flatMap((m) => m.meal_items)).toHaveLength(2); // retry did not duplicate
    expect(meals.find((m) => m.slot === 'dinner')!.meal_items[0]!.data_source).toBe('user');

    await expect(
      a.nutrition.logFood({ id: newId(), local_date: day, slot: 'lunch', quantity: 100, food_id: yogurt.id, recipe_id: yogurt.id }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(b.nutrition.logFood({ id: newId(), local_date: day, slot: 'lunch', quantity: 100, food_id: yogurt.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });

    await a.nutrition.setGoal({ effective_from: '2025-10-01', kcal: 2300, protein_g: 150 });
  });

  it('tracks habits with dated schedules and computes streaks client-side', async () => {
    const habitId = newId();
    await a.habits.save({ id: habitId, name: 'Agua', effective_from: '2025-10-20', kind: 'count', unit: 'vasos', target_value: 2 });
    for (const d of ['2025-10-23', '2025-10-24', '2025-10-25']) {
      await a.habits.log({ id: newId(), habit_id: habitId, local_date: d });
      await a.habits.log({ id: newId(), habit_id: habitId, local_date: d });
    }
    const days = (await a.habits.days('2025-10-20', day)).filter((d) => d.habit_id === habitId) as HabitDay[];
    expect(days).toHaveLength(6);
    expect(dailyStreak(days, day)).toBe(3);
    expect(await b.habits.days('2025-10-20', day)).toEqual([]);
  });

  it('imports health data idempotently and builds the daily summary', async () => {
    const rows = [
      { id: newId(), metric: 'sleep_session' as const, value: 432, start_at: '2025-10-24T21:48:00Z', end_at: '2025-10-25T05:20:00Z', source: 'health_connect' as const, source_app: 'Samsung Health', external_id: `s-${habitsSalt}` },
      { id: newId(), metric: 'steps' as const, value: 7842, start_at: '2025-10-25T06:00:00Z', end_at: '2025-10-25T20:00:00Z', source: 'health_connect' as const, source_app: 'Samsung Health', external_id: `st-${habitsSalt}` },
      { id: newId(), metric: 'mood' as const, value: 3, start_at: '2025-10-25T19:00:00Z' },
    ];
    expect(await a.health.record(rows)).toBe(3);
    expect(await a.health.record(rows)).toBe(0); // replay after a lost response

    const outbox = a.createOutbox();
    await outbox.enqueue({ kind: 'record_measurement', input: { id: newId(), metric: 'weight_kg', value: 78.4, measured_at: '2025-10-25T06:30:00Z' } });
    expect(await outbox.flush()).toMatchObject({ confirmed: 1 });
    await expect(a.body.record([{ id: newId(), metric: 'body_fat_pct', value: 90, measured_at: '2025-10-25T06:30:00Z' }]))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const [s] = (await a.summaries.daily(day, day)) as Array<Record<string, unknown>>;
    expect(Number(s!.weight_kg)).toBe(78.4);
    expect(s!.steps).toBe(7842);
    expect(Number(s!.sleep_min)).toBe(432);
    expect(Number(s!.kcal)).toBe(165 + 700);
    expect(Number(s!.kcal_goal)).toBe(2300);
    expect(s!.habits_completed).toBe(1);

    const [other] = (await b.summaries.daily(day, day)) as Array<Record<string, unknown>>;
    expect(other!.weight_kg).toBeNull();
    expect(other!.kcal).toBeNull();
  });

  it('sets goals and pulls phase 4 tables with the sync cursor', async () => {
    const g = (await a.goals.create({ id: newId(), kind: 'weight', title: 'Llegar a 76 kg', target_value: 76, start_value: 78.4, unit: 'kg', start_date: day })) as { status: string };
    expect(g.status).toBe('active');
    const pulled = await a.sync.pull('meal_items', null, 100);
    expect(pulled.rows.length).toBe(2);
    expect(localDate('2025-10-24T22:30:00Z', 'Europe/Madrid')).toBe(day);
  });
});

const habitsSalt = Math.random().toString(36).slice(2, 10);
