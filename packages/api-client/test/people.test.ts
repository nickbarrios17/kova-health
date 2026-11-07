import { describe, expect, it } from 'vitest';
import { inviteCode } from '../src/index.js';

describe('inviteCode', () => {
  it('normalizes typed or pasted codes', () => {
    expect(inviteCode('k7mq2x')).toBe('K7MQ2X');
    expect(inviteCode(' K7M Q2X ')).toBe('K7MQ2X');
    expect(inviteCode('Únete en https://kova-health.vercel.app/invitar/K7MQ2X')).toBe('K7MQ2X');
    expect(inviteCode('kovahealth://invitar/K7MQ2X')).toBe('K7MQ2X');
  });
  it('rejects anything that is not a valid code', () => {
    expect(inviteCode('K7MQ2')).toBeNull();
    expect(inviteCode('K0MQ2X')).toBeNull(); // 0 and O are not used
    expect(inviteCode('')).toBeNull();
  });
});
