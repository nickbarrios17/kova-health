import { KovaError } from '@kova/domain';
import { describe, expect, it, vi } from 'vitest';
import { claimDevice } from '../src/devices.js';

describe('claimDevice', () => {
  it('keeps the id when this account can register it', async () => {
    const register = vi.fn().mockResolvedValue({});
    await expect(claimDevice(register, { id: 'a' }, () => 'b')).resolves.toBe('a');
    expect(register).toHaveBeenCalledTimes(1);
  });
  it('takes a fresh id when the row belongs to another account', async () => {
    const register = vi.fn().mockRejectedValueOnce(new KovaError('FORBIDDEN')).mockResolvedValue({});
    await expect(claimDevice(register, { id: 'a' }, () => 'b')).resolves.toBe('b');
    expect(register).toHaveBeenLastCalledWith({ id: 'b' });
  });
  it('keeps the id and reports any other failure (offline must not create new devices)', async () => {
    const register = vi.fn().mockRejectedValue(new KovaError('NETWORK'));
    await expect(claimDevice(register, { id: 'a' }, () => 'b')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(register).toHaveBeenCalledTimes(1);
  });
});
