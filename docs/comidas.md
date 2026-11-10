# Comida → Asesor de comidas · propuesta

Estado: **propuesta para aprobar**. No hay código todavía.

## La idea en una frase

Un asesor que arma lo que comés alrededor de **tu entrenamiento real, tu bolsillo y tu casa**, en Argentina, sin inventar números.

## Reglas que no cambian

1. **La IA elige y redacta; los números salen de datos.** Kcal y macros vienen del catálogo (USDA, Open Food Facts, etiquetas). Cuando no hay dato, se muestra una estimación como rango («≈ 550–700 kcal»), marcada como estimada, y el usuario la confirma antes de guardarla.
2. **Todo registro sigue usando lo que ya existe:** `foods` (con `data_source`: verified / label / user / estimated), `meals`, `meal_items` con valores congelados, `log_food`, `nutrition_goals` y la energía dinámica (`energy.today`).
3. **Salud primero:**
   - Sin planes restrictivos para menores de 18, embarazo, diabetes con insulina o antecedentes de trastornos de la conducta alimentaria. Para esos casos: «Consultá con un profesional».
   - Hay un piso mínimo de calorías y no hay déficits agresivos.
   - Nada de afirmaciones médicas.
4. **Privacidad:**
   - Las fotos se procesan y no se guardan.
   - La IA se usa con consentimiento.
   - En producción, Gemini corre con facturación activa, así que sus términos no permiten usar los datos.
   - Hay un límite de pedidos por persona y por día, y un tope de gasto mensual.

## Hoy (punto de partida)

- **Base de datos:**
  - Están las tablas de alimentos, recetas, comidas e ítems con su origen.
  - Hay metas de nutrición y vistas `nutrition_daily` y `frequent_foods`.
  - `foods.barcode` existe, pero nadie lo usa.
- **Catálogo:** en producción el catálogo verificado está **vacío**. Solo hay alimentos de ejemplo en el seed local. La pantalla dice «Verificado aún no está disponible».
- **App:** búsqueda, alta manual de alimento, registro por franja (desayuno a cena) y recetas.
- **Lo que falta:** cámara, código de barras, IA, planes, compras y precios.

## Fuentes de datos

| Fuente | Para qué | Licencia | Nota |
|---|---|---|---|
| USDA FoodData Central | Alimentos genéricos (pollo, arroz, banana) | Dominio público | Se traducen los nombres; los valores no se tocan |
| Open Food Facts | Código de barras, etiqueta, sellos, categoría | ODbL: atribución + compartir igual | Se guarda en una tabla aparte y se muestra «© Open Food Facts contributors». Pide un User-Agent con contacto. Límite de 100 lecturas por minuto |
| ARGENFOODS (UNLu) | Composición de alimentos argentinos | **Sin confirmar** | Hay que pedir permiso a la Universidad de Luján. Mientras tanto, las comidas típicas se arman como recetas de ingredientes USDA |
| SEPA / Precios Claros | Precios diarios por supermercado y sucursal | Datos abiertos (verificar CC BY en datos.gob.ar) | Unos 12 millones de precios por día: se guarda solo lo de las sucursales elegidas y los productos de las listas |
| Gemini Flash | Entender texto, voz, fotos; armar planes | Plan gratuito en prueba, pago en producción | Detrás de una función de Supabase; el proveedor es intercambiable |

## Etapas

### Etapa 1 · Registrar sin esfuerzo

1. **Catálogo base:**
   - Unos 400 alimentos genéricos de USDA en español.
   - Porciones caseras con su equivalencia en gramos y su fuente, por ejemplo «1 empanada de carne ≈ 85 g».
   - Comidas argentinas como recetas: milanesa, empanadas, tarta, guiso, facturas, mate con azúcar, y el asado por corte (vacío, entraña, chorizo, morcilla).
2. **Describir la comida** por texto o dictado del teclado: «comí 2 empanadas de carne y una ensalada».
   - Gemini separa los ítems y las cantidades.
   - Cada ítem se busca en el catálogo. Si no está, se estima con un rango.
   - El usuario confirma o corrige y se guarda con `log_food`.
3. **Foto del plato:** el mismo flujo, con la imagen. Pide confirmar las porciones (por ejemplo «¿era un plato lleno?»).
4. **Código de barras:**
   - Cámara en el celular (expo-camera, **requiere APK nuevo**) y en la web.
   - El producto sale de Open Food Facts y queda en caché.
   - Se muestran los **sellos negros** (exceso en azúcares, sodio, grasas…) y «otra opción de la misma góndola» con menos sellos.
   - Si no está en Open Food Facts: se saca foto de la etiqueta, Gemini la lee y se guarda como «etiqueta» para esa persona.
5. **Repetir rápido:** «lo mismo que ayer», comidas frecuentes y recetas propias con un toque.

**Base de datos nueva:**
- `food_portions`
- `off_products` (aparte, por la licencia)
- `ai_requests` (límite diario y costo)
- Edge Functions `food-describe` y `food-barcode`

### Etapa 2 · El asesor: plan según tu entrenamiento

6. **Preferencias:** gustos, lo que no comés, alergias, presupuesto semanal, tiempo para cocinar, cuántos comen en tu casa y la zona y supermercados.
7. **Plan semanal:**
   - Se usan tu meta, la energía del día y tus rutinas programadas. Más carbohidratos los días de piernas o de bici larga, menos en descanso, y proteína repartida.
   - Gemini propone recetas dentro de esos límites.
   - **El servidor recalcula** los macros con el catálogo y rechaza lo que no cierra.
   - Podés cambiar cualquier comida por otra equivalente.
8. **Comida alrededor del entrenamiento:**
   - En Hoy: «Entrenás Pecho a las 19 h: merendá a las 16 h…» y, después, «te faltan 35 g de proteína».
   - **Ciclismo:** el gasto estimado de la ruta planificada, qué llevar (bananas, gel, agua) y la recarga.
9. **Modo asado o salida:** «El sábado tengo asado». La meta pasa a ser **semanal** y el resto de la semana se reacomoda.

**Base de datos nueva:**
- `food_preferences`
- `meal_plans`
- `meal_plan_items`
- `meal_events`
- Edge Function `meal-plan`

### Etapa 3 · Compras

10. **Lista de compras** desde el plan:
    - Agrupada por góndola.
    - Con cantidades redondeadas a envases reales (un paquete de 1 kg, no 830 g).
    - Se tilda en el súper.
11. **Despensa:**
    - Foto del ticket del súper o de la heladera → lo que tenés.
    - La lista descuenta lo que ya hay.
    - Opción **«¿Qué cocino con lo que tengo?»**.
12. **Precios reales (SEPA):**
    - Se elige el súper y la zona.
    - Se muestra cuánto sale la lista en cada uno.
    - El plan respeta el presupuesto: «140 g de proteína por día con $X por semana».
    - Los datos se cargan una vez por día con un trabajo programado.

**Base de datos nueva:**
- `shopping_lists`
- `shopping_items`
- `pantry_items`
- `stores`
- `prices` (solo sucursales y productos usados)
- Trabajo diario `sepa-sync`

### Etapa 4 · La casa y la cocina

13. **Plan del hogar:** el mismo menú con porciones distintas para cada persona según su objetivo. La lista de compras es compartida y cualquiera la tilda. Se usa el vínculo de Coach y amigos o una invitación nueva de «hogar».
14. **Sesión de cocina** (para la semana):
    - Pasos en orden, con temporizadores, como una rutina de gimnasio.
    - Al final reparte las porciones en táperes por día y quedan cargados en el plan.
15. **Comer afuera:** foto de la carta → las 2 o 3 opciones que mejor encajan con lo que te queda del día, explicadas.

**Base de datos nueva:**
- `households`
- `household_members`
- `cook_sessions`

### Etapa 5 · Inteligencia y coach

16. **Insights nuevos**, con nivel de evidencia (Hecho, Patrón, Hipótesis):
    - Cena tarde ↔ sueño.
    - Proteína ↔ récords y volumen.
    - Comida ↔ ánimo.
    - Días de bici ↔ hambre del día siguiente.
    - Sigue la regla de siempre: los patrones nunca dicen «porque».
17. **Coach:** el coach o nutricionista asigna o ajusta el plan y ve cuánto se cumple, con los permisos de Coach y amigos.
18. **Reloj:** aviso de comida antes de entrenar y registro rápido de agua.
19. **Hidratación:** meta según entrenamiento, bici y temperatura del día.

**Hecho en la etapa 5:**
- Insights «Cena tarde ↔ sueño de esa noche» y «Poca proteína ↔ ánimo». Usan los mismos niveles de evidencia y nunca dicen «porque».
- El coach ve el plan semanal del alumno y cuánto comió de lo planeado. Solo si el alumno comparte su alimentación (`person_meal_plan`). Por ahora no lo edita.
- Agua: tarjeta en Comida con +1 vaso y Deshacer. Meta de ~35 ml/kg, más medio litro si entrenaste. Es privada: nadie más la ve.

**Queda para después:**
- Proteína ↔ récords y Bici ↔ hambre: necesitan más historia para no inventar.
- Reloj: aviso antes de entrenar y agua desde la muñeca.
- Temperatura en la meta de agua.

## Qué hace falta de tu lado

1. **Clave de Gemini:**
   - Creá la clave en Google AI Studio.
   - La guardás vos como secreto en Supabase, igual que `ORS_API_KEY`:
     - en la base de prueba, con el plan gratuito;
     - en la oficial, con facturación y un tope mensual.
2. **Contacto para Open Food Facts:** un mail o URL de contacto de Kova para el User-Agent que exige su API. No uso tu mail sin que me digas.
3. **ARGENFOODS:** si querés datos argentinos oficiales, un mail a la Universidad de Luján pidiendo permiso de uso. No bloquea nada.
4. **APK nuevo:** la cámara del código de barras necesita instalar la app de nuevo. Primero «Prueba», después la oficial.

## Pruebas por etapa

- **Dominio (Vitest):**
  - Conversión de porciones.
  - Rangos de estimación.
  - Validación de macros de un plan.
  - Redondeo a envases.
  - Meta semanal flexible.
  - Detectores de insights.
- **Base de datos (pgTAP):**
  - RLS de todas las tablas nuevas.
  - Límite diario de IA.
  - Hogar compartido: cada miembro ve solo lo compartido.
  - La caché de Open Food Facts se lee pero no la escribe el usuario.
- **Edge Functions:**
  - Respuestas de Gemini con formato inválido se rechazan.
  - Sin clave → error claro.
  - Límite por usuario.
- **Manual en el celular:**
  - Código de barras real.
  - Foto de plato.
  - Plan de una semana con rutina y una vuelta en bici.
  - Lista con precios de un súper real.

## Orden de trabajo

Cada etapa en su PR a `develop`, probada en «Kova Health Prueba», y recién después a producción. Igual que con Ciclismo y el rediseño.
