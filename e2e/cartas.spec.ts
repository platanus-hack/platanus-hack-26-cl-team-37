// F26 · Memoria de cartas sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética gira la palma con `pronacionDeg` (0 = palma abajo = de cara a la cámara; negativo = supinación,
// la palma gira hacia arriba; positivo = pronación) y se pone sobre cada carta con las `celdas` que informa
// window.__manoviva.juego.estado() (posición en la imagen y distancia que dejan la palma sobre esa carta).
// - Sesión REAL, nivel 1 (2×2, 45°), mano derecha: un giro menor al umbral inclina la carta pero no la voltea; sobre el
//   umbral se voltea; sin volver a palma abajo no se voltea otra; un no_par vuelve a tapar; los dos pares terminan la
//   sesión en /sensacion. Eventos y resumen (giro por volteo, máximos a cada lado) guardados. Mide el fps.
//   Con CAPTURA_MEMORIA=<carpeta> guarda capturas horizontales (referencia: 05_memoria_de_cartas.png).
// - Sesión REAL, mano izquierda: mismo giro, mismo signo (supinación positiva), un par y /sensacion.
// - Sesión falsa, nivel 3 (2×4, 60°) y modo "sin memoria" (?sinMemoria=1).
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, parametros, sesionFalsa, type Ventana } from './juegos.ts'

type Lado = 'derecha' | 'izquierda'
type Estado = {
  contador: number
  meta: number
  filas: number
  columnas: number
  umbralDeg: number
  sinMemoria: boolean
  figuras: number[]
  estados: ('tapada' | 'visible' | 'par')[]
  inclinacion: number[]
  celdas: { x: number; distanciaCm: number }[]
  resolviendo: boolean
  intentos: number
  pares: number
  supinacionMax: number
  pronacionMax: number
  manos: Partial<Record<Lado, { angulo: number | null; crudo: number | null; sobre: number | null; armada: boolean; esperaRetorno: boolean; mantenidoMs: number }>>
}
const SIN_FPS = '[data-testid=fps] { display: none !important }'

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const poner = (p: Page, pose: object, lado: Lado) => p.evaluate(([po, l]) => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose(po as object, l as string), [pose, lado] as const)

/** Pose con la palma sobre la carta i girada `grados` hacia arriba (negativo = pronación). */
const pose = (e: Estado, i: number, grados: number) => ({ x: e.celdas[i].x, y: 0.5, distanciaCm: e.celdas[i].distanciaCm, pronacionDeg: -grados })

/** Palma abajo sobre la carta i, ya detectada (elegida, giro ≈ 0 y lista para voltear). */
async function palmaAbajoSobre(page: Page, i: number, lado: Lado) {
  const e = await estado(page)
  await poner(page, pose(e, i, 0), lado)
  await expect
    .poll(async () => {
      const m = (await estado(page)).manos[lado]!
      return m.sobre === i && m.armada && m.angulo != null && Math.abs(m.angulo) < 10
    }, { timeout: 5_000 })
    .toBe(true)
}

/** Gira sobre la carta i hasta voltearla; devuelve cuando la carta ya no está tapada. */
async function voltear(page: Page, i: number, lado: Lado, grados = 70) {
  await palmaAbajoSobre(page, i, lado)
  await poner(page, pose(await estado(page), i, grados), lado)
  await expect.poll(async () => (await estado(page)).estados[i], { timeout: 5_000 }).not.toBe('tapada')
}
const pareja = (e: Estado, i: number) => e.figuras.findIndex((f, j) => j !== i && f === e.figuras[i])
const distinta = (e: Estado, i: number) => e.figuras.findIndex((f, j) => j !== i && f !== e.figuras[i] && e.estados[j] === 'tapada')

async function terminar(page: Page, id: string) {
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Terminar sesión' }).click()
  await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })
}

test.describe('Memoria de cartas', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('giro bajo el umbral inclina sin voltear; sobre el umbral voltea; retorno a palma abajo; no_par y pares; resumen con máximos', async ({ page }, info) => {
    test.setTimeout(150_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('memoria-cartas', 5, 0, 1)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Memoria de cartas' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByText('Gira la palma hacia arriba para voltear la carta')).toBeVisible()
      await expect(page.getByText('Giro del antebrazo')).toBeVisible()
      await expect(page.getByText('Supinación máx.')).toBeVisible()
      await expect(page.getByText('Pronación máx.')).toBeVisible()
      await expect(page.getByTestId('contador')).toHaveText('0/2')

      const e0 = await estado(page)
      expect(e0).toMatchObject({ filas: 2, columnas: 2, umbralDeg: 45, meta: 2, sinMemoria: false })
      expect(e0.estados).toEqual(['tapada', 'tapada', 'tapada', 'tapada'])
      expect([...e0.figuras].sort()).toEqual([0, 0, 1, 1])

      // Palma abajo sobre la carta 0: queda elegida, sin voltear.
      await palmaAbajoSobre(page, 0, 'derecha')
      await expect(page.getByTestId('mano-derecha')).toContainText('Palma abajo')

      // Pronación (poco, hacia el otro lado): cuenta para la pronación máxima, no voltea.
      await poner(page, pose(await estado(page), 0, -25), 'derecha')
      await expect.poll(async () => (await estado(page)).pronacionMax, { timeout: 4_000 }).toBeGreaterThan(20)
      await palmaAbajoSobre(page, 0, 'derecha')

      // 30° < 45°: la carta se inclina siguiendo el giro, pero NO se voltea aunque se mantenga.
      await poner(page, pose(await estado(page), 0, 30), 'derecha')
      await expect.poll(async () => (await estado(page)).manos.derecha!.angulo ?? 0, { timeout: 4_000 }).toBeGreaterThan(27)
      await page.waitForTimeout(1_500)
      let e = await estado(page)
      expect(e.estados[0]).toBe('tapada')
      expect(e.inclinacion[0]).toBeGreaterThan(20)
      expect(e.inclinacion[0]).toBeLessThan(56)
      await expect(page.getByTestId('mano-derecha')).toContainText('Girando')
      await expect(page.getByTestId('vivo-giro')).toContainText('°')

      // 70° ≥ 45° sostenido: se voltea (la carta sigue el giro hasta quedar boca arriba).
      await poner(page, pose(e, 0, 70), 'derecha')
      await expect.poll(async () => (await estado(page)).estados[0], { timeout: 5_000 }).toBe('visible')
      await expect.poll(async () => (await estado(page)).inclinacion[0], { timeout: 3_000 }).toBeGreaterThan(170)
      e = await estado(page)
      expect(e.manos.derecha!.esperaRetorno).toBe(true)

      // Sin volver a palma abajo no se voltea otra carta, aunque se quede girada sobre ella.
      const otra = distinta(e, 0)
      const a = [1, 2, 3].find((i) => i !== pareja(e, 0))!
      expect(a).toBe(otra)
      await poner(page, pose(e, a, 70), 'derecha')
      await expect.poll(async () => (await estado(page)).manos.derecha!.sobre, { timeout: 4_000 }).toBe(a)
      await page.waitForTimeout(1_200)
      expect((await estado(page)).estados[a]).toBe('tapada')

      // Vuelve a palma abajo (retorno_palma_abajo) y voltea la distinta: no_par; se muestran y se vuelven a tapar.
      await palmaAbajoSobre(page, a, 'derecha')
      await poner(page, pose(await estado(page), a, 66), 'derecha')
      await expect.poll(async () => (await estado(page)).resolviendo, { timeout: 5_000 }).toBe(true)
      expect((await estado(page)).estados[0]).toBe('visible')
      expect((await estado(page)).estados[a]).toBe('visible')
      await expect(page.getByTestId('contador')).toHaveText('0/2')
      await expect.poll(async () => (await estado(page)).estados.every((s) => s === 'tapada'), { timeout: 5_000 }).toBe(true)
      expect((await estado(page)).intentos).toBe(1)
      const figurasAntes = (await estado(page)).figuras

      // Pares: 0 con su pareja, y luego el otro par.
      await voltear(page, 0, 'derecha', 70)
      await voltear(page, pareja(await estado(page), 0), 'derecha', 75)
      await expect(page.getByTestId('contador')).toHaveText('1/2', { timeout: 4_000 })
      e = await estado(page)
      expect(e.figuras).toEqual(figurasAntes)
      expect(e.estados.filter((s) => s === 'par')).toHaveLength(2)
      expect(e.resolviendo).toBe(false)

      if (process.env.CAPTURA_MEMORIA) {
        await poner(page, { x: 0.95, y: 0.5, distanciaCm: 50 }, 'derecha')
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${process.env.CAPTURA_MEMORIA}/memoria-cartas-par.png`, style: SIN_FPS })
      }
      // Captura "en acción": un par arriba, una carta inclinándose con la mano encima (como la imagen de referencia).
      const resto = e.estados.map((s, i) => (s === 'tapada' ? i : -1)).filter((i) => i >= 0)
      await palmaAbajoSobre(page, resto[0], 'derecha')
      await poner(page, pose(await estado(page), resto[0], 40), 'derecha')
      await expect.poll(async () => (await estado(page)).inclinacion[resto[0]], { timeout: 3_000 }).toBeGreaterThan(30)
      const j0 = (await juego(page))!
      if (process.env.CAPTURA_MEMORIA) {
        await page.waitForTimeout(300)
        await page.screenshot({ path: `${process.env.CAPTURA_MEMORIA}/memoria-cartas.png`, style: SIN_FPS })
      }
      await voltear(page, resto[0], 'derecha', 80)
      await voltear(page, resto[1], 'derecha', 80)
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 2/2', { timeout: 6_000 })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Memoria de cartas no usa física').toEqual([])
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[memoria-cartas] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas).toMatchObject({ contador: 2, meta: 2, metaCumplida: true, motivoFin: 'meta' })
      const m = s.metricas.juego
      expect(m).toMatchObject({ pares: 2, intentos: 3, volteos: 6 })
      expect(m.supinacionMax).toBeGreaterThanOrEqual(75) // giros de hasta 80° (suavizados)
      expect(m.supinacionMax).toBeLessThanOrEqual(85)
      expect(m.pronacionMax).toBeGreaterThanOrEqual(20) // un giro de 25° hacia el otro lado
      expect(m.pronacionMax).toBeLessThanOrEqual(30)
      expect(m.giroMinVolteo).toBeGreaterThanOrEqual(45)
      expect(m.giroMaxVolteo).toBeLessThanOrEqual(85)
      expect(m.giroMedioVolteo).toBeGreaterThan(60)
      expect(m.tiempoTotal).toBeGreaterThan(10)
      expect(s.muestras.canales.giroDeg.length).toBe(s.muestras.t.length)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const tipo = (t: string) => evs.filter((x) => x.tipo === t)
      expect(tipo('volteo')).toHaveLength(6)
      expect(tipo('par')).toHaveLength(2)
      expect(tipo('no_par')).toHaveLength(1)
      expect(tipo('retorno_palma_abajo').length).toBeGreaterThanOrEqual(5)
      expect(tipo('sobre_carta').length).toBeGreaterThanOrEqual(3)
      for (const x of tipo('volteo')) {
        expect(x.mano).toBe('derecha')
        expect(x.datos.grados).toBeGreaterThanOrEqual(45)
        expect(x.datos.carta).toBeGreaterThanOrEqual(1)
      }
      expect(tipo('no_par')[0].datos.cartas).toHaveLength(2)
      expect(evs.map((x) => x.seq)).toEqual(evs.map((_, i) => i + 1))
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('mano izquierda: mismo giro y mismo signo (supinación positiva); un par y /sensacion', async ({ page }) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('memoria-cartas', 5, 0, 1, 'paciente', { parametros: { ...parametros(5, 0, 1), mano: 'izquierda' } })
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&lado=izquierda`)
      await expect(page.getByRole('heading', { level: 1, name: 'Memoria de cartas' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('contador')).toHaveText('0/2')

      await palmaAbajoSobre(page, 0, 'izquierda')
      await expect(page.getByTestId('mano-izquierda')).toContainText('Palma abajo')
      // 30° < 45°: se inclina, no se voltea; el ángulo medido es +30 (no −30).
      await poner(page, pose(await estado(page), 0, 30), 'izquierda')
      await expect.poll(async () => (await estado(page)).manos.izquierda!.angulo ?? 0, { timeout: 4_000 }).toBeGreaterThan(27)
      await page.waitForTimeout(1_200)
      let e = await estado(page)
      expect(e.estados[0]).toBe('tapada')
      expect(e.manos.izquierda!.angulo!).toBeLessThan(35)
      expect(e.inclinacion[0]).toBeGreaterThan(20)

      await voltear(page, 0, 'izquierda', 70)
      await voltear(page, pareja(await estado(page), 0), 'izquierda', 70)
      await expect(page.getByTestId('contador')).toHaveText('1/2', { timeout: 4_000 })
      e = await estado(page)
      expect(e.supinacionMax).toBeGreaterThan(60)
      expect(e.pronacionMax).toBeLessThan(10)
      await terminar(page, id)

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.metricas.juego).toMatchObject({ pares: 1, intentos: 1, volteos: 2 })
      expect(s.metricas.juego.supinacionMax).toBeGreaterThanOrEqual(65)
      expect(s.metricas.juego.pronacionMax).toBeLessThan(10)
      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      expect(evs.filter((x) => x.tipo === 'volteo').map((x) => x.mano)).toEqual(['izquierda', 'izquierda'])
      expect(evs.filter((x) => x.tipo === 'par')).toHaveLength(1)
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('nivel 3 (2×4, 60°) y modo "sin memoria": mismo juego con las figuras a la vista', async ({ page }) => {
    test.setTimeout(120_000)
    const escrituras = await sesionFalsa(page, 'memoria-cartas', 5, 0, 3)
    await page.setViewportSize(HORIZONTAL)
    const v = vigilarErrores(page)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta&sinMemoria=1`)
    await expect(page.getByRole('heading', { level: 1, name: 'Memoria de cartas' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    await expect(page.getByTestId('contador')).toHaveText('0/4')
    const e0 = await estado(page)
    expect(e0).toMatchObject({ filas: 2, columnas: 4, umbralDeg: 60, meta: 4, sinMemoria: true })
    expect(e0.figuras).toHaveLength(8)

    // 50° < 60° de este nivel: no voltea.
    await palmaAbajoSobre(page, 5, 'derecha')
    await poner(page, pose(await estado(page), 5, 50), 'derecha')
    await expect.poll(async () => (await estado(page)).manos.derecha!.angulo ?? 0, { timeout: 4_000 }).toBeGreaterThan(46)
    await page.waitForTimeout(1_200)
    expect((await estado(page)).estados[5]).toBe('tapada')
    // 70°: voltea.
    await voltear(page, 5, 'derecha', 70)
    if (process.env.CAPTURA_MEMORIA) {
      await poner(page, { x: 0.95, y: 0.5, distanciaCm: 50 }, 'derecha')
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${process.env.CAPTURA_MEMORIA}/memoria-cartas-sin-memoria.png`, style: SIN_FPS })
    }
    await terminar(page, ID_FALSO)
    const evs = escrituras.filter((x) => x.tabla === 'eventos_sesion').flatMap((x) => x.cuerpo as { tipo: string; datos: Record<string, unknown> | null }[])
    expect(evs.filter((x) => x.tipo === 'volteo')).toMatchObject([{ datos: { carta: 6 } }])
    v.sinErrores()
  })

  test('sin la opción, las figuras no se ven (modo con memoria) y el catálogo ofrece el juego', async ({ page }) => {
    await sesionFalsa(page, 'memoria-cartas', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await esperarFase(page, 'jugando', 15_000)
    expect((await estado(page)).sinMemoria).toBe(false)
    await page.goto('/ejercicios')
    await expect(page.locator('[data-juego="memoria-cartas"]').getByText('Próximamente', { exact: true })).toHaveCount(0)
  })
})
