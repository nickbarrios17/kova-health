# Reportar un problema

Cualquier persona con cuenta puede reportar un error o proponer una mejora desde:

- **Celular:** Ajustes › «Reportar un problema», y en cada ejercicio («Cómo se hace») el link «Reportar un error en este ejercicio o su modelo 3D».
- **Web:** «Reportar un problema» en el menú lateral, y el mismo link en el detalle de cada ejercicio.

Cada reporte guarda la categoría (`bug`, `exercise`, `model3d`, `interface`, `idea`, `other`), el mensaje y, solos, la pantalla, el ejercicio, la plataforma y la versión de la app. No se guarda nada más del dispositivo.

## Quién ve qué

- Cada persona ve solo sus reportes (RLS).
- Los **administradores** ven todos en la web, en «Reportes recibidos» (`/reportes`), y les cambian el estado: Nuevo, Visto, Resuelto, Descartado.
- Un administrador es una fila en `private.admins`. Se agrega a mano, nunca desde la app:

```sql
insert into private.admins (user_id) select id from auth.users where email = '<correo>';
```

Funciones: `am_i_admin()`, `admin_reports(estado?, límite?)`, `admin_set_report(id, estado, nota?)`. Tests: `supabase/tests/database/16_feedback_reports.test.sql`. En las apps: `kova.feedback`.
