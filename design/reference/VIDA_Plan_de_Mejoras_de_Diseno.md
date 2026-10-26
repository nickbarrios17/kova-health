# VIDA --- Plan de mejoras de diseño

**Sistema visual para Web, móvil y Wear OS**\
**Versión:** 1.0

> **Alcance:** este documento cubre únicamente diseño visual y
> experiencia de interfaz (UI/UX). No incluye backend, base de datos,
> autenticación, sincronización ni implementación de servicios.

## 1. Objetivo

Refinar el diseño actual de VIDA sin cambiar su identidad de forma
radical. La dirección recomendada es una estética de salud premium y
tecnología cercana: oscura, sobria y clara, con suficiente energía
visual para mantener el entrenamiento como parte central del producto.

La prioridad no es agregar más elementos, sino mejorar la jerarquía
visual, la legibilidad y la consistencia entre pantallas y dispositivos.

## 2. Resumen de decisiones

  -----------------------------------------------------------------------
  Área                    Decisión                Prioridad
  ----------------------- ----------------------- -----------------------
  Identidad               Conservar el fondo      Alta
                          oscuro, los tonos       
                          azul-gris y el violeta  
                          como acento principal.  

  Tipografía              Mantener Inter; revisar Alta
                          jerarquías, tamaños     
                          pequeños y cifras.      

  Dashboard               Priorizar el resumen    Muy alta
                          del día y reducir la    
                          competencia entre       
                          tarjetas.               

  Wear OS                 Simplificar vistas      Muy alta
                          activas y priorizar     
                          acciones grandes y      
                          rápidas.                

  Componentes             Unificar tarjetas,      Alta
                          gráficos, estados,      
                          iconos y espaciados.    

  Accesibilidad           Mejorar contraste,      Alta
                          tamaño de texto y       
                          claridad sin depender   
                          solo del color.         

  Modo claro              Definir tokens          Media
                          preparados para         
                          soportarlo; no es       
                          obligatorio             
                          implementarlo ahora.    
  -----------------------------------------------------------------------

## 3. Paleta de colores

Conservar la paleta base observada en el prototipo. No conviene
cambiarla solo por buscar novedad; el trabajo principal consiste en
asignar un propósito consistente a cada color.

  -----------------------------------------------------------------------
  Token                   Valor                   Uso recomendado
  ----------------------- ----------------------- -----------------------
  Fondo principal         `#161826`               Lienzo general y fondos
                                                  de pantalla

  Superficie              `#232532`               Tarjetas y paneles
                                                  sobre el fondo

  Violeta VIDA            `#9184D9`               Acento de marca,
                                                  selección y acciones
                                                  principales

  Texto principal         `#E9E9ED`               Títulos, valores y
                                                  contenido prioritario

  Texto secundario        `#B2B6CA`               Descripciones y
                                                  metadatos; comprobar
                                                  contraste

  Verde semántico         Definir token           Estados positivos y
                                                  objetivos completados

  Ámbar semántico         Definir token           Avisos suaves o
                                                  elementos que requieren
                                                  atención

  Coral/rojo semántico    Definir token           Errores y estados
                                                  críticos, no para
                                                  decorar
  -----------------------------------------------------------------------

### Reglas de uso

-   El violeta debe identificar VIDA, no colorear todos los elementos de
    la pantalla.
-   Reservar los colores semánticos para comunicar estados reales y
    consistentes.
-   No comunicar éxito, error o riesgo únicamente con color: acompañar
    con icono y texto.
-   Revisar contraste de textos secundarios, líneas finas y elementos
    deshabilitados en cada dispositivo.
-   Usar superficies y bordes sutiles para separar bloques; evitar
    sombras fuertes en modo oscuro.

## 4. Tipografía y jerarquía

Mantener Inter como familia tipográfica. La mejora debe venir de una
escala tipográfica consistente, no de incorporar varias fuentes.

-   **Títulos de página:** Inter Medium/Semibold, con tamaño claramente
    superior al contenido.
-   **Texto de lectura:** Inter Regular, con altura de línea cómoda.
-   **Métricas:** cifras prominentes; unidades, comparaciones y
    etiquetas en un nivel inferior.
-   **Etiquetas:** evitar exceso de mayúsculas y tracking amplio.
-   **Texto auxiliar:** no reducirlo hasta volverlo difícil de leer,
    especialmente en móvil.
-   Aplicar la misma jerarquía semántica en web y móvil, adaptando los
    tamaños a cada pantalla.

## 5. Dashboard y navegación

Reorganizar la página principal en tres niveles de lectura:

1.  **Nivel 1 --- Hoy:** una síntesis clara del día: una acción
    principal, entrenamiento previsto o pendiente y, si aporta valor,
    una métrica destacada.
2.  **Nivel 2 --- Progreso:** tarjetas compactas de nutrición, actividad
    y hábitos. Cada tarjeta debe mostrar valor, unidad, objetivo o
    tendencia y período.
3.  **Nivel 3 --- Profundizar:** historial, gráficos detallados,
    tendencias y análisis deben quedar accesibles sin competir
    visualmente con las acciones del día.

### Cambios concretos

-   Reducir la cantidad de tarjetas con el mismo peso visual en la
    primera pantalla.
-   Aumentar el espacio entre secciones y mantener más compacto el
    contenido que pertenece a una misma tarjeta.
-   Usar una acción primaria por sección; evitar múltiples botones
    igualmente destacados.
-   Mantener patrones de diseño coherentes para navegación, filtros,
    períodos y estados seleccionados.
-   Crear estados vacíos útiles: explicar cómo empezar cuando todavía no
    hay datos, sin mostrar métricas simuladas como si fueran reales.

## 6. Tarjetas, gráficos e iconografía

-   **Tarjetas de métricas:** definir una plantilla común: nombre,
    valor, unidad, tendencia/comparación, período y, cuando corresponda,
    progreso hacia un objetivo.
-   **Gráficos:** unificar ejes, etiquetas, líneas, colores y estados
    vacíos. Cada gráfico debe responder una pregunta concreta y permitir
    identificar el período mostrado.
-   **Iconos:** usar un único estilo de iconos con grosores y tamaños
    consistentes. No mezclar iconos lineales, rellenos y emojis como si
    fueran el mismo sistema.
-   **Bordes y radios:** mantener radios moderados y consistentes.
    Reservar mayor redondez para superficies táctiles o elementos
    destacados.
-   **Animaciones:** usarlas solo para comunicar una transición o
    confirmación; evitar animaciones decorativas constantes.
-   **Estados:** diseñar variantes de normal, seleccionado,
    deshabilitado, cargando, vacío, error y éxito.

## 7. VIDA Watch --- Wear OS

El reloj no debe ser una versión miniatura del dashboard. Debe mostrar
información de un vistazo y facilitar acciones con pocos toques.

-   En una sesión activa, priorizar ejercicio actual, número de serie,
    carga/repeticiones y acción para completar la serie.
-   Mostrar el descanso como estado principal después de registrar una
    serie, con temporizador legible y controles simples.
-   Mantener la frecuencia cardíaca como dato complementario, sin
    competir con la acción principal.
-   Aumentar la claridad y el tamaño de los controles táctiles; evitar
    botones pequeños y acciones muy juntas.
-   Reducir la cantidad de métricas simultáneas en la esfera o vista
    diaria.
-   Diseñar estados claros para sesión pausada, finalizada, datos
    pendientes de sincronización y ausencia de conexión (solo en
    términos de interfaz).
-   Minimizar texto secundario y evitar que el usuario tenga que navegar
    por muchas pantallas para completar una acción frecuente.

## 8. Móvil y web: misma marca, distinta experiencia

  -----------------------------------------------------------------------
  Aspecto                 Móvil                   Web
  ----------------------- ----------------------- -----------------------
  Prioridad               Acciones rápidas y      Análisis, planificación
                          lectura breve           y comparación

  Composición             Una columna y tarjetas  Grillas y paneles que
                          fáciles de recorrer     aprovechen el espacio

  Gráficos                Resumen legible y       Mayor contexto,
                          detalle progresivo      períodos y
                                                  comparaciones

  Navegación              Pocas opciones          Navegación persistente
                          principales y acciones  y acceso a módulos
                          accesibles              

  Densidad                Baja a moderada         Moderada, sin llenar
                                                  cada espacio
  -----------------------------------------------------------------------

## 9. Accesibilidad y legibilidad

-   Validar contraste de texto y controles, no solo la estética de la
    paleta.
-   No usar el color como única señal para estados positivos,
    advertencias o errores.
-   Comprobar tamaños de texto en móviles de pantalla pequeña y en
    relojes redondos.
-   Asegurar que botones, zonas táctiles y controles de entrenamiento
    sean fáciles de pulsar.
-   Dar nombres claros a iconos y controles; no depender de iconos
    ambiguos sin etiqueta cuando la acción no sea obvia.
-   Probar el diseño con escalado de texto y diferentes densidades de
    pantalla.

## 10. Sistema de diseño a documentar

Crear una pequeña guía de diseño que actúe como fuente de verdad para
todas las interfaces:

-   **Tokens:** colores, tipografía, espacios, radios, bordes y tamaños
    de iconos.
-   **Componentes:** botones, campos, tarjetas de métricas, chips,
    navegación, gráficos y avisos.
-   **Estados:** normal, hover/focus cuando aplique, seleccionado,
    deshabilitado, vacío, cargando, error y éxito.
-   **Reglas por plataforma:** cómo se adapta cada componente a web,
    móvil y Wear OS.
-   **Ejemplos de uso correcto e incorrecto** para evitar variantes
    visuales inconsistentes.

## 11. Orden de implementación visual

  -----------------------------------------------------------------------
  Orden                   Trabajo                 Criterio de
                                                  finalización
  ----------------------- ----------------------- -----------------------
  1                       Definir tokens y        Colores, tamaños y
                          tipografía              espaciados documentados
                                                  y consistentes.

  2                       Refinar dashboard       La acción principal y
                                                  el resumen diario se
                                                  entienden rápidamente.

  3                       Normalizar componentes  Tarjetas, botones,
                                                  iconos y estados
                                                  comparten reglas
                                                  visuales.

  4                       Refinar el flujo de     Completar una serie y
                          entrenamiento en reloj  pasar al descanso
                                                  requiere pocas
                                                  interacciones.

  5                       Ajustar móvil y web por Cada interfaz aprovecha
                          separado                su pantalla sin perder
                                                  identidad.

  6                       Revisión de             Contraste, legibilidad,
                          accesibilidad           escalado y controles
                                                  táctiles comprobados.
  -----------------------------------------------------------------------

## 12. Fuera de alcance

Este plan no propone cambios de backend ni decisiones de
infraestructura. Quedan expresamente fuera:

-   Base de datos, modelos de datos y migraciones.
-   Autenticación, permisos, seguridad del servidor y APIs.
-   Sincronización real entre reloj, móvil, web y servicios externos.
-   Integraciones con sensores o plataformas de salud.
-   Implementación de IA, suscripciones, analítica de producto o lógica
    de negocio.

## Criterio final

VIDA debe conservar su estética oscura, el violeta como acento y la
tipografía Inter. La mejora principal será ordenar la información,
aumentar la legibilidad y hacer que cada dispositivo tenga una función
visual clara. Antes de sumar pantallas nuevas, conviene pulir los flujos
más frecuentes y documentar los componentes para mantener la
consistencia.
