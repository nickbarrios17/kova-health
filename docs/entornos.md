# Entornos: prueba y producción

Los cambios se prueban primero en un entorno aparte y llegan a todos juntos, en un lanzamiento.

| | Prueba | Producción |
| --- | --- | --- |
| Rama | `develop` | `master` |
| App del celular | «Kova Health Prueba» (`com.kovahealth.app.prueba`, ícono ámbar), se instala al lado de la real | «Kova Health» (`com.kovahealth.app`) |
| Canal de actualizaciones (EAS) | `prueba` | `production` |
| APK nuevo (cambios nativos) | `releases/android/kova-health-prueba-N.apk` del proyecto de prueba | `releases/android/kova-health-N.apk` del proyecto real |
| Web | `https://kova-health-git-develop-nickbarrios17s-projects.vercel.app` | `https://kova-health.vercel.app` |
| Base de datos (Supabase) | `kova-health-prueba` (`nvegmmpovtytrmdhgvlh`), contraseña en `supabase/.env.staging` (fuera de git) | `vida` (`oxfucatgikqbwowtgkow`), contraseña en `supabase/.env.remote` |

La variante sale de `apps/mobile/app.config.js` con `APP_VARIANT=prueba`. El workflow `mobile-release.yml` corre en las dos ramas y elige canal, proyecto y nombre del APK según la rama. El reloj todavía usa solo producción.

## Cómo se trabaja

1. Cada cambio va en su rama y su PR **contra `develop`**. CI corre los tests.
2. Al mergear en `develop`: la app de prueba recibe el cambio por aire (o un APK de prueba si hubo cambios nativos), y la web de prueba se actualiza sola. Las migraciones nuevas se aplican a la base de prueba (`supabase db push` desde una carpeta enlazada a `nvegmmpovtytrmdhgvlh`, nunca desde la del repo).
3. Cuando todo está probado: un PR **`develop` → `master`**. Al mergearlo, sale una sola actualización con todo para los usuarios reales, y las migraciones se aplican a la base real.

## Puesta en marcha (una vez)

- `.\scripts\setup-staging.ps1` (lo corre el dueño del repo): guarda las claves del proyecto de prueba en GitHub (`STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`) y en Vercel (variables de Preview solo para la rama `develop`).
- La primera vez, la app de prueba se instala desde el APK de prueba (link en `releases/android/latest.json` del proyecto de prueba); después se actualiza sola.

Configuración de auth del proyecto de prueba: igual que producción (sin confirmación de correo), con la web de prueba como Site URL y `kovahealthprueba://` en los redirects.
