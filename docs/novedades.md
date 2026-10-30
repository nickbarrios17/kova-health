# Novedades

Cuando alguien abre la app o la web después de una actualización, aparece «¿Qué hay de nuevo?» con lo que cambió, agrupado por día. Las novedades anteriores quedan en **Ajustes → Novedades** (celular) y en **Novedades** en el menú de la web.

## Cómo agregar una novedad

En `packages/domain/src/news.ts`, en `NEWS`: un día nuevo arriba de todo (o un ítem más en el día de hoy), con título y una frase escrita para quien usa la app, no para desarrolladores. Sale con la próxima actualización (en el celular, por OTA).

- **`preview: true`:** el ítem se ve solo en «Kova Health Prueba» y en la web de prueba. Cuando llega a la app oficial, se saca el flag.
- **Un día que suma ítems** vuelve a aparecer como nuevo (su id es la fecha más la cantidad de ítems).

## Qué se muestra al abrir

- Los días que ese dispositivo todavía no vio.
- La primera vez en un dispositivo, solo los de la última semana, para no mostrarle todo el historial a una cuenta nueva.

Lo visto se guarda en el dispositivo (AsyncStorage en el celular, localStorage en la web). Si se pierde, solo vuelve a mostrar la última semana.
