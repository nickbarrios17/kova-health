# La app del celular en el navegador (iPhone y cualquier celular)

La misma dirección de la web sirve dos versiones:

- **Celular (pantalla de menos de 768 px de ancho):** la app del celular, la misma que la APK, compilada para el navegador y servida en `/m`.
- **Escritorio:** la web de escritorio de siempre. Si alguien abre `/m` en una pantalla de 1024 px o más, va a la de escritorio.

En iPhone se abre en Safari y se instala con **Compartir → Agregar a la pantalla de inicio**: queda con el ícono de Kova y a pantalla completa (`manifest.webmanifest` y las etiquetas `apple-*` en `index.html`).

## Elegir la otra versión

- En la app del celular en el navegador: **Ajustes → Ver la versión de escritorio**. Queda recordado en ese navegador.
- En la web de escritorio: **Versión para celular** en el menú de la izquierda.
- Por dirección: `?escritorio` fija la de escritorio; `/m?celular` abre la del celular aunque la pantalla sea ancha.

Los links de invitación (`/invitar/CÓDIGO`) en un celular abren la app con el código cargado. Los links para cambiar la contraseña (`/reset-password`) se quedan siempre en la web.

La sesión es la misma en las dos versiones: comparten el almacenamiento del navegador.

## Qué no anda en el navegador

- **Pasos, sueño y demás de Health Connect o Apple Salud:** un navegador no puede leerlos. En Ajustes no aparece Health Connect.
- **Versión de la app y actualizaciones:** no aplica; la web siempre es la última versión.
- **Botón atrás del navegador:** sale de la app en lugar de volver a la pantalla anterior.

El modelo 3D se dibuja en un iframe aislado (`MannequinView.web.tsx`), en lugar del WebView del celular.

## Cómo se arma

`scripts/build-mobile-web.mjs` corre antes de `next build` (script `build` de `apps/web`), en tu PC y en Vercel:

1. `expo export --platform web` de `apps/mobile` con `EXPO_WEB_BASE_URL=/m`, contra el mismo Supabase que la web (`NEXT_PUBLIC_*` → `EXPO_PUBLIC_*`).
2. Lo deja en `apps/web/public/m` (no se sube a git) y le agrega el manifest y el ícono.
3. `next.config.mjs` sirve `/m` con `public/m/index.html`.

El código específico de la web vive en archivos `.web.ts(x)` (Metro los elige solo para el navegador) o detrás de `Platform.OS === 'web'`. La redirección por ancho está en `apps/web/app/layout.tsx` (celular → `/m`) y `apps/mobile/src/webLayout.ts` (pantalla ancha → escritorio).
