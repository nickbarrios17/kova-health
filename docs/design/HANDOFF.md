# Kova Health · Nocturno Vital · Handoff de implementación

Versión final del sistema visual. Destino: repositorio `nickbarrios17/kova-health`, rama `develop` (incluye Ciclismo).
Archivos de este paquete: `HANDOFF.md` (este documento) y `tokens.json` (fuente única de tokens).
Referencia visual: lienzo «Kova Health — Auditoría y dirección visual», páginas **Nocturno Vital v2** (pantallas) y **Handoff final**; catálogo visual de componentes en **Rediseño v1 · B**.

> Si una maqueta y este documento difieren, manda este documento.
> Todas las cifras, nombres y fechas de las maquetas son **datos de ejemplo**. Nunca se copian al código.

---

## 0. Reglas que no se negocian

1. No renombrar variables CSS, claves de `theme.ts`, constantes Kotlin, claves de almacenamiento (`kova:*`), paquetes (`@kova/*`, `com.kovahealth.*`), tablas, RPC ni rutas. Solo se **agregan** tokens y alias.
2. No crear endpoints, tablas, cálculos ni funciones. Lo que no existe en el backend se muestra con su estado vacío (p. ej. **Preparación** → «Aún sin calcular»).
3. No mostrar en la app ninguna nota de especificación del lienzo (títulos de tablero, numeraciones, tablas, notas naranjas, medidas).
4. Sin degradados decorativos, glow ni neón. La geometría de la K (Cinta Vital) no se toca.
5. 3D solo en Ciclismo, técnica de ejercicios y anatomía.
6. Todos los textos en **voseo rioplatense** (§12).
7. `#9184D9` nunca como texto sobre `#2C2F3F`; `#5D5294` nunca como color de texto.
8. Todo estado se comunica con **color + glifo + palabra**.

---

## 1. Arquitectura que se respeta

| Plataforma | Ubicación | Stack | Tema actual |
|---|---|---|---|
| Web | `apps/web` | Next.js 15, React 19, Phosphor web | `app/nocturne.css` + `app/kova.css` |
| Web en celular | `/m` (build web de `apps/mobile`) | react-native-web | `apps/mobile/src/theme.ts` |
| Móvil | `apps/mobile` | Expo 58, RN 0.88, phosphor-react-native, Inter de @expo-google-fonts | `src/theme.ts` + kit `src/ui.tsx` |
| Wear OS | `apps/watch` | Kotlin, Compose for Wear OS Material 3 | constantes en `MainActivity.kt`, `res/values/colors.xml` |
| Datos | `packages/api-client`, `packages/domain`, `supabase/` | supabase-js, Zod | — |

Debajo de 768 px la web redirige a `/m` (`app/layout.tsx`). No se diseña una cuarta versión.

---

## 2. Design System (tokens)

Fuente: `tokens.json`. Resumen:

### 2.1 Color
| Rol | Valor | CSS | RN (`c.`) | Kotlin |
|---|---|---|---|---|
| bg | #161826 | `--color-bg` | `bg` | — |
| surface | #232532 | `--color-surface` | `surface` | — |
| surface-raised *(nuevo)* | #2C2F3F | `--kova-surface-raised` | `raised` | — |
| nav-bg *(nuevo)* | #1C1E2C | `--kova-nav-bg` | `navBg` | — |
| watch-bg | #000000 | — | — | `Bg` |
| watch-surface | #292B31 | `--color-neutral-900` | `n900` | `Surface` |
| text | #E9E9ED | `--color-text` | `text` | `TextC` |
| text-2 | #B2B6CA | `--color-neutral-400` | `n400` | `N400` |
| text-3 (mínimo para texto) | #9397AB | `--color-neutral-500` | `n500` | `N500` |
| accent | #9184D9 | `--color-accent` | `accent` | `Accent` |
| accent-text | #B5ABFC | `--color-accent-400` | `a400` *(nuevo)* | `Accent400` *(nuevo)* |
| accent-strong | #5D5294 | `--color-accent-700` | `a700` | `Accent700` *(nuevo)* |
| accent-strong-hover / pressed | #6B60A8 / #4E457E | `--kova-accent-strong-*` | `a700Hover` / `a700Pressed` | — / `Accent700Pressed` |
| accent-soft / texto | #2A2843 / #D2CEFD | `--kova-accent-soft` / `--color-accent-300` | `accentSoftSolid` / `a300` | — / `Accent300` |
| accent-track *(nuevo)* | #3A3466 | `--kova-accent-track` | `track` | `Track` |
| ok / warn / crit | #6FD6A3 / #EFC173 / #F08A78 | `--kova-ok/warn/crit` (pasar de oklch a hex) | `ok/warn/crit` | `Ok/Warn/Crit` *(Crit nuevo)* |
| ok-soft / warn-soft / crit-soft | #1D3A2E / #3A3020 / #3D2522 | `--kova-*-soft` | `okSoft/warnSoft/critSoft` | — |
| chart-muted / chart-empty | #6B6F84 / #3A3D4C | `--kova-chart-*` | `chartMuted/chartEmpty` | — |
| border-subtle / border / border-strong | rgba(233,233,237,.08 / .16 / .24) | — / `--color-divider` / — | — / `divider` / — | — / `Divider` / — |

Contrastes verificados (WCAG 2.2): text 14,5 / 12,6 / 10,9 : 1 sobre bg / surface / raised; text-3 ≥ 4,6 : 1; accent-text ≥ 6,4 : 1; blanco sobre accent-strong 6,8 : 1 (hover 5,4 : 1); chart-muted 3,1 : 1 sobre surface.

### 2.2 Tipografía (Inter 400/500/600, cifras tabulares)
| Token | Web px | Móvil dp | Reloj sp | Peso | Interlínea | Uso |
|---|---|---|---|---|---|---|
| display | 44 | 36 | 56 | 600 | 1.0 | cifra héroe, temporizador |
| title-1 | 34 | 26 | — | 600 | 1.15 | saludo |
| metric | 30 | 24 | 48 | 600 | 1.1 | valor de métrica |
| title-2 | 20 | 17 | 16 | 600 | 1.2 | sección |
| title-3 | 17 | 17 | 15 | 600 | 1.3 | tarjeta |
| body | 15 | 15 | 14 | 400 | 1.55 | texto |
| label | 13 | 13 | 13 | 500 | 1.4 | etiquetas (sin mayúsculas) |
| caption | 12 | 12 | 12 | 400 | 1.4 | mínimo de texto |
| axis | 11 | 11 | — | 500 | 1.2 | solo ejes |

Web: alojar Inter localmente (woff2) y quitar el `@import` de Google de `nocturne.css`. Cifras: `font-variant-numeric: tabular-nums` · RN `fontVariant: ['tabular-nums']` · Compose `fontFeatureSettings = "tnum"`. Agregar `Inter_700Bold` no es necesario.

### 2.3 Espacio, radios, tamaños, elevación
- Espacio (px/dp): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Los `--space-*` de 2,8 px quedan como alias sin uso nuevo.
- Radios: 6 (insignias) · 10–12 (botones, inputs, nav) · 16 (tarjetas compactas, banners) · 20–24 (tarjetas principales, hojas) · 999 (chips, botones del reloj).
- Toques: web ≥ 40 px (44 críticos) · móvil ≥ 48 dp (52 acción principal) · reloj ≥ 48 dp (52–56 acción). 8 px entre toques.
- Elevación: 0 bg · 1 surface · 2 raised + border-subtle · 3 raised + border + `0 16px 40px rgba(0,0,0,.45)` (solo diálogos y avisos).
- Foco: outline 2 px `accent-text`, offset 3 px.
- Capas: sticky 10 (barra de sesión) · overlay 40 (scrim `rgba(10,11,18,.7)`) · toast 50.

---

## 3. Catálogo de componentes y estados

Estados estándar: **normal · hover (web) · presionado · foco · deshabilitado · cargando · seleccionado · error**. Referencia visual: Rediseño v1 · B.

| Componente | Anatomía | Estados y valores | Web | Móvil (`ui.tsx`) | Reloj |
|---|---|---|---|---|---|
| Botón primario | texto 600 blanco sobre accent-strong | hover #6B60A8 · presionado #4E457E · foco anillo · deshabilitado fondo #2C2F3F texto #9397AB (sin opacidad) · cargando spinner 16 + texto, mismo ancho | 40–44 px, radio 10–12 | 52 dp ancho completo, radio 14 | 52 dp píldora 150–156 dp |
| Botón secundario | borde border-strong, texto text 500 | hover fondo rgba(233,233,237,.06) · presionado .12 · deshabilitado borde .12 texto #9397AB | 40–44 | 48 | relleno #292B31, 44–48 |
| Botón texto | texto accent-text | hover fondo rgba(181,171,252,.10) texto #D2CEFD · presionado .18 | ✓ | ✓ | no se usa |
| Botón destructivo | borde y texto crit | hover fondo rgba(240,138,120,.10) | ✓ | ✓ | texto crit sin borde |
| Botón ícono | 44 × 44, radio 12, fondo raised | `aria-label` / `accessibilityLabel` / `contentDescription` obligatorio | ✓ | ✓ | 48 dp |
| Input | etiqueta 13/500 text-2 visible + campo 48 alto, fondo bg, borde border | foco borde accent + halo rgba(181,171,252,.35) · error borde crit + mensaje 13 crit con ✕ y `aria-describedby` · deshabilitado texto #75798C | ✓ | fuente 16 (evita zoom iOS) | — |
| Stepper de carga | − cifra + | botones 44–52 raised; cifra metric; saltos 2,5 kg / 5 lb | — | ✓ | 48 dp, fondo #292B31 |
| Selector segmentado | contenedor bg, opción activa raised + border + 600 | `role=radiogroup`, flechas cambian opción | 36 alto | 40 | — |
| Chip / filtro | píldora 32–36 | seleccionado: accent-soft + texto #D2CEFD + «✓» · deshabilitado borde .08 texto #75798C | ✓ | ✓ | — |
| Tarjeta de métrica | nombre 13/500 · período 13 text-3 · cifra metric · unidad text-2 · barra 6 o mini barras · comparación 12–13 | normal · cumplido (barra ok + «✓ Objetivo cumplido») · atención (barra warn + «△ …») · vacío (valor «Sin datos»/«Sin registrar» text-2 + acción accent-text) · cargando (esqueleto) | grilla, radio 20, padding 20 | 2 columnas, radio 18, padding 14 | una cifra por pantalla |
| Tarjeta de insight | insignia kind · dominios 12 text-3 · título body-strong · (web) «Útil» / «No útil» | después del feedback: «Gracias, lo tendremos en cuenta.» | panel derecho de Hoy y página Coach | 1 en Hoy | no se muestra |
| Insignia de confianza | píldora 24–28 | Hecho ● accent-soft/#D2CEFD · Patrón ◐ borde accent-text · Hipótesis ○ borde .32 text-2 · Proyección ⇢ borde .32 text-2 | ✓ | ✓ | — |
| Anillo de preparación | anillo trazo ≈ 11 % del diámetro | **único estado implementable:** punteado `chart-empty` (dash 4/10) + «—» + «Aún sin calcular» | 112 px | 64 dp | no se muestra |
| Anillo / barra de descanso | pista accent-track, progreso accent, extremos redondos | se actualiza cada 1 s | — | barra 6 dp | anillo 10 dp en el borde |
| Fila de serie | Serie · Anterior · kg · Reps · check 44 | actual: raised + borde 1,5 accent · hecha: check relleno accent-strong + ✓ · pendiente de envío: anillo 2 px warn + «↑ guardada aquí» · deshacer: tocar el check de la última | — | ✓ | — |
| Selector de ejercicios | chips en fila con scroll | completado «✓ nombre» · actual accent-soft | — | ✓ | — |
| Chip de estado de sync | 32 alto, glifo de color + texto text | ✓ Al día · ↑ N pendientes · ⌁ Sin conexión · ◌ Enviando · ✕ N errores | pie de barra lateral | cabecera de Hoy y sesión | etiqueta 12 sp al pie |
| Banner | radio 14, fondo *-soft + borde 1 px del color al 32 % | info ⌁ neutro (raised) · error ✕ con acción «Ver» | ✓ | ✓ | pantalla breve |
| Aviso breve (toast) | raised + elevación 3 | 3 s, `aria-live="polite"` | abajo a la derecha | abajo, sobre la barra | — |
| Diálogo / hoja | raised, radio 20 (web) / 24 superior (hoja móvil), scrim | título 18–19/600 · texto 14 text-2 · primario + secundario | centrado ≤ 540 px | hoja inferior | pantalla completa |
| Estado vacío | ícono línea 32–48 text-3 · título 16–18/600 · frase · ≤ 1 acción | — | ✓ | ✓ | texto 12 sp centrado |
| Esqueleto | bloques #2C2F3F con radios de su componente | opacidad 1 ↔ .6, 1,2 s; estático con movimiento reducido | ✓ | ✓ | — |
| Navegación | ver §5 | — | barra lateral | barra inferior + barra de sesión | lineal |

---

## 4. Especificación de pantallas

Para cada pantalla: fuente de datos (existente), estructura y estados. Las pantallas no listadas (Tendencias, Comida, Entrenamiento web, Coach, Coach y amigos, Reportes, Administración, Rutinas, Ejercicios, Progreso, Métricas, Personas, Ajustes) se rediseñan **solo con tokens y componentes** de §2–§3, sin cambiar su estructura funcional ni su contenido.

### 4.1 Web · Hoy (`app/(app)/page.tsx`) — tablero v2 · 2
- Contenedor: padding 32 vertical / `clamp(16px,3vw,48px)` lateral; contenido máx. 1180 px; secciones a 40 px.
- Encabezado: fecha 14 text-2 · «Buenas tardes, {nombre}» title-1 (sin nombre: «Buenas tardes») · chip de sync · botón ícono «Reportar un problema».
- Fila «Hoy» (flex-wrap, gap 16):
  - Tarjeta del día (flex 3 1 560 px, surface, radio 24, padding 28): **Preparación** vacía + chips de acceso «Sueño · {valor}», «HRV · {valor}» (con △ si está fuera de rango), «FC reposo · {valor}» que llevan a Progreso de hoy · separador 1 px · **Plan de hoy** (nombre title, ejercicios con «series × reps · carga», «N ejercicios · ~X min · empieza en el móvil o el reloj») · primario «Ver rutina» + texto «Editar».
  - Sin rutina: «Hoy no tenés una rutina programada.» + primario «Ver rutinas».
  - «Kova Health ve hoy» (flex 2 1 360 px): hasta 4 tarjetas de insight de `insights.today()` + enlace «Todo el Coach». Sin insights: estado vacío «Nada por ahora».
- «Progreso de hoy»: grilla `auto-fill minmax(300px,1fr)`, 6 tarjetas: Comida, Pasos, Sueño, Corazón, Cuerpo, Ánimo, con mini barras de 7 días (7 × 8 px, gap 4, alto máx. 36; hoy accent o color de estado; sin dato: 2 px #2C2F3F). Leyenda: «Barras: últimos 7 días. Los días sin datos aparecen vacíos.»
- «La semana en números»: tabla en caja con `overflow-x:auto`, min 860 px; fuera de objetivo = «△ valor» warn 600; sin dato «—»; columna Hoy en 700.
- Datos: `summaries.daily()`, `energy.today()`, `nutrition.day()`, `routines.list()`, `insights.today()`, `devices.list()`.
- Accesibilidad: enlace «Saltar al contenido» (visible al foco), landmarks, `aria-current`.

### 4.2 Web · Ciclismo (`app/(app)/ciclismo/page.tsx`, develop) — tablero v2 · 7
- Panel izquierdo 340 px: título · segmentado «Por tiempo / A → B / Guardadas» · «¿Cuánto querés andar?» chips 30 min…2 h · origen («Salís de tu ubicación» / «Salís del punto marcado») · «Encontramos N recorridos» · tarjeta de ruta (seleccionada con borde 1,5 accent): «Opción N · Vuelta de X», distancia y subida, barra de composición (bicisenda ok · calles accent · avenidas warn · sendero text-2) con leyenda en texto, parques, avisos «△ X km por zonas con muchos robos» · primario «Guardar ruta» + secundario «Recorrer en 3D».
- Mapa: estilo claro existente, radio 20; controles 44 × 44 sobre surface (3D, zonas, ubicación) con `aria-label`; leyenda de zonas con «Promedios, no una garantía».
- La web no navega.

### 4.3 Móvil · Hoy (`src/screens/Hoy.tsx`) — tableros v2 · 4a y 4b
- Encabezado: fecha 13 text-2 · «Hola, {nombre}» 26/600 · chip de sync (se oculta 5 s después de «Al día») · botón 44 «Ajustes».
- Tarjeta del día (radio 24, padding 18): Preparación vacía (64 dp) con «Mientras tanto, mirá tu sueño y tu corazón abajo.» · Plan de hoy + «Ver rutina» · primario 52 «Empezar {rutina}».
- Si hay sesión en curso: el primario dice «Continuar {rutina}» y aparece la barra de sesión (§5.2).
- 1 insight (el de mayor score).
- Progreso de hoy: 2 columnas, 4 tarjetas (Comida, Pasos, Sueño, Corazón o Ánimo según datos).
- Sin datos (4b): «Hola», plan vacío + «Crear una rutina», tarjeta «Conectá Health Connect» + «Conectar», métricas con textos vacíos (§6).

### 4.4 Móvil · Entrenamiento activo (`src/screens/Session.tsx`) — tableros v2 · 5a y 5b
- Barra superior 64: «Minimizar» (chevron) · nombre + tiempo · texto «Terminar».
- Selector de ejercicios (chips) · cabecera de ejercicio: vista previa del maniquí 60 dp, «Ejercicio N de M · series × reps», nombre 22/600, «Ver técnica».
- Pausa: banner warn-soft «‖ Sesión en pausa» + «Continuar»; las filas no aceptan check.
- Tabla de series (§3). Al completar todas: banner ok «{ejercicio} completo · N series · volumen X kg».
- Secundario «Pausar sesión» / «Continuar sesión».
- Pie fijo (nav-bg): descanso (12 «Descanso», 34/600 temporizador, «+15 s» secundario, «Saltar» primario, barra 6 dp) **o** primario 56 «Serie N hecha» · «Sigue: {ejercicio} · series × reps».
- «Terminar» abre hoja «¿Guardar la sesión con N series?» · «Guardar» / «Seguir entrenando». Sin series: texto existente «No registraste ninguna serie. ¿Descartar la sesión?».
- Sin conexión (5b): banner neutro «⌁ Sin conexión · Podés seguir entrenando. Tus series se guardan acá y se envían al volver.» + chip «↑ N envíos pendientes»; filas encoladas con anillo warn.
- El móvil **no** muestra pulso en vivo.

### 4.5 Móvil · Ciclismo (`Ciclismo.tsx`, `Navegar.tsx`, develop) — tablero v2 · 7
- Entrenar → Ciclismo. Mapa 300 dp, radio 20, botón 3D · segmentado de 3 · tarjeta de ruta (km, subida, composición, aviso) · primario 52 «Navegar» + botón ícono «Guardar ruta».
- Navegar: mapa a pantalla completa; tarjeta superior surface radio 20 con flecha de maniobra (56 dp accent-strong), distancia 28/600, indicación 15 («Doblá a la derecha por …»), botón «Silenciar la voz»; aviso de zona warn-soft «△ Atención: zona con muchos robos»; hoja inferior con Falta · Tiempo · Llegada · Velocidad (20/600) y secundario «Terminar».

### 4.6 Wear OS (`MainActivity.kt`) — tablero v2 · 6
Flujo: Plan («Plan de hoy», nombre, «Empezar») → Serie (ejercicio 13 #D2CEFD, «Serie N de M», cifra 48 «kg × reps», «✓ Serie hecha», pie «♥ pulso · estado») → Ajustar («Ajustar carga y repeticiones», − / + 48 dp, «Listo») → Descanso (anillo, temporizador 56, «Sigue: kg × reps», «+15 s» y «Siguiente») → Ánimo («¿Cómo te sentís?», lista curva 1–5 con palabra) → «Sesión completada».
Estados: «‖ Sesión en pausa» + «Reanudar» / «Terminar sesión» · «↑ N envíos pendientes» (12 sp warn) · «⌁ Sin conexión» (chip contorno warn) · «✓ Sincronizado» 2 s + vibración · «Algo salió mal» + «Continuar» · «Sin rutina hoy · Creá una rutina en la web o en el móvil».
Implementación: extraer las constantes de color a un objeto de tema (`KovaWatchTheme`) con los nombres actuales; agregar `Crit`, `Track`, `Accent400`, `Accent700`, `Accent700Pressed`.

---

## 5. Navegación e interacciones

### 5.1 Web
- Barra lateral 248 px (nav-bg): K + «Kova Health» · Hoy · Tendencias · Comida · Entrenamiento · Ciclismo · Coach (contador de insights nuevos) · Coach y amigos — separador — Reportes · Administración (solo si `feedback.isAdmin()`) · pie: dispositivos con estado y «Versión para celular».
- Ítem: 40 alto, radio 10; activo raised + ícono accent relleno + 600 + `aria-current="page"`; hover rgba(233,233,237,.05); foco anillo.
- 1024–1279 px: colapsada a 72 px, botones 44, tooltip al foco y hover, `aria-label`.
- Tooltips de gráficos: hover y foco; flechas ← → recorren puntos.

### 5.2 Móvil
- 4 pestañas (`App.tsx`): Hoy · Entrenar · Comida · Progreso. Activa: píldora 56 × 30 accent-track, ícono relleno text, etiqueta 600, `accessibilityRole="tab"` + `selected`.
- Ciclismo dentro de Entrenar. Ajustes, Coach y Personas desde Hoy.
- Barra de sesión en curso (56 dp, raised + borde accent-text al 40 %) sobre las pestañas en toda pantalla con pestañas: «{rutina} · en curso», serie o «Descanso m:ss», «Volver».
- Atrás (Android): resumen → Entrenar · sesión → minimiza · otra pestaña → Hoy · Hoy → sale (existente).
- Gráficos: tocar una barra la selecciona y muestra su valor arriba.

### 5.3 Reloj
- Navegación lineal; deslizar a la derecha vuelve; la corona desplaza listas y ajusta la carga.

---

## 6. Estados: vacío, error, carga, desconexión y sincronización

### 6.1 Vacíos (texto final en voseo)
| Lugar | Título / texto | Acción |
|---|---|---|
| Hoy · plan | Hoy no tenés una rutina programada. | Ver rutinas / Crear una rutina |
| Preparación | Aún sin calcular · Kova todavía no calcula tu preparación. Mientras tanto, mirá cómo dormiste y tu corazón en Progreso de hoy. | — |
| Comida | Registrá tus comidas desde el móvil · (móvil) Agregalo en Comida | Agregar comida |
| Pasos | Conectá el reloj o el móvil para ver tus pasos · (móvil) Llegan del reloj o de Health Connect · Sin objetivo de pasos | Conectar |
| Sueño | Ponete el reloj esta noche | — |
| HRV | La HRV llega del reloj mientras dormís · Aún no hay noches suficientes para comparar | — |
| Peso | Pesate desde el móvil o conectá tu báscula · Una sola medición esta semana | — |
| Ánimo | Registralo desde el móvil o el reloj · (móvil) Tocá para registrarlo | Registrar |
| Coach | Nada por ahora | — |
| Ciclismo · Guardadas | Todavía no guardaste rutas · Planificá una en «Por tiempo» o «A → B» y tocá «Guardar ruta». | Por tiempo |
| Reloj | Sin rutina hoy · Creá una rutina en la web o en el móvil | — |

### 6.2 Errores
| Caso | Texto | Acciones |
|---|---|---|
| Carga de cuenta (todas) | No pudimos cargar tu cuenta · Revisá tu conexión a internet e intentalo de nuevo. | Reintentar · Cerrar sesión |
| Genérico móvil / reloj | Algo salió mal. | Reintentar / Continuar |
| Validación | mensaje bajo el campo, crit, con ✕ | — |
| Health Connect | No se pudo sincronizar. Revisá los permisos de Health Connect. | Abrir permisos |
| Ubicación (Ciclismo) | Sin permiso de ubicación. Tocá el mapa para marcar desde dónde salís. | — |
| Búsqueda (Ciclismo) | No encontramos ese lugar. | — |
| Gráfico | No pudimos cargar este gráfico | Reintentar |
Nunca mostrar texto técnico: los errores llegan como códigos (`KovaError`); el texto es del cliente.

### 6.3 Carga
Esqueletos con la forma del componente; nunca spinners de página completa salvo el arranque. Botones en carga conservan su ancho.

### 6.4 Sincronización (móvil y reloj; la web no tiene cola)
| Estado | Disparador | Web | Móvil | Reloj |
|---|---|---|---|---|
| ✓ Sincronizado | outbox vacía y último envío OK | dispositivo «✓ hace X» | chip «✓ Al día» (se oculta a los 5 s) | «Sincronizado» 12 sp text-3 |
| ↑ Pendiente | entradas `pending` | dispositivo «↑ N pendientes» | chip warn; toca → hoja de envíos | «N envíos pendientes» warn |
| ⌁ Sin conexión | sin red | banner «Sin conexión. La web necesita internet; tus datos están a salvo.» | banner neutro | chip contorno warn |
| ◌ Enviando | vaciado > 600 ms | — | chip accent (spinner estático con movimiento reducido) | igual que pendiente |
| ✓ Todo enviado | pasa de pendiente a vacío | — | aviso 3 s «Todo enviado · N series» | «✓ Sincronizado» verde 2 s + vibración |
| ✕ Error en un envío | entrada `failed` | — | banner crit «N serie no se pudo guardar: {motivo}» + «Ver»; hoja con «Descartar» | «Algo salió mal» + «Continuar» |
| Sesión en otro dispositivo | `ACTIVE_SESSION_EXISTS` | aviso en Hoy | diálogo «Ya tenés una sesión en curso» · «Continuar la del reloj» / «Abandonar la del reloj y seguir acá» | «Continuar» / «Volver» |
Los reintentos no se muestran. «Descartar» elimina la operación fallida de la outbox (no borra datos del servidor).

---

## 7. Responsive y accesibilidad

### 7.1 Web
| Ancho | Barra lateral | Tarjeta del día | Insights | Métricas | Tabla |
|---|---|---|---|---|---|
| ≥ 1440 | 248 | en fila con insights (3:2) | columna derecha | 3 col | completa |
| 1280–1439 | 248 | ancho completo, interior 2 col | debajo, 2 col | 3 col | completa |
| 1024–1279 | 72 | ancho completo, interior 2 col | debajo, 2 col | 2 col | scroll horizontal |
| 768–1023 | 72 | apilada | 1 col | 2 col | scroll horizontal |
| < 768 | redirige a `/m` | | | | |
Nunca scroll horizontal de página. Zoom 200 % ≈ regla de 768 px.

### 7.2 Móvil y reloj
Móvil: una columna, margen 16, verificado en 360 y 412 dp; texto del sistema hasta 200 % sin cortar cifras (bajan de línea). Reloj: pantallas redondas, contenido dentro del círculo inscrito; escala de fuente del sistema.

### 7.3 Criterios de aceptación
- Texto ≥ 4,5 : 1; gráficos e íconos informativos ≥ 3 : 1 (tabla §2.1).
- Toques mínimos §2.3; foco visible en todo control; orden de foco = orden visual.
- Web: «Saltar al contenido», landmarks, `aria-current`, `aria-live` en avisos, `role="timer"` en temporizadores (anuncio cada 30 s, no cada segundo).
- Móvil: `accessibilityRole/State/Label` en tabs, botones ícono y checks de serie («Marcar serie N como hecha» / «Serie N hecha. Tocá para deshacer»).
- Reloj: `contentDescription` en íconos y botones −/+.
- Gráficos: `role="img"` + `aria-label` con resumen, o tabla accesible.
- Movimiento reducido: §9.
- Color nunca única señal.

---

## 8. Assets e iconografía
| Asset | Ubicación | Regla |
|---|---|---|
| Símbolo Cinta Vital | `design/brand/kova-mark.svg` · `KovaMark.tsx` (web y móvil) | Geometría intacta; mínimo 20 px; sin efectos |
| Monocromo | `design/brand/kova-mark-mono*.svg` | Blanco sobre oscuro, #161826 sobre claro |
| Lockups | `design/brand/kova-lockup-*.svg` | Login web, documentos |
| Íconos de app | `apps/mobile/assets/*.png`, `apps/web/app/icon.svg` | Variante «prueba» ámbar existente |
| Ícono del reloj | `apps/watch/.../ic_launcher_foreground.xml` | El hueco usa watch-bg |
| Maniquí 3D | `apps/web/public/mannequin.js`, `MannequinView` | Técnica y anatomía únicamente |
| Mapa | `packages/domain/src/cyclingMap.ts` | Estilo claro existente; no recolorear |
| Imágenes de ejercicios | `exercises.media` | Sobre surface; quitar el fondo blanco de `.kova-frames` |
| Fuente | Inter woff2 local (web), @expo-google-fonts/inter (móvil) | 400/500/600 |

Iconografía Phosphor: regular 20 (web) / 22 (móvil) / 24 (reloj); `fill` solo en activo o seleccionado. Mapa: Hoy `squares-four` · Tendencias/Progreso `chart-line(-up)` · Comida `fork-knife` · Entrenar `barbell` · Ciclismo `bicycle` · Coach `lightbulb-filament` · Coach y amigos `users-three` · Reportes `flag` · Administración `shield` · Ajustes `gear`/`user-circle` · dispositivos `watch`/`device-mobile`/`desktop` · Sueño `moon` · Corazón `heart` · Pausa `pause`/`play` · Reintentar `arrow-clockwise`. Glifos de estado tipográficos: ✓ △ ✕ ↑ ⌁ ◌ ‖. Sin emojis.

---

## 9. Animaciones y transiciones
Duraciones: fast 120 · base 200 · slow 320 ms. Curvas: standard `cubic-bezier(0.2,0,0,1)`, exit `cubic-bezier(0.3,0,1,1)`.

| Elemento | Animación | Movimiento reducido |
|---|---|---|
| Hover / presionado | color 120 ms | igual |
| Tarjeta que aparece | opacidad + translateY 8→0, 200 ms | solo opacidad 120 ms |
| Hoja / diálogo | translateY 100 %→0 / scale .98→1, 200 ms (salida 160) | solo opacidad |
| Cambio de pestaña | opacidad 120 ms | sin animación |
| Check de serie | fondo + escala ✓ .6→1, 200 ms + háptico | sin escala; háptico sí |
| Serie → descanso | cruce de opacidad 200 ms (+ vibración en reloj) | cambio directo |
| Anillos y barras | de 0 al valor, 320 ms, una vez | aparecen con su valor |
| Temporizador de descanso | lineal en tiempo real | actualización por segundo sin interpolar |
| Esqueleto | opacidad 1 ↔ .6, 1,2 s | estático |
| Aviso breve | opacidad + translateY, 200 ms; visible 3 s | solo opacidad |
| Maniquí 3D | animación del ejercicio; pausa fuera de pantalla | pose fija + «Reproducir» |
| Recorrer en 3D | cámara sigue la ruta a la velocidad elegida | no arranca solo |
Detección: `prefers-reduced-motion` (web) · `AccessibilityInfo.isReduceMotionEnabled` (RN) · escala de animación del sistema (Wear).

---

## 10. Gráficos, métricas e insights

### 10.1 Gráficos
- Cada gráfico: título con período · cifra principal · referencia (objetivo punteado text-3 1,5 px, o banda de rango propio accent-track) · resumen accesible · fuente cuando viene de un dispositivo.
- Serie única accent; comparación chart-muted; hoy/punto activo = color + etiqueta 700.
- Líneas 3 px redondas; barras radio superior 6; ejes 11 px text-3; grilla horizontal rgba(233,233,237,.06); sin bordes.
- Tipos: barras diarias (pasos, sueño, comida) · línea + banda (HRV, FC en reposo) · línea + proyección punteada con supuesto escrito (peso) · puntos por día (ánimo 1–5) · barras semanales con semana en curso en contorno (volumen).
- Estados: cargando (esqueleto) · sin datos · datos insuficientes · un solo dato (punto sin línea) · error con «Reintentar».
- Período: web 7/28/90 días; móvil 7 días y 28 en la pantalla de métrica.

### 10.2 Métricas
| Métrica | Referencia | Atención cuando… |
|---|---|---|
| Pasos | objetivo de pasos | nunca |
| Sueño | objetivo de sueño | nunca ámbar; texto «↓ X min menos de lo que necesitás» |
| HRV | rango propio | fuera de rango: △ «−X % frente a tu base» |
| FC en reposo | media 7 días | fuera de rango: △ |
| Peso | objetivo si existe | nunca; ↗ ↘ neutros |
| Comida / proteína | `nutrition_goals` | ✓ al cumplir |
| Ánimo | escala 1–5 | nunca |
| Entrenamiento | sesiones planificadas | nunca; «3 de 4» sin juicio |

### 10.3 Insights (`packages/domain/src/insights.ts`)
- Solo los 6 detectores existentes: semana de entrenamiento (hecho), proteína frente al objetivo (hecho), sueño ↔ ánimo (patrón o hipótesis según evidencia), día más flojo de un hábito (patrón o hipótesis), tendencia de peso (proyección), datos de sueño faltantes (hecho).
- Insignia por `kind`: fact → ● Hecho · pattern → ◐ Patrón · hypothesis → ○ Hipótesis · prediction → ⇢ Proyección.
- Lenguaje (reglas del motor): los patrones nunca dicen «porque»; las proyecciones dicen su supuesto; las hipótesis son condicionales.
- Feedback (web): «Útil» / «No útil» → `insights.feedback(key, fecha, useful|not_useful)`; luego «Gracias, lo tendremos en cuenta.»

---

## 11. Diseño · comportamiento · backend

| Área | Diseño | Comportamiento (cliente) | Backend / fuente |
|---|---|---|---|
| Tokens, tipografía | §2 | — | no depende |
| Componentes | §3 | estados existentes en `ui.tsx` / `.btn` | no depende |
| Preparación | anillo vacío + texto | siempre estado vacío | **no existe** · no crear |
| Puntuación de sueño | — | no mostrar | **no existe** |
| Insights | tarjeta + insignia | `insights.today()`, `insights.feedback()`, `insights.markShown()` | detectores existentes |
| Métricas de Hoy | tarjeta + mini barras | elegir variante por estado | `summaries.daily()`, `energy.today()`, `nutrition.day()`, `body.*`, `health.*` |
| Rango de HRV / FC | banda + △ | media propia en cliente (`progress.ts`) | `health_observations` |
| Sesión en vivo | tabla, descanso, pausa, fin | máquina de estados existente; +15 s y Saltar existentes | RPC `start_session`, `record_set`, `transition_session`, `workouts.active()` |
| Sincronización | chips, banners, hoja, avisos | contar `pending`/`failed` de la outbox; «Descartar» quita la entrada fallida | outbox local; `KovaError` |
| Sesión en otro dispositivo | diálogo | al recibir `ACTIVE_SESSION_EXISTS` llamar `workouts.active()` | índice único existente |
| Ciclismo | planificador, ruta, navegación | existente en develop | `bike-route`, `bike_routes`, safety |
| 3D | marco, controles, fallback | solo ciclismo/técnica/anatomía; pausa con movimiento reducido | `mannequin.js`, three.js, MapLibre |
| Reloj | tema Compose | lógica existente en `MainActivity.kt`, `Store.kt` | `Api.kt` |
| Textos | voseo | reemplazo de cadenas | códigos de error del servidor |
| Administración | sistema visual | visible si `feedback.isAdmin()` | panel admin existente |

---

## 12. Voz: voseo rioplatense
Inventario actual (develop): unas 80 formas de «tú» en 32 archivos de `apps/web`, `apps/mobile`, `apps/watch` y `packages/domain` (más frecuentes: Revisa, Elige, tienes, Crea, Toca, necesitas, inténtalo).
Reglas: imperativo agudo (tocá, registrá, elegí, revisá) · enclíticos sin tilde (registralo, agregalo, intentalo, ponete, pesate) · presente (tenés, podés, necesitás, dormís, te sentís) · pasado y tercera persona sin cambios («Sigue: 45 × 8», «Kova te avisa») · Ciclismo ya está en voseo.
Ejemplos: Regístralo → Registralo · Ponte → Ponete · Conecta → Conectá · Pésate → Pesate · Añádelo en Comida → Agregalo en Comida · Toca para registrarlo → Tocá para registrarlo · Hoy no tienes… → Hoy no tenés… · Revisa tu conexión e inténtalo de nuevo → Revisá tu conexión e intentalo de nuevo · Elige… → Elegí… · ¿Cómo te sientes? → ¿Cómo te sentís? · Crea una rutina… → Creá una rutina… · Usa la misma cuenta… → Usá la misma cuenta…

---

## 13. Orden de implementación y aceptación
1. **Tokens y alias** en las tres plataformas → sin cambios visuales inesperados.
2. **Componentes base** → todos los estados de §3 con foco visible.
3. **Hoy** (web y móvil) → preparación vacía, insights reales, métricas con estados, sin datos de ejemplo.
4. **Sesión en vivo** (móvil) y **entrenamiento** (reloj) → sin regresiones en serie → descanso → siguiente, pausa y fin.
5. **Sincronización y errores** → los 7 estados con sus textos.
6. **Ciclismo, gráficos y pantallas restantes** → mismos componentes; 3D solo donde corresponde.
7. **Voseo y verificación final** → contraste, foco, teclado, texto 200 %, movimiento reducido, anchos 768–1440, 360/412 dp, pantalla redonda.

Verificación sugerida: Playwright + axe en web y `/m`; `npm run typecheck` y tests existentes; prueba manual en teléfono Android y reloj Wear OS (pendiente según `docs/guia-de-uso.md`).
