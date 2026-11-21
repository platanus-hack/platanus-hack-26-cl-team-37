# Probar ManoViva en un teléfono real

La cámara (y el service worker, que hace que la app funcione sin conexión) **solo funcionan con HTTPS** o en `localhost`.
Por eso desde el teléfono no sirve abrir `http://192.168.x.x:5174`. Hay tres caminos; el A es el más simple.

> Lo que sigue lo escribió una sesión sin teléfono a mano: los comandos y la configuración están probados en el computador
> (build, service worker, modo sin red con Playwright), pero **instalar en un teléfono real, el modo avión y la cámara
> frontal no se han probado**. Anota lo que veas en `docs/validacion.md` (F21).

## A. La URL de Vercel (recomendado)

1. En el computador: `vercel deploy --prod --yes` (proyecto `manoviva`), o usa la URL ya publicada: https://manoviva-sigma.vercel.app
2. Abre esa URL en el teléfono (Chrome en Android, Safari en iPhone). Es HTTPS real: cámara, instalación y modo sin red funcionan.
3. Ingresa con la cuenta demo (paciente `carmen.demo@example.com`; ver `docs/manoviva-spec.md`).

Es la única forma de probar la instalación como la verá una persona.

## B. Servidor local por HTTPS en la red Wi-Fi (para iterar sobre el código)

Computador y teléfono en la **misma red Wi-Fi**.

1. Instala `mkcert` (una vez): Windows `winget install FiloSottile.mkcert` · macOS `brew install mkcert`.
2. Crea la autoridad local y el certificado (cambia `192.168.1.50` por la IP de tu computador: `ipconfig` en Windows, `ifconfig` en macOS/Linux):

   ```bash
   mkcert -install
   mkdir -p .certs
   mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem localhost 127.0.0.1 192.168.1.50
   ```

   `.certs/` está en `.gitignore`: nunca se sube. `vite.config.ts` usa esos archivos solo si existen.
3. Arranca: `npm run dev:https` → `https://192.168.1.50:5174` (el service worker no existe en `dev`; para probar la instalación y el
   modo sin red usa `npm run preview:https`, que compila y sirve el build con el mismo certificado).
4. Que el teléfono confíe en el certificado:
   - **Android**: copia `rootCA.pem` (carpeta que muestra `mkcert -CAROOT`) al teléfono → Ajustes → Seguridad → Cifrado y credenciales → Instalar un certificado → Certificado de CA.
   - **iPhone**: envíate `rootCA.pem` (AirDrop/correo) → Ajustes → "Perfil descargado" → Instalar; luego Ajustes → General → Información → Ajustes de confianza de certificados → activar la confianza total para "mkcert".
5. Abre `https://192.168.1.50:5174` en el teléfono. Si Windows pregunta por el firewall, permite Node en redes privadas.

## C. Túnel con HTTPS (si no quieres instalar certificados en el teléfono)

Con `cloudflared` (gratis, sin cuenta): `npm run preview:https` en una terminal (sin `.certs/` sirve HTTP) y en otra
`cloudflared tunnel --url http://localhost:5174`. Te da una URL `https://….trycloudflare.com` válida para cámara y service worker.
Sirve para una prueba rápida; la URL cambia cada vez. (`allowedHosts` ya está abierto en `vite.config.ts` para túneles.)

## Instalar la app

- **Android (Chrome)**: menú ⋮ → "Instalar aplicación" (o "Agregar a pantalla principal"). Queda con ícono de ManoViva, abre sin barra del navegador (`display: standalone`) y con el color de tema #0f1720.
- **iPhone (Safari)**: botón Compartir → "Agregar a pantalla de inicio". Debe hacerse desde **Safari** (Chrome en iOS no instala PWAs). El ícono sale de `apple-touch-icon.png`.

## Comprobar que funciona sin conexión (modo avión)

1. Con red, abre la app instalada (o la pestaña) y navega: Inicio → Ejercicios → un juego → "Comenzar". Espera ~1 minuto la primera vez:
   el service worker baja en segundo plano la app, el modelo de manos (~8 MB) y el wasm de MediaPipe (~15 MB) — unos 28 MB en total, conviene tener Wi-Fi.
2. Activa el **modo avión** y cierra y vuelve a abrir la app. Debe verse la franja "Sin conexión · tus datos se guardan en el teléfono".
3. Completa una sesión entera: Ejercicios → juego → Comenzar → calibrar → jugar → sensación. La sesión recibe un ID provisional (`S-AAAAMMDD-L…`) y todo queda en el teléfono (IndexedDB, base `manoviva`).
4. El resumen se muestra, pero avisa "No pudimos cerrar la sesión todavía": cerrar (sellar con hash) necesita servidor.
5. Desactiva el modo avión. La cola sube sola (la sesión recibe su ID real); toca "Reintentar" en el resumen y la sesión queda cerrada.

Límites a recordar: **iniciar sesión por primera vez y cambiar de cuenta necesitan red**; los datos que se ven sin red son los que la app guardó la última vez que hubo conexión.
Si se borran los datos del sitio mientras hay cola pendiente, esas escrituras se pierden: no cierres sesión ni borres datos antes de volver a tener red.

## Diferencias de iPhone (Safari / PWA instalada)

- **Cámara**: pide permiso cada vez que se abre la app instalada si no se otorgó permanente; la cámara solo funciona en HTTPS. El `<video>` usa `playsinline` (sin él iOS abre el video a pantalla completa).
- **Orientación**: iOS no permite bloquearla (`screen.orientation.lock` no existe). Por eso, si se abre un juego en vertical aparece "Gira tu teléfono" y el juego queda en pausa hasta que se gira.
- **Zonas seguras**: la app usa `viewport-fit=cover` y `env(safe-area-inset-*)` (arriba para el notch/isla, abajo para la barra de inicio, a los lados en horizontal). Revisa en ambas orientaciones que nada quede bajo el notch.
- **Almacenamiento**: iOS puede borrar los datos de un sitio web sin uso por 7 días si no está instalado como PWA; instalada, no.
- Sin `beforeinstallprompt`: no hay botón propio de "Instalar"; se instala a mano como arriba.

## Publicar en tiendas con Capacitor (no implementado)

La app es una web: Capacitor la envuelve en un proyecto nativo (WebView) para App Store y Google Play. Haría falta:

1. **Cuentas**: Apple Developer Program (US$ 99/año, y un Mac con Xcode para compilar iOS) y Google Play Console (US$ 25 una vez).
2. **Proyecto**: `npm i @capacitor/core @capacitor/cli`, `npx cap init`, `webDir: 'dist'`, `npx cap add ios android`, y `npx cap sync` tras cada `vite build`. `appId` propio (p. ej. `cl.manoviva.app`).
3. **Cámara**: permisos nativos (`NSCameraUsageDescription` en Info.plist; `CAMERA` en AndroidManifest) con el texto de privacidad; `getUserMedia` funciona en el WebView (iOS 14.3+, Android System WebView reciente). Revisar el rendimiento de MediaPipe en WebView.
4. **Service worker**: no corre en el esquema `capacitor://` de iOS; en la app nativa los archivos ya van empaquetados (el modelo y el wasm no se descargan), así que no hace falta. La capa de datos con cola local (`src/data/sinConexion.ts`) sigue valiendo.
5. **Supabase**: permitir el origen `capacitor://localhost` / `https://localhost` en CORS y en las URL de redirección de Auth.
6. **Ícono y splash**: `@capacitor/assets` a partir de `public/iconos/icono-512.png` (1024×1024 recomendado para iOS).
7. **Revisión de tiendas**: política de privacidad pública (la de `/privacidad` sirve de base), declarar datos de salud/cámara ("no se guarda video"), y, por tratarse de rehabilitación, **posicionarla como apoyo y no como dispositivo médico** salvo que se quiera la regulación (Apple 1.4.1 / Play "Health apps"); capturas de pantalla por tamaño de dispositivo; cuenta demo para los revisores.
8. **Orientación**: en la app nativa sí se puede bloquear en horizontal para los juegos (`@capacitor/screen-orientation`), lo que elimina el aviso "Gira tu teléfono".
