// Builds the phone app for the browser (docs/web-celular.md) into apps/web/public/m, so the web app
// serves it at /m/. Runs before `next build` (apps/web "build" script), locally and on Vercel.
// It talks to the same Supabase project as the web: NEXT_PUBLIC_* → EXPO_PUBLIC_*.
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps/mobile');
const out = join(root, 'apps/web/public/m');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.warn('[build-mobile-web] Sin NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY: no se arma /m.');
  process.exit(0);
}

rmSync(out, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir "${out}"`, {
  cwd: mobile,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey, EXPO_WEB_BASE_URL: '/m' },
});

// Installable from the browser («Agregar a la pantalla de inicio»), full screen, with Kova's icon.
copyFileSync(join(mobile, 'assets/icon.png'), join(out, 'icon.png'));
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Kova Health', short_name: 'Kova', lang: 'es', start_url: '/m', scope: '/m', display: 'standalone',
  orientation: 'portrait', background_color: '#161826', theme_color: '#161826',
  icons: [{ src: '/m/icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
}, null, 2));
const indexPath = join(out, 'index.html');
const head = [
  '<link rel="manifest" href="/m/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/m/icon.png" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Kova" />',
  '<meta name="theme-color" content="#161826" />',
].join('\n    ');
writeFileSync(indexPath, readFileSync(indexPath, 'utf8')
  .replace('<html lang="en">', '<html lang="es">')
  .replace('shrink-to-fit=no"', 'viewport-fit=cover"')
  .replace('</head>', `    ${head}\n    <style>body{background:#161826}</style>\n  </head>`));
console.log('[build-mobile-web] Listo: apps/web/public/m');
