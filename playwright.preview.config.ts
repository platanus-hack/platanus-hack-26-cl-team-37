// Pruebas e2e de la PWA (F20): contra el BUILD (vite build + vite preview), porque el service worker no existe en `npm run dev`.
//   npm run e2e:offline          (puerto: E2E_PUERTO_PREVIEW, por defecto 5177)
import { defineConfig, devices } from '@playwright/test'

const PUERTO = Number(process.env.E2E_PUERTO_PREVIEW ?? 5177)

export default defineConfig({
  testDir: 'e2e',
  testMatch: /offline\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PUERTO}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    permissions: ['camera'],
    serviceWorkers: 'allow',
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
  },
})
