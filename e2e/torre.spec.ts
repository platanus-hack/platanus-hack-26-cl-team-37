// F22 · Torre de cubos sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética se maneja en lazo cerrado leyendo el estado del juego (window.__manoviva.juego.estado(): cubos, silueta,
// punta del índice, zona de las manos): subir, ir sobre el cubo, bajar, cerrar la pinza, subir, ir sobre la silueta, bajar, abrir.
// - Sesión REAL, nivel 1 (torre de 3), meta 1 torre, mano DERECHA y mano IZQUIERDA (dos pruebas): altura exacta, "¡Meta cumplida! 1/1",
//   eventos tomar/agarre_inicio/agarre_fin/soltar/colocado, desvío de cada cubo en metricas.juego (desvioCubo1..3) y en
//   los eventos, y /sensacion. La de la derecha mide el fps. Con CAPTURA_TORRE=1 guarda docs/capturas/torre.png y torre-meta.png.
// - Sesión falsa: bajar el cubo hasta meterlo en la torre y soltarlo no la derriba (piso de altura del cubo sostenido y al soltar).
// - Sesión falsa, sin meta en el plan (meta 0 → 2 torres por defecto): al completar la 1.ª torre se rearma sola, sin "Meta
//   cumplida" todavía (1/2); Reiniciar también rearma.
//   (La caída se cubre con las pruebas unitarias de `torreCaida`: ya no hay forma de empujar la torre con el cubo sostenido.)
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, parametros, sesionFalsa, type Ventana } from './juegos.ts'

type P3 = { x: number; y: number; z: number }
type Cubo = P3 & { id: string; estado: string; mano: string | null; inicio: P3 }
type EstadoTorre = {
  /** Altura actual (cubos colocados). */
  contador: number
  /** Torres completas (contador de la meta). */
  torres: number
  meta: number
  caidas: number
  lado: number
  toleranciaCm: number
  base: { x: number; z: number; radio: number; grosor: number }
  silueta: P3 | null
  cubos: Cubo[]
  zona: { x: [number, number]; y: [number, number]; z: [number, number]; distanciaCm: [number, number]; margen: number }
  pinza: Record<string, P3 | undefined>
  punta: Record<string, P3 | undefined>
  agarrando: Record<string, boolean | undefined>
  desvioPorPiso: (number | null)[]
}
type Pose = { x: number; y: number; distanciaCm: number; apertura: number; dedos: { indice: number }; pinzaCm: number }
type Lado = 'derecha' | 'izquierda'

const SIN_FPS = '[data-testid=fps] { display: none !important }'
const ABIERTA = 6
const CERRADA = 0.5

const estadoTorre = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<EstadoTorre>

/** Mano manejada por guiones con interpolación lineal; el apuntado se corrige en lazo cerrado con la punta del índice. */
class Mano {
  pose: Pose = { x: 0.42, y: 0.88, distanciaCm: 47, apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: ABIERTA }
  private page: Page
  readonly lado: Lado
  constructor(page: Page, lado: Lado) {
    this.page = page
    this.lado = lado
  }

  async mover(hacia: Partial<Pose>, ms: number, esperaExtra = 250) {
    const desde = this.pose
    this.pose = { ...desde, ...hacia }
    const guion = { bucle: false, manos: [{ lado: this.lado, poses: [{ t: 0, ...desde }, { t: ms, ...this.pose }] }] }
    await this.page.evaluate((g) => (globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(g), guion)
    await this.page.waitForTimeout(ms + esperaExtra)
  }

  /** Lleva la punta del índice a `objetivo` (los ejes que vengan) corrigiendo hasta 5 veces. */
  async apuntar(objetivo: { x?: number; y?: number; z?: number }, ms: number, tol = 0.04) {
    for (let i = 0; i < 5; i++) {
      const e = await estadoTorre(this.page)
      const p = e.punta[this.lado]!
      const dx = objetivo.x == null ? 0 : objetivo.x - p.x
      const dy = objetivo.y == null ? 0 : objetivo.y - p.y
      const dz = objetivo.z == null ? 0 : objetivo.z - p.z
      if (Math.hypot(dx, dy, dz) < tol) return
      const z = e.zona
      const util = 1 - 2 * z.margen
      const nx = this.pose.x - (dx * util) / (z.x[1] - z.x[0])
      const ny = this.pose.y - (dy * util) / (z.y[1] - z.y[0])
      const nd = this.pose.distanciaCm + (dz * (z.distanciaCm[1] - z.distanciaCm[0])) / (z.z[1] - z.z[0])
      await this.mover(
        { x: Math.min(0.9, Math.max(0.1, nx)), y: Math.min(0.9, Math.max(0.1, ny)), distanciaCm: Math.min(64, Math.max(31, nd)) },
        i === 0 ? ms : 250,
        450,
      )
    }
  }

  /** Sube, va en horizontal sobre (x, z) y baja a `y`: así no arrastra otros cubos ni la torre. */
  async ir(x: number, z: number, y: number, alto = 1.45) {
    await this.apuntar({ y: alto }, 500, 0.08)
    await this.apuntar({ x, z, y: alto }, 900)
    await this.apuntar({ x, z, y }, 600)
  }
  async pinzar() {
    await this.mover({ pinzaCm: CERRADA }, 300, 250)
  }
  async abrir() {
    await this.mover({ pinzaCm: ABIERTA }, 300, 150)
  }
}

/** Toma el cubo `id` y lo suelta sobre la silueta amarilla (más `desfase` en x, en unidades de escena). */
async function apilar(page: Page, mano: Mano, id: string, desfase = 0, antesDeAbrir?: () => Promise<void>) {
  const e = await estadoTorre(page)
  const cubo = e.cubos.find((c) => c.id === id)!
  await mano.ir(cubo.x, cubo.z, cubo.y + e.lado / 2 + 0.1)
  await mano.pinzar()
  await expect.poll(async () => (await estadoTorre(page)).cubos.find((c) => c.id === id)!.estado, { timeout: 2_000 }).toBe('tomado')
  await expect(page.getByTestId(`mano-${mano.lado}`)).toContainText('Agarrando')
  const s = e.silueta!
  await mano.ir(s.x + desfase, s.z, s.y + 0.12)
  if (antesDeAbrir) await antesDeAbrir()
  await mano.abrir()
}

async function torreCompleta(page: Page, lado: Lado, info: { annotations: { type: string; description?: string }[] }) {
  const desde = new Date(Date.now() - 5_000).toISOString()
  let id = ''
  try {
    id = await crearSesion('torre-cubos', 5, 1, 1, 'paciente', { parametros: { ...parametros(5, 1, 1), mano: lado } })
    await page.setViewportSize(HORIZONTAL)
    const v = vigilarErrores(page)
    await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&lado=${lado}&depuracion=1`)
    await expect(page.getByRole('heading', { level: 1, name: 'Torre de cubos' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Apila el cubo sobre la torre')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeVisible()
    const mano = new Mano(page, lado)
    await mano.mover({}, 100)
    await esperarFase(page, 'jugando', 15_000)
    expect((await juego(page))!.fisica).toBe(true)
    await expect(page.getByTestId('contador')).toHaveText('0/1') // torres completas

    // Nivel 1: 3 cubos grandes sueltos, silueta sobre la base.
    const e0 = await estadoTorre(page)
    expect(e0.cubos).toHaveLength(3)
    expect(e0.meta).toBe(1)
    expect(e0.cubos.every((c) => c.estado === 'mesa')).toBe(true)
    expect(e0.silueta).not.toBeNull()
    expect(e0.toleranciaCm).toBeGreaterThanOrEqual(1.5)

    // Sin cubo cerca: cerrar la pinza en el aire no toma nada.
    await mano.ir(e0.base.x, e0.base.z + 0.9, 1.3)
    await mano.pinzar()
    expect((await estadoTorre(page)).cubos.every((c) => c.estado === 'mesa')).toBe(true)
    await mano.abrir()

    // Tres cubos, uno tras otro, sobre la silueta.
    for (let k = 1; k <= 3; k++) {
      const libre = (await estadoTorre(page)).cubos.find((c) => c.estado === 'mesa')!
      // CAPTURA_TORRE=1: captura "en acción" con el 3.er cubo en la mano sobre la silueta (como la imagen de referencia).
      const capturar = process.env.CAPTURA_TORRE && k === 3 ? () => page.screenshot({ path: 'docs/capturas/torre.png', style: SIN_FPS }).then(() => undefined) : undefined
      await apilar(page, mano, libre.id, 0, capturar)
      if (k < 3) {
        await expect.poll(async () => (await estadoTorre(page)).contador, { timeout: 6_000 }).toBe(k)
        await expect(page.getByTestId('contador')).toHaveText('0/1') // la torre aún no está completa
        const e = await estadoTorre(page)
        expect(e.contador).toBe(k)
        expect(e.desvioPorPiso[k - 1]).not.toBeNull()
      }
      if (k === 2) {
        // fps con física y cubos (ventanas de 2 s).
        const j0 = (await juego(page))!
        info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
        console.log(`[torre ${lado}] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)
        expect(j0.fps).toBeGreaterThanOrEqual(24)
      }
    }
    await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 1/1', { timeout: 6_000 })
    if (process.env.CAPTURA_TORRE) await page.screenshot({ path: 'docs/capturas/torre-meta.png', style: SIN_FPS })
    await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&lado=${lado}&depuracion=1$`), { timeout: 10_000 })

    // Agregados y eventos guardados.
    const sb = await clienteComo('paciente')
    const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
    expect(s.estado).toBe('en curso')
    const m = s.metricas
    expect(m).toMatchObject({ contador: 1, meta: 1, metaCumplida: true, motivoFin: 'meta', agarres: 3, intentos: 3, precision: 1 })
    expect(lado === 'derecha' ? m.agarresDer : m.agarresIzq).toBe(3)
    expect(lado === 'derecha' ? m.agarresIzq : m.agarresDer).toBe(0)
    expect(m.juego).toMatchObject({ alturaMax: 3, caidas: 0 })
    expect(m.juego.desvioMedio).toBeGreaterThanOrEqual(0)
    expect(m.juego.desvioMedio).toBeLessThanOrEqual(e0.toleranciaCm)
    expect(m.juego.aperturaPinza).toBeGreaterThan(1)
    expect(m.juego.estabilidad).toBeGreaterThanOrEqual(0)
    expect(m.juego.estabilidad).toBeLessThanOrEqual(100)
    // Desvío de cada cubo en el resumen de la sesión (metricas.juego.desvioCubo1..3).
    for (const n of [1, 2, 3]) {
      expect(m.juego[`desvioCubo${n}`], `desvioCubo${n}`).not.toBeNull()
      expect(m.juego[`desvioCubo${n}`]).toBeLessThanOrEqual(e0.toleranciaCm)
    }
    for (const n of [4, 5, 6]) expect(m.juego[`desvioCubo${n}`]).toBeNull()
    expect(s.muestras.canales.agarrando.length).toBe(s.muestras.t.length)
    expect(s.muestras.canales.altura).toContain(3)

    const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
    const de = (tipo: string) => evs.filter((e) => e.tipo === tipo)
    expect(de('tomar')).toHaveLength(3)
    expect(de('agarre_inicio')).toHaveLength(3)
    expect(de('agarre_fin')).toHaveLength(3)
    expect(de('soltar').map((e) => e.datos.enCaja)).toEqual([true, true, true])
    expect(de('colocado').map((e) => e.datos.piso)).toEqual([1, 2, 3])
    expect(de('colocado').map((e) => e.datos.alturaCubos)).toEqual([1, 2, 3])
    expect(de('caida')).toHaveLength(0)
    for (const e of [...de('tomar'), ...de('soltar'), ...de('colocado')]) expect(e.mano).toBe(lado)
    for (const e of de('soltar')) expect(e.datos.desvioCm).toBeGreaterThanOrEqual(0)
    for (const e of de('tomar')) expect(e.datos.aperturaCm).toBeGreaterThan(0)
    for (const n of [1, 2, 3]) expect(de('colocado')[n - 1].datos.desvioCm).toBe(m.juego[`desvioCubo${n}`])
    expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1))
    // Orden por cubo: tomar → agarre_inicio → agarre_fin → soltar → colocado.
    for (const col of de('colocado')) {
      const previos = evs.filter((e) => e.seq <= col.seq && e.objeto === col.objeto).map((e) => e.tipo)
      expect(previos).toEqual(['tomar', 'agarre_inicio', 'agarre_fin', 'soltar', 'colocado'])
    }
    v.sinErrores()
  } finally {
    limpiar(desde, id)
  }
}

test.describe('Torre de cubos', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('nivel 1 con la mano derecha: torre de 3, desvío de cada cubo, meta cumplida y /sensacion', async ({ page }, info) => {
    test.setTimeout(180_000)
    await torreCompleta(page, 'derecha', info)
  })

  test('nivel 1 con la mano izquierda: torre de 3, desvío de cada cubo, meta cumplida y /sensacion', async ({ page }, info) => {
    test.setTimeout(180_000)
    await torreCompleta(page, 'izquierda', info)
  })

  test('bajar el cubo hasta la torre (hasta meterlo en ella) y soltarlo no la derriba: cuenta como colocado', async ({ page }) => {
    test.setTimeout(150_000)
    const escrituras = await sesionFalsa(page, 'torre-cubos', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    const v = vigilarErrores(page)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Torre de cubos' })).toBeVisible({ timeout: 15_000 })
    const mano = new Mano(page, 'derecha')
    await mano.mover({}, 100)
    await esperarFase(page, 'jugando', 15_000)

    const [a, b] = (await estadoTorre(page)).cubos
    await apilar(page, mano, a.id)
    await expect.poll(async () => (await estadoTorre(page)).contador, { timeout: 6_000 }).toBe(1)
    const antes = (await estadoTorre(page)).cubos.find((c) => c.id === a.id)!

    // Segundo cubo: se lleva sobre la silueta y se BAJA la mano hasta 0,3 por debajo de ella (dentro de la torre).
    const e = await estadoTorre(page)
    const cb = e.cubos.find((c) => c.id === b.id)!
    await mano.ir(cb.x, cb.z, cb.y + e.lado / 2 + 0.1)
    await mano.pinzar()
    await expect.poll(async () => (await estadoTorre(page)).cubos.find((c) => c.id === b.id)!.estado, { timeout: 2_000 }).toBe('tomado')
    const s = e.silueta!
    await mano.ir(s.x, s.z, s.y + 0.12)
    await mano.apuntar({ y: s.y - 0.3 }, 500, 0.06)
    // Con la mano dentro de la torre: el cubo se queda justo encima del último cubo, y la torre no se mueve.
    await mano.mover({}, 700, 0)
    const dentro = await estadoTorre(page)
    expect(dentro.punta.derecha!.y).toBeLessThan(s.y - 0.1)
    const sostenido = dentro.cubos.find((c) => c.id === b.id)!
    expect(sostenido.estado).toBe('tomado')
    expect(sostenido.y).toBeGreaterThanOrEqual(s.y - 0.01)
    expect(dentro.caidas).toBe(0)
    const colocadoA = dentro.cubos.find((c) => c.id === a.id)!
    expect(Math.hypot(colocadoA.x - antes.x, colocadoA.y - antes.y, colocadoA.z - antes.z)).toBeLessThan(0.02)
    // Se suelta ahí mismo (el cubo vuelve a donde estaba 150 ms antes: no debe quedar dentro de la torre).
    await mano.abrir()
    await expect.poll(async () => (await estadoTorre(page)).contador, { timeout: 6_000 }).toBe(2)
    const fin = await estadoTorre(page)
    expect(fin.caidas).toBe(0)
    expect(fin.cubos.filter((c) => c.estado === 'colocado').map((c) => c.id).sort()).toEqual([a.id, b.id].sort())
    expect(fin.cubos.find((c) => c.id === a.id)!.y).toBeGreaterThan(antes.y - 0.05)
    await expect(page.getByTestId('pista')).not.toContainText('Se cayó la torre')
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion\\?fuente=sintetica&guion=quieta$`), { timeout: 10_000 })
    const eventos = escrituras.filter((x) => x.tabla === 'eventos_sesion').flatMap((x) => x.cuerpo as { tipo: string; datos: Record<string, unknown> | null }[])
    expect(eventos.filter((x) => x.tipo === 'caida')).toHaveLength(0)
    expect(eventos.filter((x) => x.tipo === 'colocado').map((x) => x.datos?.piso)).toEqual([1, 2])
    v.sinErrores()
  })

  test('sin meta en el plan (2 torres por defecto): al completar la 1.ª torre se rearma sola y la sesión sigue; Reiniciar también rearma', async ({ page }) => {
    test.setTimeout(170_000)
    // meta 0 en el plan → TORRES_POR_SESION = 2: la 1.ª torre no termina la sesión.
    const escrituras = await sesionFalsa(page, 'torre-cubos', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    const v = vigilarErrores(page)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Torre de cubos' })).toBeVisible({ timeout: 15_000 })
    const mano = new Mano(page, 'derecha')
    await mano.mover({}, 100)
    await esperarFase(page, 'jugando', 15_000)
    expect((await estadoTorre(page)).meta).toBe(2)

    for (let k = 1; k <= 3; k++) {
      await apilar(page, mano, (await estadoTorre(page)).cubos.find((c) => c.estado === 'mesa')!.id)
      if (k < 3) await expect.poll(async () => (await estadoTorre(page)).contador, { timeout: 6_000 }).toBe(k)
    }
    // 1.ª torre de 2: cuenta 1/2, no hay "¡Meta cumplida!", se rearma sola (altura 0, cubos en su lugar) y la sesión sigue.
    await expect(page.getByTestId('contador')).toHaveText('1/2', { timeout: 6_000 })
    await expect(page.getByTestId('meta-cumplida')).toHaveCount(0)
    await expect.poll(async () => (await estadoTorre(page)).contador, { timeout: 8_000 }).toBe(0)
    await expect.poll(async () => (await estadoTorre(page)).cubos.every((c) => c.estado === 'mesa' && Math.hypot(c.x - c.inicio.x, c.z - c.inicio.z) < 0.05), { timeout: 4_000 }).toBe(true)
    expect((await juego(page))!.fase).toBe('jugando')
    expect((await estadoTorre(page)).silueta!.y).toBeLessThan(0.4) // otra vez el piso de abajo
    await expect(page.getByTestId('meta-cumplida')).toHaveCount(0)

    // Se puede volver a jugar: un cubo vuelve a colocarse.
    await apilar(page, mano, (await estadoTorre(page)).cubos[0].id)
    await expect.poll(async () => (await estadoTorre(page)).contador, { timeout: 6_000 }).toBe(1)

    // Reiniciar: todo a su lugar, sin perder lo anotado.
    await page.getByRole('button', { name: 'Reiniciar' }).click()
    expect((await estadoTorre(page)).contador).toBe(0)
    expect((await estadoTorre(page)).cubos.every((c) => c.estado === 'mesa')).toBe(true)

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion\\?fuente=sintetica&guion=quieta$`), { timeout: 10_000 })
    const final = escrituras.filter((x) => x.tabla === 'sesiones' && x.metodo === 'PATCH').at(-1)!.cuerpo as { metricas: { motivoFin: string; metaCumplida: boolean; juego: Record<string, number | null> } }
    expect(final.metricas.motivoFin).toBe('manual')
    expect(final.metricas.juego).toMatchObject({ caidas: 0, alturaMax: 3 })
    const eventos = escrituras.filter((x) => x.tabla === 'eventos_sesion').flatMap((x) => x.cuerpo as { tipo: string; datos: Record<string, unknown> | null }[])
    expect(eventos.filter((x) => x.tipo === 'caida')).toHaveLength(0)
    expect(eventos.filter((x) => x.tipo === 'colocado').length).toBeGreaterThanOrEqual(4)
    v.sinErrores()
  })
})
