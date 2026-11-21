// F25 · Exprime la naranja sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética se maneja en lazo cerrado con fijarPose (apertura 1 = mano abierta, 0 = puño) leyendo el estado del
// juego (window.__manoviva.juego.estado(): paso, cierre %, tiempo sostenido, contadores).
// - Sesión REAL, mano derecha, nivel 3 (75 %, 3 s), meta 2: una repetición se suelta antes de tiempo (incompleta en el
//   paso 3), otra se cierra a medias y se vuelve a abrir (incompleta en el paso 2) y dos son válidas → contador exacto
//   2/2, "¡Meta cumplida!", /sensacion; eventos, métricas y muestras guardados. Mide el fps.
//   Con CAPTURA_NARANJA=1 guarda docs/capturas/exprime-naranja.png (sosteniendo, con gotas) y exprime-naranja-meta.png.
// - Sesión REAL, mano IZQUIERDA, nivel 2 (68 %, 2 s), meta 1: repetición válida con la mano izquierda.
// - Sesión falsa, sin meta, nivel 5 (90 %, 5 s): llegar a 80 % no pasa el umbral; soltar a la mitad = incompleta con el
//   paso, y Terminar guarda esas métricas.
// - Ningún texto del juego (código ni pantalla) dice lo que la cámara no mide.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, parametros, sesionFalsa, type Ventana } from './juegos.ts'

type Estado = {
  contador: number
  meta: number
  lado: string
  paso: 1 | 2 | 3 | 4
  cierre: number | null
  umbral: number
  sostenerMs: number
  sostenidoMs: number
  cierreMax: number
  naranja: boolean
  validas: number
  incompletas: number
  ultimoFallo: number | null
  nivelVaso: number
  gotas: number
}
const SIN_FPS = '[data-testid=fps] { display: none !important }'
// Las palabras que la cámara no puede respaldar (fuerza, presión, apretar/apretones/apretando): se arman por partes
// para que este archivo no las contenga.
const PROHIBIDAS = new RegExp(`${'fuer'}za|${'pre'}si[oó]n|${'apr'}(?:e|ie)t`, 'i')

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const poner = (p: Page, pose: object, lado = 'derecha') => p.evaluate(([po, l]) => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose(po as object, l as string), [pose, lado] as const)
const esperarPaso = (p: Page, paso: number, timeout = 5_000) => expect.poll(async () => (await estado(p)).paso, { timeout }).toBe(paso)
const ABIERTA = { apertura: 1 }
const PUNO = { apertura: 0 }

/** Mano abierta hasta que aparece la naranja (paso 2). */
async function abrirYEsperarNaranja(p: Page, lado = 'derecha') {
  await poner(p, ABIERTA, lado)
  await esperarPaso(p, 2)
  expect((await estado(p)).naranja).toBe(true)
}
/** Repetición válida: naranja → puño → sostener hasta el paso 4 → abrir por completo. */
async function repeticionValida(p: Page, lado = 'derecha') {
  const antes = (await estado(p)).contador
  await abrirYEsperarNaranja(p, lado)
  await poner(p, PUNO, lado)
  await esperarPaso(p, 3)
  await esperarPaso(p, 4, 8_000)
  await poner(p, ABIERTA, lado)
  await expect.poll(async () => (await estado(p)).contador, { timeout: 5_000 }).toBe(antes + 1)
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]))
}

test.describe('Exprime la naranja', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('mano derecha: soltar antes de tiempo y cerrar a medias quedan incompletas; las válidas cuentan exacto; meta 2/2 y /sensacion', async ({ page }, info) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('exprime-naranja', 5, 2, 3)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Exprime la naranja' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByText('Cierre de puño')).toBeVisible()
      await expect(page.getByText('Tiempo sostenido')).toBeVisible()
      await expect(page.getByText('Apertura completa')).toBeVisible()
      await expect(page.getByText('Cierres')).toBeVisible()
      await expect(page.getByTestId('contador')).toHaveText('0/2')
      await expect(page.getByTestId('mano-derecha')).toContainText('Abierta')
      await expect(page.getByTestId('vivo-cierre')).toContainText('%')

      const e0 = await estado(page)
      expect(e0).toMatchObject({ meta: 2, lado: 'derecha', umbral: 75, sostenerMs: 3000, contador: 0 })
      // Paso 1: mano abierta → aparece la naranja (la mano sintética parte abierta).
      await abrirYEsperarNaranja(page)
      await expect(page.getByTestId('pista')).toContainText('Cierra el puño hasta el 75 %')

      // Repetición A: suelta antes de tiempo (paso 3).
      await poner(page, PUNO)
      await esperarPaso(page, 3)
      await expect(page.getByTestId('mano-derecha')).toContainText('Puño cerrado')
      expect((await estado(page)).cierre).toBeGreaterThan(90)
      await page.waitForTimeout(300) // de 3 s de sostén
      await poner(page, { apertura: 0.6 }) // suelta a medias (≈ 34 %)
      await expect.poll(async () => (await estado(page)).ultimoFallo, { timeout: 4_000 }).toBe(3)
      let e = await estado(page)
      expect(e).toMatchObject({ contador: 0, validas: 0, incompletas: 1 })
      // Una mano a medias no cuenta como abierta: la naranja no aparece hasta abrirla por completo.
      await page.waitForTimeout(900)
      expect((await estado(page)).paso).toBe(1)
      expect((await estado(page)).naranja).toBe(false)
      await expect(page.getByTestId('contador')).toHaveText('0/2')
      await expect(page.getByTestId('pista')).toContainText('Soltaste antes de tiempo')

      // Repetición B: cierra a medias (sobre el inicio, bajo el umbral) y vuelve a abrir (paso 2).
      await abrirYEsperarNaranja(page)
      await expect(page.getByTestId('contador')).toHaveText('0/2')
      await poner(page, { apertura: 0.55 })
      await expect.poll(async () => (await estado(page)).cierre, { timeout: 3_000 }).toBeGreaterThan(30)
      e = await estado(page)
      expect(e.cierre).toBeLessThan(75)
      expect(e.paso).toBe(2)
      await page.waitForTimeout(500)
      expect((await estado(page)).paso).toBe(2) // quedarse a medias no falla
      await poner(page, ABIERTA)
      await expect.poll(async () => (await estado(page)).ultimoFallo, { timeout: 4_000 }).toBe(2)
      expect((await estado(page)).incompletas).toBe(2)
      await expect(page.getByTestId('pista')).toContainText('No llegaste al 75 %')

      // Repetición C: válida. Se ve el avance y las gotas durante el sostén, y el vaso sube al abrir.
      await abrirYEsperarNaranja(page)
      await poner(page, PUNO)
      await esperarPaso(page, 3)
      await expect.poll(async () => (await estado(page)).gotas, { timeout: 2_000 }).toBeGreaterThan(0)
      await expect(page.getByTestId('pista')).toContainText('Sostén el puño')
      if (process.env.CAPTURA_NARANJA) {
        await page.waitForTimeout(500)
        await page.screenshot({ path: 'docs/capturas/exprime-naranja.png', style: SIN_FPS })
      }
      await esperarPaso(page, 4, 6_000)
      await expect(page.getByTestId('contador')).toHaveText('0/2') // todavía falta el paso 4
      // Con el puño cerrado en el paso 4 el tiempo sostenido ya no suma: se queda en 3,0 s (el panel dice 3,0 / 3 s).
      await page.waitForTimeout(1_500)
      expect((await estado(page)).sostenidoMs).toBe(3000)
      await expect(page.getByTestId('vivo-sostenido')).toContainText('3,0')
      await poner(page, ABIERTA)
      await expect.poll(async () => (await estado(page)).contador, { timeout: 5_000 }).toBe(1)
      await expect(page.getByTestId('contador')).toHaveText('1/2')
      await expect.poll(async () => (await estado(page)).nivelVaso, { timeout: 3_000 }).toBeGreaterThan(0.3) // el vaso sube

      const j0 = (await juego(page))!
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[exprime-naranja] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)
      await expect(page.locator('body')).not.toContainText(PROHIBIDAS)

      // Repetición D: válida → meta.
      await repeticionValida(page)
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 2/2', { timeout: 6_000 })
      if (process.env.CAPTURA_NARANJA) await page.screenshot({ path: 'docs/capturas/exprime-naranja-meta.png', style: SIN_FPS })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Exprime la naranja no usa física').toEqual([])

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas).toMatchObject({ contador: 2, meta: 2, metaCumplida: true, motivoFin: 'meta' })
      const m = s.metricas.juego
      expect(m).toMatchObject({ repeticiones: 2, incompletas: 2, falloPaso2: 1, falloPaso3: 1, falloPaso4: 0, completadas: 50 })
      expect(m.cierreMaxPico).toBeGreaterThanOrEqual(90)
      expect(m.cierreMax).toBeGreaterThan(60) // promedio de las 4 repeticiones (una a medias)
      expect(m.cierreMax).toBeLessThan(100)
      expect(m.tiempoSostenido).toBeGreaterThan(1.5) // una soltada antes + 2 repeticiones con ≥ 3 s
      expect(m.aperturaCompleta).toBeGreaterThanOrEqual(85)
      expect(s.muestras.hz).toBe(10)
      expect(s.muestras.canales.cierrePct.length).toBe(s.muestras.t.length)
      expect(Math.max(...s.muestras.canales.cierrePct.filter((x: number | null) => x != null))).toBeGreaterThan(90)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      expect(evs.map((x) => x.tipo)).toEqual([
        'cierre_inicio', 'umbral_alcanzado', 'repeticion_incompleta', // A: soltó antes de tiempo
        'cierre_inicio', 'repeticion_incompleta', // B: cerró a medias
        'cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa', // C
        'cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa', // D
      ])
      const inc = evs.filter((x) => x.tipo === 'repeticion_incompleta')
      expect(inc[0].datos).toMatchObject({ paso: 3, pasoNombre: 'sostener el puño', requeridoMs: 3000, umbralPct: 75 })
      expect(inc[0].datos.sostenidoMs).toBeGreaterThanOrEqual(0)
      expect(inc[0].datos.sostenidoMs).toBeLessThan(3000)
      expect(inc[1].datos).toMatchObject({ paso: 2, pasoNombre: 'cerrar el puño' })
      const ok = evs.filter((x) => x.tipo === 'apertura_completa')
      for (const x of ok) expect(x.datos.aperturaPct).toBeGreaterThanOrEqual(85)
      expect(evs.filter((x) => x.tipo === 'sostenido_completo').every((x) => x.datos.sostenidoMs >= 3000)).toBe(true)
      for (const x of evs) expect(x.mano).toBe('derecha')
      expect(evs.map((x) => x.seq)).toEqual(evs.map((_, i) => i + 1))
      expect(JSON.stringify([s.metricas, evs])).not.toMatch(PROHIBIDAS)
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('mano izquierda: nivel 2 (68 %, 2 s) con una repetición válida en sesión real', async ({ page }) => {
    test.setTimeout(90_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('exprime-naranja', 5, 1, 2, 'paciente', { parametros: { ...parametros(5, 1, 2), mano: 'izquierda' } })
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&lado=izquierda&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Exprime la naranja' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('mano-izquierda')).toContainText('Abierta')
      const e0 = await estado(page)
      expect(e0).toMatchObject({ lado: 'izquierda', umbral: 68, sostenerMs: 2000 })

      await abrirYEsperarNaranja(page, 'izquierda')
      await poner(page, PUNO, 'izquierda')
      await esperarPaso(page, 3)
      await expect(page.getByTestId('mano-izquierda')).toContainText('Puño cerrado')
      // El sostén de 2 s tiene que completarse antes del paso 4.
      await esperarPaso(page, 4, 6_000)
      expect((await estado(page)).sostenidoMs).toBeGreaterThanOrEqual(2000)
      await poner(page, ABIERTA, 'izquierda')
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 1/1', { timeout: 6_000 })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.metricas).toMatchObject({ contador: 1, meta: 1, metaCumplida: true })
      expect(s.metricas.juego).toMatchObject({ repeticiones: 1, incompletas: 0, completadas: 100 })
      expect(s.metricas.juego.tiempoSostenido).toBeGreaterThanOrEqual(2)
      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      expect(evs.map((x) => x.tipo)).toEqual(['cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa'])
      for (const x of evs) expect(x.mano).toBe('izquierda')
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('nivel 5 (90 %, 5 s) sin meta: a 80 % no se pasa el umbral; soltar a medias es incompleta con el paso; Terminar guarda', async ({ page }) => {
    test.setTimeout(90_000)
    const escrituras = await sesionFalsa(page, 'exprime-naranja', 5, 0, 5)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Exprime la naranja' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    expect(await estado(page)).toMatchObject({ umbral: 90, sostenerMs: 5000, meta: 0 })
    await abrirYEsperarNaranja(page)
    await poner(page, { apertura: 0.35 }) // ≈ 80 % de cierre: no llega al 90 %
    await expect.poll(async () => (await estado(page)).cierre, { timeout: 3_000 }).toBeGreaterThan(70)
    await page.waitForTimeout(700)
    expect((await estado(page)).paso).toBe(2)
    await poner(page, PUNO)
    await esperarPaso(page, 3)
    await page.waitForTimeout(1_200) // de 5 s
    await expect(page.getByTestId('pista')).toContainText('Sostén el puño: faltan')
    await poner(page, ABIERTA)
    await expect.poll(async () => (await estado(page)).ultimoFallo, { timeout: 4_000 }).toBe(3)
    await expect(page.getByTestId('contador')).toHaveText('0')

    // "Reiniciar" a mitad de una repetición la deja anotada como incompleta (con su paso), sin eventos sin cerrar.
    await abrirYEsperarNaranja(page)
    await poner(page, PUNO)
    await esperarPaso(page, 3)
    await page.getByRole('button', { name: 'Reiniciar' }).click()
    await expect.poll(async () => (await estado(page)).incompletas, { timeout: 3_000 }).toBe(2)
    expect(await estado(page)).toMatchObject({ paso: 1, ultimoFallo: 3 })
    await expect(page.locator('body')).not.toContainText(PROHIBIDAS)

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion`), { timeout: 10_000 })
    const final = escrituras.filter((e) => e.tabla === 'sesiones' && e.metodo === 'PATCH').at(-1)!.cuerpo as { metricas: Record<string, unknown> & { juego: Record<string, unknown> } }
    expect(final.metricas).toMatchObject({ contador: 0, meta: 0, motivoFin: 'manual' })
    expect(final.metricas.juego).toMatchObject({ repeticiones: 0, incompletas: 2, falloPaso3: 2, completadas: 0, aperturaCompleta: null })
    const todos = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string; datos: Record<string, unknown> | null }[])
    const evs = todos.filter((x) => !['pausa', 'reanudar', 'perdida_seguimiento'].includes(x.tipo))
    expect(evs.map((x) => x.tipo)).toEqual(['cierre_inicio', 'umbral_alcanzado', 'repeticion_incompleta', 'cierre_inicio', 'umbral_alcanzado', 'repeticion_incompleta'])
    expect(evs[2].datos).toMatchObject({ paso: 3, requeridoMs: 5000, umbralPct: 90 })
    expect(evs[5].datos).toMatchObject({ paso: 3, requeridoMs: 5000, umbralPct: 90 })
  })

  test('el código del juego no dice lo que la cámara no mide', () => {
    const dir = join(process.cwd(), 'src', 'games', 'naranja')
    const lista = archivos(dir)
    expect(lista.length).toBeGreaterThanOrEqual(3)
    for (const f of lista) expect(readFileSync(f, 'utf8'), f).not.toMatch(PROHIBIDAS)
  })
})
