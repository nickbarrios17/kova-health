/**
 * Hermes (React Native's JS engine) has no Web Crypto. Client-generated UUIDs (ADR 0002) need
 * `crypto.randomUUID` / `crypto.getRandomValues`, so they are provided by expo-crypto (native,
 * cryptographically secure). Must be imported before anything that creates ids.
 */
import * as ExpoCrypto from 'expo-crypto';

const g = globalThis as unknown as { crypto?: Partial<Crypto> };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = ((a: ArrayBufferView) => ExpoCrypto.getRandomValues(a as Uint8Array)) as Crypto['getRandomValues'];
}
if (typeof g.crypto.randomUUID !== 'function') {
  g.crypto.randomUUID = (() => ExpoCrypto.randomUUID()) as Crypto['randomUUID'];
}
