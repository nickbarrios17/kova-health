# Panel de administración

En la web, en «Administración» (`/admin`). Solo lo ven los administradores; para el resto, la entrada no aparece y la página dice «Solo para administradores».

## Qué muestra

- **Esta semana:** cuentas, cuentas nuevas, cuentas activas, entrenamientos, comidas anotadas, reportes nuevos (lleva a `/reportes`) y vínculos de coach activos.
- **Cuentas:** nombre, correo, fecha de alta, última actividad, entrenamientos (en total y en la semana), comidas anotadas en la semana, si tiene coach o alumnos, reportes enviados y estado. Se puede buscar por nombre o correo.
  - La última actividad es lo más reciente entre: inicio de sesión, renovación de sesión, dispositivo visto, entrenamiento empezado y comida anotada.

**Privacidad:** el panel muestra cantidades y fechas, nunca el contenido de los datos de nadie (comidas, peso, sueño, salud). Para ver los datos de alguien hace falta que esa persona lo comparta como coach o amigo.

## Acciones

- **Hacer admin / Quitar admin.** Nadie se puede quitar el rol a sí mismo, así siempre queda al menos un administrador.
- **Suspender / Reactivar.** Una cuenta suspendida no puede iniciar sesión y se le cierran las sesiones. Un acceso ya emitido sigue andando hasta que vence (como mucho una hora). Sus datos no se borran. No se puede suspender a un administrador ni a uno mismo: primero hay que quitarle el rol.

Ambas piden confirmación.

## El primer administrador

Se agrega a mano en cada base (prueba y producción), nunca desde la app:

```sql
insert into private.admins (user_id) select id from auth.users where email = '<correo>';
```

Después, los demás se pueden nombrar desde el panel.

## Técnica

Migración `20261029000700_admin_panel.sql`. Funciones (todas fallan con FORBIDDEN si no sos admin): `admin_users()`, `admin_overview()`, `admin_set_admin(usuario, bool)`, `admin_set_suspended(usuario, bool)`. La suspensión usa `auth.users.banned_until` de Supabase Auth. Error `ADMIN_SELF` (VD008) al intentar algo sobre uno mismo u otro admin. Tests: `supabase/tests/database/17_admin_panel.test.sql`. En las apps: `kova.admin`.
