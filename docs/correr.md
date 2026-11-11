# Correr y caminar

Está en el celular, en **Entrenar → Correr y caminar**. Es el mismo planificador que [Ciclismo](ciclismo.md), pero a pie. Arriba elegís **Correr** o **Caminar**.

- **Por tiempo:** elegís cuánto (de 20 min a 1 h 30) y tu ritmo en min/km.
  - Al correr: 7:30, 6:19, 5:27 o 4:48 min/km.
  - Al caminar: 15, 12 o 10 min/km.
  - Kova arma hasta 3 circuitos que salen y vuelven al mismo punto. Primero va el que más pasa por parques y senderos, y el que menos va junto a avenidas o por zonas con muchos robos.
- **A → B:** el camino a pie hasta un lugar.
- **Guardadas:** tus rutas de correr y caminar. Las de bici quedan en Ciclismo.
- **Navegar:** igual que en bici, con la voz, el recálculo y el aviso de zonas. Abajo muestra el ritmo en min/km en vez de la velocidad. Al terminar, la salida se guarda como entrenamiento: «Correr» o «Caminata» (`log_foot_activity`).
- **Recorrer en 3D:** un corredor recorre la ruta, en lugar de la bici.
- **Para esta salida:**
  - Energía aproximada: ≈ 1 kcal por kg y km corriendo, ≈ 0,5 caminando.
  - Agua: unos 500 ml por hora corriendo y 300 caminando.
  - Un gel o una banana si la salida pasa de 1 h 15 corriendo.

## Diferencias con la bici

| | Bici | A pie |
|---|---|---|
| Perfil de OpenRouteService | `cycling-regular` | `foot-walking`: veredas, peatonales, parques |
| Qué suma | Bicisendas y parques | Parques, senderos y caminos peatonales |
| Avenidas | «X km por avenidas» | «X km junto a avenidas» |
| Tiempo | +8 % por semáforos, +6 s por metro de subida | Correr: +3 % y +3 s por metro. Caminar: +5 % y +6 s por metro (Naismith) |
| Largo de una vuelta | 2 a 150 km | 0,8 a 50 km |

Las rutas se guardan en la misma tabla `bike_routes`, con la columna `sport` (`bike`, `run` o `walk`). La función es la misma `bike-route`, que recibe `sport`. Los avisos de zonas inseguras son los mismos para todos.

En la web de escritorio, el planificador sigue siendo solo de bici.
