// Captura de una vista en tamaño teléfono para compararla con la imagen de referencia.
// Uso: npm run captura -- <ruta> <nombre> [--como paciente|terapeuta|nadie] [--horizontal] [--espera ms]
//   npm run captura -- /inicio inicio
//   npm run captura -- "/sesion/S-20261121-03/jugar?fuente=sintetica" caja --horizontal
// Guarda docs/capturas/<nombre>.png. Levanta el servidor dev en :5175 si no hay uno corriendo.
// La sesión se inyecta con las cuentas demo (no depende de que la pantalla de acceso exista).
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const args = process.argv.slice(2)
const [rutaCruda, nombre] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').match(/^--(como|espera)$/))
// Git Bash (MSYS) convierte "/inicio" en "C:/Program Files/Git/inicio": se deshace aquí.
const ruta = rutaCruda?.replace(/^[A-Za-z]:[\\/].*?[\\/]Git(?=[\\/])/i, '').replace(/\\/g, '/')
if (!ruta || !nombre) {
  console.error('Uso: npm run captura -- <ruta> <nombre> [--como paciente|terapeuta|nadie] [--horizontal] [--espera ms]')
  process.exit(1)
}
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const como = opt('--como', ruta.startsWith('/terapeuta') ? 'terapeuta' : ruta === '/acceso' ? 'nadie' : 'paciente')
const espera = Number(opt('--espera', 1500))
const horizontal = args.includes('--horizontal')
const PUERTO = 5175
const BASE = `http://localhost:${PUERTO}`

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)

async function arriba() {
  try {
    return (await fetch(BASE)).ok
  } catch {
    return false
  }
}

let servidor = null
if (!(await arriba())) {
  servidor = spawn('npx', ['vite', '--port', String(PUERTO), '--strictPort'], { shell: true, stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await arriba()); i++) await new Promise((r) => setTimeout(r, 500))
  if (!(await arriba())) {
    console.error('No levantó el servidor dev en ' + BASE)
    process.exit(1)
  }
}

let sesionJson = null
if (como !== 'nadie') {
  const email = como === 'terapeuta' ? 'terapeuta.demo@example.com' : 'carmen.demo@example.com'
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } })
  const r = await sb.auth.signInWithPassword({ email, password: 'manoviva-demo' })
  if (r.error) {
    console.error('Login demo falló: ' + r.error.message)
    process.exit(1)
  }
  sesionJson = JSON.stringify(r.data.session)
}

const navegador = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const viewport = horizontal ? { width: 844, height: 390 } : { width: 390, height: 844 }
const ctx = await navegador.newContext({ viewport, deviceScaleFactor: 2, locale: 'es-CL', timezoneId: 'America/Santiago', permissions: ['camera'] })
if (sesionJson) await ctx.addInitScript((s) => localStorage.setItem('manoviva-auth', s), sesionJson)
const pagina = await ctx.newPage()
const errores = []
pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
pagina.on('pageerror', (e) => errores.push(e.message))
await pagina.goto(BASE + ruta, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(espera)
mkdirSync(new URL('../docs/capturas/', import.meta.url), { recursive: true })
const archivo = `docs/capturas/${nombre}.png`
await pagina.screenshot({ path: archivo, fullPage: false })
console.log(`captura: ${archivo} (${viewport.width}x${viewport.height}, como ${como}) url final: ${pagina.url().replace(BASE, '')}`)
if (errores.length) console.log('errores de consola:\n  ' + errores.slice(0, 10).join('\n  '))
await navegador.close()
servidor?.kill()
process.exit(0)
