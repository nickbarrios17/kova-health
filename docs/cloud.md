# VIDA en la nube

## Supabase (base de datos, cuentas, API)

| Dato | Valor |
| --- | --- |
| Proyecto | `vida` |
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
- **Confirmar correo:** activado (el valor por defecto en la nube). Cada cuenta nueva recibe un correo de confirmación antes de poder entrar.
- **Envío de correos:** el SMTP incluido en Supabase tiene límites estrictos (pocos correos por hora) y está pensado para pruebas. Para usuarios reales hay que configurar un SMTP propio (Resend, SendGrid, Brevo…) en Authentication → Emails → SMTP Settings.
- **Site URL y Redirect URLs:** cuando la web esté publicada, en Authentication → URL Configuration:
  - Site URL: la URL de Vercel (por ejemplo `https://vida-xxxx.vercel.app`).
  - Redirect URLs: `https://vida-xxxx.vercel.app/**` y `vida://**` (el esquema de la app móvil).

  Sin esto, el enlace de «recuperar contraseña» lleva a `localhost` y no funciona fuera del PC.
- Recomendado: activar **Leaked password protection** y revisar el **Security Advisor**.

## Vercel (web)

La web (`apps/web`) es una app de Next.js con todas sus páginas estáticas: se puede publicar en Vercel con el plan gratuito.

Una sola vez, el propietario inicia sesión:

```bash
npx vercel login
```

Despliegue, desde la raíz del repositorio:

```bash
npx vercel deploy --prod --cwd apps/web
```

Variables de entorno del proyecto en Vercel (Settings → Environment Variables), solo públicas:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://oxfucatgikqbwowtgkow.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave anon (la misma que en `apps/mobile/.env`)

Al ser un monorepo, Vercel debe instalar desde la raíz: en el proyecto de Vercel, Root Directory = `apps/web` e «Include files outside the root directory» activado. Esto ya viene en la configuración por defecto de Vercel para monorepos con npm workspaces.

Estado: **pendiente del inicio de sesión del propietario en Vercel** (ver la guía de uso, «Lo que te queda por hacer»).
