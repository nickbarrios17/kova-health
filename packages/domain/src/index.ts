export * from './errors.js';
export * from './units.js';
export * from './time.js';
export * from './workout.js';
export * from './schemas.js';
export * from './nutrition.js';
export * from './habits.js';

/** Stable client-generated id (ADR 0002). */
export const newId = (): string => globalThis.crypto.randomUUID();
