// Utilidades compartidas de las pruebas e2e.
import { readFileSync } from 'node:fs'
import { expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

export type Como = 'paciente' | 'terapeuta'

export const CUENTAS: Record<Como, string> = {
  paciente: 'carmen.demo@example.com',
  terapeuta: 'terapeuta.demo@example.com',
}
export const CLAVE_DEMO = 'manoviva-demo'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)

// Una sesión por cuenta y por proceso de prueba (evita el límite de ingresos de Supabase).
const sesiones = new Map<Como, Promise<string>>()
function sesionDe(como: Como): Promise<string> {
  let s = sesiones.get(como)
  if (!s) {
    s = (async () => {
      const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: WebSocket as never },
      })
      const r = await sb.auth.signInWithPassword({ email: CUENTAS[como], password: CLAVE_DEMO })
      if (r.error || !r.data.session) throw new Error(`Login demo falló (${como}): ${r.error?.message}`)
      return JSON.stringify(r.data.session)
    })()
    sesiones.set(como, s)
  }
  return s
}

/**
 * Deja al contexto con la sesión de una cuenta demo (misma clave localStorage que usa la app).
 * Se inyecta una sola vez por pestaña: si la prueba cierra sesión, no vuelve a aparecer.
 * La pantalla de acceso real (F03) tiene su propia prueba.
 */
export async function entrarComo(ctx: BrowserContext, como: Como) {
  const s = await sesionDe(como)
  await ctx.addInitScript((sesion) => {
    if (sessionStorage.getItem('e2e-sesion')) return
    localStorage.setItem('manoviva-auth', sesion)
    sessionStorage.setItem('e2e-sesion', '1')
  }, s)
}

/** Junta errores de consola y de página para comprobar que una vista carga limpia. */
export function vigilarErrores(page: Page) {
  const errores: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  page.on('pageerror', (e) => errores.push(e.message))
  return {
    errores,
    sinErrores: () => expect(errores, 'errores de consola').toEqual([]),
  }
}
