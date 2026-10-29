import { describe, expect, it, vi } from 'vitest';
import { newId, KovaError } from '@kova/domain';
import { MemoryOutboxStorage, Outbox, type OutboxOp } from '../src/outbox.js';
import { withRetry } from '../src/retry.js';
import { toKovaError } from '../src/errors.js';
import { createKovaClient } from '../src/index.js';

const sessionId = newId();
const exId = newId();
const setOp = (i: number): OutboxOp => ({
  kind: 'record_set',
  input: { id: newId(), session_exercise_id: exId, set_index: i, weight_kg: 45, reps: 8 },
});

describe('Outbox', () => {
  it('keeps operations pending while offline and replays them in order', async () => {
    const sent: OutboxOp[] = [];
    let online = false;
    const outbox = new Outbox(async (op) => {
      if (!online) throw new KovaError('NETWORK');
      sent.push(op);
    });
    await outbox.enqueue({ kind: 'start_session', input: { id: sessionId } });
    for (const i of [0, 1, 2]) await outbox.enqueue(setOp(i));

    expect(await outbox.flush()).toEqual({ confirmed: 0, failed: 0, pending: 4 });
    expect(await outbox.pendingCount()).toBe(4);

    online = true;
    expect(await outbox.flush()).toEqual({ confirmed: 4, failed: 0, pending: 0 });
    expect(sent.map((o) => o.kind)).toEqual(['start_session', 'record_set', 'record_set', 'record_set']);
  });

  it('survives a restart: a new Outbox on the same storage resumes the queue', async () => {
    const storage = new MemoryOutboxStorage();
    await new Outbox(async () => { throw new KovaError('NETWORK'); }, storage).enqueue(setOp(0));
    const send = vi.fn(async () => undefined);
    expect(await new Outbox(send, storage).flush()).toMatchObject({ confirmed: 1, pending: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('marks non-retryable failures and keeps going', async () => {
    const outbox = new Outbox(async (op) => {
      if (op.kind === 'record_set' && op.input.set_index === 1) throw new KovaError('SESSION_CLOSED');
    });
    for (const i of [0, 1, 2]) await outbox.enqueue(setOp(i));
    expect(await outbox.flush()).toEqual({ confirmed: 2, failed: 1, pending: 0 });
    expect((await outbox.entries()).find((e) => e.status === 'failed')?.error).toBe('SESSION_CLOSED');
  });

  it('rejects invalid operations before queueing them', async () => {
    const outbox = new Outbox(async () => undefined);
    await expect(
      outbox.enqueue({ kind: 'record_set', input: { id: newId(), session_exercise_id: exId, set_index: 0 } }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('does not run two flushes concurrently (no double send)', async () => {
    const send = vi.fn(async () => new Promise<void>((r) => setTimeout(r, 5)));
    const outbox = new Outbox(send);
    await outbox.enqueue(setOp(0));
    await Promise.all([outbox.flush(), outbox.flush()]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry', () => {
  const sleep = async () => undefined;

  it('retries transient errors, then succeeds', async () => {
    let n = 0;
    const r = await withRetry(async () => {
      if (++n < 3) throw new KovaError('NETWORK');
      return 'ok';
    }, { sleep });
    expect(r).toBe('ok');
    expect(n).toBe(3);
  });

  it('never retries business errors', async () => {
    const fn = vi.fn(async () => { throw new KovaError('VERSION_CONFLICT'); });
    await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget', async () => {
    const fn = vi.fn(async () => { throw new KovaError('NETWORK'); });
    await expect(withRetry(fn, { sleep, attempts: 3 })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('client validation', () => {
  it('reports invalid input as a rejected promise, before any request', async () => {
    const c = createKovaClient({ url: 'http://127.0.0.1:1', anonKey: 'unused' });
    const call = c.workouts.recordSet({ id: newId(), session_exercise_id: exId, set_index: 0 });
    expect(call).toBeInstanceOf(Promise);
    await expect(call).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(c.nutrition.logFood({ id: newId(), local_date: '2025-10-25', slot: 'lunch', quantity: 1 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('toKovaError', () => {
  it('maps PostgREST and network errors to safe codes', () => {
    expect(toKovaError({ code: 'VD001', message: 'ACTIVE_SESSION_EXISTS' }).code).toBe('ACTIVE_SESSION_EXISTS');
    expect(toKovaError({ code: '42501', message: 'new row violates row-level security policy for table "x"' }).message)
      .not.toMatch(/row-level|table/);
    expect(toKovaError(new TypeError('fetch failed')).code).toBe('NETWORK');
    expect(toKovaError(new TypeError('Network request failed')).code).toBe('NETWORK'); // React Native
    expect(toKovaError(new TypeError("Cannot read property 'x' of undefined")).code).toBe('INTERNAL'); // a bug, not offline
    expect(toKovaError({ message: 'boom' }, 503).retryable).toBe(true);
    expect(toKovaError({ message: 'nope' }, 401).code).toBe('UNAUTHENTICATED');
  });
});
