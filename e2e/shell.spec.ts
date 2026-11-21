// F09 · Base común de juegos (J0): el juego de prueba 'prueba-shell' sobre /sesion/:id/jugar con ?fuente=sintetica.
// - Sesión REAL (Supabase): se monta, pasa a 'en curso', registra eventos, pausa sola sin mano > 2 s, se reanuda,
//   cumple la meta y va a /sensacion con métricas, muestras a 10 Hz y eventos guardados. Se mide el fps.
// - Sesión REAL: pausa manual desde Menú y fin por tiempo.
// - Sesión falsa (page.route, sin escribir en la BD): en vertical "Gira tu teléfono"; "Terminar sesión";
//   'prueba-fisica' carga Rapier (y 'prueba-shell' no).
// Las sesiones reales se borran al final con scripts/limpiar-preparadas.ts (borra 'preparada' y 'en curso' demo).
import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'

// e2e se tipa sin DOM: tipos mínimos de lo que se toca en el navegador.
type EstadoJuego = { fase: string; motivo: string | null; fps: number; calidad: number; pixelRatio: number; jugadoMs: number; contador: number; eventos: number; muestras: number; fisica: boolean; vivo: Record<string, number | null> }
type FuenteViva = { fijarPose(p: object, lado?: string): void; ocultar(): void; cargarGuion(g: object): void }
type Ventana = { __manovivaJuego?: EstadoJuego; __manoviva?: { fuente?: FuenteViva } }

const HORIZONTAL = { width: 844, height: 390 }
const CALIBRACION = {
  largoManoCm: 18.2,
  largoManoFuente: 'estimado',
  largoManoEstimadoCm: 18.2,
  aperturaPinzaMaxCm: 9.5,
  rangoAbrirCerrar: { min: 0.05, max: 1.0 },
  fps: 30,
  confianzaMedia: 0.95,
  escalaCmPorUnidad: 100,
}
const parametros = (duracionMin: number, meta: number) => ({ mano: 'derecha', nivel: 2, duracionMin, metaAgarres: meta, metaPinzaCm: 0, prescritoPor: null })

/** Abrir y cerrar la mano derecha: un ciclo cada 2 s (en bucle). */
const ABRIR_CERRAR = {
  manos: [
    {
      lado: 'derecha',
      poses: [
        { t: 0, x: 0.42, apertura: 1 },
        { t: 400, apertura: 1 },
        { t: 1000, apertura: 0 },
        { t: 1400, apertura: 0 },
        { t: 2000, apertura: 1 },
      ],
    },
  ],
}

const juego = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manovivaJuego ?? null)
async function esperarFase(p: Page, fase: string, timeout = 10_000) {
  await expect.poll(async () => (await juego(p))?.fase, { timeout }).toBe(fase)
}

/** Crea una sesión real 'preparada' de Carmen (con la sesión demo del e2e, sin ingreso extra). */
async function crearSesion(juegoId: string, duracionMin: number, meta: number): Promise<string> {
  const sb = await clienteComo('paciente')
  const pac = await sb.from('pacientes').select('id').single()
  if (pac.error) throw new Error(pac.error.message)
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }).replaceAll('-', '')
  for (let i = 0; i < 4; i++) {
    const id = await sb.rpc('siguiente_id_sesion', { p_dia: dia })
    if (id.error) throw new Error(id.error.message)
    const r = await sb.from('sesiones').insert({ id: id.data, paciente_id: pac.data.id, juego: juegoId, estado: 'preparada', parametros: parametros(duracionMin, meta), calibracion: CALIBRACION })
    if (!r.error) return id.data as string
    if (!/duplicate key/i.test(r.error.message)) throw new Error(r.error.message)
  }
  throw new Error('no se pudo asignar id')
}
/** Borra solo la sesión de esta prueba (los e2e corren en paralelo). Sin id (falló antes de crearla), todo desde `desde`. */
const limpiar = (desde: string, id: string) => execSync(`npx tsx scripts/limpiar-preparadas.ts ${desde} ${id}`, { stdio: 'inherit' })

const ID_FALSO = 'S-20990101-01'
/** Sesión falsa: GET devuelve la fila; PATCH/POST se aceptan sin tocar la BD y se guardan para revisarlos. */
async function sesionFalsa(page: Page, juegoId: string, duracionMin = 5, meta = 0) {
  const escrituras: { tabla: string; metodo: string; cuerpo: unknown }[] = []
  const fila = {
    id: ID_FALSO, paciente_id: '00000000-0000-0000-0000-000000000000', plan_version: null, juego: juegoId, parametros: parametros(duracionMin, meta),
    inicio: null, fin: null, estado: 'preparada', calibracion: CALIBRACION, metricas: null, muestras: null, dolor_eva: null, esfuerzo: null, nota: null,
    dispositivo: null, version_app: null, version_modelo: null, hash: null, creada: new Date().toISOString(),
  }
  await page.route('**/rest/v1/sesiones?*', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ json: [fila] })
    escrituras.push({ tabla: 'sesiones', metodo: m, cuerpo: route.request().postDataJSON() })
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/rest/v1/eventos_sesion?*', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ json: [] })
    escrituras.push({ tabla: 'eventos_sesion', metodo: m, cuerpo: route.request().postDataJSON() })
    return route.fulfill({ status: 201, json: [] })
  })
  return escrituras
}

test.describe('base común de juegos', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('juego de prueba: se monta, registra eventos, pausa sola sin mano > 2 s, cumple la meta y va a /sensacion', async ({ page }, info) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('prueba-shell', 5, 3)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)

      // Se monta: canvas, HUD y fase 'jugando' con la mano a la vista.
      await expect(page.getByRole('heading', { level: 1, name: 'Prueba de la base' })).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('canvas.juego-lienzo')).toBeVisible()
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('gira-telefono')).toHaveCount(0)
      await expect(page.getByTestId('contador')).toHaveText('0/3')
      await expect(page.getByTestId('mano-derecha')).toContainText('Abierta')
      await expect(page.getByTestId('mano-izquierda')).toContainText('—')
      await expect(page.getByTestId('vivo-apertura')).toContainText('%')
      await expect(page.getByRole('button', { name: 'Menú' })).toBeVisible()
      await expect(page.getByText('MediaPipe Hands')).toBeVisible()

      // La sesión pasó a 'en curso'.
      const sb = await clienteComo('paciente')
      await expect.poll(async () => (await sb.from('sesiones').select('estado, inicio').eq('id', id).single()).data?.estado, { timeout: 8_000 }).toBe('en curso')

      // fps con la escena base (ventana de 2 s; se espera a la segunda ventana).
      await page.waitForTimeout(4_500)
      const j0 = (await juego(page))!
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[shell] fps escena base: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)
      expect(j0.fps).toBeGreaterThanOrEqual(24)
      expect(j0.pixelRatio).toBeLessThanOrEqual(1.5)
      await expect(page.getByTestId('fps')).toContainText(/\d+ fps · seguimiento \d+ fps/)

      // Pausa automática: sin mano NO pausa antes de 2 s; sí después.
      await page.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.fuente!.ocultar())
      await page.waitForTimeout(1_200)
      expect((await juego(page))!.fase).toBe('jugando')
      await expect(page.getByTestId('pausa-auto')).toBeVisible({ timeout: 3_000 })
      expect((await juego(page))!.motivo).toBe('sin-mano')
      await expect(page.getByTestId('mano-derecha')).toContainText('—')
      const t1 = (await juego(page))!.jugadoMs
      await page.waitForTimeout(1_000)
      expect((await juego(page))!.jugadoMs).toBe(t1)
      // Vuelve la mano → se reanuda sola.
      await page.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose({}, 'derecha'))
      await esperarFase(page, 'jugando', 3_000)
      await expect(page.getByTestId('pausa-auto')).toHaveCount(0)

      // Abrir y cerrar 3 veces → meta → "¡Meta cumplida!" → /sensacion conservando el query.
      await page.evaluate((g) => (globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(g), ABRIR_CERRAR)
      await expect(page.getByTestId('contador')).toHaveText('1/3', { timeout: 5_000 })
      await expect(page.getByTestId('meta-cumplida')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida!')
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Rapier no se carga si el juego no usa física').toEqual([])

      // Lo guardado: métricas, muestras a 10 Hz y eventos. La sesión sigue 'en curso' (la cierra /resumen).
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.fin).not.toBeNull()
      expect(s.metricas.motivoFin).toBe('meta')
      expect(s.metricas.metaCumplida).toBe(true)
      expect(s.metricas.meta).toBe(3)
      expect(s.metricas.contador).toBeGreaterThanOrEqual(3)
      expect(s.metricas.juego.cierres).toBe(s.metricas.contador)
      expect(s.metricas.calidadRegistro).toBeGreaterThan(0.5)
      expect(s.metricas.calidadRegistro).toBeLessThan(1)
      expect(s.metricas.duracionS).toBeGreaterThan(8)
      expect(s.muestras.hz).toBe(10)
      expect(s.muestras.t.length).toBeGreaterThan(60)
      expect(s.muestras.apertura.length).toBe(s.muestras.t.length)
      expect(s.muestras.canales.aperturaMano.length).toBe(s.muestras.t.length)
      const dts = s.muestras.t.slice(1).map((t: number, i: number) => t - s.muestras.t[i])
      expect(Math.min(...dts)).toBeGreaterThanOrEqual(90)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const tipos = evs.map((e) => e.tipo)
      expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1))
      expect(tipos).toEqual(expect.arrayContaining(['perdida_seguimiento', 'pausa', 'reanudar', 'agarre_inicio', 'agarre_fin']))
      expect(evs.find((e) => e.tipo === 'pausa')!.datos).toEqual({ motivo: 'sin-mano' })
      expect(tipos.filter((t) => t === 'agarre_fin').length).toBe(s.metricas.contador)
      expect(evs.every((e, i) => i === 0 || e.t >= evs[i - 1].t)).toBe(true)
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('pausa manual desde Menú detiene el tiempo; termina por tiempo', async ({ page }) => {
    test.setTimeout(90_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('prueba-shell', 0.1, 0) // 6 s, sin meta
      await page.setViewportSize(HORIZONTAL)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta`)
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('contador')).toHaveText('0') // sin meta: sin "/meta" ni barra
      await page.getByRole('button', { name: 'Menú' }).click()
      await expect(page.getByTestId('menu-pausa')).toBeVisible()
      await esperarFase(page, 'pausa', 2_000)
      const t1 = (await juego(page))!.jugadoMs
      await page.waitForTimeout(1_200)
      expect((await juego(page))!.jugadoMs).toBe(t1)
      await page.getByRole('button', { name: 'Continuar' }).click()
      await expect(page.getByTestId('menu-pausa')).toHaveCount(0)
      await esperarFase(page, 'jugando', 2_000)
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta$`), { timeout: 15_000 })

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('metricas, estado').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas.motivoFin).toBe('tiempo')
      expect(s.metricas.duracionS).toBe(6)
      expect(s.metricas.metaCumplida).toBe(false)
      const evs = (await sb.from('eventos_sesion').select('tipo, datos').eq('sesion_id', id).order('seq')).data!
      expect(evs).toEqual([
        { tipo: 'pausa', datos: { motivo: 'manual' } },
        { tipo: 'reanudar', datos: null },
      ])
    } finally {
      limpiar(desde, id)
    }
  })

  test("en vertical muestra 'Gira tu teléfono' y el tiempo no corre; al girar se juega", async ({ page }) => {
    await sesionFalsa(page, 'prueba-shell')
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByTestId('gira-telefono')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Gira tu teléfono' })).toBeVisible()
    await esperarFase(page, 'pausa')
    expect((await juego(page))!.motivo).toBe('orientacion')
    await page.waitForTimeout(800)
    expect((await juego(page))!.jugadoMs).toBe(0)
    await page.setViewportSize(HORIZONTAL)
    await expect(page.getByTestId('gira-telefono')).toHaveCount(0)
    await esperarFase(page, 'jugando')
    await expect.poll(async () => (await juego(page))!.jugadoMs).toBeGreaterThan(500)
  })

  test('Terminar sesión desde el menú guarda métricas y va a /sensacion', async ({ page }) => {
    const escrituras = await sesionFalsa(page, 'prueba-shell', 5, 10)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=abrir-cerrar`)
    await esperarFase(page, 'jugando', 15_000)
    await expect(page.getByTestId('contador')).toHaveText('1/10', { timeout: 5_000 })
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion\\?fuente=sintetica&guion=abrir-cerrar$`), { timeout: 10_000 })
    const patches = escrituras.filter((e) => e.tabla === 'sesiones' && e.metodo === 'PATCH').map((e) => e.cuerpo as Record<string, never>)
    expect(patches[0]).toMatchObject({ estado: 'en curso' })
    const final = patches.at(-1) as unknown as { metricas: { motivoFin: string; contador: number; metaCumplida: boolean }; muestras: { hz: number } }
    expect(final.metricas.motivoFin).toBe('manual')
    expect(final.metricas.contador).toBeGreaterThanOrEqual(1)
    expect(final.metricas.metaCumplida).toBe(false)
    expect(final.muestras.hz).toBe(10)
    const eventos = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string }[])
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['agarre_inicio', 'agarre_fin', 'pausa']))
  })

  test('usaFisica: carga Rapier y la bola cae sobre la mesa', async ({ page }) => {
    await sesionFalsa(page, 'prueba-fisica')
    await page.setViewportSize(HORIZONTAL)
    const rapier: string[] = []
    page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Prueba de física' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    expect((await juego(page))!.fisica).toBe(true)
    expect(rapier.length).toBeGreaterThan(0)
    // Cae desde 1,6 u (≈ 14 cm sobre la mesa) y queda apoyada.
    await expect.poll(async () => (await juego(page))!.vivo.alturaBola, { timeout: 8_000 }).toBeLessThan(0.5)
    await page.getByRole('button', { name: 'Reiniciar' }).click()
    await expect.poll(async () => (await juego(page))!.vivo.alturaBola, { timeout: 3_000 }).toBeGreaterThan(5)
  })
})
