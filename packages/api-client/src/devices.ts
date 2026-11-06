/** Device ids live on the device, but a device row belongs to one account. */
import { KovaError, newId } from '@kova/domain';

/**
 * Registers this device for the signed-in account and returns the id to use. When another account
 * signed in here first, its row keeps the id (FORBIDDEN by RLS) and everything recorded with that id
 * would fail its foreign key, so this account gets a fresh id.
 */
export async function claimDevice<T extends { id: string }>(
  register: (input: T) => Promise<unknown>,
  input: T,
  freshId: () => string = newId,
): Promise<string> {
  try {
    await register(input);
    return input.id;
  } catch (e) {
    if (!(e instanceof KovaError) || e.code !== 'FORBIDDEN') throw e;
    const id = freshId();
    await register({ ...input, id });
    return id;
  }
}
