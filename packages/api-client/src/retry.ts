import { KovaError } from '@kova/domain';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retry with exponential backoff + jitter. Use ONLY for idempotent operations
 * (all Kova Health write RPCs are idempotent on the client-generated id).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const base = opts.baseDelayMs ?? 300;
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!(err instanceof KovaError) || !err.retryable || i === attempts - 1) throw err;
      await sleep(base * 2 ** i + Math.random() * base);
    }
  }
  throw lastError;
}
