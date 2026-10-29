import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The phone inlines the web's mannequin.js; scripts/sync-mannequin.mjs keeps them equal.
describe('mannequin copies', () => {
  it('apps/mobile/src/mannequinSource.ts matches apps/web/public/mannequin.js', () => {
    const web = readFileSync(new URL('../../../apps/web/public/mannequin.js', import.meta.url), 'utf8');
    const mobile = readFileSync(new URL('../../../apps/mobile/src/mannequinSource.ts', import.meta.url), 'utf8');
    const m = mobile.match(/export const MANNEQUIN_JS = (".*");/s);
    expect(m, 'run node scripts/sync-mannequin.mjs').not.toBeNull();
    // Line endings may differ on a Windows checkout (core.autocrlf).
    const eol = (t: string) => t.replace(/\r\n/g, '\n');
    expect(eol(JSON.parse(m![1]!))).toBe(eol(web));
  });
});
