/**
 * Offline outbox (docs/sync.md). Operations are idempotent on their client-generated ids,
 * so replaying the whole queue after a crash or a lost response is always safe.
 */
import {
  BodyMeasurementSchema,
  HealthObservationSchema,
  LogFoodSchema,
  LogHabitSchema,
  newId,
  RecordSetSchema,
  StartSessionSchema,
  TransitionSessionSchema,
  KovaError,
  type BodyMeasurementInput,
  type ErrorCode,
  type HealthObservationInput,
  type LogFoodInput,
  type LogHabitInput,
  type RecordSetInput,
  type StartSessionInput,
  type TransitionSessionInput,
} from '@kova/domain';

export type OutboxOp =
  | { kind: 'start_session'; input: StartSessionInput }
  | { kind: 'record_set'; input: RecordSetInput }
  | { kind: 'transition_session'; input: TransitionSessionInput }
  | { kind: 'log_food'; input: LogFoodInput }
  | { kind: 'log_habit'; input: LogHabitInput }
  | { kind: 'record_measurement'; input: BodyMeasurementInput }
  | { kind: 'record_observation'; input: HealthObservationInput };

export type OutboxStatus = 'pending' | 'confirmed' | 'failed';

export interface OutboxEntry {
  id: string;
  op: OutboxOp;
  status: OutboxStatus;
  attempts: number;
  enqueued_at: string;
  error?: ErrorCode;
}

/** Persist entries somewhere that survives restarts (AsyncStorage, IndexedDB, Room…). */
export interface OutboxStorage {
  load(): Promise<OutboxEntry[]>;
  save(entries: OutboxEntry[]): Promise<void>;
}

export class MemoryOutboxStorage implements OutboxStorage {
  private entries: OutboxEntry[] = [];
  async load() {
    return structuredClone(this.entries);
  }
  async save(entries: OutboxEntry[]) {
    this.entries = structuredClone(entries);
  }
}

export type OutboxSender = (op: OutboxOp) => Promise<unknown>;

export interface FlushResult {
  confirmed: number;
  failed: number;
  pending: number;
}

const SCHEMA = {
  start_session: StartSessionSchema,
  record_set: RecordSetSchema,
  transition_session: TransitionSessionSchema,
  log_food: LogFoodSchema,
  log_habit: LogHabitSchema,
  record_measurement: BodyMeasurementSchema,
  record_observation: HealthObservationSchema,
} as const;

/** What a sync indicator needs: counts by status and whether a flush is running. */
export interface OutboxState {
  pending: number;
  failed: number;
  sending: boolean;
}

export class Outbox {
  private flushing: Promise<FlushResult> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly send: OutboxSender,
    private readonly storage: OutboxStorage = new MemoryOutboxStorage(),
  ) {}

  /** Validate and persist an operation before attempting to send it. */
  async enqueue(op: OutboxOp): Promise<OutboxEntry> {
    const parsed = SCHEMA[op.kind].safeParse(op.input);
    if (!parsed.success) throw new KovaError('INVALID_INPUT', 'Algún dato no es válido.');
    const entries = await this.storage.load();
    const entry: OutboxEntry = { id: newId(), op, status: 'pending', attempts: 0, enqueued_at: new Date().toISOString() };
    entries.push(entry);
    await this.storage.save(entries);
    this.emit();
    return entry;
  }

  /** Called whenever the queue may have changed (enqueue, flush start/end, prune, discard). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    for (const l of this.listeners) {
      try { l(); } catch { /* a listener never breaks the queue */ }
    }
  }

  async state(): Promise<OutboxState> {
    const entries = await this.storage.load();
    return {
      pending: entries.filter((e) => e.status === 'pending').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      sending: this.flushing != null,
    };
  }

  /**
   * Removes one failed operation from the queue («Descartar»). Only failed entries can go: the
   * server never accepted them, so nothing on the server is deleted.
   */
  async discard(id: string): Promise<boolean> {
    const entries = await this.storage.load();
    const next = entries.filter((e) => !(e.id === id && e.status === 'failed'));
    if (next.length === entries.length) return false;
    await this.storage.save(next);
    this.emit();
    return true;
  }

  /** Puts failed operations back in the queue, keeping their place (after resolving what blocked them). */
  async retry(ids: string[]): Promise<number> {
    const entries = await this.storage.load();
    let n = 0;
    for (const e of entries) {
      if (e.status === 'failed' && ids.includes(e.id)) { e.status = 'pending'; delete e.error; n++; }
    }
    if (n) { await this.storage.save(entries); this.emit(); }
    return n;
  }

  async entries(): Promise<OutboxEntry[]> {
    return this.storage.load();
  }

  async pendingCount(): Promise<number> {
    return (await this.storage.load()).filter((e) => e.status === 'pending').length;
  }

  /**
   * Send pending entries in FIFO order. Stops at the first network error (keeps the rest pending,
   * preserving order). Non-retryable errors mark that entry `failed` so the UI can surface it.
   */
  flush(): Promise<FlushResult> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
        this.emit();
      });
      this.emit();
    }
    return this.flushing;
  }

  /** Drop confirmed entries (call after the UI has reconciled with the server). */
  async prune(): Promise<void> {
    await this.storage.save((await this.storage.load()).filter((e) => e.status !== 'confirmed'));
    this.emit();
  }

  private async doFlush(): Promise<FlushResult> {
    const entries = await this.storage.load();
    for (const entry of entries) {
      if (entry.status !== 'pending') continue;
      entry.attempts++;
      try {
        await this.send(entry.op);
        entry.status = 'confirmed';
        delete entry.error;
      } catch (err) {
        const e = err instanceof KovaError ? err : new KovaError('INTERNAL');
        if (e.retryable) {
          entry.error = e.code;
          await this.storage.save(entries);
          break;
        }
        entry.status = 'failed';
        entry.error = e.code;
      }
      await this.storage.save(entries);
    }
    return {
      confirmed: entries.filter((e) => e.status === 'confirmed').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      pending: entries.filter((e) => e.status === 'pending').length,
    };
  }
}
