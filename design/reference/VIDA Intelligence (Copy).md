Diseño técnico & conceptual — segunda pasada

# VIDA Intelligence

Cómo llevar a VIDA de "te muestro lo que cargaste" a "te ayudo a entender por qué pasa y qué podrías hacer" — sin reconstruir la app, y sin usar IA donde una regla alcanza.

"VIDA no debería limitarse a decirme qué está pasando. Debería ayudarme a entender por qué está pasando y qué podría hacer al respecto."

Sin cambios de código en esta pasada — diseño únicamente Basado en `PersonalPatterns.kt`, `WeeklySummary.kt`, `CalorieEngine.kt`, el modelo de datos completo y la Edge Function `generate-insights`

Contenidos

1. [01Lo que VIDA ya sabe](#s1)
2. [02PersonalPatterns hoy](#s2)
3. [03El motor de inteligencia](#s3)
4. [04Hecho vs. hipótesis](#s4)
5. [05Conexiones entre dominios](#s5)
6. [0618 insights concretos](#s6)
7. [07¿Reglas, ML o LLM?](#s7)
8. [08Sistema de confianza](#s8)
9. [09Sistema de prioridad](#s9)
10. [10De insight a acción](#s10)
11. [11El rol de Gemini](#s11)
12. [12MVP realista](#s12)
13. [13Roadmap V1→V4](#s13)
14. [14La pregunta importante](#s14)

01

## Lo que VIDA ya sabe

Todo lo que sigue está tomado directamente de `AppData` (AppStore.kt), las entidades de Room, el esquema de Supabase y `HealthConnectManager.kt` — nada inventado. La columna "usado hoy" es la más importante de esta tabla: separa lo que VIDA ya recolecta de lo que efectivamente convierte en algún insight, sea regla local o resumen enviado a Gemini.

Finanzas

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Movimiento (gasto/ingreso) | `money_entries` | Manual | Por evento | Sí | Sí | Sí (Android) | Sí | Sí — delivery trend, meta de ahorro, WeeklySummary |
| Cuenta + saldo inicial | `accounts` | Manual | Al crear/editar | Sí | Sí | Sí | Sí | No |
| Transferencia entre cuentas | `transfer_entries` | Manual | Por evento | Sí | Sí | Sí | Sí | No |
| Meta de ahorro (SavingsPlan) | `savings_plans` | Manual | Al aportar | Sí | Sí | Sí | Sí | Parcial — solo si un Goal la referencia |
| Compromiso financiero | `financial_commitments` | Manual | Al crear/renovar | Sí | Sí | Sí | Sí | Sí — solo si vinculado a un Goal |
| Método de pago + impuestos | `payment_methods` | Manual | Rara vez | Sí | Sí | Sí | Sí | No — solo cálculo de conversión en pantalla |
| Presupuesto mensual | `profile.monthlyBudget` | Manual | Rara vez | Sí | Sí | Sí | Sí | No — solo barra de progreso en Finanzas |

Peso / composición corporal

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Peso | `weight_entries` | Manual o Health Connect (WeightRecord) | Diaria/al pesarse | Sí | Sí | Sí | Sí | Sí — peso vs. composición, goalProgress "weight" |
| Medidas corporales | `body_measurement_entries` | Manual | Esporádica | Sí | Sí | Sí | Sí | No |
| Composición corporal (grasa/masa magra) | `body_composition_entries` | Health Connect (BodyFatRecord, LeanBodyMassRecord) — solo lectura, del reloj | Cuando el reloj mide | Captura sí, sync a nube no (bug conocido) | Solo lectura, probablemente rota | Sí (Android) | Roto | Sí, en el mismo dispositivo — peso vs. composición |
| Foto de progreso | `progress_photos` + Storage | Manual (cámara/galería) | Esporádica | Sí | Solo lectura | Sí | Sí | No — visual únicamente |

Alimentación

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Comida (macros) | `meal_entries` | Manual o IA (foto/texto vía Gemini) | Por comida | Sí | Sí | Sí | Sí | Parcial — solo `caloriesTotal` va a la IA, ninguna regla local lo usa |
| Comida planificada | `planned_meals` | IA sugerida o manual | Semanal / bajo demanda | Sí | Sí | Sí | Sí | No |
| Objetivo nutricional | `profile.nutrition*` | CalorieEngine o manual | Al recalcular perfil | Sí | Sí | Sí | Sí | No — solo referencia visual de progreso |

Sueño

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Horas de sueño | `sleep_entries` | Manual o Health Connect (SleepSessionRecord) | Diaria | Sí | Sí | Sí | Sí | Sí — es el dato más usado: sueño vs. entrenamiento, promedio semanal, WeeklySummary |

Actividad física

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Entrenamiento (serie/ejercicio) | `workout_entries` | Manual o auto-import (ExerciseSessionRecord) | Por sesión | Sí | Sí | Sí | Sí | Sí — racha semanal, sueño vs. entrenamiento, WeeklySummary |
| Pasos | `steps_entries` | Health Connect (StepsRecord) | Diaria | Sí | Sí | Sí | Sí | No — ninguna regla ni el resumen para IA lo usa |
| Ritmo cardíaco | `heart_rate_entries` | Health Connect (HeartRateRecord) — solo lectura | Promedio diario | Sí | Sincroniza, sin pantalla | Sí | Sí | No |
| Calorías activas | No persistido — se calcula al vuelo | Health Connect (ActiveCaloriesBurnedRecord) | Diaria, solo "hoy" | Solo el valor de hoy, sin historial | No existe | Sí | No aplica — nunca se guarda | Sí, pero solo alimenta CalorieEngine de hoy, no hay serie histórica para ningún patrón |

Hábitos

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hábito + fechas completadas | `habits` | Manual (toggle) | Diaria | Sí | Sí | Sí | Sí | Sí — racha, semana vs. semana, vinculado a objetivos |

Objetivos

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Objetivo (Goal) + enlaces | `goals` | Manual | Al crear/actualizar | Sí | Sí | Sí | Sí | Sí — es el conector central de casi todas las reglas de `PersonalPatterns` |

Tareas

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tarea | `tasks` | Manual | Al crear/completar | Sí | Sí | Sí | Sí | Parcial — solo si está vinculada a un Goal |

Otros

| Dato | Almacenamiento | Fuente | Frecuencia | Android | Web | Offline | Supabase | Usado en insight hoy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ánimo | `mood_entries` | Manual | Diaria | Sí | Sí | Sí | Sí | Solo viaja a Gemini en `WeeklySummary` — ninguna regla local lo cruza con nada |
| Agua | `water_entries` | Manual | Diaria | Sí | Sí | Sí | Sí | No — ni regla local ni resumen para IA |
| Nota + checklist | `notes` | Manual | Libre | Sí | Sí | Sí | Sí | No |
| Rutina de entrenamiento | `routines` | Manual | Al crear | Sí | Sí | Sí | Sí | No es insight, es programación (`routinesForDay`) |

**El patrón que salta de esta tabla:** Sueño, Entrenamiento y Objetivos están bien aprovechados. Agua, Pasos, Ritmo cardíaco, Medidas corporales y Ánimo están recolectados con la misma disciplina — sincronizados, con RLS, con pantalla propia — pero prácticamente ningún insight los toca. VIDA ya paga el costo de recolectar estos datos; hoy no cobra el beneficio.

02

## PersonalPatterns, hoy

`ui/PersonalPatterns.kt` (Android) y su puerto 1:1 `dashboard/personalPatterns.ts` (Web) son, hoy, el motor de inteligencia completo de VIDA. Son 10 funciones puras, sin red, cada una devolviendo un `String?` o `List<String>` ya redactado. `personalPatterns()` las llama todas, junta los resultados no nulos, y corta a `MAX_DISPLAYED_PATTERNS = 5`.

### Las 10 reglas, con sus umbrales exactos

| Regla | Datos | Umbral | Prioridad hoy |
| --- | --- | --- | --- |
| Compromiso vinculado a objetivo | Goal.financialCommitmentIds + FinancialCommitment | Vencido o vence en ≤3 días | 1ª (más accionable) |
| Tarea vinculada a objetivo | Goal.taskIds + Task | Vencida y no completada | 2ª |
| Hábito vinculado a objetivo | Goal.habitIds + Habit | ≤2/7 días completados esta semana | 3ª |
| Delivery vs. meta de ahorro | MoneyEntry (texto "delivery") + Goal savings + SavingsPlan | Delivery +15% y meta sin completar | 4ª |
| Sueño vs. entrenamiento | SleepEntry + WorkoutEntry, ventana 14 días | ≥3 días por bucket, brecha de tasa ≥25% | 5ª |
| Peso vs. composición corporal | WeightEntry + BodyCompositionEntry, ventana 14 días | Pérdida ≥0.5kg, mediciones separadas ≥7 días | 6ª |
| Tendencia de delivery | MoneyEntry, semana vs. semana anterior | ±15% | 7ª |
| Hábitos semana vs. semana | Habit.completedDates | Cualquier diferencia ≠0 | 8ª |
| Promedio de sueño semanal | SleepEntry, últimos 7 días | ≥3 registros, promedio \<7h | 9ª |
| Racha de entrenamiento | WorkoutEntry, últimos 7 días | ≥3 sesiones | 10ª |

### Limitaciones reales, no hipotéticas

**Umbrales fijos, no personales.** "Menos de 6:30h de sueño" o "menos de 7h en promedio" son el mismo número para cualquier usuario — no hay noción de la línea base individual. Alguien que duerme naturalmente 6h todas sus noches disparará la alerta de sueño bajo todas las semanas, sin que sea una desviación real de *su* normalidad.

**Salida como texto, no como dato.** Cada regla devuelve un `String` ya armado — no hay severidad, confianza, dominio ni entidades involucradas como campos separados. Es imposible ordenar por importancia real, filtrar, o hacer cualquier cosa con un insight más allá de mostrarlo tal cual.

**Prioridad por orden de código, no por relevancia calculada.** El recorte a 5 resultados es literalmente `.take(5)` sobre el orden en que las funciones fueron escritas en el archivo — no un score de qué es más importante *hoy* para *este* usuario.

**Sin memoria.** `personalPatterns()` es 100% stateless: se recalcula de cero en cada composición, sin saber qué se le mostró ayer. Un mismo patrón puede repetirse literal, día tras día, sin variación.

**Cobertura desigual.** Sueño, Entrenamiento, Hábitos, Objetivos y Delivery tienen reglas. Ánimo, Agua, Pasos, Ritmo cardíaco, Medidas corporales y Presupuesto — cero, pese a estar disponibles (sección 01).

**La única regla honesta sobre su propia incertidumbre** es `savingsGoalSpendPattern`, cuyo comentario en el código dice explícitamente que es "una correlación honesta... no una afirmación de causalidad exacta" porque no existe vínculo entre un `MoneyEntry` puntual y un `Goal`. Es el único lugar donde el código ya se autolimita así — el resto de las reglas no distingue entre lo que es aritmética segura y lo que es una observación con margen de error.

### Patrones nuevos posibles sin ningún dato nuevo

Ánimo vs. sueño, ánimo vs. entrenamiento, presupuesto mensual vs. ritmo real de gasto del mes, pasos vs. sueño, día de la semana más débil para hábitos (agregando `completedDates` por `DayOfWeek` en vez de por semana completa), tendencia de peso con regresión sobre más de dos puntos, objetivo sin ningún hábito/tarea/compromiso vinculado. Todos usan columnas que ya existen hoy en `AppData`.

**Patrones que sí requieren datos nuevos:** gasto por hora del día vs. hora de dormir (MoneyEntry solo tiene `date`, no hora), causalidad real gasto↔objetivo (falta `goalId` en MoneyEntry — identificado en la auditoría anterior), puntualidad de pago de compromisos (no existe historial de pagos, solo `nextDueDate`), y cualquier análisis del texto libre de `NoteEntry` (hoy nunca se procesa).

03

## El motor de inteligencia

La arquitectura que propusiste (Datos → Normalización → Features → Reglas → Correlaciones → Contexto → Inferencia → Insight → Acción) es un pipeline de ML genérico razonable, pero no es la correcta para VIDA tal como está hoy, por tres motivos concretos: (1) es estrictamente secuencial, y obliga a que hasta un hecho trivial ("gastaste $80.000 esta semana") pase por ocho etapas cuando es una suma; (2) no dice dónde vive cada etapa — para una app offline-first eso es la decisión más importante, no un detalle de implementación; (3) no tiene ningún lazo de retroalimentación — nada que aprenda si un insight sirvió o no.

### Arquitectura propuesta: capas, no un pipeline lineal

Capa 0

Datos\
Room + Postgres, ya existe

→

Capa 1

Features\
ventanas y agregados compartidos

→

Capa 2

Detectores\
las 10 reglas + nuevas, cada una independiente

→

Capa 3

Confianza\
§08, separada de cada regla

→

Capa 4

Prioridad\
§09, con memoria de lo mostrado

→

Capa 5

Interpretación\
Gemini, opcional, §11

→

Capa 6

Acción\
§10, solo si accionable

La diferencia clave con lo que propusiste no es la lista de etapas — son parecidas — sino que **cada Insight no pasa por todas**. Un hecho aritmético (Capa 0→2, listo) no necesita Confianza (es 100% cierto por definición) ni Interpretación de Gemini. Una hipótesis cross-domain sí necesita las seis. El pipeline es un techo, no un camino obligatorio.

Y cada capa tiene un dueño de dónde corre, coherente con lo que ya existe: **Capas 0-4 corren en el cliente** (Kotlin en Android, TypeScript en Web — igual que hoy PersonalPatterns), sin red, deterministas, testeables. **Capa 5 es la única que toca la nube**, vía Edge Function, igual que `generate-insights` ya hace. **Capa 6** puede vivir en el cliente (es solo lógica de negocio sobre insights ya calculados). Esto no es una reconstrucción — es envolver lo que ya existe en una forma más estructurada.

### La pieza que falta hoy y sostiene todo lo demás

Lo único genuinamente nuevo es que un `Insight` deje de ser un `String` y sea una estructura con campos: `kind` (hecho/patrón/predicción/hipótesis/recomendación, §04), `confidence` (§08), `domains` (qué dominios de datos usó), `score` (§09), y el texto final. Todo lo demás de esta sección — capas, dónde corre cada una — es una consecuencia de tener esa estructura, no un cambio de infraestructura.

04

## Hecho, patrón, predicción, hipótesis

Cada `Insight` lleva un `kind` asignado por el propio detector que lo genera — nunca inferido después por la UI. La regla de diseño es simple: **el tipo determina el lenguaje permitido**, no al revés.

Hecho

Aritmética directa sobre datos propios, sin comparación causal. Siempre 100% cierto — no lleva puntaje de confianza porque no es una inferencia, es una suma.

*"Esta semana gastaste $80.000." · "Tenés una racha de 23 días en Meditar." · "Tu objetivo 'Aprender inglés' no tiene ningún hábito ni tarea vinculada."*

Patrón observado

Correlación repetida entre dos series de datos *del propio usuario*, con un mínimo de muestras (igual criterio que ya usa `sleepWorkoutCorrelationPattern`: mínimo 3 días por bucket). Se afirma como observación, nunca como causa — el lenguaje nunca dice "porque", dice "cuando... también".

*"Durante las últimas 6 semanas gastaste más en delivery los días posteriores a dormir menos de 6 horas."*

Predicción

Proyección numérica sobre una tendencia actual, siempre con el supuesto explícito de que esa tendencia se mantiene. `estimateMonths()` ya hace exactamente esto para `SavingsPlan` — es el molde a generalizar.

*"Si mantenés este ritmo, tu objetivo de ahorro se retrasaría aproximadamente 3 semanas."*

Hipótesis

Relación posible entre dos patrones sin evidencia estadística suficiente, o sin descartar variables de confusión conocidas. Es, casi siempre, lo que Gemini puede sugerir a partir de patrones ya detectados — nunca algo que el código afirma por sí solo. Lenguaje obligatoriamente condicional.

*"El menor descanso podría estar asociado con el aumento del delivery."*

Recomendación

Acción sugerida, derivada de una predicción o un patrón de confianza suficiente. Siempre reversible y opcional — VIDA nunca aplica nada sola.

*"Podrías intentar preparar comida con anticipación los días en los que dormís poco."*

### La regla que separa esto de la mayoría de los "insights de IA" genéricos

Un Hecho y una Hipótesis nunca deberían verse igual en pantalla. Si las cinco tarjetas de la sección de patrones hoy son visualmente idénticas —texto negro sobre blanco, sin distinción— la app está, sin querer, presentando una corazonada con el mismo peso visual que una suma. Eso es precisamente lo que este sistema de tipos está diseñado para evitar.

05

## Conexiones entre dominios

Para cada conexión: qué existe hoy, qué patrón detectaría, y qué tan confiable sería siendo honestos sobre el tamaño de muestra real de una sola persona.

Sueño ↔ EntrenamientoYa existe

Datos

SleepEntry, WorkoutEntry

Confiabilidad

Media — N mínimo razonable, pero no controla causalidad inversa (quizás entrena menos por otro motivo, no por el sueño)

Sueño ↔ AlimentaciónNueva, datos existentes

Datos

SleepEntry + MealEntry o MoneyEntry (texto "delivery")

Patrón

Cambio en qué/cuánto se come el día después de dormir mal

Valor

Alto — mismo tipo de cruce que ya funciona bien para entrenamiento

Riesgo

"Delivery" se detecta por texto libre, no por un campo estructurado — falso negativo si la descripción no lo menciona

Sueño ↔ HábitosNueva, datos existentes

Datos

SleepEntry + Habit.completedDates

Patrón

Tasa de cumplimiento el día después de dormir poco vs. bien

Riesgo

Confusión con fin de semana (afecta ambas variables a la vez)

Alimentación ↔ FinanzasParcial

Datos

MoneyEntry (delivery) hoy; MealEntry.description nunca cruzado

Riesgo

No hay vínculo estructural entre un gasto y una comida — cualquier cruce es aproximado por fecha

Finanzas ↔ ObjetivosYa existe

Datos

MoneyEntry, Goal, SavingsPlan

Límite conocido

Sin `goalId` en MoneyEntry: correlación, no causalidad (ya documentado en el propio código)

Hábitos ↔ ObjetivosYa existe, sólido

Datos

Goal.habitIds + Habit

Entrenamiento ↔ PesoNueva, datos existentes

Datos

WorkoutEntry (volumen/frecuencia) + WeightEntry

Confiabilidad

Media-baja — el peso tiene ruido diario alto (agua, digestión), riesgo real de sobre-interpretar una semana

Alimentación ↔ PesoNueva, datos existentes

Datos

MealEntry.calories vs. NutritionGoal, WeightEntry

Patrón

Déficit calculado sostenido sin bajar de peso

Riesgo importante

El "déficit" depende de que el usuario registre el 100% de lo que come — si no lo hace, el cálculo es sistemáticamente optimista. VIDA debería decir esto, no asumirlo en silencio.

Compromisos financieros ↔ AhorroYa existe

Datos

FinancialCommitment, SavingsPlan.monthlyContributionCents

Extensión posible

Sumar compromisos del mes vs. aporte de ahorro planeado — es aritmética, casi un Hecho, no una Hipótesis

Tareas ↔ ObjetivosYa existe

Datos

Goal.taskIds + Task

Ánimo ↔ SueñoNueva, datos existentes

Datos

MoodEntry + SleepEntry — hoy ni siquiera se cruzan en el resumen que recibe Gemini

Confiabilidad

Media — mood es autoreportado, ruido alto, pero es una de las relaciones más "sentidas" si aparece

Ánimo ↔ FinanzasNueva, alto riesgo

Datos

MoodEntry + MoneyEntry

Riesgo

Alto — fácil de malinterpretar como "gastás porque estás triste" cuando puede ser causalidad inversa o coincidencia. Marcar siempre como Hipótesis, nunca como Patrón, hasta tener mucho más volumen.

Pasos ↔ SueñoNueva, datos existentes

Datos

StepsEntry + SleepEntry

Confiabilidad

Potencialmente la más sólida de las nuevas — es una relación fisiológica bien establecida, aunque el N personal seguirá siendo bajo

Presupuesto ↔ Ritmo de gastoNueva, es un Hecho puro

Datos

profile.monthlyBudget + MoneyEntry del mes

Riesgo

Ninguno — es aritmética directa (% gastado vs. % del mes transcurrido). Sorprende que no exista ya.

06

## 18 ejemplos concretos

Usando exclusivamente datos que VIDA ya tiene. Formato: datos → detección → interpretación → acción.

### Finanzas

#### Presupuesto en riesgo antes de fin de mes

Hecho

Datos

monthlyBudget, MoneyEntry del mes

Detección

% gastado vs. % de días transcurridos del mes

Interpretación

"Vas gastado el 68% del presupuesto y ya pasó el 50% del mes."

Acción

Opcional: ver categorías con más gasto

#### Compromisos compitiendo con el ahorro

Patrón

Datos

FinancialCommitment del mes, SavingsPlan.monthlyContributionCents

Detección

Suma de compromisos vs. aporte de ahorro planeado

Interpretación

"Este mes tenés $340.000 comprometido en pagos fijos, contra $50.000 que planeás ahorrar."

Acción

Revisar si el aporte de ahorro sigue siendo realista

#### Cuenta con saldo crónicamente bajo

Patrón

Datos

accountBalance() por semana, últimas 4 semanas

Detección

Saldo cierra bajo/negativo 3 de las últimas 4 semanas

Interpretación

"Tu cuenta 'Efectivo' viene cerrando el mes casi en cero 3 de las últimas 4 semanas."

Acción

Mover el gasto recurrente a otra cuenta o ajustar el presupuesto

### Salud

#### Déficit calórico sin bajar de peso

Hipótesis

Datos

MealEntry.calories vs. NutritionGoal, WeightEntry

Detección

Ingesta bajo objetivo la mayoría de 10 días, peso estable

Interpretación

"Registraste menos calorías que tu objetivo la mayoría de los últimos 10 días, pero tu peso no bajó — puede ser retención, un ciclo natural, o que falte registrar algo."

Acción

Revisar consistencia del registro antes de bajar más las calorías

#### Pérdida de peso con pérdida de músculo

Patrón — ya existe

Datos

WeightEntry + BodyCompositionEntry

Detección

Masa magra baja proporcionalmente más que la grasa corporal

Interpretación

"Bajás rápido pero estás perdiendo músculo, capaz te falta proteína." (regla ya construida y bien calibrada)

Acción

Revisar la estrategia de macros del perfil

#### Actividad de fondo cayendo

Patrón

Datos

StepsEntry, últimas 2 semanas vs. 2 anteriores

Detección

Caída significativa en el promedio

Interpretación

"Tus pasos diarios bajaron un 30% en las últimas 2 semanas."

Acción

Revisar si el nivel de actividad del perfil sigue reflejando la realidad (afecta el objetivo calórico)

#### Días sin registrar agua

Hecho de registro, no de comportamiento

Datos

WaterEntry

Detección

Ausencia de registro en 5 de 7 días

Interpretación

"No registraste agua en 5 de los últimos 7 días." — deliberadamente NO dice "tomaste poca agua": no lo sabe.

Acción

Ninguna — ejemplo de cuándo ser honesto sobre la ambigüedad del dato importa más que "detectar" algo

### Hábitos

#### Hábito decayendo cerca de la fecha límite del objetivo

Patrón

Datos

Habit.completedDates + Goal.targetDate

Detección

Tasa de cumplimiento cae mientras la fecha objetivo se acerca

Interpretación

"Tu hábito 'Entrenar' bajó de 6/7 a 3/7 días esta quincena, y tu objetivo 'Bajar de peso' vence en 5 semanas."

Acción

Revisar si la fecha sigue siendo realista, o retomar el hábito

#### Día de la semana sistemáticamente débil

Patrón

Datos

Habit.completedDates agregado por día de la semana

Detección

Un día tiene tasa de cumplimiento sistemáticamente más baja

Interpretación

"Los martes cumplís tus hábitos la mitad de las veces que el resto de la semana."

Acción

Mover el recordatorio a otro horario ese día

#### Racha larga en riesgo hoy

Hecho + urgencia

Datos

streak() ya calculado

Detección

Racha ≥14 días, no marcada hoy, hora avanzada

Interpretación

"Tenés una racha de 23 días en 'Meditar' y todavía no la marcaste hoy."

Acción

Recordatorio directo — el caso más simple, ya casi construible con la infraestructura de notificaciones existente

### Objetivos

#### Objetivo estancado

Hecho

Datos

Goal + goalProgress() en el tiempo

Detección

El progreso no cambió en 3 semanas pese a seguir activo

Interpretación

"Tu objetivo 'Viaje a Bariloche' no avanzó en 3 semanas."

Acción

Revisar si algún hábito/tarea/compromiso vinculado está fallando (reusa las reglas goal-linked existentes como "por qué")

#### Proyección de llegada tarde a la meta

Predicción

Datos

SavingsPlan + estimateMonths() ya existente + Goal.targetDate

Detección

Comparar estimateMonths() actual contra la fecha objetivo

Interpretación

"Al ritmo actual, vas a llegar a tu meta de ahorro 2 meses después de la fecha que pusiste."

Acción

Aumentar el aporte mensual en $X para llegar a tiempo (cálculo inverso de la fórmula ya existente)

#### Objetivo sin ningún soporte

Hecho estructural

Datos

Goal.habitIds/taskIds/financialCommitmentIds

Detección

Objetivo activo sin ningún enlace

Interpretación

"Tu objetivo 'Aprender inglés' no tiene ningún hábito ni tarea vinculada."

Acción

Vincular al menos un hábito o tarea — un insight "sobre cómo estás usando VIDA", no sobre tu vida

### Cross-domain

#### Sueño → delivery

Hipótesis

Datos

SleepEntry + MoneyEntry (delivery)

Detección

Gasto en delivery los días posteriores a sueño bajo vs. sueño normal

Interpretación

"El menor descanso podría estar asociado con el aumento del delivery."

Acción

Preparar comida con anticipación los días que se sabe que se durmió poco

#### Sueño → hábitos, aplicado

Patrón

Datos

SleepEntry + Habit

Detección

Tasa de cumplimiento el día después de dormir \<6:30h vs. bien

Interpretación

Mismo umbral que la regla de sueño↔entrenamiento ya construida, aplicado a hábitos.

Acción

Ninguna prescriptiva — solo consciencia

#### Ánimo → entrenamiento

Hipótesis

Datos

MoodEntry + WorkoutEntry

Detección

Tasa de entrenamiento en días de ánimo bajo vs. alto

Interpretación

Marcada como Hipótesis, no Patrón — el N típico personal es demasiado bajo para más.

Acción

Ninguna — solo reflejo

#### Vencimientos grandes → sueño/ánimo

Hipótesis de baja confianza — ejemplo de qué NO mostrar como Patrón

Datos

FinancialCommitment (vencimientos) + MoodEntry/SleepEntry cercanos

Detección

Ánimo/sueño peor cerca de un vencimiento grande

Interpretación

Riesgo de interpretación alto — correlación espuria muy fácil con N bajo. Deliberadamente incluido como ejemplo de qué mantener como posibilidad tentativa, nunca como afirmación.

Acción

Ninguna — solo mostrar si el usuario pide explícitamente "explorar hipótesis"

#### Entrenamiento + déficit combinados vs. peso

Patrón, tres dominios

Datos

WeightEntry + WorkoutEntry + MealEntry

Detección

Semanas con más volumen de entrenamiento Y déficit sostenido vs. semanas sin ambos

Interpretación

Solo si el N alcanza — de lo contrario, degradar a Hipótesis

Acción

Ninguna prescriptiva médica

07

## ¿Reglas, estadística, ML o LLM?

No uso IA porque quede más moderno. Regla general: si algo se resuelve mejor con aritmética verificable, se queda en Kotlin/TypeScript.

Reglas determinísticas

La columna vertebral, hoy y a futuro. Vencimientos, comparaciones semana-a-semana, rachas, umbrales de presupuesto. Es lo más barato, más explicable, y lo único que hoy tiene 86 tests reales encima. No reemplazar — extender.

Estadística simple

Promedios, desvío, umbrales relativos a la línea base histórica de *cada* usuario, en vez del número fijo actual (ej. "menos de 6.5h" igual para todos). Sigue siendo determinístico y explicable — es la mejora de fondo más valiosa antes de tocar ML o LLM.

Correlaciones (Pearson/Spearman)

Para las conexiones de la sección 05 — reemplaza la comparación binaria de buckets de `sleepWorkoutCorrelationPattern` por un coeficiente real, con su propio umbral de significancia. Aritmética simple, sin librería de ML.

Series temporales (tendencia lineal)

Para predicciones — `estimateMonths()` ya es, sin llamarse así, una simulación simple. Extenderlo a regresión lineal sobre `WeightEntry` en vez de comparar solo dos puntos es el siguiente paso natural, todavía sin ML.

Machine learning

**No, todavía no.** El dataset de un usuario individual son semanas o meses de datos, no miles de muestras — un modelo entrenado no le va a ganar a una regla estadística bien calibrada a ese volumen. Sería justificable recién con muchos usuarios, para aprender mejores valores default de umbrales poblacionales — no para los insights personales en sí. Usarlo hoy sería sobre-ingeniería.

LLM (Gemini)

Para exactamente dos cosas: traducir hechos/patrones ya calculados a lenguaje natural más rico que un template fijo, y proponer *hipótesis* explícitamente etiquetadas como tales al conectar patrones que el código no cruza directamente. Nunca calcula un número — eso lo hace mejor y de forma verificable el código (detalle completo en §11).

08

## Sistema de confianza

Una escala de confianza de un solo eje colapsa dos cosas distintas: "¿esto es verdad?" y "¿cuánta evidencia lo respalda?". Un Hecho es 100% cierto por definición — no tiene sentido ponerle un semáforo. Propongo separar el **tipo** (sección 04) de la **fuerza de la evidencia**, y que la fuerza se calcule de factores concretos que el código ya puede medir: N de muestras, tamaño del efecto, consistencia entre ventanas de tiempo, y variables de confusión conocidas sin controlar.

Confirmado repetidamente

Hechos (siempre) y Patrones con N alto y efecto grande, sostenidos en ≥2 ventanas de tiempo distintas. Lenguaje: afirmación directa.

Patrón emergente

N mínimo alcanzado pero observado en una sola ventana, o efecto moderado. Lenguaje: "en las últimas semanas, parece que...".

Hipótesis a validar

Relación plausible con N insuficiente, confusión conocida sin controlar, o sugerida por Gemini sin verificación numérica propia. Lenguaje obligatoriamente condicional.

Dato insuficiente

Ni siquiera alcanza el umbral mínimo para evaluar. Mejora real sobre hoy: decirlo explícitamente en vez de simplemente no mostrar nada.

Proyección

No es un nivel de confianza — es un tipo aparte (Predicción, §04). Siempre lleva su supuesto explícito ("si mantenés este ritmo..."), independiente de qué tan fuerte sea el patrón en que se basa.

Esto evita exactamente lo que pediste evitar: que una correlación se presente con el mismo peso que una verdad causal. El nivel no es un adorno visual — determina literalmente qué palabras puede usar el texto generado.

09

## Sistema de prioridad

No todo lo detectado merece molestar al usuario. Hoy el corte a 5 es `.take(5)` sobre el orden del código — acá propongo un score explícito y transparente, no una caja negra.

score = (severidad × w1) + (confianza × w2) + (impacto_objetivo × w3) + (novedad × w4) − (fatiga × w5)

severidad

0-3, derivada de los propios umbrales de cada regla (ej. compromiso vencido = urgente, vence en 3 días = importante)

confianza

Viene directo de la sección 08, numérica 0-1

impacto_objetivo

¿Está vinculado a un Goal activo? Generaliza el criterio que `personalPatterns()` ya aplica hoy al ordenar los goal-linked primero — de un orden fijo a un score

novedad

¿Es la primera vez que se detecta esta combinación insight+entidad, o ya se mostró? Requiere memoria — hoy `personalPatterns()` es 100% stateless

fatiga

Cuántas veces se mostró un insight del mismo tipo/entidad en los últimos N días — penaliza la repetición

### Dos compuertas distintas, no una

**Compuerta pasiva** (tarjeta de Inicio): umbral bajo — cualquier insight con score positivo puede aparecer, ordenado de mayor a menor, cortado a 5.

**Compuerta activa** (notificación push): umbral mucho más alto — *solo* si `score ≥ X`, `accionable = true`, y no se mostró en los últimos N días. La "posibilidad de acción" no suma al score: es un filtro binario aparte, porque un insight sin ninguna acción posible puede vivir tranquilo en el dashboard pero nunca debería justificar interrumpir al usuario con una notificación.

10

## De insight a acción

Tres ejemplos completos, construidos sobre fórmulas que ya existen en el código — no hay nada acá que requiera inventar matemática nueva.

Observación

Tu gasto en delivery aumentó 31% esta semana.

Contexto

Coincidió con 4 de 7 noches con menos de 6:30h de sueño (Patrón, confianza media).

Impacto

Tu aporte real a "Viaje a Bariloche" cayó $42.000 esta semana frente a tu plan.

Opciones

- Preparar comida para 3 días
- Establecer un límite semanal de delivery
- No hacer nada

Impacto estimado

Ahorrar $30.000/semana adelantaría tu meta \~2 semanas (mismo cálculo que ya hace `estimateMonths()`, corrido con el aporte mensual ajustado).

Observación

Tu hábito "Entrenar" bajó de 6/7 a 3/7 días esta quincena.

Contexto

Está vinculado a tu objetivo "Bajar de peso", que vence en 5 semanas (goalLinkedHabitPatterns, ya existente).

Impacto

Al ritmo actual de avance, no vas a llegar al peso objetivo antes de la fecha (goalProgress "weight", proyectado).

Opciones

- Reprogramar el recordatorio del hábito
- Mover la fecha objetivo
- No hacer nada

Impacto estimado

Volver a 6/7 días te devuelve a la trayectoria original según la misma fórmula de `goalProgress()`.

Observación

Este mes tenés $340.000 comprometido en pagos fijos.

Contexto

Tu aporte planeado a metas de ahorro es $50.000 (Hecho, aritmética directa sobre FinancialCommitment + SavingsPlan).

Impacto

Los compromisos representan 87% de lo que destinás a obligaciones + ahorro combinados este mes.

Opciones

- Revisar si algún compromiso puede pausarse o renegociarse
- Ajustar el aporte de ahorro a algo sostenible
- No hacer nada

Impacto estimado

No aplica un número único — se muestra el nuevo estimateMonths() bajo cada opción que el usuario considere.

El patrón común: "Opciones" siempre incluye "No hacer nada" de forma explícita, y "Impacto estimado" siempre reusa una fórmula que ya existe en `Utils.kt` — este módulo no inventa proyecciones nuevas, solo las corre con los parámetros de cada opción.

11

## El papel de Gemini

Calcula VIDA (cliente)

Todos los hechos y patrones basados en umbrales/estadística/correlación — todo lo de `PersonalPatterns.kt` hoy más las extensiones de §07. Cualquier cosa aritméticamente verificable vive en Kotlin/TypeScript, nunca se le pide a Gemini que "calcule" un promedio o un porcentaje.

Calcula el backend

Nada de estadística nueva. Su único rol es orquestar la llamada a Gemini protegiendo la API key (ya lo hace bien) y, eventualmente, agregaciones más baratas en SQL que traer todo el dataset al cliente — optimización, no inteligencia.

Hace un modelo tradicional

La capa de detección y confianza de §07-08 — vive client-side, consistente con el diseño offline-first actual.

Interpreta Gemini

Dado un conjunto YA calculado de hechos/patrones con su confianza y números de soporte: (1) los redacta en lenguaje natural más variado que templates fijos, (2) propone Hipótesis adicionales etiquetadas como tales al conectar patrones que el código no cruza directamente, (3) sugiere 2-3 opciones de acción para un insight ya confirmado. Nunca inventa el patrón en sí.

Información que recibe

Los mismos `DailyPoint` numéricos/categóricos de hoy (`WeeklySummary`), extendidos a los dominios hoy ausentes del payload (pasos, agua, ritmo cardíaco — siempre como números), más los patrones YA detectados localmente con su score de confianza, para interpretar sobre una base validada en vez de inventar desde cero.

Información que NO recibe

Título/descripción de gastos en texto libre, nombres de hábitos, contenido de notas — igual que hoy. `WeeklySummary.kt` ya es cuidadoso con esto; mantenerlo tal cual.

Evitar alucinaciones

(1) el prompt solo puede hablar de relaciones entre las columnas que recibió — nunca inventar un dato ausente (ya lo intenta hoy con "nunca inventes una relación que los números no muestren"; reforzarlo); (2) mantener el `response_schema` estructurado que ya se usa; (3) exigir que cada insight de Gemini cite qué columnas/fechas específicas lo soportan, para poder validarlo después.

Validar las respuestas

La pieza que **hoy no existe** y es la más importante de esta sección: un paso de post-procesamiento que re-calcule mecánicamente la afirmación que Gemini generó contra los datos reales, y degrade a confianza baja (u oculte) cualquier insight que no se pueda verificar. Hoy el texto de Gemini se muestra tal cual, sin ningún chequeo — es el hueco de seguridad conceptual más grande de este diseño.

12

## MVP realista — VIDA Intelligence v1

Reutiliza casi toda la infraestructura existente. No requiere reconstruir nada.

Funcionalidades

- `PersonalPatterns` devuelve `Insight` estructurado (kind, confidence, domains, score) en vez de `String` — las 10 reglas no cambian su lógica interna
- Scoring de §09 reemplaza el `.take(5)` fijo
- 2-3 reglas nuevas y baratas: ánimo↔sueño, presupuesto vs. ritmo de gasto, día de semana débil para hábitos — elegidas por no requerir ninguna tabla nueva
- Historial mínimo de qué se mostró, para novedad/fatiga
- **NO** tocar la arquitectura de Gemini todavía — `generate-insights` queda igual en v1

Tablas nuevas

- Solo una: `shown_insights` (id, insightKey, domain, shownAt, dismissedAt?, user_id, updatedAt, deletedAt)
- Mismo patrón de tombstone que las otras 24 tablas — mínimo esfuerzo de infraestructura

Clases / módulos nuevos

- `Insight` (data class: kind, confidence, domains, score, supportingData, message)
- `InsightDetector` (interfaz común; cada regla actual se envuelve, no se reescribe)
- `InsightScorer` (fórmula de §09)
- `InsightHistory` (lee/escribe `shown_insights`)

Cambios en Supabase

- La tabla nueva + su entrada en `schema_tombstones.sql`
- Opcional: en `schema_realtime.sql`, si se quiere sincronizar entre dispositivos qué ya se mostró

Cambios en Android

- `PersonalPatterns.kt` pasa a un paquete `intelligence/` con los detectores extraídos
- `VidaApp.kt`/`HomeScreen.kt` consumen `List<Insight>` en vez de `List<String>` — cambio de tipo, no de arquitectura de navegación

Cambios en Web

- Mismo cambio de forma en `personalPatterns.ts`
- Buen momento para generar un tipo compartido, dado que ya es un "puerto 1:1" mantenido a mano

APIs necesarias

- Ninguna nueva en v1 — todo corre client-side, igual que hoy

Tests a agregar

- Scoring: dado un set de insights candidatos con confidence/severidad/novedad conocidos, verificar el orden resultante
- Historial: no repetir un insight dentro de la ventana de fatiga
- Portar los mismos casos a Vitest en la web, siguiendo el patrón ya usado con `personalPatterns.test.ts`

13

## Roadmap

V1

#### Intelligence básica

- Insight estructurado (kind, confidence, score)
- Scoring de prioridad reemplaza el truncado fijo
- 2-3 reglas nuevas con datos ya existentes
- Tabla `shown_insights` para novedad/fatiga
- Gemini queda como está

V2

#### Intelligence contextual

- Conectar más dominios: medidas corporales, presupuesto por categoría
- Extender `WeeklySummary` a pasos/agua/ritmo cardíaco
- Conectar Gemini al nuevo formato de Insight para interpretación enriquecida
- Agregar el paso de validación mecánica de §11 — la pieza de seguridad que hoy falta

V3

#### Predictive VIDA

- Regresión lineal real sobre tendencias (peso, ahorro, gasto)
- Simulaciones "qué pasaría si" generalizadas más allá de SavingsPlan (incluye Deudas, de la auditoría anterior)
- Correlaciones con coeficiente real en vez de comparación de buckets

V4

#### Personal Decision System

- Módulo de insight→acción (§10) sistematizado para cualquier insight accionable, no solo ejemplos sueltos
- Notificaciones proactivas con la compuerta activa de §09 ya filtrando bien
- Feedback loop real: marcar un insight "útil / no útil" y que ajuste los pesos del scoring — la única pieza de todo el roadmap que se acerca a "aprendizaje", y aun así sin ML pesado

14

## La pregunta más importante

¿Esto hace a VIDA significativamente mejor, o es complejidad innecesaria?

Depende de dónde se corte. **V1 y V2 son claramente lo primero** — reutilizan el 90% de lo que ya existe (las 10 reglas, el patrón de sync por tombstones, la Edge Function de Gemini), y el cambio real es de forma (String → Insight estructurado) más una tabla nueva mínima. El riesgo técnico es bajo y el beneficio es directo: es literalmente lo que separa "te muestro datos" de "te digo qué significan", que es la tesis del pedido.

**V3 es razonable pero no urgente.** Extiende matemática que ya existe (estimateMonths, comparación de dos puntos → regresión) sin agregar una capa tecnológica nueva.

**V4 es donde hay que tener cuidado.** No por la tecnología — el feedback loop no necesita ML pesado — sino porque es donde más fácil es que VIDA se sienta como una app llena de "quizás" en vez de una fuente confiable. El sistema de confianza y prioridad (§08-09) no es un detalle de UX secundario acá: es lo que decide si el resultado final se siente como un analista serio o como un generador de correlaciones espurias. Machine learning tradicional, en cualquier versión de este roadmap, no está justificado — el volumen de datos de una sola persona nunca lo va a necesitar.

Si fuera tu proyecto, ¿qué construirías en los próximos 6 meses?

- Mes 1-2V1 completo: Insight estructurado, scoring, tabla `shown_insights`, y las 3 reglas nuevas más baratas (ánimo↔sueño, presupuesto vs. ritmo de gasto, día de semana débil). Se lanza primero en Android, se porta a web después — mismo orden que ya siguió el resto del proyecto.
- Mes 3El sistema de confianza y prioridad visible en la UI (distinguir Hecho/Patrón/Hipótesis de verdad, no solo en el diseño). En paralelo, el puente a notificación proactiva de la auditoría anterior — reusa `ReminderScheduler` con la compuerta activa de §09 como filtro, para que no se convierta en spam desde el primer día.
- Mes 4`goalId` en `MoneyEntry` (cierra la brecha de causalidad real, identificada en la auditoría anterior y otra vez acá). Extender `WeeklySummary` a pasos/agua/ánimo con cuidado. Conectar Gemini al nuevo formato de Insight, con el paso de validación mecánica de §11 — sin este paso, no vale la pena avanzar más con Gemini.
- Mes 5-6Una sola extensión predictiva real (tendencia lineal sobre peso o ahorro) y el módulo de insight→acción para Finanzas y Objetivos únicamente — no los seis dominios a la vez. Frenar ahí, mirar si vos mismo, usándolo, actuás sobre las recomendaciones, antes de construir el feedback loop completo de V4.

Ninguna semana de este plan requiere ML entrenado, un backend nuevo, o tocar la arquitectura de sync. La apuesta completa es: la inteligencia real de VIDA está en conectar mejor lo que ya sabe, no en agregar una fuente de datos más.

vida intelligence — diseño técnico y conceptual, sin código implementado