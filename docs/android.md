# Android y Wear OS: compilar e instalar

Este documento explica cómo se generan los dos APK de VIDA, cómo instalarlos en el teléfono y en un reloj Wear OS, y qué hacer si algo falla.

| APK | Origen | Tamaño aprox. | Requisitos |
| --- | --- | --- | --- |
| `dist/VIDA-movil-0.1.0.apk` | `apps/mobile` (Expo SDK 58, React Native 0.88) | ~45 MB | Android 8.0+ (API 26, requisito de Health Connect), ARM 32/64 bits |
| `dist/VIDA-reloj-wearos-0.1.0.apk` | `apps/watch` (Kotlin, Compose) | 2 MB | Wear OS 3+ (API 30) |

Ambos se conectan al proyecto de Supabase en la nube (`docs/cloud.md`), así que funcionan con cualquier conexión a internet, sin el PC encendido. `dist/` no se sube a git: los APK se regeneran con los comandos de abajo. `dist/SHA256SUMS.txt` tiene la huella de cada archivo.

---

## 1. Instalar en el teléfono

1. Copia `VIDA-movil-0.1.0.apk` al teléfono por cable USB, Google Drive, correo o WhatsApp a ti mismo.
2. Ábrelo desde la app «Archivos» o desde la notificación de descarga.
3. Android pedirá permiso para **instalar apps de origen desconocido** para esa app (Archivos, Chrome, Drive…). Actívalo solo para esa app y vuelve atrás.
4. Pulsa **Instalar**. Si aparece Play Protect, elige «Instalar de todos modos». Es normal en apps que no vienen de Play Store.
5. Abre **VIDA**, crea tu cuenta o inicia sesión.

Alternativa con cable, con la depuración USB activada en el teléfono:

```bash
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r "C:\Users\nicol\Desktop\Proyectos personales\VIDA HEALT\dist\VIDA-movil-0.1.0.apk"
```

**Actualizar:** instala el APK nuevo encima del anterior. Los datos se conservan porque están en la nube y la firma es la misma (ver §5).

---

## 2. Instalar en el reloj (Wear OS)

Los relojes Wear OS no tienen navegador de archivos, así que el APK se instala con **ADB por Wi-Fi** desde este PC. El reloj y el PC deben estar en la **misma red Wi-Fi**.

### 2.1 Activar las opciones de desarrollador en el reloj
1. En el reloj: **Ajustes → Sistema → Información** (en Samsung: **Ajustes → Información del reloj → Información de software**).
2. Toca **«Número de compilación» 7 veces**, hasta que diga que eres desarrollador.
3. Vuelve a **Ajustes → Opciones de desarrollador** y activa:
   - **Depuración ADB**
   - **Depuración por Wi-Fi** (la Wi-Fi del reloj debe estar encendida y conectada, no solo vía el teléfono)

### 2.2 Emparejar y conectar (Wear OS 3+)
1. En el reloj: **Opciones de desarrollador → Depuración por Wi-Fi → Emparejar dispositivo nuevo**. Verás una **IP:puerto de emparejamiento** y un **código de 6 dígitos**.
2. En el PC, en **PowerShell** (los comandos llevan `&` delante porque la ruta va entre comillas):

```bash
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" pair IP_DEL_RELOJ:PUERTO_DE_EMPAREJAMIENTO
```

   Escribe el código de 6 dígitos cuando lo pida.

3. Vuelve a la pantalla «Depuración por Wi-Fi» del reloj. Allí aparece otra **IP:puerto** (la de conexión, distinta de la de emparejamiento). Conéctate a ella:

```bash
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" connect IP_DEL_RELOJ:PUERTO_DE_CONEXION
```

4. Comprueba que aparece:

```bash
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

### 2.3 Instalar

```bash
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r "C:\Users\nicol\Desktop\Proyectos personales\VIDA HEALT\dist\VIDA-reloj-wearos-0.1.0.apk"
```

Si hay más de un dispositivo conectado, añade `-s IP_DEL_RELOJ:PUERTO_DE_CONEXION` después de la ruta de `adb.exe`.

5. En el reloj, abre **VIDA** desde la lista de apps e inicia sesión con **la misma cuenta del móvil**. El teclado del reloj sirve para escribir el correo y la contraseña; solo hace falta una vez.
6. Cuando termines, desactiva la **Depuración por Wi-Fi** en el reloj para ahorrar batería.

> En relojes con Wear OS 2, que ya no reciben soporte, el emparejamiento es distinto (`adb connect IP:5555`). VIDA necesita Wear OS 3 o superior.

### 2.4 Qué hace la app del reloj
- **Inicio:** hora, rutina de hoy, botón **Empezar** y estado de sincronización.
- **Entreno:** una serie por pantalla. Toca el peso para ajustarlo con − / + (2,5 kg o 5 lb) y pulsa **Serie hecha**, que arranca el descanso con +15 s y **Siguiente**. Puedes pausar y terminar la sesión.
- **Ánimo:** registro de 1 a 5 con un toque.
- **Sin conexión:** todo se guarda en el reloj y se envía al recuperar la red. Arriba verás «N envíos pendientes».
- La pantalla se mantiene encendida mientras la app está abierta, para el gimnasio.

---

## 3. Compilar el APK del móvil (Windows)

### Requisitos (ya presentes en este PC)
- Android Studio, que trae el **JDK 21** en `C:\Program Files\Android\Android Studio\jbr`. El Java 25 del sistema **no** sirve para Gradle.
- SDK de Android en `%LOCALAPPDATA%\Android\Sdk` (Gradle descarga solo la plataforma 37 y el NDK la primera vez).
- Node 20+ y las dependencias instaladas (`npm install` en la raíz).
- `apps/mobile/.env` con `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (ver `.env.example`; solo valores públicos).

### El problema de las rutas largas en Windows
La compilación nativa en C++ (CMake + ninja) falla con `Filename longer than 260 characters` si el proyecto está en una carpeta larga como `…\Proyectos personales\VIDA HEALT\…`. Un `subst` no sirve, porque Node resuelve las rutas reales. Por eso se compila desde una **copia en una carpeta corta** (`C:\v`), con la caché de CMake también en una ruta corta, mediante el plugin `apps/mobile/plugins/withShortCxxDir.js` y la variable `VIDA_CXX_DIR`.

### Pasos

En PowerShell:

```bash
robocopy "C:\Users\nicol\Desktop\Proyectos personales\VIDA HEALT" C:\v /MIR /XD node_modules .next .git .gradle build .cxx android .kotlin .expo .claude design x /XF *.log
```

En Git Bash:

```bash
cd /c/v && npm ci && cd apps/mobile && VIDA_CXX_DIR=C:/v/x npx expo prebuild --platform android --clean --no-install
```

```bash
cd /c/v/apps/mobile/android && echo "sdk.dir=C:/Users/nicol/AppData/Local/Android/Sdk" > local.properties && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

El resultado queda en `C:\v\apps\mobile\android\app\build\outputs\apk\release\app-release.apk`. La primera compilación tarda unos 5 minutos y las siguientes, menos de 1.

- `local.properties` usa barras normales (`/`). Con barras invertidas, `\n` se interpreta como salto de línea y Gradle falla con «Invalid file path».
- `android/` es una carpeta **generada** (Continuous Native Generation): no se edita a mano ni se sube a git. Cualquier cambio nativo va en `app.json` o en un plugin.

---

## 4. Compilar el APK del reloj

En Git Bash:

```bash
cd "/c/Users/nicol/Desktop/Proyectos personales/VIDA HEALT/apps/watch" && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" sh ./gradlew assembleRelease
```

- Requiere `apps/watch/secrets.properties` (copia de `secrets.properties.example`, con la URL y la clave anon) y `apps/watch/local.properties` con `sdk.dir=C:/Users/nicol/AppData/Local/Android/Sdk`. Los dos están fuera de git.
- Resultado: `apps/watch/app/build/outputs/apk/release/app-release.apk`.
- También se puede abrir `apps/watch` en Android Studio y usar **Run** con el reloj conectado por ADB.

### Tests en el reloj
`app/src/androidTest/.../StoreTest.kt` corre en el propio reloj: outbox (orden, errores de red, rechazos), persistencia del entreno en curso y armado de la sesión desde una rutina. Usa su propio archivo de preferencias (`vida-test`), así que no toca la sesión ni los datos de la app.

No uses `connectedDebugAndroidTest`: al terminar desinstala la app y cierra la sesión del reloj. En su lugar (Git Bash, en `apps/watch`, con el reloj conectado):

```bash
./gradlew assembleDebug assembleDebugAndroidTest assembleRelease
```

```bash
ADB="/c/Users/nicol/AppData/Local/Android/Sdk/platform-tools/adb.exe"; "$ADB" install -r app/build/outputs/apk/debug/app-debug.apk && "$ADB" install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk && "$ADB" shell am instrument -w com.vida.health.test/androidx.test.runner.AndroidJUnitRunner
```

```bash
ADB="/c/Users/nicol/AppData/Local/Android/Sdk/platform-tools/adb.exe"; "$ADB" uninstall com.vida.health.test; "$ADB" install -r app/build/outputs/apk/release/app-release.apk
```

Con más de un dispositivo conectado, agrega `-s <serie del reloj>` después de `"$ADB"` (la serie sale en `adb devices`). Las versiones debug y release se firman con la misma clave, así que `install -r` conserva la sesión.

### Arquitectura del reloj
| Archivo | Rol |
| --- | --- |
| `Api.kt` | Cliente HTTP mínimo (sin librerías): inicio de sesión con GoTrue, refresco del token, lecturas y RPC de PostgREST. Solo lleva la clave anon; cada petición va con el JWT del usuario y la RLS manda. |
| `Store.kt` | SharedPreferences privadas: sesión, id del dispositivo, entreno en curso y **outbox** (cola ordenada de RPC idempotentes). Sobrevive a cierres del proceso. |
| `MainActivity.kt` | UI en Compose (primitivas de foundation) con el diseño de *VIDA Watch v2*: objetivos táctiles de 44–56 dp, texto ≥ 12 sp, fondo negro OLED. |

El protocolo es el de `docs/sync.md`. El reloj genera sus propios UUID (sesión, ejercicios de la sesión y series) y llama a `start_session`, `record_set`, `transition_session` y `record_observations`, igual que el móvil, así que reintentar nunca duplica datos.

---

## 5. Firma y publicación en Play Store

- Los dos APK están firmados con la **clave de depuración local**. Sirve para instalar a mano y para actualizar encima desde este mismo PC.
- Para **Google Play** hace falta una clave de publicación propia. Se crea una sola vez y se guarda en un lugar seguro: si se pierde, no se puede actualizar la app publicada. Es una tarea tuya (ver la guía de uso). Opciones:
  - **EAS Build** (`npx eas-cli build -p android`), que gestiona la clave en la nube de Expo y requiere una cuenta de Expo.
  - Una clave local con `keytool` y un plugin que configure `signingConfigs.release`.
- Play Store exige además una política de privacidad, la declaración de datos de salud (Health apps declaration) y, para Wear OS, capturas del reloj.

---

## 6. Health Connect (móvil) y Health Services (reloj)

**Móvil:** `react-native-health-connect` 4.1, que trae su plugin de Expo (filtro de intención y alias para la pantalla de privacidad), con `expo-build-properties` para `minSdkVersion 26`. Pide permisos de **solo lectura**: `READ_STEPS`, `READ_SLEEP`, `READ_WEIGHT`, `READ_RESTING_HEART_RATE` y `READ_HEART_RATE_VARIABILITY` (`app.json`).
- `src/health.ts` lee los últimos días, valida cada fila con los esquemas Zod de la API y llama a `record_observations` y `record_body_measurements` con `external_id` = id del registro en Health Connect y `source_app` = app de origen. Así es idempotente y no cuenta dos veces los pasos de dos fuentes (el resumen diario usa la mayor).
- Sueño: los minutos dormidos son la suma de las fases SLEEPING, LIGHT, DEEP y REM, sin los despertares. Las fases se guardan en `details.stages_min`. Si no hay fases, cuenta la sesión completa.
- La primera conexión importa 30 días. Después se sincronizan 7 días cada vez que la app pasa a primer plano.
- Para publicar en Google Play hay que declarar el acceso a datos de salud en la Play Console. La aprobación tarda varios días.

**Reloj:** `androidx.health:health-services-client` 1.0 (`HeartRate.kt`) mide la frecuencia cardíaca con `MeasureClient` solo mientras la pantalla de entreno está activa y sin pausa. Se muestra pequeña («♥ 128 lpm») y la media se envía como `avg_hr` de la sesión al completarla, por la cola offline. Permiso: `BODY_SENSORS` hasta Android 15 y `android.permission.health.READ_HEART_RATE` desde Android 16. Se pide al empezar el primer entreno; sin permiso, la app funciona sin pulso.

---

## 7. Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| «No se ha instalado la app» en el teléfono | Hay otra versión firmada con otra clave | Desinstala VIDA y vuelve a instalar |
| `adb pair` falla | Código caducado o puerto equivocado | Repite «Emparejar dispositivo nuevo»; el puerto de emparejamiento cambia cada vez |
| `adb connect` falla | Reloj y PC en redes distintas, o la Wi-Fi del reloj apagada | Conecta el reloj a la misma Wi-Fi (no por Bluetooth del teléfono) |
| La app dice «Sin conexión» | Sin internet, o el servidor no responde | Sigue usando la app: todo queda en cola y se envía después |
| «Correo o contraseña incorrectos» con datos correctos | La cuenta aún no confirmó el correo | Abre el correo de confirmación de Supabase y vuelve a intentarlo |
| Gradle: `Filename longer than 260 characters` | Ruta larga en Windows | Compila desde `C:\v` (§3) |
| Gradle: `Invalid file path` | `local.properties` con barras invertidas | Usa `C:/Users/...` |
