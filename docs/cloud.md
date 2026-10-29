# Kova Health en la nube

## Supabase (base de datos, cuentas, API)

| Dato | Valor |
| --- | --- |
| Proyecto | `vida` (nombre visible en el panel de Supabase; el identificador `oxfucatgikqbwowtgkow` no se puede cambiar) |
| Referencia | `oxfucatgikqbwowtgkow` |
| Región | `sa-east-1` (São Paulo) |
| URL de la API | `https://oxfucatgikqbwowtgkow.supabase.co` |
| Panel | https://supabase.com/dashboard/project/oxfucatgikqbwowtgkow |
| Plan | Gratuito. Los proyectos inactivos se **pausan** tras unos días sin uso; se reactivan desde el panel. |

Creado el 2026-10-27 con la CLI de Supabase y la sesión de la cuenta del propietario. Tus otros dos proyectos («nickbarrios17's Project» y «App_Vida») no se tocaron.

### Qué hay desplegado
- Las 12 migraciones de `supabase/migrations/`, aplicadas con `supabase db push`. El seed de desarrollo **no** se sube: la base en la nube empieza vacía, con el catálogo de 5 ejercicios.
- La Edge Function `delete-account`.
- Verificado con `supabase test db --linked`: 7 archivos y 121 comprobaciones de pgTAP pasan contra la base en la nube.

### Claves y secretos
- **Clave anon (pública):** va dentro de la web y de los APK. Es segura de distribuir, porque la RLS protege cada fila.
- **Clave service_role (secreta):** solo existe en Supabase, que la inyecta en la Edge Function. Nunca está en el repositorio ni en las apps.
- **Contraseña de la base de datos:** generada al azar y guardada solo en `supabase/.env.remote`, que está fuera de git. Si pierdes ese archivo, cámbiala desde el panel (Database → Settings → Reset password).

### Desplegar cambios futuros

```bash
supabase db push
```

```bash
supabase functions deploy delete-account
```

```bash
supabase test db --linked
```

`supabase db push` pide la contraseña de la base: está en `supabase/.env.remote`.

### Ajustes de autenticación (panel → Authentication)
- **Confirmar correo:** desactivado desde el 29/10/2026 para las pruebas con amigos. El SMTP incluido en Supabase rechazaba los registros («Demasiados intentos»): permite muy pocos correos por hora y solo entrega a direcciones del equipo. Ahora las cuentas nuevas entran directamente, sin verificar el correo. **Antes de publicar:** configurar un SMTP propio (punto siguiente) y volver a activarlo (`[auth.email] enable_confirmations = true`), con el método de `config push` desde una carpeta aparte.
- **Envío de correos:** el SMTP incluido en Supabase tiene límites estrictos (pocos correos por hora) y está pensado para pruebas. Para usuarios reales hay que configurar un SMTP propio (Resend, SendGrid, Brevo…) en Authentication → Emails → SMTP Settings.
- **Site URL y Redirect URLs** (actualizado el 29/10/2026 con el nombre Kova Health):
  - Site URL: `https://kova-health.vercel.app`.
  - Redirect URLs: `https://kova-health.vercel.app/**` y `kovahealth://**` (el esquema de la app). Las de antes del cambio de nombre (`https://vida-nine-iota.vercel.app/**`, `vida://**`) siguen aceptadas por correos y apps viejas.

  Así los enlaces de confirmación y de «recuperar contraseña» abren la web publicada y no `localhost`.
- **Cuidado con `supabase config push`:** aplica el cambio sin pedir confirmación y sube *todo* `supabase/config.toml`, que tiene valores de desarrollo local (confirmación de correo desactivada, URLs `127.0.0.1`). No lo ejecutes con el config del repo. Para cambiar un ajuste de la nube, usa el panel, o copia el config a una carpeta aparte, iguala todos los valores a los de la nube y cambia solo el que quieras (`supabase config push --workdir <carpeta>`). Comprueba después que `GET <SUPABASE_URL>/auth/v1/settings` devuelve `"mailer_autoconfirm": false`.
- Recomendado: activar **Leaked password protection** y revisar el **Security Advisor**.

## Vercel (web)

La web (`apps/web`) es una app de Next.js con todas sus páginas estáticas: se puede publicar en Vercel con el plan gratuito.

Una sola vez, el propietario inicia sesión:

```bash
npx vercel login
```

Despliegue **automático**: el repositorio de GitHub está conectado al proyecto (28/10/2026), así que cada push a `master` publica la web en producción y cada push a otra rama crea una vista previa. Para publicar a mano, desde la raíz del repositorio (ya vinculada al proyecto `kova-health`; `.vercel/` está fuera de git):

```bash
npx vercel deploy --prod
```

Variables de entorno del proyecto en Vercel (Settings → Environment Variables), solo públicas:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://oxfucatgikqbwowtgkow.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave anon (la misma que en `apps/mobile/.env`)

Configuración del proyecto `kova-health` en Vercel (monorepo con npm workspaces):
- Root Directory = `apps/web`, framework Next.js.
- Install Command = `cd ../.. && npm ci --no-audit --no-fund`. Hace falta instalar desde la raíz: si Vercel instala solo `apps/web`, falta TypeScript (está en la raíz) y Next no resuelve los alias `@/`.
- `.vercelignore` deja fuera de la subida lo que no se usa para compilar la web (APKs de `dist/`, `design/`, `docs/`, `supabase/`, el reloj y las carpetas nativas del móvil).

Estado: **publicada** en https://kova-health.vercel.app (producción).
