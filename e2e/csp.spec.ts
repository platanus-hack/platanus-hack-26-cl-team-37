// F18 · Content-Security-Policy real: se compila la app y se sirve dist/ con EXACTAMENTE los encabezados de vercel.json
// (vite preview no los aplica). Se comprueba que la política está activa y que la app sigue funcionando sin una sola
// violación: /acceso, ingreso del paciente de prueba por la UI, un juego (three.js + Rapier, fuente sintética) y la
// calibración con MediaPipe (wasm local, cámara falsa). Inventario de red: docs/privacidad-red.md.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { CLAVE_DEMO, CUENTAS, entrarComo } from './ayudas.ts'
import { esperarFase, ID_FALSO, juego, sesionFalsa } from './juegos.ts'

test.describe.configure({ mode: 'serial' })
// Este build trae el service worker de la PWA. Si toma el control, las peticiones a Supabase salen por él y page.route
// (la sesión falsa de juegos.ts) no las ve: la calibración pedía la sesión a la base real y no la encontraba.
// El service worker se prueba en offline.spec.ts; aquí solo importa la CSP.
test.use({ serviceWorkers: 'block' })

const PUERTO = Number(process.env.CSP_PUERTO ?? 5197)
const BASE = `http://localhost:${PUERTO}`
const DIST = join(process.cwd(), 'node_modules', '.tmp', 'dist-csp')
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.png': 'image/png', '.woff2': 'font/woff2',
}

// Encabezados tal como los aplicará Vercel (source "/(.*)").
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
// vercel.json trae la ref de Supabase de producción. Si .env.local apunta a otro proyecto (manoviva-dev, en local y en
// la CI), se sirve la CSP con esa ref, igual que hacen los deploys de desarrollo de .github/workflows/ci.yml.
const REF_PROD = 'iniposctftmzxkqasikh'
const URL_APP = /^VITE_SUPABASE_URL=(.*)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? ''
const REF_APP = /^https?:\/\/([^.]+)\./.exec(URL_APP)?.[1] ?? REF_PROD
const ENCABEZADOS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value.replaceAll(REF_PROD, REF_APP)]),
)
const CSP = ENCABEZADOS['Content-Security-Policy']
const CSP_VERCEL = vercel.headers.find((h) => h.source === '/(.*)')!.headers.find((h) => h.key === 'Content-Security-Policy')!.value

let servidor: Server

test.beforeAll(async () => {
  test.setTimeout(180_000)
  // Mismas variables VITE_* que el build real (.env.local); salida aparte para no pisar dist/.
  execSync(`npx vite build --outDir "${DIST}" --emptyOutDir`, { stdio: 'ignore' })
  servidor = createServer((req, res) => {
    const ruta = decodeURIComponent((req.url ?? '/').split('?')[0])
    let archivo = normalize(join(DIST, ruta))
    let ok = archivo.startsWith(DIST)
    try {
      if (!ok || !extname(archivo)) throw new Error('rewrite')
      readFileSync(archivo)
    } catch {
      // Igual que los rewrites de vercel.json: rutas sin archivo → index.html; archivos que faltan → 404.
      ok = !extname(ruta) || ruta === '/'
      archivo = join(DIST, 'index.html')
    }
    if (!ok) {
      res.writeHead(404, ENCABEZADOS)
      return res.end('no encontrado')
    }
    res.writeHead(200, { ...ENCABEZADOS, 'Content-Type': MIME[extname(archivo)] ?? 'application/octet-stream' })
    res.end(readFileSync(archivo))
  })
  await new Promise<void>((r) => servidor.listen(PUERTO, r))
})
test.afterAll(() => servidor?.close())

/** Junta violaciones CSP (evento del navegador + mensajes de consola, también de workers) y errores de página. */
function vigilarCsp(page: Page) {
  const problemas: string[] = []
  // (e2e se tipa sin DOM: el código del navegador va como texto)
  void page.addInitScript(
    "document.addEventListener('securitypolicyviolation', (e) => console.warn('CSPVIOLACION ' + e.violatedDirective + ' ' + e.blockedURI))",
  )
  page.on('console', (m) => {
    const t = m.text()
    if (/^INFO: /.test(t)) return // MediaPipe/TFLite informa por console.error; no es un error
    if (/CSPVIOLACION|Content Security Policy|Refused to/i.test(t) || m.type() === 'error') problemas.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', (e) => problemas.push(`[pageerror] ${e.message}`))
  return problemas
}

test('el servidor aplica la CSP y los encabezados de vercel.json', async ({ request }) => {
  const r = await request.get(`${BASE}/acceso`)
  expect(r.status()).toBe(200)
  expect(r.headers()['content-security-policy']).toBe(CSP)
  expect(r.headers()['x-content-type-options']).toBe('nosniff')
  expect(r.headers()['referrer-policy']).toBe('no-referrer')
  expect(r.headers()['permissions-policy']).toContain('camera=(self)')
  // Política mínima: nada de eval ni de scripts en línea; Supabase por https y wss; camera solo para este origen.
  expect(CSP).not.toMatch(/(?<!wasm-)unsafe-eval|script-src[^;]*unsafe-inline/)
  expect(CSP).toContain("script-src 'self' 'wasm-unsafe-eval'")
  expect(CSP_VERCEL).toContain(`https://${REF_PROD}.supabase.co`)
  expect(CSP_VERCEL).toContain(`wss://${REF_PROD}.supabase.co`)
  expect(CSP).toContain(`https://${REF_APP}.supabase.co`)
  expect(CSP).toContain(`wss://${REF_APP}.supabase.co`)
  expect(CSP).not.toMatch(/\*|http:\/\//)
})

test('la política está activa: bloquea scripts en línea, fetch y scripts de otros orígenes', async ({ page }) => {
  await page.goto(`${BASE}/acceso`)
  const r = await page.evaluate<Record<string, string>>(`(async () => {
    const out = {}
    // Script en línea: sin 'unsafe-inline' en script-src no se ejecuta (cubre también la inyección de scripts).
    const sc = document.createElement('script')
    sc.textContent = 'window.__ejecutado = true'
    document.head.appendChild(sc)
    out.inline = window.__ejecutado ? 'permitido' : 'bloqueado'
    out.fetch = await fetch('https://example.com/x').then(() => 'permitido', () => 'bloqueado')
    out.script = await new Promise((res) => {
      const s = document.createElement('script')
      s.src = 'https://example.com/x.js'
      s.onload = () => res('permitido')
      s.onerror = () => res('bloqueado')
      document.head.appendChild(s)
    })
    return out
  })()`)
  expect(r).toEqual({ inline: 'bloqueado', fetch: 'bloqueado', script: 'bloqueado' })
})

test('acceso + ingreso del paciente de prueba + inicio: sin violaciones', async ({ page }) => {
  test.setTimeout(60_000)
  const problemas = vigilarCsp(page)
  await page.goto(`${BASE}/acceso`)
  await expect(page.getByRole('heading', { level: 1, name: 'Kuwü' })).toBeVisible()
  await page.getByRole('radio', { name: /Soy paciente/ }).click()
  await page.getByLabel('Código de la clínica').fill('CRM-4821')
  await page.getByLabel('Correo').fill(CUENTAS.prueba)
  await page.getByLabel('Contraseña').fill(CLAVE_DEMO)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hola')
  await page.goto(`${BASE}/privacidad`)
  await expect(page.getByRole('heading', { name: 'Tu video no se guarda' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(problemas).toEqual([])
})

// Gráficos (Recharts), informes y demás pantallas: estilos y recursos propios, sin violaciones.
for (const [como, rutas] of [
  ['paciente', ['/inicio', '/ejercicios', '/progreso', '/historial', '/perfil', '/privacidad']],
  ['terapeuta', ['/terapeuta/pacientes', '/terapeuta/alertas', '/terapeuta/planes', '/terapeuta/informes']],
] as const) {
  test(`pantallas del ${como}: sin violaciones`, async ({ page, context }) => {
    test.setTimeout(90_000)
    await entrarComo(context, como)
    const problemas = vigilarCsp(page)
    for (const ruta of rutas) {
      await page.goto(BASE + ruta)
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    }
    expect(problemas).toEqual([])
  })
}

test('juego con ?fuente=sintetica (three.js + Rapier): sin violaciones', async ({ page, context }) => {
  test.setTimeout(60_000)
  await entrarComo(context, 'prueba')
  const problemas = vigilarCsp(page)
  await sesionFalsa(page, 'caja-juguetes', 5, 10, 1)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto(`${BASE}/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
  await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible({ timeout: 20_000 })
  await esperarFase(page, 'jugando', 20_000)
  await expect.poll(async () => (await juego(page))?.fisica, { timeout: 15_000 }).toBe(true) // Rapier (wasm) cargó
  await expect(page.locator('canvas.juego-lienzo')).toBeVisible()
  expect(problemas).toEqual([])
})

test('calibración con la cámara falsa (MediaPipe wasm local): sin violaciones', async ({ page, context }) => {
  test.setTimeout(90_000)
  await entrarComo(context, 'prueba')
  const problemas = vigilarCsp(page)
  await sesionFalsa(page, 'caja-juguetes', 5, 10, 1)
  await page.goto(`${BASE}/sesion/${ID_FALSO}/calibrar?fuente=camara&delegado=cpu`)
  await expect(page.getByRole('heading', { level: 1, name: 'Calibración' })).toBeVisible({ timeout: 20_000 })
  // MediaPipe carga wasm + modelo desde el propio origen y queda buscando manos (la imagen falsa no tiene).
  await expect(page.getByTestId('fuente')).toContainText(/fps/, { timeout: 60_000 })
  expect(problemas).toEqual([])
})
