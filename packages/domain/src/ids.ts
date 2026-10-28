/**
 * Stable client-generated UUID v4 (ADR 0002). Uses `crypto.randomUUID` when present, otherwise builds
 * one from `crypto.getRandomValues`. Never falls back to Math.random: ids must not collide.
 * (React Native/Hermes has neither natively; apps/mobile installs them from expo-crypto.)
 */
export const newId = (): string => {
  const c = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  if (typeof c?.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40; // version 4
    b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  throw new Error('No secure random source available to generate ids (crypto.getRandomValues).');
};
