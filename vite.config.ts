import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// HTTPS en la red local para probar en un teléfono (la cámara exige HTTPS fuera de localhost): si existen los certificados de
// mkcert en .certs/ (ver docs/telefono.md), `npm run dev:https` y `npm run preview:https` los usan. Sin ellos, HTTP normal.
const certificados = existsSync('.certs/dev.pem') && existsSync('.certs/dev-key.pem') ? { cert: readFileSync('.certs/dev.pem'), key: readFileSync('.certs/dev-key.pem') } : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA (F20). El service worker solo existe en el build (en `npm run dev` no se registra: no estorba a los e2e ni al HMR).
    VitePWA({
      registerType: 'autoUpdate', // el SW nuevo toma el control solo (skipWaiting + clientsClaim)
      injectRegister: 'script', // <script src="/registerSW.js"> solo en el build
      includeAssets: ['favicon.svg', 'iconos/apple-touch-icon.png'],
      manifest: {
        name: 'ManoViva',
        short_name: 'ManoViva',
        description: 'Rehabilitación de manos que se juega.',
        lang: 'es-CL',
        start_url: '/',
        scope: '/',
        id: '/',
        display: 'standalone',
        background_color: '#0f1720',
        theme_color: '#0f1720',
        icons: [
          { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precaché (se baja al instalar el SW): la app (incl. el chunk de Rapier de ~4,3 MB), las fuentes, el modelo de manos
        // y el wasm de MediaPipe que usa Chromium/Safari. Con eso la app abre y se juega sin red tras la primera visita.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,json}', 'mediapipe/hand_landmarker.task', 'mediapipe/wasm/vision_wasm_internal.*'],
        // La otra variante del wasm (_module_) no se baja de antemano (14 MB más): si algún navegador la pide, se guarda al usarla.
        globIgnores: ['mediapipe/wasm/vision_wasm_module_internal.*', 'grabaciones/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/mediapipe\//, /^\/fuentes\//, /^\/iconos\//],
        cleanupOutdatedCaches: true,
        skipWaiting: true, // el SW nuevo toma el control sin esperar a cerrar la app
        clientsClaim: true,
        runtimeCaching: [
          // Supabase: nunca por caché. Los datos se guardan aparte (IndexedDB: src/data/sinConexion.ts) y las escrituras van a la cola.
          { urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' },
          { urlPattern: ({ url }) => url.pathname.startsWith('/mediapipe/'), handler: 'CacheFirst', options: { cacheName: 'mediapipe', expiration: { maxEntries: 12 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith('/grabaciones/'), handler: 'StaleWhileRevalidate', options: { cacheName: 'grabaciones' } },
        ],
      },
    }),
  ],
  server: { https: certificados, allowedHosts: true }, // allowedHosts: deja entrar por un túnel (cloudflared, ngrok)
  preview: { https: certificados, allowedHosts: true },
  // Vitest solo corre las unitarias de src/; e2e/ es de Playwright (npm run e2e).
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
