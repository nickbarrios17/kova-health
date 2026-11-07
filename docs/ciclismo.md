# Ciclismo

**Entrenar → Ciclismo** en el celular, y en el navegador del celular (`/m`).

- **Por tiempo:** elegís cuánto querés andar (30 min a 2 h) y tu ritmo. Kova arma hasta 3 vueltas que salen y vuelven al mismo punto, y ordena primero la que tiene más bicisendas y parques.
- **A → B:** buscás un lugar, o tocás el mapa, y te da la ruta en bici.
- **Guardadas:** las rutas que guardaste, con su nombre.

Para cada ruta se ve:
- el tiempo estimado a tu ritmo, la distancia y la subida;
- cuánto va por bicisenda, por calles de barrio, por avenidas y por senderos;
- los parques por los que pasa;
- avisos: kilómetros por avenidas, adoquines o tierra, y subidas fuertes.

El mapa es claro, tipo maqueta, y cambia entre 2D y 3D (edificios blancos y relieve), y **Recorrer en 3D** muestra una bici con su ciclista en 3D que pedalea a lo largo de la ruta, con la cámara siguiéndola desde atrás. La velocidad se elige (lenta, media o rápida: 5, 15 o 40 veces tu ritmo, y cada opción dice cuánto dura), se puede cambiar en el medio, pausar y detener. three.js se descarga recién la primera vez que alguien la usa.

## Cómo funciona

| Parte | Dónde |
|---|---|
| Rutas y búsqueda de lugares | [OpenRouteService](https://openrouteservice.org), perfil bici, a través de la Edge Function `bike-route`. La clave está solo en el servidor. |
| Parques | OpenStreetMap (Overpass), consultado por la misma función alrededor de la ruta. |
| Análisis (bicisenda, calles, avenidas, parques, tiempo) | `packages/domain/src/cycling.ts`, con tests. |
| Mapa | MapLibre GL con un estilo propio claro, tipo maqueta (`routeMapHtml.ts`): calles y edificios de OpenFreeMap, edificios en 3D de [Overture Maps](https://docs.overturemaps.org/examples/overture-tiles) (que suma huellas de Microsoft y Google, así se llenan todas las manzanas) y relieve de AWS Terrain Tiles. Va en un WebView (`RouteMap.tsx`) o un iframe (`RouteMap.web.tsx`). No necesita claves. |
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

## Lo que viene

- **Zonas inseguras:** avisar o descartar rutas que pasan por zonas con más delitos. En CABA, con el mapa del delito de Buenos Aires Data. En el conurbano, con estadísticas por partido, que son menos precisas, y zonas marcadas por los usuarios.
- **En vivo:** seguir la ruta con el GPS mientras andás, con el tiempo que falta.
- La versión de escritorio de la web.

## Edificios de Overture

El archivo de edificios es de una versión con fecha (`OVERTURE_BUILDINGS` en `routeMapHtml.ts`, hoy `2026-10-21.0`). Overture publica una nueva cada mes y puede borrar las viejas. Si la que usamos deja de estar, el mapa usa solo los edificios de OpenStreetMap, que en Buenos Aires son bastantes menos. Para actualizar, cambiá la fecha por la de la última versión de su [calendario](https://docs.overturemaps.org/release-calendar/).
