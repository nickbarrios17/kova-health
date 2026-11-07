/** Web build of the phone app (docs/web-celular.md): a browser cannot read Health Connect or Apple Health. */
export type HcStatus = 'unsupported' | 'not_installed' | 'needs_update' | 'available';
export const PERMISSION_COUNT = 0;
export async function status(): Promise<HcStatus> { return 'unsupported'; }
export async function connect(): Promise<number> { return 0; }
export async function grantedCount(): Promise<number> { return 0; }
export const openSettings = () => undefined;
export async function lastSync(): Promise<string | null> { return null; }
export async function sync(_timeZone: string, _deviceId: string | null, _days = 7): Promise<number> { return 0; }
