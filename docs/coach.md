# Coach y amigos

Cualquier cuenta puede entrenar, ser coach y tener amigos. Plan completo: el documento «Kova Health — Plan del modo coach».

## Vínculos

| Tipo | Quién ve a quién | Qué ve | Qué edita |
| --- | --- | --- | --- |
| Coach | El coach ve al alumno | Entrenamientos y rutinas; peso, comida y salud solo si el alumno los comparte | Las rutinas del alumno: crear, editar, borrar, importar una planilla (el alumno también puede editarlas) |
| Amigo | Los dos se ven (dos vínculos, uno por dirección) | Entrenamientos; el resto solo si cada uno lo comparte | Nada |

- Un alumno tiene como máximo un coach activo. Aceptar un coach que ya era amigo convierte ese lado en vínculo de coach.
- Invitación: código de 6 caracteres (sin 0/O ni 1/I), de un solo uso, vence a los 7 días; máximo 20 por día por cuenta. Link: `https://kova-health.vercel.app/invitar/CODIGO` (web) o `kovahealth://invitar/CODIGO` (celular).
- Cualquiera de los dos corta el vínculo; en amigos se cortan las dos direcciones.

## Seguridad

Los vínculos **no** agregan políticas RLS a las tablas del dueño: las consultas normales siguen devolviendo solo filas propias, así que nada de un alumno o amigo se mezcla en las pantallas propias. Todo acceso a datos de otra persona pasa por funciones `security definer` que llaman a `private.can_view(dueño, área)` (`training`, `routines`, `body`, `nutrition`, `health`). Tests: `supabase/tests/database/14_people_links.test.sql`.

## Funciones (RPC)

| Función | Para qué |
| --- | --- |
| `create_invite(kind)` | Crea un código (`coach` o `friend`) |
| `invite_info(code)` | Quién invita y como qué, antes de aceptar |
| `accept_invite(code)` | Acepta: crea el vínculo (o los dos, en amigos) |
| `my_links()` | Mis vínculos en las dos direcciones, con el nombre de la otra persona y, si soy quien ve, su última sesión y sesiones en 7 días |
| `end_link(id)` | Corta un vínculo |
| `set_link_shares(id, body, nutrition, health)` | El dueño elige qué más ve el otro |
| `coach_routines(alumno)` · `coach_exercises(alumno)` | Rutinas (con nombres de ejercicio) y ejercicios propios del alumno |
| `coach_save_routine(alumno, …)` · `coach_delete_routine(alumno, id)` | Igual que `save_routine`, en la cuenta del alumno; marca `routines.assigned_by` |
| `coach_create_exercise(alumno, id, nombre, slug)` | Ejercicio nuevo del alumno (el coach no puede usar sus ejercicios privados) |

En las apps: `kova.people` (`@kova/api-client`), pantalla «Coach y amigos» (celular: Ajustes; web: menú lateral).
