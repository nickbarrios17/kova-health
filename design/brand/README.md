# Kova Health — marca

**Cinta Vital**: dos cintas forman la K. La cinta clara (`#9184D9`) baja por el tallo y sigue en la pierna; pasa por delante de la oscura (`#5D5294`), que va del brazo a la base del tallo. En el cruce hay un hueco transparente para que el símbolo funcione en un solo color.

| Archivo | Uso |
| --- | --- |
| `kova-mark.svg` | Símbolo a color, fondo transparente (lienzo 512). |
| `kova-mark-mono.svg` / `kova-mark-mono-dark.svg` | Un color: blanco sobre fondo oscuro, `#161826` sobre fondo claro. |
| `kova-app-icon.svg` | Símbolo sobre el fondo de la app `#161826`, esquinas redondeadas (favicon web). |
| `kova-lockup-dark.svg` / `kova-lockup-light.svg` | Símbolo + «Kova Health», para fondo oscuro / claro. El texto es `<text>` (Inter o la sans del sistema), no está convertido a curvas. |

Reglas: colores planos, sin degradados ni volumen; no deformar ni rotar; el fondo de la app es `#161826`.

Dónde vive en el código (misma geometría en todos):
- Web: `apps/web/components/KovaMark.tsx`, `apps/web/app/icon.svg`, `apps/web/app/apple-icon.png`.
- Celular: `apps/mobile/src/KovaMark.tsx` y los PNG de `apps/mobile/assets` (ícono, adaptive icon frente/fondo/monocromo al 84 % dentro de la zona segura de 66 dp, splash).
- Reloj: `apps/watch/app/src/main/res/drawable/ic_launcher_foreground.xml` (VectorDrawable; el hueco se pinta con el color de fondo porque VectorDrawable no tiene máscaras).
