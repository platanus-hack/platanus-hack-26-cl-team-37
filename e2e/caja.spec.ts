// F10 · Caja de juguetes sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética se maneja con guiones "ir al juguete → pinza → llevar a la caja → abrir". Para apuntar se lee el
// estado del juego (window.__manoviva.juego.estado(): juguetes, caja, punta del índice de cada mano en la escena,
// zona de las manos) y se corrige la pose en lazo cerrado (la escena es lineal en x de la imagen y en la distancia).
// - Sesión REAL: 1 intento fallido (soltado en la mesa) + 3 agarres a la caja → contador exacto, "¡Meta cumplida! 3/3",
//   agregados y eventos guardados, /sensacion. Se mide el fps con física y juguetes.
// Con CAPTURA_CAJA=1 guarda docs/capturas/caja.png (como 06a) y caja-meta.png (como 06b).
// - Sesión falsa: un agarre, "Reiniciar objetos" devuelve todo a su lugar, Terminar guarda agarres 1/1.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, sesionFalsa, type Ventana } from './juegos.ts'

type P3 = { x: number; y: number; z: number }
type Objeto = P3 & { id: string; forma: string; tam: number; estado: string; mano: string | null; inicio: P3 }
type EstadoCaja = {
  contador: number
  objetos: Objeto[]
  caja: { x: number; z: number; ancho: number; fondo: number }
  zona: { x: [number, number]; y: [number, number]; z: [number, number]; distanciaCm: [number, number]; margen: number }
  pinza: Record<string, P3 | undefined>
  punta: Record<string, P3 | undefined>
  agarrando: Record<string, boolean | undefined>
}
type Pose = { x: number; y: number; distanciaCm: number; apertura: number; dedos: { indice: number }; pinzaCm: number }

/** Mano en pinza abierta (6 cm) / cerrada (0,5 cm): el índice queda igual, solo se mueve el pulgar. */
/** Las capturas de referencia no muestran la franja de fps de depuración. */
const SIN_FPS = '[data-testid=fps] { display: none !important }'
const ABIERTA = 6
const CERRADA = 0.5

const estadoCaja = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<EstadoCaja>

/** Mano derecha manejada por guiones con interpolación lineal (sin bucle). */
class Mano {
  pose: Pose = { x: 0.42, y: 0.88, distanciaCm: 47, apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: ABIERTA }
  private page: Page
  constructor(page: Page) {
    this.page = page
  }

  async mover(hacia: Partial<Pose>, ms: number, esperaExtra = 250) {
    const desde = this.pose
    this.pose = { ...desde, ...hacia }
    const guion = { bucle: false, manos: [{ lado: 'derecha', poses: [{ t: 0, ...desde }, { t: ms, ...this.pose }] }] }
    await this.page.evaluate((g) => (globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(g), guion)
    await this.page.waitForTimeout(ms + esperaExtra)
  }

  /** Lleva la punta del índice (≈ punto de pinza al cerrar) a (x, z) de la mesa, corrigiendo hasta 4 veces. */
  async apuntar(objetivo: { x: number; z: number }, ms: number) {
    for (let i = 0; i < 4; i++) {
      const e = await estadoCaja(this.page)
      const p = e.punta.derecha!
      const dx = objetivo.x - p.x
      const dz = objetivo.z - p.z
      if (Math.hypot(dx, dz) < 0.05) return
      const z = e.zona
      const util = 1 - 2 * z.margen
      // anclaX = lerp(x0, x1, (1 − cx − margen)/util) → d(anclaX)/d(cx) = −(x1 − x0)/util
      const nx = this.pose.x - (dx * util) / (z.x[1] - z.x[0])
      // anclaZ = lerp(z0, z1, (d − d0)/(d1 − d0)) → d(anclaZ)/d(d) = (z1 − z0)/(d1 − d0)
      const nd = this.pose.distanciaCm + (dz * (z.distanciaCm[1] - z.distanciaCm[0])) / (z.z[1] - z.z[0])
      await this.mover({ x: Math.min(0.88, Math.max(0.12, nx)), distanciaCm: Math.min(64, Math.max(31, nd)) }, i === 0 ? ms : 250, 450)
    }
  }

  async pinzar() {
    await this.mover({ pinzaCm: CERRADA }, 300, 250)
  }
  async abrir() {
    await this.mover({ pinzaCm: ABIERTA }, 300, 150)
  }
}

/** Toma el juguete `id` y lo deja en (x, z) (por defecto, el centro de la caja). */
async function trasladar(page: Page, mano: Mano, id: string, destino?: { x: number; z: number }, antesDeAbrir?: () => Promise<void>) {
  const e = await estadoCaja(page)
  const obj = e.objetos.find((o) => o.id === id)!
  await mano.apuntar(obj, 800)
  await mano.pinzar()
  await expect.poll(async () => (await estadoCaja(page)).objetos.find((o) => o.id === id)!.estado, { timeout: 2_000 }).toBe('tomado')
  await expect(page.getByTestId('mano-derecha')).toContainText('Agarrando')
  await mano.apuntar(destino ?? e.caja, 1000)
  if (antesDeAbrir) await antesDeAbrir()
  await mano.abrir()
}

const libres = async (page: Page) => (await estadoCaja(page)).objetos.filter((o) => o.estado === 'mesa').map((o) => o.id)

test.describe('Caja de juguetes', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('tomar y dejar en la caja: cuenta agarres exactos, meta cumplida, guarda agregados y va a /sensacion', async ({ page }, info) => {
    test.setTimeout(150_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('caja-juguetes', 5, 3, 2)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Guarda los juguetes en la caja')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reiniciar objetos' })).toBeVisible()
      const mano = new Mano(page)
      await mano.mover({}, 100)
      await esperarFase(page, 'jugando', 15_000)
      expect((await juego(page))!.fisica).toBe(true)
      await expect(page.getByTestId('contador')).toHaveText('0/3')

      // Nivel 2: 6 juguetes en la mesa, alrededor de la caja.
      const e0 = await estadoCaja(page)
      expect(e0.objetos).toHaveLength(6)
      expect(new Set(e0.objetos.map((o) => o.forma))).toEqual(new Set(['cubo', 'esfera', 'cilindro', 'capsula']))
      expect(e0.objetos.every((o) => o.estado === 'mesa')).toBe(true)

      // Sin pinza cerca de nada: cerrar no toma nada.
      await mano.apuntar({ x: e0.caja.x, z: e0.caja.z + 0.9 }, 600)
      await mano.pinzar()
      expect((await estadoCaja(page)).objetos.every((o) => o.estado === 'mesa')).toBe(true)
      await mano.abrir()

      // Intento fallido: tomarlo y soltarlo en la mesa (fuera de la caja).
      const primero = e0.objetos[0]
      await trasladar(page, mano, primero.id, { x: primero.x + 0.15, z: primero.z + 0.35 })
      await expect.poll(async () => (await estadoCaja(page)).objetos.find((o) => o.id === primero.id)!.estado, { timeout: 5_000 }).toBe('mesa')
      await expect(page.getByTestId('contador')).toHaveText('0/3')

      // fps con física y juguetes (ventanas de 2 s; ya pasó la primera).
      const j0 = (await juego(page))!
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[caja] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)
      expect(j0.fps).toBeGreaterThanOrEqual(24)

      // 3 agarres a la caja (uno de cada lado incluido).
      for (let k = 1; k <= 3; k++) {
        const ids = await libres(page)
        // Cada uno a un rincón distinto de la caja (el tercero cae al centro, quizá sobre otro: apilado también cuenta).
        const c = (await estadoCaja(page)).caja
        const destino = k === 3 ? c : { x: c.x + (k === 1 ? -0.3 : 0.3), z: c.z + (k === 1 ? 0.1 : -0.1) }
        // CAPTURA_CAJA=1: capturas de referencia (06a con un juguete en la mano sobre la caja; 06b con la meta).
        const capturar = process.env.CAPTURA_CAJA && k === 3 ? () => page.screenshot({ path: 'docs/capturas/caja.png', style: SIN_FPS }).then(() => undefined) : undefined
        await trasladar(page, mano, ids[k === 2 ? 1 : 0], destino, capturar)
        if (k < 3) {
          await expect(page.getByTestId('contador')).toHaveText(`${k}/3`, { timeout: 5_000 })
          expect((await estadoCaja(page)).objetos.filter((o) => o.estado === 'guardado')).toHaveLength(k)
        }
      }
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 3/3', { timeout: 5_000 })
      if (process.env.CAPTURA_CAJA) await page.screenshot({ path: 'docs/capturas/caja-meta.png', style: SIN_FPS })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&depuracion=1$`), { timeout: 10_000 })

      // Agregados y eventos guardados.
      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      const m = s.metricas
      expect(m).toMatchObject({ agarres: 3, agarresDer: 3, agarresIzq: 0, intentos: 4, precision: 0.75, contador: 3, meta: 3, metaCumplida: true, motivoFin: 'meta' })
      expect(m.juego).toMatchObject({ agarres: 3, intentos: 4, precision: 75 })
      expect(m.tiempoMedioAgarreS).toBeGreaterThan(1)
      expect(m.tiempoMedioAgarreS).toBeLessThan(6)
      expect(m.juego.tiempoMedioAgarre).toBe(m.tiempoMedioAgarreS)
      expect(m.suavidad).toBeGreaterThanOrEqual(0)
      expect(m.suavidad).toBeLessThanOrEqual(100)
      expect(m.juego.suavidad).toBe(m.suavidad)
      expect(m.aperturaMaxCm).toBeGreaterThan(5)
      expect(m.flexionIndiceMax).toBeGreaterThan(0)
      expect(m.calidadRegistro).toBeGreaterThan(0.9)
      expect(s.muestras.hz).toBe(10)
      expect(s.muestras.canales.agarrando.length).toBe(s.muestras.t.length)
      expect(s.muestras.canales.agarrando).toContain(1)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const de = (tipo: string) => evs.filter((e) => e.tipo === tipo)
      expect(de('agarre_inicio')).toHaveLength(4)
      expect(de('agarre_fin')).toHaveLength(4)
      expect(de('soltar').map((e) => e.datos.enCaja)).toEqual([false, true, true, true])
      expect(de('soltar')[0].objeto).toBe(primero.id)
      for (const e of de('agarre_inicio')) expect(e.mano).toBe('derecha')
      expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1))
      // Orden por juguete: agarre_inicio → agarre_fin → soltar.
      for (const fin of de('soltar')) {
        const previos = evs.filter((e) => e.seq < fin.seq && e.objeto === fin.objeto).map((e) => e.tipo)
        expect(previos.slice(-2)).toEqual(['agarre_inicio', 'agarre_fin'])
      }
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test("'Reiniciar objetos' devuelve los juguetes a la mesa; Terminar guarda los agarres", async ({ page }) => {
    test.setTimeout(90_000)
    const escrituras = await sesionFalsa(page, 'caja-juguetes', 5, 10, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    const mano = new Mano(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible({ timeout: 15_000 })
    await mano.mover({}, 100)
    await esperarFase(page, 'jugando', 15_000)
    const e0 = await estadoCaja(page)
    expect(e0.objetos).toHaveLength(4) // nivel 1
    const tamNivel1 = e0.objetos[0].tam

    await trasladar(page, mano, e0.objetos[1].id)
    await expect(page.getByTestId('contador')).toHaveText('1/10', { timeout: 5_000 })
    expect((await estadoCaja(page)).objetos[1].estado).toBe('guardado')

    await page.getByRole('button', { name: 'Reiniciar objetos' }).click()
    const e1 = await estadoCaja(page)
    expect(e1.objetos.every((o) => o.estado === 'mesa')).toBe(true)
    for (const o of e1.objetos) expect(Math.hypot(o.x - o.inicio.x, o.z - o.inicio.z)).toBeLessThan(0.05)
    expect(e1.contador).toBe(1) // lo logrado no se pierde
    expect(tamNivel1).toBeGreaterThan(0.35) // nivel 1 = objetos grandes

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion\\?fuente=sintetica&guion=quieta$`), { timeout: 10_000 })
    const final = escrituras.filter((e) => e.tabla === 'sesiones' && e.metodo === 'PATCH').at(-1)!.cuerpo as { metricas: Record<string, unknown> & { juego: Record<string, unknown> } }
    expect(final.metricas).toMatchObject({ agarres: 1, intentos: 1, precision: 1, contador: 1, meta: 10, metaCumplida: false, motivoFin: 'manual' })
    expect(final.metricas.juego).toMatchObject({ agarres: 1, intentos: 1, precision: 100 })
    const eventos = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string; datos: { enCaja?: boolean } | null }[])
    expect(eventos.filter((e) => e.tipo === 'soltar').map((e) => e.datos?.enCaja)).toEqual([true])
  })
})
