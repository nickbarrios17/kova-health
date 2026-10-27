# VIDA: guía de uso

VIDA reúne en un solo lugar tu **entrenamiento**, tu **comida**, tus **hábitos** y tus **datos de salud**, sincronizados entre la web, el teléfono y el reloj.

| Dónde | Para qué |
| --- | --- |
| **Web** (navegador) | Analizar: la semana en números, tendencias de 28 días, historial de entrenos, el Coach |
| **Teléfono** (Android) | Actuar en el día: empezar un entreno, registrar comida, hábitos, peso y ánimo, conectar Health Connect |
| **Reloj** (Wear OS) | Entrenar con un toque por serie, descanso con temporizador, ánimo rápido |

Todo lo que registras en un dispositivo aparece en los demás. Si no hay conexión, se guarda en el dispositivo y se envía solo cuando vuelve la red.

---

## 1. Instalación

### Web
- **En local** (este PC): `npm run dev:web` y abre http://localhost:3000 (detalles en `docs/setup.md`).
- **En internet:** cuando esté publicada en Vercel tendrá una dirección del tipo `https://vida-….vercel.app` (ver «Lo que te queda por hacer»). Funciona en cualquier navegador, también en el del teléfono.

### Teléfono (Android 8 o superior)
1. Pasa `dist/VIDA-movil-0.1.0.apk` al teléfono (cable, Drive, correo…).
2. Ábrelo y permite **instalar apps de origen desconocido** para la app con la que lo abriste.
3. Pulsa **Instalar** (si Play Protect avisa, «Instalar de todos modos») y abre **VIDA**.

### Reloj (Wear OS 3 o superior)
Los relojes se instalan desde este PC por Wi-Fi. Resumen (paso a paso completo en `docs/android.md` §2):
1. En el reloj: **Ajustes → Sistema → Información** → toca «Número de compilación» 7 veces.
2. **Opciones de desarrollador** → activa **Depuración ADB** y **Depuración por Wi-Fi**.
3. **Emparejar dispositivo nuevo** → anota la IP:puerto y el código.
4. En el PC, empareja con el código, conéctate e instala:

```bash
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" pair IP:PUERTO_EMPAREJAMIENTO
```

```bash
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" connect IP:PUERTO_CONEXION
```

```bash
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" install -r dist\VIDA-reloj-wearos-0.1.0.apk
```

5. Abre **VIDA** en el reloj e inicia sesión con la misma cuenta.

---

## 2. Cuentas

### Crear una cuenta
1. En la web o en el teléfono: **Crear una cuenta** → correo y contraseña (mínimo 8 caracteres, con letras y números).
2. Te llega un **correo de confirmación** de Supabase. Ábrelo y pulsa el enlace.
3. Vuelve a VIDA e **inicia sesión**. Si intentas entrar sin confirmar, VIDA te lo dirá («Confirma tu correo…»).

Una misma cuenta sirve para la web, el teléfono y el reloj.

### Olvidé mi contraseña
**Olvidé mi contraseña** → tu correo → abre el enlace del correo → elige una contraseña nueva en la web.
> Hasta que la web esté publicada y la URL configurada en Supabase, el enlace del correo apunta a `localhost` y solo funciona desde este PC.

### Cerrar sesión
- Web: **Cerrar sesión** abajo en la barra lateral.
- Teléfono: **Progreso → Cuenta → Cerrar sesión**.
- Reloj: en Inicio, **Cerrar sesión**. Si había un entreno a medias, se descarta del reloj; lo ya enviado queda guardado.

### Borrar la cuenta
Teléfono: **Progreso → Cuenta → Borrar mi cuenta y mis datos** → confirmar. Se borran **para siempre** la cuenta y todo lo registrado. No se puede deshacer.

### Tus datos
- Son privados: cada consulta va con tu sesión y la base de datos solo devuelve tus filas.
- Se guardan en Supabase (región São Paulo).
- Puedes pedir una **copia completa** de tus datos en formato JSON (función `export_my_data`; la pantalla para descargarla llegará a la web).

---

## 3. Uso diario

### Hoy (web y teléfono)
- **Plan de hoy:** la rutina programada para hoy, con series×repeticiones y el último peso que usaste. En el teléfono, el botón **Empezar** arranca la sesión.
- **VIDA ve hoy:** observaciones del Coach (ver §3.6).
- **Progreso de hoy:** comida, pasos, sueño, cuerpo, ánimo y entreno. Si no hay dato, la tarjeta dice «Sin datos» y cómo conseguirlo. **VIDA nunca inventa números.**
- **La semana en números** (web): tabla de 7 días. Lo resaltado está fuera de tu objetivo o de tu media.
- **kg / lb:** el selector de arriba cambia la unidad en todos tus dispositivos.

### Entrenar
**Rutinas.** Las rutinas aparecen en «Entrenar» (teléfono) y «Entrenamiento» (web), con sus días (por ejemplo «Lun · Jue»). Por ahora se crean desde la base de datos o con la API; el editor de rutinas en la app es trabajo pendiente.

**Sesión en vivo (teléfono):**
1. **Empezar** en una rutina.
2. Cada ejercicio tiene una tabla: **Serie · Anterior · kg · Reps · ✓**. Ajusta peso y repeticiones y toca **✓** al terminar la serie.
3. Arranca el **descanso**: **+15 s** o **Saltar**.
4. Cambia de ejercicio con las pastillas de arriba. **Añadir serie** si haces una más.
5. **Pausar sesión** si te interrumpes. **Terminar** al acabar.
6. El **resumen** muestra volumen, series, duración y los **récords** (si superaste tu mejor peso anterior).

Puedes salir de la sesión con la flecha ⌄: queda una barra «Volver» abajo. Si el teléfono se apaga o cierras la app, la sesión **se recupera** al volver a abrirla.

**Sesión en vivo (reloj):**
- **Empezar** en Inicio → una serie por pantalla: ejercicio, «Serie 2 de 4», peso × reps.
- Toca el **peso** para ajustarlo con − / +.
- **Serie hecha** → anillo de **descanso** (+15 s / Siguiente).
- Arriba, **Pausa**. En pausa: **Reanudar** o **Terminar sesión**.
- Abajo se ve tu **pulso** (si diste permiso) y el estado: «Sincronizado» o «N envíos pendientes».

**Historial y progreso (web → Entrenamiento):** rutinas, **1RM estimado** de las últimas 8 semanas (fórmula de Epley con series de 1 a 12 repeticiones) e historial de sesiones con duración, volumen, pulso medio, sueño de la noche anterior y notas.

### Comida
1. **Comida** (web o teléfono) → elige el día (Hoy / Ayer).
2. En cada comida (Desayuno, Almuerzo, Merienda, Cena, Picoteo) → **Añadir**.
3. **Busca** un alimento. Si no existe, **Crear alimento** con los valores de la etiqueta (por 100 g o por porción).
4. Indica la **cantidad** y VIDA calcula kcal y macros antes de guardar.
5. Para quitar algo, la papelera. Para cambiar una cantidad, quítalo y vuelve a añadirlo.

Cosas a saber:
- Cada valor dice de dónde viene: **Verificado**, **Etiqueta**, **Introducido por ti** o **Estimado**.
- Lo registrado se **congela**: si luego editas un alimento, tus días pasados no cambian.
- El catálogo verificado de alimentos todavía está vacío (ver «Lo que te queda por hacer»). Mientras tanto, crea tus alimentos.
- Los objetivos de kcal y macros los pones tú; VIDA no prescribe dietas.

### Progreso (teléfono)
- **Ánimo:** cinco caras, de «Muy mal» a «Muy bien». Toca la de hoy.
- **Peso:** escribe el de hoy y **Guardar**. Debajo, tus últimas mediciones.
- **Hábitos de hoy:** marca ✓ los hechos. La **racha** cuenta los días cumplidos seguidos; un día que no toca no la rompe, y el día de hoy tampoco hasta que termina. Crea hábitos nuevos abajo (diarios).
- **Health Connect:** ver §4.
- **Cuenta:** cerrar sesión o borrar la cuenta.

### Tendencias (web)
Elige una métrica (sueño, pasos, peso, calorías, proteína, HRV, frecuencia en reposo, ánimo) y verás **28 días** con tu media como línea discontinua. Los días sin datos quedan **vacíos**: no se rellenan con ceros.

### Coach
El Coach busca **hechos y patrones** en tus últimos 60 días, con reglas transparentes y **sin inteligencia artificial**. Cada observación dice qué es:

| Tipo | Qué significa | Ejemplo |
| --- | --- | --- |
| **Hecho** | Cuentas de tus datos; siempre cierto | «Entrenaste 3 veces esta semana, 1 más que la anterior.» |
| **Patrón** | Algo que se repite; es una asociación, **no una causa** | «Los días que dormiste menos de 6 h 30, tu ánimo fue más bajo…» |
| **Proyección** | Qué pasaría si sigues igual, con su supuesto | «Si mantienes este ritmo, tu peso baja unos 0,3 kg por semana.» |
| **Hipótesis** | Relación posible con poca evidencia (borde punteado) | «Dormir poco podría estar relacionado con tu ánimo…» |

- **¿Por qué?** muestra los números que respaldan cada observación.
- **Útil / No útil** ayuda a que el Coach aprenda qué mostrarte.
- No repite lo mismo todos los días.
- Con pocos datos no muestra nada: es lo esperado al empezar. **Nada de esto es consejo médico.**

---

## 4. Health Connect (teléfono)

Health Connect es el «almacén» de salud de Android, donde escriben Samsung Health, Google Fit, Fitbit, tu reloj, etc. VIDA puede **leer** de ahí (nunca escribe):

| Dato | Para qué se usa |
| --- | --- |
| Pasos | Tarjeta Pasos, tendencias |
| Sueño (con fases si las hay) | Tarjeta Sueño, Coach, «sueño previo» de cada entreno |
| Peso | Cuerpo, tendencias, proyección de peso |
| Frecuencia en reposo | Semana en números, tendencias |
| HRV (RMSSD) | Corazón, tendencias |

1. **Progreso → Health Connect → Conectar** → elige qué datos permitir.
2. VIDA importa los últimos 30 días y, después, se actualiza sola cada vez que abres la app (o con **Sincronizar ahora**).
3. **Cambiar permisos** abre los ajustes de Health Connect.

En Android 13 o anterior hace falta instalar «Health Connect» desde Play Store. En Android 14 o superior ya viene con el sistema.

Si un mismo paseo lo registran el teléfono y el reloj, VIDA **no los suma dos veces**: usa la fuente con más pasos del día.

---

## 5. Sin conexión y sincronización

- El teléfono y el reloj guardan cada serie, comida, peso, ánimo o hábito **en el dispositivo al instante** y lo envían cuando hay red.
- Reintentar es seguro: cada registro tiene un identificador único, así que **nunca se duplica**.
- Solo puede haber **un entreno en curso** por cuenta. Si empiezas en el reloj, en el teléfono verás «… en curso» (y viceversa).
- La web siempre muestra lo que está en el servidor; usa **Actualizar** o recarga la página para ver lo último.

---

## 6. Preguntas frecuentes

**¿Por qué dice «Sin datos» si llevo el reloj?** Los pasos, el sueño y el pulso en reposo llegan por Health Connect: conéctalo en el teléfono (§4). El reloj VIDA, por ahora, solo mide el pulso durante el entreno.

**¿Por qué no veo calorías del entreno?** Sin un sensor de pulso fiable durante toda la sesión, VIDA prefiere no mostrar un número inventado. Si en el futuro se estima, se marcará como «estimado».

**¿Qué es la Preparación «Aún sin calcular»?** Hace falta una línea base de varias noches de sueño y HRV. Ese modelo está en el plan de VIDA Intelligence. Mientras tanto ves los datos reales que lo alimentan.

**El reloj dice «N envíos pendientes».** No hay red o el servidor no responde. Sigue entrenando: se envía solo al recuperar la conexión.

**¿Mis datos están seguros?** Están protegidos por cuenta en la base de datos (Row Level Security): ninguna otra cuenta puede leerlos, ni siquiera con la clave pública de la app. La clave de administración nunca sale del servidor.

---

## 7. Lo que te queda por hacer

Cosas que solo puedes hacer tú, porque requieren tu cuenta, tu dispositivo o una decisión tuya:

| # | Tarea | Por qué | Cómo |
| --- | --- | --- | --- |
| 1 | **Iniciar sesión en Vercel** | Para publicar la web en internet | `npx vercel login` en una terminal; avísame y la despliego |
| 2 | **Configurar las URLs en Supabase** (cuando la web esté publicada) | Que los enlaces de confirmación y de recuperar contraseña funcionen fuera del PC | Panel de Supabase → Authentication → URL Configuration (`docs/cloud.md`) |
| 3 | **Probar los APK en tu teléfono y tu reloj** | No hay dispositivos conectados a este PC, así que no pude probarlos en hardware real | Instálalos (§1) y cuéntame cualquier fallo |
| 4 | **Correo propio para Supabase (SMTP)** | El correo incluido tiene pocos envíos por hora y es para pruebas | Crear una cuenta en Resend, SendGrid o Brevo y configurarla en Supabase → Authentication → Emails |
| 5 | **Elegir el catálogo de alimentos** | Para tener alimentos «verificados»; hay que revisar su licencia | Opciones: USDA FoodData Central (dominio público), BEDCA (España), Open Food Facts (ODbL) |
| 6 | **Decidir sobre `git push`** | Hay commits locales sin subir y el CI de GitHub aún no corrió | Dime y lo subo |
| 7 | **Publicar en Google Play** (opcional) | Distribución pública y actualizaciones automáticas | Cuenta de desarrollador (pago único), clave de publicación, política de privacidad, declaración de datos de salud (`docs/android.md` §5) |
| 8 | **Decisiones de producto** | Afectan a cumplimiento legal y monetización | Mercados de lanzamiento (GDPR o leyes locales de datos de salud), proveedor de pagos, inicio de sesión con Google/Apple |
| 9 | **Borrar `C:\v`** cuando ya no compiles | Es una copia de compilación (unos 2 GB) | Borrar la carpeta |

Lo que **todavía no está construido** (para que no te sorprenda):
- Editor de rutinas y de hábitos avanzados en la app (crear, reordenar, horarios semanales).
- Pantalla de exportación de datos en la web.
- App de iPhone y HealthKit (no se puede compilar iOS desde Windows).
- Pagos y funciones premium (la base de permisos ya existe, sin proveedor de cobro).
- Modelo de «Preparación» y la parte del Coach con IA (Gemini), que el diseño deja para fases posteriores.
