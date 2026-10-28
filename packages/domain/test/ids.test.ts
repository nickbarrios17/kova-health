import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../src/index.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses crypto.randomUUID when available', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('builds a v4 UUID from getRandomValues when randomUUID is missing (React Native/Hermes)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('fails loudly instead of using an insecure source', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => newId()).toThrow(/secure random source/);
  });
});
