// F08 · Calibración: con ?fuente=sintetica completa los 3 pasos, guarda la línea base en la Sesion y sigue a /jugar.
// Además: permiso denegado / sin cámara (getUserMedia rechazado), poca luz, mano fuera del marco y sin mano
// (control en vivo de la fuente sintética), sesión inexistente o cerrada.
// La sesión real que crea la primera prueba se borra al final con scripts/limpiar-preparadas.ts (sigue "preparada":
// la calibración no cambia el estado).
import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'

const ID_FALSO = 'S-20990101-01'
// e2e se tipa sin DOM (tsconfig.node.json): tipos mínimos de lo que se toca en el navegador.
type FuenteViva = { fijarLuz(l: number): void; fijarPose(p: object): void; ocultar(): void }
type Ventana = { __manoviva?: { guion?: unknown; fuente?: FuenteViva } }
type ConCamara = { navigator: { mediaDevices: { getUserMedia: () => Promise<never> } } }
/** Fila de sesiones (snake_case, como la devuelve PostgREST) para pruebas sin escribir en la BD. */
const filaFalsa = (estado: string) => ({
  id: ID_FALSO,
  paciente_id: '00000000-0000-0000-0000-000000000000',
  plan_version: null,
  juego: 'caja-juguetes',
  parametros: { mano: 'derecha', nivel: 1, duracionMin: 5, metaAgarres: 0, metaPinzaCm: 0, prescritoPor: null },
  inicio: null,
  fin: null,
  estado,
  calibracion: null,
  metricas: null,
  muestras: null,
  dolor_eva: null,
  esfuerzo: null,
  nota: null,
  dispositivo: null,
  version_app: null,
  version_modelo: null,
  hash: null,
  creada: new Date().toISOString(),
})

/** Sesión falsa (GET) y ninguna escritura real (PATCH falla si ocurre). */
async function sesionFalsa(page: Page, estado = 'preparada') {
  const escrituras: string[] = []
  await page.route('**/rest/v1/sesiones?*', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [filaFalsa(estado)] })
    escrituras.push(route.request().method())
    return route.fulfill({ status: 500, json: { message: 'sin escrituras en esta prueba' } })
  })
  return escrituras
}

const indicacion = (p: Page) => p.getByTestId('indicacion')
const fila = (p: Page, nombre: string) => p.locator('.calibrar-fila', { hasText: nombre })

test.describe('calibración', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('con ?fuente=sintetica completa los 3 pasos, guarda la calibración y sigue a /jugar', async ({ page }) => {
    test.setTimeout(90_000)
    const sb = await clienteComo('paciente')
    const { data: pac } = await sb.from('pacientes').select('id, largo_mano_cm').single()
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = '' // limpieza solo de esta sesión (los e2e corren en paralelo)
    try {
      const v = vigilarErrores(page)
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await page.getByRole('button', { name: 'Comenzar' }).click()
      await expect(page).toHaveURL(/\/sesion\/S-\d{8}-\d{2,}\/calibrar\?fuente=sintetica$/)
      id = new URL(page.url()).pathname.split('/')[2]

      await expect(page.getByRole('heading', { level: 1, name: 'Calibración' })).toBeVisible()
      await expect(page.getByTestId('fuente')).toContainText(/Mano simulada · \d+ fps/)
      // Paso 1: mano abierta dentro del marco (verde, 21/21).
      await expect(indicacion(page)).toHaveText('Mantén la mano abierta', { timeout: 15_000 })
      await expect(page.getByTestId('marco')).toHaveClass(/dentro/)
      await expect(page.getByTestId('puntos')).toHaveText('21/21 puntos')
      await expect(page.getByTestId('consejo')).toHaveText('Paso 1 de 3')
      // Checklist en vivo.
      await expect(fila(page, 'Iluminación')).toContainText('Buena')
      await expect(fila(page, 'Distancia')).toContainText(/\d+ cm aprox\./)
      await expect(fila(page, 'Confianza de detección')).toContainText('95%')
      if (pac?.largo_mano_cm) await expect(fila(page, 'Largo de la mano')).toContainText(/Regla · cámara \d+,\d aprox\./)
      // Paso 2 y 3.
      await expect(indicacion(page)).toContainText('Abre y cierra la mano', { timeout: 15_000 })
      await expect(page.getByTestId('consejo')).toHaveText('Paso 2 de 3')
      await expect(indicacion(page)).toHaveText('Junta el pulgar y el índice', { timeout: 15_000 })
      await expect(indicacion(page)).toHaveText('¡Calibración lista!', { timeout: 15_000 })
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
      await expect(page.getByTestId('consejo')).toHaveText('Continuando al ejercicio…')
      await page.screenshot({ path: 'docs/capturas/calibrar-lista.png' })

      // Guardado en la Sesion (vía repos, con RLS de la paciente).
      const { data: s, error } = await sb.from('sesiones').select('*').eq('id', id).single()
      expect(error).toBeNull()
      expect(s.estado).toBe('preparada')
      expect(s.inicio).not.toBeNull()
      expect(s.version_app).toBe('0.1.0')
      expect(s.version_modelo).toBe('sintetica (sin modelo)')
      expect(s.dispositivo).toMatchObject({ camara: 'sintetica' })
      expect(s.dispositivo.fps).toBeGreaterThan(10)
      const c = s.calibracion
      expect(c).toBeTruthy()
      expect(c.largoManoFuente).toBe(pac?.largo_mano_cm ? 'regla' : 'estimado')
      if (pac?.largo_mano_cm) expect(c.largoManoCm).toBe(Number(pac.largo_mano_cm))
      expect(c.largoManoEstimadoCm).toBeGreaterThan(17)
      expect(c.largoManoEstimadoCm).toBeLessThan(19.5)
      expect(c.aperturaPinzaMaxCm).toBeGreaterThan(5)
      expect(c.rangoAbrirCerrar.min).toBeLessThan(0.3)
      expect(c.rangoAbrirCerrar.max).toBeGreaterThan(0.8)
      expect(c.confianzaMedia).toBeCloseTo(0.95, 2)
      expect(c.fps).toBeGreaterThan(10)
      expect(c.escalaCmPorUnidad).toBeGreaterThan(80)

      // Continúa a /jugar conservando ?fuente=.
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/jugar\\?fuente=sintetica$`), { timeout: 8_000 })
      await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)
      v.sinErrores()
    } finally {
      execSync(`npx tsx scripts/limpiar-preparadas.ts ${desde} ${id}`, { stdio: 'inherit' })
    }
  })

  test('poca luz, mano fuera del marco y sin mano (fuente sintética en vivo)', async ({ page }) => {
    const escrituras = await sesionFalsa(page)
    await page.addInitScript(() => {
      // Mano quieta y abierta en el centro, como un teléfono vertical (sin pasos: no completa la calibración).
      ;(globalThis as unknown as Ventana).__manoviva = { guion: { manos: [{ lado: 'derecha', poses: [{ t: 0, x: 0.5, y: 0.5, apertura: 1 }] }], camara: { ancho: 480, alto: 640 } } }
    })
    await page.goto(`/sesion/${ID_FALSO}/calibrar?fuente=sintetica`)
    await expect(page.getByTestId('marco')).toHaveClass(/dentro/)

    await page.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarLuz(30))
    await expect(fila(page, 'Iluminación')).toContainText('Poca')
    await expect(fila(page, 'Iluminación')).toHaveAttribute('data-nivel', 'mal')
    await expect(page.getByTestId('consejo')).toHaveText('Hay poca luz: busca un lugar más iluminado')

    await page.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose({ x: 0.08, y: 0.5 }))
    await expect(indicacion(page)).toHaveText('Pon la mano dentro del marco')
    await expect(page.getByTestId('marco')).not.toHaveClass(/dentro/)
    await expect(page.getByTestId('puntos')).not.toHaveText('21/21 puntos')

    await page.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.fuente!.ocultar())
    await expect(indicacion(page)).toHaveText('Muestra tu mano a la cámara')
    await expect(page.getByTestId('puntos')).toHaveText('0/21 puntos')
    expect(escrituras).toEqual([])
  })

  for (const [nombre, error, titulo] of [
    ['permiso denegado muestra cómo activarlo', 'NotAllowedError', 'Necesitamos permiso para usar la cámara'],
    ['sin cámara lo explica', 'NotFoundError', 'No encontramos una cámara'],
  ] as const) {
    test(nombre, async ({ page }) => {
      await sesionFalsa(page)
      await page.addInitScript((n) => {
        ;(globalThis as unknown as ConCamara).navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('rechazado en la prueba', n))
      }, error)
      await page.goto(`/sesion/${ID_FALSO}/calibrar`)
      const alerta = page.getByRole('alert')
      await expect(alerta.getByRole('heading', { name: titulo })).toBeVisible({ timeout: 20_000 })
      if (error === 'NotAllowedError') {
        await expect(alerta).toContainText('Android (Chrome)')
        await expect(alerta).toContainText('iPhone (Safari)')
        await expect(alerta).toContainText('Permitir')
        await expect(alerta).toContainText('no se guarda ni se envía')
        await page.screenshot({ path: 'docs/capturas/calibrar-permiso.png' })
      }
      await expect(alerta.getByRole('button', { name: 'Reintentar' })).toBeVisible()
      await expect(alerta.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/inicio')
    })
  }

  test('cámara (falsa de Chromium): video en espejo de fondo, sin mano pide mostrarla', async ({ page }) => {
    test.setTimeout(60_000)
    const escrituras = await sesionFalsa(page)
    await page.goto(`/sesion/${ID_FALSO}/calibrar`)
    await expect(indicacion(page)).toHaveText('Muestra tu mano a la cámara', { timeout: 40_000 })
    await expect(page.getByTestId('fuente')).toContainText(/Cámara frontal · \d+ fps/)
    const video = page.locator('.calibrar-fondo video')
    await expect(video).toHaveCount(1)
    expect(await video.evaluate((v) => (globalThis as unknown as { getComputedStyle(e: unknown): { transform: string } }).getComputedStyle(v).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)')
    await expect(page.getByTestId('puntos')).toHaveText('0/21 puntos')
    expect(escrituras).toEqual([])
  })

  test('sesión inexistente o cerrada no calibra', async ({ page }) => {
    await page.route('**/rest/v1/sesiones?*', (route) => route.fulfill({ json: [] }))
    await page.goto(`/sesion/${ID_FALSO}/calibrar?fuente=sintetica`)
    await expect(page.getByText('No encontramos esta sesión')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver ejercicios' })).toBeVisible()
    await page.unrouteAll()
    await sesionFalsa(page, 'cerrada')
    await page.goto(`/sesion/${ID_FALSO}/calibrar?fuente=sintetica`)
    await expect(page.getByText('Esta sesión ya terminó')).toBeVisible()
    await expect(page.getByTestId('indicacion')).toHaveCount(0)
  })
})
