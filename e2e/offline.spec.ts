// F20 · PWA instalable y sin conexión. Corre contra el BUILD (npm run e2e:offline → playwright.preview.config.ts),
// porque el service worker no existe en `vite dev`.
//  1. Manifest válido, SW registrado y activo, caché con app + modelo + wasm + Rapier + fuentes, nada de Supabase en caché,
//     y ninguna petición a Google Fonts (autoalojadas).
//  2. Con la red cortada (context.setOffline) el paciente de PRUEBA completa preparar → calibrar → jugar (sintética) →
//     sensación; todo queda en la cola local y al volver la red se sincroniza y el resumen cierra la sesión con hash.
// Limpieza: solo las sesiones de esta prueba (limpiarPrueba con ids).
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, esperarFase, limpiarPrueba } from './juegos.ts'

// e2e/ no tiene tipos DOM: lo mínimo de lo que se usa dentro de page.evaluate.
type Ventana = {
  caches: { keys(): Promise<string[]>; open(n: string): Promise<{ keys(): Promise<{ url: string }[]> }> }
  navigator: { serviceWorker: { ready: Promise<unknown>; controller: unknown } }
  indexedDB: { open(n: string): { result: any; onerror: () => void; onsuccess: () => void } } // eslint-disable-line @typescript-eslint/no-explicit-any
  document: { fonts: { check(f: string): boolean; load(f: string): Promise<unknown> } }
}

/** Espera a que el SW esté activo y controle la página (autoUpdate: skipWaiting + clientsClaim). */
async function esperarSW(page: Page) {
  await page.evaluate(async () => {
    await (globalThis as unknown as Ventana).navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => !!(globalThis as unknown as Ventana).navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true)
}

async function urlsEnCache(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const w = globalThis as unknown as Ventana
    const urls: string[] = []
    for (const nombre of await w.caches.keys()) for (const r of await (await w.caches.open(nombre)).keys()) urls.push(r.url)
    return urls
  })
}

async function pendientes(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolver) => {
        const abrir = (globalThis as unknown as Ventana).indexedDB.open('manoviva')
        abrir.onerror = () => resolver(-1)
        abrir.onsuccess = () => {
          const db = abrir.result
          if (!db.objectStoreNames.contains('pendientes')) return resolver(0)
          const c = db.transaction('pendientes').objectStore('pendientes').count()
          c.onsuccess = () => {
            db.close()
            resolver(c.result)
          }
        }
      }),
  )
}

test.describe('PWA: instalable y sin conexión', () => {
  test('manifest válido, service worker activo y caché con app, modelo, wasm, Rapier y fuentes (sin Supabase)', async ({ page }) => {
    const salientes: string[] = []
    page.on('request', (req) => {
      const u = new URL(req.url())
      if (u.hostname !== 'localhost' && !u.host.endsWith('supabase.co')) salientes.push(req.url())
    })
    await page.goto('/acceso')
    await esperarSW(page)

    // Manifest: el que enlaza el HTML.
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBe('/manifest.webmanifest')
    const m = await (await page.request.get(href!)).json()
    expect(m).toMatchObject({ name: 'Kuwü', short_name: 'Kuwü', display: 'standalone', theme_color: '#fff9f0', background_color: '#fff9f0', start_url: '/' })
    const icono = (tam: string, proposito: string) => m.icons.find((i: { sizes: string; purpose: string }) => i.sizes === tam && i.purpose === proposito)
    for (const i of [icono('192x192', 'any'), icono('512x512', 'any'), icono('512x512', 'maskable')]) {
      expect(i, 'ícono del manifest').toBeTruthy()
      const r = await page.request.get(i.src)
      expect(r.status()).toBe(200)
      expect(r.headers()['content-type']).toContain('image/png')
    }
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fff9f0')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/iconos/apple-touch-icon.png')

    // Caché del SW: lo que hace falta para jugar sin red tras la primera visita.
    const urls = await urlsEnCache(page)
    const tiene = (f: RegExp) => urls.some((u) => f.test(new URL(u).pathname))
    expect(tiene(/^\/index\.html$|^\/$/), 'index').toBe(true)
    expect(tiene(/^\/mediapipe\/hand_landmarker\.task$/), 'modelo').toBe(true)
    expect(tiene(/^\/mediapipe\/wasm\/vision_wasm_internal\.wasm$/), 'wasm').toBe(true)
    expect(tiene(/^\/mediapipe\/wasm\/vision_wasm_internal\.js$/), 'loader wasm').toBe(true)
    expect(tiene(/^\/assets\/rapier-.*\.js$/), 'chunk de Rapier').toBe(true)
    expect(tiene(/^\/fuentes\/poppins-700-latin\.woff2$/), 'Poppins').toBe(true)
    expect(tiene(/^\/fuentes\/dm-sans-latin\.woff2$/), 'DM Sans').toBe(true)
    expect(urls.filter((u) => /supabase\.co/.test(u)), 'Supabase nunca en caché').toEqual([])

    // Fuentes propias: ningún origen externo (ni Google Fonts) y la tipografía carga.
    expect(salientes).toEqual([])
    // Nunito (la fuente del brandbook, textos y cifras) se sirve desde la app y carga.
    expect(await page.evaluate(async () => {
      const d = (globalThis as unknown as Ventana).document
      await d.fonts.load('800 16px "Nunito"')
      return d.fonts.check('800 16px "Nunito"')
    })).toBe(true)
  })

  test('sin conexión el paciente completa una sesión entera y al volver la red se sincroniza y se cierra', async ({ page, context }) => {
    test.setTimeout(240_000)
    await entrarComo(context, 'prueba')
    const sb = await clienteComo('prueba')
    const previas = ((await sb.from('sesiones').select('id').eq('juego', 'caja-juguetes').eq('parametros->>nivel', '1')).data ?? []).map((x) => x.id as string)
    limpiarPrueba(previas)
    let id = ''
    const v = vigilarErrores(page)
    try {
      // 1. Con red: se abre lo que el paciente verá (queda copiado en el teléfono) y se espera el service worker.
      await page.goto('/inicio?fuente=sintetica')
      await esperarSW(page)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
      await page.getByRole('group', { name: 'Dificultad' }).getByRole('button', { name: 'Nivel 1' }).click()

      // 2. Se corta la red y se vuelve a cargar: la app, la pantalla y los datos salen del teléfono.
      await (context as BrowserContext).setOffline(true)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
      await expect(page.getByTestId('estado-red')).toContainText('Sin conexión')
      await page.getByRole('group', { name: 'Dificultad' }).getByRole('button', { name: 'Nivel 1' }).click()
      await page.getByRole('button', { name: 'Comenzar' }).click()

      // Sesión creada sin servidor: ID provisional.
      await expect(page).toHaveURL(/\/sesion\/S-\d{8}-L[0-9a-z]+\/calibrar\?fuente=sintetica$/)
      const provisional = new URL(page.url()).pathname.split('/')[2]
      await expect(page).toHaveURL(new RegExp(`/sesion/${provisional}/jugar\\?fuente=sintetica$`), { timeout: 40_000 })
      await page.setViewportSize(HORIZONTAL)
      await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible({ timeout: 20_000 })
      await esperarFase(page, 'jugando', 20_000)
      await page.waitForTimeout(3_000)
      await page.getByRole('button', { name: 'Menú' }).click()
      await page.getByRole('button', { name: 'Terminar sesión' }).click()

      await expect(page).toHaveURL(new RegExp(`/sesion/${provisional}/sensacion\\?fuente=sintetica$`), { timeout: 15_000 })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('slider', { name: /Dolor durante la sesión/ }).fill('2')
      await page.getByRole('button', { name: 'Suave', exact: true }).click()
      await page.getByRole('button', { name: 'Guardar y ver resumen' }).click()

      // Sin red el resumen se muestra, pero no se puede cerrar (hash): avisa y deja reintentar.
      await expect(page).toHaveURL(new RegExp(`/sesion/${provisional}/resumen\\?fuente=sintetica$`), { timeout: 15_000 })
      await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()
      await expect(page.getByTestId('dato-dolor')).toContainText('2/10')
      await expect(page.getByRole('alert')).toContainText('No pudimos cerrar la sesión todavía')
      expect(await pendientes(page)).toBeGreaterThan(2) // crear sesión + actualizaciones + eventos
      const sinRed = await sb.from('sesiones').select('id').eq('juego', 'caja-juguetes').eq('parametros->>nivel', '1')
      expect(sinRed.data ?? []).toHaveLength(0) // nada llegó al servidor

      // 3. Vuelve la red: la cola sube sola, la sesión recibe su ID real y queda completa en la BD.
      await context.setOffline(false)
      await expect.poll(async () => (await sb.from('sesiones').select('id').eq('juego', 'caja-juguetes').eq('parametros->>nivel', '1')).data?.length ?? 0, { timeout: 30_000 }).toBe(1)
      id = ((await sb.from('sesiones').select('id').eq('juego', 'caja-juguetes').eq('parametros->>nivel', '1')).data ?? [])[0].id as string
      expect(id).toMatch(/^S-\d{8}-\d{2,}$/)
      await expect.poll(() => pendientes(page), { timeout: 30_000 }).toBe(0)
      const f = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(f.estado).toBe('en curso')
      expect(f.dolor_eva).toBe(2)
      expect(f.esfuerzo).toBe('Suave')
      expect(f.metricas).toMatchObject({ meta: 12, motivoFin: 'manual' })
      expect(f.calibracion).toBeTruthy()
      const eventos = (await sb.from('eventos_sesion').select('seq').eq('sesion_id', id)).data ?? []
      expect(eventos.length).toBeGreaterThan(0)

      // 4. Reintentar: ahora sí se cierra con hash (la URL sigue con el ID provisional, que se resuelve solo).
      await page.getByRole('button', { name: 'Reintentar' }).click()
      await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 20_000 })
      await expect.poll(async () => (await sb.from('sesiones').select('estado, hash').eq('id', id).single()).data?.estado, { timeout: 15_000 }).toBe('cerrada')
      expect((await sb.from('sesiones').select('hash').eq('id', id).single()).data!.hash).toMatch(/^[0-9a-f]{64}$/)
      await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)
      // Sin duplicados: la cola creó la sesión una sola vez.
      expect(((await sb.from('sesiones').select('id').eq('juego', 'caja-juguetes').eq('parametros->>nivel', '1')).data ?? []).map((x) => x.id)).toEqual([id])
      // Sin red el navegador registra las peticiones fallidas; cualquier otro error de la app sí cuenta.
      expect(v.errores.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e))).toEqual([])
    } finally {
      await context.setOffline(false).catch(() => undefined)
      await page.goto('about:blank').catch(() => undefined)
      limpiarPrueba([id])
    }
  })
})
