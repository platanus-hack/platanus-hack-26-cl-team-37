// Pruebas e2e: npm run e2e  (o npm run e2e -- smoke para un archivo).
// Levanta el servidor dev en :5176 (5174 queda para npm run dev y 5175 para npm run captura).
import { defineConfig, devices } from '@playwright/test'

const PUERTO = 5176

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 2,
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
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
  },
})
