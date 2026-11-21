# Privacidad y red: inventario de llamadas (F18)

Revisión técnica de lo que la app contacta, qué viaja y la política que lo limita (`vercel.json`). Fecha: 2026-11-21.

## Conclusión

**Ningún cuadro de video sale del dispositivo, ni se guarda.** El flujo de la cámara (`getUserMedia`) se asigna solo a un `<video>` en memoria y se entrega a MediaPipe (`detectForVideo`), que corre en el navegador (wasm local). Lo único que se dibuja del video es un reducido de 32×24 px para medir la luz (`drawImage` en `src/tracking/camara.ts`), del que solo queda un número (luminancia). El código no usa `toBlob`, `toDataURL`, `MediaRecorder`, `captureStream`, `sendBeacon`, `XMLHttpRequest`, `WebSocket` ni `new Worker`; el único `fetch` propio es la grabación de demo de la misma app (`/grabaciones/demo.json`). Hacia Supabase solo van filas: sesión, parámetros, calibración (números), métricas, muestras a 10 Hz (aperturas y ángulos), eventos (agarre, pausa), dolor/esfuerzo/nota, planes, consentimientos, alertas y auditoría.

## Inventario de orígenes

| Origen | Para qué | Qué viaja | Quién lo permite |
|---|---|---|---|
| El propio sitio (`'self'`) | Código, estilos, `public/mediapipe/hand_landmarker.task` y `public/mediapipe/wasm/*`, `public/grabaciones/demo.json`, favicon | Nada del usuario (solo descargas) | `default-src`, `script-src`, `connect-src`, `worker-src`, `media-src` |
| `https://iniposctftmzxkqasikh.supabase.co` (REST + Auth) | Datos: `repos` (PostgREST `/rest/v1`, RPC) e ingreso (`/auth/v1`) | Filas del paciente/terapeuta con el token del usuario (RLS). Nunca imágenes | `connect-src` |
| `wss://iniposctftmzxkqasikh.supabase.co` | Realtime de supabase-js. **Hoy la app no abre ningún canal**; se deja habilitado para no romper una función futura | Nada hoy | `connect-src` |
| `https://fonts.googleapis.com` | Hoja de estilos de Google Fonts (DM Sans, Poppins) de `index.html` | Una petición GET de CSS (la IP del usuario llega a Google) | `style-src-elem` |
| `https://fonts.gstatic.com` | Archivos de las fuentes | GET de `.woff2` | `font-src` |
| `https://odml.pa.googleapis.com/v1/log` | **Telemetría de MediaPipe Tasks.** Está **bloqueada**: `bloquearTelemetriaMediapipe()` responde 204 sin salir y, además, la CSP no la deja pasar | Nada (no sale) | no permitido |

Las fuentes de Google son el único contacto con terceros. Si F20 las autoaloja (`@fontsource` o archivos en `public/`), hay que quitar de `index.html` los `preconnect` y la hoja, y de `vercel.json` `https://fonts.googleapis.com` (en `style-src-elem`) y `https://fonts.gstatic.com` (en `font-src`); nada más depende de ellos.

El e2e `tracking` (cámara falsa) comprueba que, con MediaPipe corriendo, no hay peticiones fuera del origen salvo Supabase y las fuentes (GET).

## Content-Security-Policy y encabezados (`vercel.json`)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self';
  style-src-elem 'self' https://fonts.googleapis.com;      ← fuentes de Google (quitar si F20 las autoaloja)
  font-src 'self' https://fonts.gstatic.com;               ← fuentes de Google (quitar si F20 las autoaloja)
  img-src 'self' data: blob:;
  media-src 'self' blob:;
  worker-src 'self' blob:;
  connect-src 'self' https://iniposctftmzxkqasikh.supabase.co wss://iniposctftmzxkqasikh.supabase.co;
  manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
```

(En el archivo va en una sola línea; aquí está partido para leerlo.)

Justificación de lo no obvio:

- **`'wasm-unsafe-eval'`** en `script-src`: MediaPipe (`vision_wasm_internal`) y Rapier compilan WebAssembly. Es la forma estrecha de permitirlo: **no** habilita `eval()` ni `new Function()` (no hay `unsafe-eval`; el bundle no los usa). No hay `unsafe-inline` en scripts: `index.html` solo tiene un `<script type="module" src>`.
- **`style-src 'self'` sin `unsafe-inline`**: React y three.js cambian estilos por el objeto CSS del DOM (no es "inline" para la CSP), y Vite emite los estilos como archivos. Se probó la app completa y no hubo violaciones, así que no hace falta `'unsafe-inline'`. Si una librería futura usa `<style>` o `style="..."` en el HTML, aparecerá como violación y habrá que decidir entre `style-src-attr 'unsafe-inline'` (más acotado) o cambiar el código.
- **`worker-src 'self' blob:`**, **`img-src data: blob:`**, **`media-src blob:`**: MediaPipe y three.js pueden crear workers, texturas y medios desde `blob:`/`data:` locales; no abre ningún origen externo.
- **`camera=(self)`** (Permissions-Policy): la cámara solo la puede pedir este sitio (ni iframes). `frame-ancestors 'none'` + `X-Frame-Options: DENY`: nadie puede incrustar la app.
- **`Referrer-Policy: no-referrer`**: ni Supabase ni Google reciben la URL (que puede incluir ids de sesión).
- La política queda más estricta que lo que se probó: `connect-src` ya impide hasta la telemetría de Google aunque se quitara el bloqueo en código.

## Cómo se verificó

`e2e/csp.spec.ts` (`npm run e2e -- csp`): compila la app (`vite build` a `node_modules/.tmp/dist-csp`), la sirve con un servidor mínimo que envía **exactamente** los encabezados de `vercel.json` (`vite preview` no los aplica) y abre, con listeners de `securitypolicyviolation` y de consola:

1. `/acceso`, ingreso real del paciente de prueba por la UI e `/inicio`.
2. Todas las pantallas del paciente (inicio, ejercicios, progreso con gráficos, historial, perfil, privacidad) y del terapeuta (pacientes, alertas, planes, informes).
3. Un juego con `?fuente=sintetica` (three.js + Rapier, fase `jugando`, `fisica: true`).
4. La calibración con `?fuente=camara&delegado=cpu` y cámara falsa (MediaPipe wasm local + modelo).

Resultado: 0 violaciones CSP, 0 errores de consola o de página. Otra prueba confirma que la política está activa (un script en línea, un `fetch` y un `<script src>` a otro origen se bloquean).

Pendiente tras el deploy: `curl -I https://<dominio>/acceso` debe mostrar `content-security-policy`. En Vercel los encabezados de `vercel.json` aplican a las rutas servidas (incluidas las reescritas a `index.html`). No probado: generar un informe PDF (jsPDF) en navegador real con la CSP (el bundle no contiene `eval`/`new Function`; las pantallas de informes sí cargan sin violaciones).

## Restablecer al paciente de prueba

`eliminar_mis_datos` (botón "Eliminar") borra plan, sesiones, consentimientos y citas del paciente que lo usa. Para el paciente de prueba (`prueba.demo@example.com`) se restaura con `npx tsx scripts/prueba-privacidad.ts restaurar` (service_role: consentimiento 1.0, plan v1, ajustes y sin sesiones/auditoría) o con `npm run db:seed`. El e2e `privacidad` lo hace solo al empezar, al terminar y en cada `finally`. `npx tsx scripts/prueba-privacidad.ts sin-consentimiento` borra solo su consentimiento (para probar la firma a mano).
