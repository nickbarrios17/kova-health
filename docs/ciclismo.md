# Ciclismo

**Entrenar → Ciclismo** en el celular y en el navegador del celular (`/m`). En la web de escritorio, **Ciclismo** en la barra lateral: el mismo planificador con un mapa grande. Ahí no se navega; las rutas que guardes aparecen en el celular para navegarlas.

- **Por tiempo:** elegís cuánto querés andar (30 min a 2 h) y tu ritmo. Kova arma hasta 3 vueltas que salen y vuelven al mismo punto, y ordena primero la que tiene más bicisendas y parques.
- **A → B:** buscás un lugar, o tocás el mapa, y te da la ruta en bici.
- **Guardadas:** las rutas que guardaste, con su nombre.
- **Navegar:** te guía por la ruta elegida con el GPS, como un navegador de auto pero para la bici (ver abajo).

Para cada ruta se ve:
- el tiempo estimado a tu ritmo, la distancia y la subida;
- cuánto va por bicisenda, por calles de barrio, por avenidas y por senderos;
- los parques por los que pasa;
- avisos: kilómetros por avenidas, adoquines o tierra, y subidas fuertes.

El mapa es claro, tipo maqueta, y cambia entre 2D y 3D (edificios blancos y relieve), y **Recorrer en 3D** muestra una bici con su ciclista en 3D que pedalea a lo largo de la ruta, con la cámara siguiéndola desde atrás. La velocidad se elige (lenta, media o rápida: 5, 15 o 40 veces tu ritmo, y cada opción dice cuánto dura), se puede cambiar en el medio, pausar y detener. three.js se descarga recién la primera vez que alguien la usa.

## Navegar

- Arriba, la próxima maniobra con su flecha y la distancia: «150 m · Doblá a la derecha por Av. Gaona».
- Una voz la anuncia dos veces: unos 200 m antes y cuando llegás a la esquina. Se puede silenciar.
- El mapa te sigue en 3D con la bici en tu posición, mirando hacia donde vas.
- Abajo: lo que falta, el tiempo, la hora de llegada y tu velocidad.
- Si te salís de la ruta (más de 40 m, en tres lecturas seguidas del GPS), avisa y recalcula desde donde estés. En una vuelta, te devuelve a la vuelta un poco más adelante, así sigue siendo una vuelta.
- La pantalla queda encendida mientras navegás.
- Al llegar, o con **Terminar**: distancia, tiempo en movimiento y velocidad promedio, medidos con el GPS. Se puede **guardar como entrenamiento**: queda en el historial como una sesión con el ejercicio «Ciclismo» (`log_bike_ride`).
- Funciona con la app abierta. Con la pantalla bloqueada no sigue, porque eso necesita el permiso de ubicación «todo el tiempo».

Las indicaciones vienen de OpenRouteService (tipo de maniobra y calle), y la app las arma en castellano rioplatense (`packages/domain/src/navigation.ts`, con tests). Las rutas guardadas antes de esta versión no tienen indicaciones: se navegan siguiendo la línea.

## Zonas inseguras

Cada ruta dice por dónde pasa, con datos públicos y avisos de otros ciclistas. Los recorridos «por tiempo» ordenan primero los que evitan las zonas con más robos.

- **CABA:** la ciudad se divide en celdas de unos 275 m. Con el [mapa del delito](https://data.buenosaires.gob.ar/dataset/delitos) de BA Data (2024 y 2025, licencia CC BY) se cuentan por año:
  - los robos, sin contar robos de autos;
  - los robos de noche, de 20 a 6 h;
  - las personas heridas o muertas en choques.
  
  «Muchos robos» es el 10 % de las celdas con más robos de la ciudad, y «algunos» el 20 % siguiente. Para choques, el 8 % con más. La ruta avisa, por ejemplo, «1,1 km por zonas con muchos robos». Si evita esas zonas, lo dice como algo a favor.
- **Conurbano:** la tasa de robos por partido del [SNIC](https://www.argentina.gob.ar/seguridad/estadisticascriminales/bases-de-datos) (Ministerio de Seguridad, 2024), comparada con el promedio de los 24 partidos del conurbano. Avisa solo si el partido está bastante por encima, un 30 % o más. Es un dato por partido entero, mucho menos preciso que el de CABA. Para saber por qué partidos pasa la ruta, la función consulta unos puntos en la [API Georef](https://apis.datos.gob.ar/georef) del Estado.
- **Avisos de ciclistas:** con el botón del megáfono, tocás un lugar del mapa y elegís qué pasó: «Me robaron», «Intento de robo», «Zona insegura u oscura» o «Calle peligrosa para la bici».
  - Los demás ven el punto, qué pasó y el día, nunca quién avisó.
  - Cada aviso dura 6 meses y se puede borrar desde «Guardadas».
  - Hay un máximo de 20 avisos por día por persona.
  - Una ruta avisa cuántos hay a menos de 100 m.
- **En el mapa:** el botón del escudo muestra u oculta las zonas (rojo, muchos robos; naranja, algunos), los puntos con muchos choques (amarillo) y los avisos.
- **Navegando:** al entrar en una zona con muchos robos, la voz avisa «Atención: zona con muchos robos», como mucho una vez cada 3 minutos.

Son promedios de dónde pasa más seguido, no una garantía, y la app lo dice así.

**Actualizar los datos** (por ejemplo, cuando BA Data publica un año nuevo):
1. Descargá los CSV del delito de CABA (`https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-justicia-y-seguridad/delitos/delitos_AAAA.csv`) y `snic-departamentos-anual.csv` de la página del SNIC.
2. Corré:
   ```
   python -I scripts/safety/build-safety-data.py --caba delitos_2024.csv delitos_2025.csv --snic snic-departamentos-anual.csv --snic-year 2024 --out supabase/migrations/<fecha>_safety_data.sql
   ```
   La migración reemplaza los datos anteriores.

## Cómo funciona

| Parte | Dónde |
|---|---|
| Rutas y búsqueda de lugares | [OpenRouteService](https://openrouteservice.org), perfil bici, a través de la Edge Function `bike-route`. La clave está solo en el servidor. |
| Parques | OpenStreetMap (Overpass), consultado por la misma función alrededor de la ruta. |
| Análisis (bicisenda, calles, avenidas, parques, tiempo) | `packages/domain/src/cycling.ts`, con tests. |
| Mapa | MapLibre GL con un estilo propio claro, tipo maqueta (`packages/domain/src/cyclingMap.ts`): calles y edificios de OpenFreeMap, edificios en 3D de [Overture Maps](https://docs.overturemaps.org/examples/overture-tiles) (que suma huellas de Microsoft y Google, así se llenan todas las manzanas) y relieve de AWS Terrain Tiles. Va en un WebView (`RouteMap.tsx`) o un iframe (`RouteMap.web.tsx`). No necesita claves. |
| Rutas guardadas | Tabla `bike_routes`: cada persona ve solo las suyas. |
| Tu ubicación | `expo-location`, solo mientras usás la pantalla y solo para marcar la salida. No se guarda. |

Tipos de vía: OpenRouteService clasifica cada tramo. *Bicisenda* son las vías exclusivas para bicis. *Calles* son las residenciales. *Avenidas* son las rutas y calles principales. Una avenida con ciclovía pintada todavía cuenta como avenida.

El tiempo estimado es la distancia a tu ritmo, más un 8 % por semáforos y esquinas, más 6 segundos por cada metro de subida.

## Configuración (una vez por proyecto de Supabase)

1. Creá una cuenta en openrouteservice.org y copiá tu API key. El plan gratis alcanza para 2000 rutas por día.
2. Guardala como secreto de la función y publicá la función:

   ```
   npx supabase secrets set ORS_API_KEY=tu-clave --project-ref <ref>
   npx supabase functions deploy bike-route --project-ref <ref>
   ```

   Prueba: `nvegmmpovtytrmdhgvlh`. Oficial: `oxfucatgikqbwowtgkow`.

## Para más adelante

- Seguir navegando con la pantalla bloqueada: necesita el permiso de ubicación «todo el tiempo», que Google revisa aparte.
- Pasar las fases de ciclismo a la app oficial: clave de OpenRouteService en producción, publicar la función y correr las migraciones (ver «Configuración»).

## Edificios de Overture

El archivo de edificios es de una versión con fecha (`OVERTURE_BUILDINGS` en `packages/domain/src/cyclingMap.ts`, hoy `2026-10-21.0`). Overture publica una nueva cada mes y puede borrar las viejas. Si la que usamos deja de estar, el mapa usa solo los edificios de OpenStreetMap, que en Buenos Aires son bastantes menos. Para actualizar, cambiá la fecha por la de la última versión de su [calendario](https://docs.overturemaps.org/release-calendar/).
