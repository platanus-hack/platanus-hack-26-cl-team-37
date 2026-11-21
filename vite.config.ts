import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vitest solo corre las unitarias de src/; e2e/ es de Playwright (npm run e2e).
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
