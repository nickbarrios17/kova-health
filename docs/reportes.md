# Reportar un problema

Cualquier persona con cuenta puede reportar un error o proponer una mejora con el botón **⚠️**, que está en todas las pantallas (celular: abajo a la derecha; web: abajo a la derecha de cada página; en el detalle de un ejercicio, arriba junto a cerrar). También desde Ajustes y el menú lateral de la web.

El reporte ofrece **opciones rápidas según la pantalla** (`reportOptions(screen)` en `@kova/domain`): en un ejercicio, «El modelo 3D no hace bien el movimiento», «Las instrucciones están mal»…; en la sesión, «No se guardó una serie»…; más las generales (se cierra, se ve mal, una idea). Se pueden marcar varias y escribir un comentario con el síntoma y qué estaban haciendo. Cada pantalla se registra con `useReportTarget(screen, contexto)` en el celular; en la web la pantalla sale de la ruta.

Cada reporte guarda la categoría (`bug`, `exercise`, `model3d`, `interface`, `idea`, `other`), el mensaje y, solos, la pantalla, el ejercicio, la plataforma y la versión de la app. No se guarda nada más del dispositivo.

## Quién ve qué

- Cada persona ve solo sus reportes (RLS).
- Los **administradores** ven todos en la web, en «Reportes recibidos» (`/reportes`), y les cambian el estado: Nuevo, Visto, Resuelto, Descartado.
- Un administrador es una fila en `private.admins`. Se agrega a mano, nunca desde la app:

```sql
insert into private.admins (user_id) select id from auth.users where email = '<correo>';
```

Funciones: `am_i_admin()`, `admin_reports(estado?, límite?)`, `admin_set_report(id, estado, nota?)`. Tests: `supabase/tests/database/16_feedback_reports.test.sql`. En las apps: `kova.feedback`.
