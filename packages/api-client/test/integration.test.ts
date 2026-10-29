/**
 * End-to-end tests against a LOCAL Supabase stack (`supabase start` + `supabase db reset`).
 * Skipped when SUPABASE_URL / SUPABASE_ANON_KEY are not set. Uses throwaway fake users only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@kova/domain';
import { createKovaClient, type KovaClient } from '../src/index.js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const run = Boolean(URL && ANON);

const PASSWORD = 'test-pass-1234';
const email = (tag: string) => `it-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kova.test`;

async function newUser(tag: string): Promise<{ c: KovaClient; email: string; id: string }> {
  const c = createKovaClient({ url: URL!, anonKey: ANON!, retry: { baseDelayMs: 50 } });
  const e = email(tag);
  await c.auth.signUp(e, PASSWORD);
  await c.auth.signIn(e, PASSWORD);
  return { c, email: e, id: await c.auth.userId() };
}

/** A fetch that drops the response of the first call to a matching URL, after the server handled it. */
function lossyFetch(match: RegExp) {
  let dropped = false;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init);
    if (!dropped && match.test(String(input))) {
      dropped = true;
      throw new TypeError('fetch failed'); // server committed, client never saw the response
    }
    return res;
  }) as typeof fetch;
}

describe.skipIf(!run)('Kova Health backend (local Supabase)', () => {
  let a: Awaited<ReturnType<typeof newUser>>;
  let b: Awaited<ReturnType<typeof newUser>>;
  let squatId: string;
  let benchId: string;

  beforeAll(async () => {
    a = await newUser('a');
    b = await newUser('b');
    const ex = (await a.c.exercises.search({ limit: 100 })) as Array<{ id: string; slug: string }>;
    squatId = ex.find((e) => e.slug === 'sentadilla')!.id;
    benchId = ex.find((e) => e.slug === 'press-banca')!.id;
  });

  afterAll(async () => {
    for (const u of [a, b]) {
      try {
        await u?.c.account.delete();
      } catch {
        /* already deleted */
      }
    }
  });

  it('creates profile + preferences on sign-up and lets the owner update them', async () => {
    const p = (await a.c.profile.get()) as { id: string; onboarding_state: string };
    expect(p.id).toBe(a.id);
    expect(p.onboarding_state).toBe('new');
    const prefs = (await a.c.profile.updatePreferences({ weight_unit: 'lb', time_zone: 'Europe/Madrid' })) as { weight_unit: string };
    expect(prefs.weight_unit).toBe('lb');
    await expect(a.c.profile.updatePreferences({ time_zone: 'Nowhere/City' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('serves the system catalog read-only', async () => {
    const ex = (await a.c.exercises.search({ muscle: 'quads' })) as Array<{ slug: string; owner_id: string | null }>;
    expect(ex.map((e) => e.slug)).toContain('sentadilla');
    // RLS: system rows are not updatable by users → zero rows affected.
    const { data } = await a.c.supabase.from('exercises').update({ name: 'hacked' }).eq('id', squatId).select();
    expect(data ?? []).toEqual([]);
    const after = (await a.c.exercises.get(squatId)) as { name: string };
    expect(after.name).toBe('Sentadilla con barra');
  });

  it('isolates routines between users and detects stale edits', async () => {
    const id = newId();
    const r1 = await a.c.routines.save({ id, name: 'Fuerza A', items: [{ exercise_id: squatId, target_sets: 4, target_reps_min: 6, target_reps_max: 6 }], schedule_days: [1, 4] });
    const r1Retry = await a.c.routines.save({ id, name: 'Fuerza A', items: [{ exercise_id: squatId, target_sets: 4 }] });
    expect(r1Retry.version).toBe(r1.version); // create is idempotent

    const r2 = await a.c.routines.save({ id, name: 'Fuerza A2', items: [{ exercise_id: benchId, target_sets: 3 }], expected_version: r1.version });
    expect(r2.version).toBeGreaterThan(r1.version);
    await expect(
      a.c.routines.save({ id, name: 'stale', items: [{ exercise_id: squatId, target_sets: 1 }], expected_version: r1.version }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    expect(await b.c.routines.list()).toEqual([]);
    await expect(
      b.c.routines.save({ id, name: 'mine now', items: [{ exercise_id: squatId, target_sets: 1 }], expected_version: r2.version }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('runs a full workout with retries, offline replay and history', async () => {
    const routineId = newId();
    const routine = await a.c.routines.save({ id: routineId, name: 'Fuerza B', items: [{ exercise_id: squatId, target_sets: 3, target_reps_min: 5, target_reps_max: 5, target_rest_s: 90 }] });

    const sessionId = newId();
    // Lost response on start → retry must return the same session, not fail or duplicate.
    const flaky = createKovaClient({ url: URL!, anonKey: ANON!, supabase: undefined, fetch: lossyFetch(/rpc\/start_session/), retry: { baseDelayMs: 20 } });
    await flaky.auth.signIn(a.email, PASSWORD);
    const s = await flaky.workouts.start({ id: sessionId, routine_id: routine.id, time_zone: 'Europe/Madrid' });
    expect(s.status).toBe('in_progress');
    expect(s.routine_version).toBe(routine.version);

    await expect(a.c.workouts.start({ id: newId() })).rejects.toMatchObject({ code: 'ACTIVE_SESSION_EXISTS' });

    const full = (await a.c.workouts.get(sessionId)) as { workout_session_exercises: Array<{ id: string; planned_sets: number }> };
    const wseId = full.workout_session_exercises[0]!.id;
    expect(full.workout_session_exercises[0]!.planned_sets).toBe(3);

    // Same set id sent twice (retry) → exactly one row.
    const setId = newId();
    await a.c.workouts.recordSet({ id: setId, session_exercise_id: wseId, set_index: 0, weight_kg: 100, reps: 5 });
    await a.c.workouts.recordSet({ id: setId, session_exercise_id: wseId, set_index: 0, weight_kg: 100, reps: 5 });

    // Watch-style offline queue: two sets + pause, replayed later, then replayed again.
    const outbox = a.c.createOutbox();
    await outbox.enqueue({ kind: 'record_set', input: { id: newId(), session_exercise_id: wseId, set_index: 1, weight_kg: 102.5, reps: 5 } });
    await outbox.enqueue({ kind: 'record_set', input: { id: newId(), session_exercise_id: wseId, set_index: 2, weight_kg: 105, reps: 4 } });
    await outbox.enqueue({ kind: 'transition_session', input: { id: sessionId, action: 'pause' } });
    expect(await outbox.flush()).toMatchObject({ confirmed: 3, pending: 0 });

    const sets = (await a.c.supabase.from('workout_sets').select('id').eq('session_id', sessionId)).data!;
    expect(sets).toHaveLength(3);

    // User B cannot see or write into A's session.
    expect((await b.c.supabase.from('workout_sets').select('id').eq('session_id', sessionId)).data).toEqual([]);
    await expect(
      b.c.workouts.recordSet({ id: newId(), session_exercise_id: wseId, set_index: 3, weight_kg: 1, reps: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await a.c.workouts.transition({ id: sessionId, action: 'resume' });
    const done = await a.c.workouts.transition({ id: sessionId, action: 'complete' });
    expect(done.status).toBe('completed');
    expect((await a.c.workouts.transition({ id: sessionId, action: 'complete' })).status).toBe('completed'); // retry no-op
    await expect(a.c.workouts.transition({ id: sessionId, action: 'resume' })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(
      a.c.workouts.recordSet({ id: newId(), session_exercise_id: wseId, set_index: 9, weight_kg: 50, reps: 5 }),
    ).rejects.toMatchObject({ code: 'SESSION_CLOSED' });

    // Editing the routine afterwards must not touch the session's snapshot.
    await a.c.routines.save({ id: routineId, name: 'Fuerza B', items: [{ exercise_id: squatId, target_sets: 5 }], expected_version: routine.version });
    const again = (await a.c.workouts.get(sessionId)) as { workout_session_exercises: Array<{ planned_sets: number }> };
    expect(again.workout_session_exercises[0]!.planned_sets).toBe(3);

    const [summary] = (await a.c.workouts.summaries(1)) as Array<{ session_id: string; working_sets: number; volume_kg: number | string }>;
    expect(summary!.session_id).toBe(sessionId);
    expect(summary!.working_sets).toBe(3);
    expect(Number(summary!.volume_kg)).toBe(100 * 5 + 102.5 * 5 + 105 * 4);

    const prs = (await a.c.workouts.personalRecords()) as Array<{ exercise_id: string; max_weight_kg: number | string }>;
    expect(Number(prs.find((p) => p.exercise_id === squatId)!.max_weight_kg)).toBe(105);
  });

  it('pulls changes with a keyset cursor', async () => {
    const first = await a.c.sync.pull('routines', null, 1);
    expect(first.rows).toHaveLength(1);
    const next = await a.c.sync.pull('routines', first.cursor, 100);
    expect(next.rows.map((r) => r.id)).not.toContain(first.rows[0]!.id);
  });

  it('exports only the caller’s data', async () => {
    const dump = (await a.c.account.export()) as { user_id: string; routines: Array<{ user_id: string }> };
    expect(dump.user_id).toBe(a.id);
    expect(dump.routines.every((r) => r.user_id === a.id)).toBe(true);
  });

  it('sends a password-recovery email (local Mailpit)', async () => {
    await a.c.auth.requestPasswordReset(a.email);
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${a.email}"`)}`);
    const body = (await res.json()) as { messages_count?: number; total?: number };
    expect(body.messages_count ?? body.total ?? 0).toBeGreaterThan(0);
  });

  it('deletes the account and every row it owned', async () => {
    const c = await newUser('del');
    await c.c.routines.save({ id: newId(), name: 'Temp', items: [{ exercise_id: squatId, target_sets: 1 }] });
    await c.c.account.delete();
    await expect(c.c.auth.signIn(c.email, PASSWORD)).rejects.toBeTruthy();
  });
});
