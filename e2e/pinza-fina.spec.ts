// F23 · Pinza fina sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética toca cada dedo con `pinzaDedo` (extensión de la fuente: el pulgar va a la punta de ese dedo) y se
// maneja en lazo cerrado leyendo el estado del juego (window.__manoviva.juego.estado(): dedo pedido, secuencia, contacto).
// - Sesión REAL, nivel 1, meta 4: una secuencia completa, un dedo tras otro en el orden fijo → contador exacto,
//   "¡Meta cumplida! 4/4", eventos objetivo_mostrado + toque por dedo, métricas, muestras y /sensacion. Mide el fps.
//   Con CAPTURA_PINZA=1 guarda docs/capturas/pinza-fina.png (como 02_pinza_fina.png) y pinza-fina-meta.png.
// - Sesión falsa, nivel 3 (al azar, 4 s por toque): un dedo se deja a 4 cm → al vencer el tiempo el juego avanza con
//   no_alcanzado y el resumen guarda esa distancia; un toque con el dedo equivocado cuenta como error sin bloquear.
// - Sesión falsa, nivel 5 (memoria): demostración de 4 dedos, después se repite de memoria (2 s por toque).
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, sesionFalsa, type Ventana } from './juegos.ts'

type Dedo = 'indice' | 'medio' | 'anular' | 'menique'
type Estado = {
  contador: number
  meta: number
  fase: 'demostrando' | 'tocando' | 'entre' | 'fin'
  lado: string
  secuencia: Dedo[]
  posicion: number
  objetivo: Dedo | null
  resultados: (string | null)[]
  contacto: Dedo | null
  distancias: Record<Dedo, number> | null
  umbrales: { toqueCm: number; sueltaCm: number }
  limiteMs: number
  secuencias: number
  errores: number
  noAlcanzados: number
}
const SIN_FPS = '[data-testid=fps] { display: none !important }'
const ORDEN: Dedo[] = ['indice', 'medio', 'anular', 'menique']

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const poner = (p: Page, pose: object, lado = 'derecha') => p.evaluate(([po, l]) => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose(po as object, l as string), [pose, lado] as const)
/** Pulgar sobre la punta del dedo (el dedo se flexiona un poco, como al hacer la pinza), a `cm` de distancia. */
const toca = (dedo: Dedo, cm = 0.5) => ({ apertura: 1, dedos: { [dedo]: 0.6 }, pinzaCm: cm, pinzaDedo: dedo })
const LIBRE = { apertura: 1 }

/** Toca `dedo` y espera a que la secuencia avance (o a que se acabe la fase); después separa el pulgar. */
async function tocar(page: Page, dedo: Dedo) {
  const antes = await estado(page)
  await poner(page, toca(dedo))
  await expect.poll(async () => (await estado(page)).posicion !== antes.posicion || (await estado(page)).secuencias !== antes.secuencias || (await estado(page)).fase !== antes.fase, { timeout: 6_000 }).toBe(true)
  await separar(page)
}
async function separar(page: Page) {
  await poner(page, LIBRE)
  await expect.poll(async () => (await estado(page)).contacto, { timeout: 4_000 }).toBeNull()
}

test.describe('Pinza fina', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('secuencia fija completa: índice, medio, anular y meñique; meta 4/4, eventos y métricas guardados', async ({ page }, info) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('pinza-fina', 5, 4, 1)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Pinza fina' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByText('Toca con el pulgar el dedo que se ilumina')).toBeVisible()
      await expect(page.getByText('Tiempo por toque')).toBeVisible()
      await expect(page.getByText('Distancia pulgar–dedo')).toBeVisible()
      await expect(page.getByText('Secuencia (de 4)')).toBeVisible()
      await expect(page.getByTestId('contador')).toHaveText('0/4')
      await expect(page.getByTestId('mano-derecha')).toContainText('Libre')

      const e0 = await estado(page)
      expect(e0.secuencia).toEqual(ORDEN)
      expect(e0.objetivo).toBe('indice')
      expect(e0.limiteMs).toBe(0) // nivel 1: sin límite de tiempo
      expect(e0.meta).toBe(4)
      expect(e0.umbrales.toqueCm).toBeCloseTo(1.82, 1) // 10 % del largo de mano calibrado (18,2 cm)

      // Esperar en el primer dedo mucho más que el tiempo de otros niveles no hace nada (sin límite, no avanza solo).
      await page.waitForTimeout(1_500)
      expect((await estado(page)).posicion).toBe(0)

      // A 2,5 cm (sobre el umbral de toque) no hay contacto aunque se quede ahí; la distancia en vivo lo muestra.
      await poner(page, toca('indice', 2.5))
      await expect(page.getByTestId('vivo-distancia')).toContainText('2,5 cm', { timeout: 3_000 })
      await page.waitForTimeout(800)
      expect((await estado(page)).posicion).toBe(0)
      expect((await estado(page)).contacto).toBeNull()
      await separar(page)

      await tocar(page, 'indice')
      await expect(page.getByTestId('contador')).toHaveText('1/4')
      await expect(page.getByTestId('vivo-tiempoToque')).toContainText(' s')
      expect((await estado(page)).objetivo).toBe('medio')
      await tocar(page, 'medio')
      await expect(page.getByTestId('contador')).toHaveText('2/4')
      expect((await estado(page)).objetivo).toBe('anular')
      await expect(page.getByTestId('vivo-secuencia')).toContainText('3')

      // Captura "en acción": 2 toques hechos, el pulgar cerca del anular (como la imagen de referencia).
      await poner(page, toca('anular', 2.5))
      await expect(page.getByTestId('vivo-distancia')).toContainText('2,5 cm', { timeout: 3_000 })
      const j0 = (await juego(page))!
      if (process.env.CAPTURA_PINZA) {
        await page.waitForTimeout(300)
        await page.screenshot({ path: 'docs/capturas/pinza-fina.png', style: SIN_FPS })
      }
      await poner(page, toca('anular'))
      await expect.poll(async () => (await estado(page)).posicion, { timeout: 4_000 }).toBe(3)
      await separar(page)
      await tocar(page, 'menique')
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 4/4', { timeout: 6_000 })
      if (process.env.CAPTURA_PINZA) await page.screenshot({ path: 'docs/capturas/pinza-fina-meta.png', style: SIN_FPS })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Pinza fina no usa física').toEqual([])

      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[pinza-fina] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas).toMatchObject({ contador: 4, meta: 4, metaCumplida: true, motivoFin: 'meta' })
      expect(s.metricas.juego).toMatchObject({ toques: 4, errores: 0, noAlcanzados: 0, dedosNoAlcanzados: 0, precision: 100 })
      expect(s.metricas.juego.tiempoMedioToque).toBeGreaterThan(0.3)
      for (const d of ['Indice', 'Medio', 'Anular', 'Menique']) {
        expect(s.metricas.juego[`distMin${d}`]).toBeLessThanOrEqual(1) // el pulgar llegó a ~0,5 cm de cada dedo
        expect(s.metricas.juego[`noAlcanza${d}`]).toBe(0)
      }
      expect(s.muestras.canales.distanciaCm.length).toBe(s.muestras.t.length)
      expect(s.muestras.canales.tocando.length).toBe(s.muestras.t.length)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const toques = evs.filter((e) => e.tipo === 'toque')
      expect(toques.map((e) => e.objeto)).toEqual(ORDEN)
      for (const e of toques) {
        expect(e.mano).toBe('derecha')
        expect(e.datos.dedo).toBe(e.objeto)
        expect(e.datos.tiempoMs).toBeGreaterThanOrEqual(300)
      }
      expect(evs.filter((e) => e.tipo === 'objetivo_mostrado').map((e) => e.objeto)).toEqual(ORDEN)
      expect(evs.filter((e) => e.tipo === 'error' || e.tipo === 'no_alcanzado')).toEqual([])
      expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1))
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('nivel 3 (al azar, 4 s): un dedo sin tocar avanza con no_alcanzado y guarda la distancia; el dedo equivocado es error', async ({ page }) => {
    test.setTimeout(120_000)
    const escrituras = await sesionFalsa(page, 'pinza-fina', 5, 0, 3)
    await page.setViewportSize(HORIZONTAL)
    const v = vigilarErrores(page)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Pinza fina' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    const e0 = await estado(page)
    expect(e0.limiteMs).toBe(4000)
    expect([...e0.secuencia].sort()).toEqual([...ORDEN].sort())
    expect(e0.secuencia).not.toEqual(ORDEN) // al azar: nunca el orden fijo
    const [a, b, c, d] = e0.secuencia

    // 1.º: se toca bien.
    expect(e0.objetivo).toBe(a)
    await tocar(page, a)
    // 2.º: se deja a 4 cm del dedo pedido y no más: vence el tiempo, el juego sigue y anota lo que faltó.
    expect((await estado(page)).objetivo).toBe(b)
    const jugadoB = (await juego(page))!.jugadoMs // tiempo de juego en que se mostró el dedo b
    await poner(page, toca(b, 4))
    await expect(page.getByTestId('vivo-distancia')).toContainText('4,0 cm', { timeout: 3_000 })
    await expect.poll(async () => (await estado(page)).posicion, { timeout: 8_000 }).toBe(2)
    // Esperó el tiempo límite (4 s de juego desde que se mostró; la lectura tiene desfase por separar el pulgar y el HUD a 5 Hz).
    const espera = (await juego(page))!.jugadoMs - jugadoB
    expect(espera).toBeGreaterThan(2_500)
    expect(espera).toBeLessThan(5_500)
    expect((await estado(page)).resultados.slice(0, 2)).toEqual(['hecho', 'perdido'])
    expect((await estado(page)).noAlcanzados).toBe(1)
    await separar(page)
    // 3.º: primero el dedo equivocado (error, sin bloquear ni avanzar) y después el correcto.
    expect((await estado(page)).objetivo).toBe(c)
    const equivocado = ORDEN.find((x) => x !== c && x !== a && x !== b)!
    await poner(page, toca(equivocado))
    await expect.poll(async () => (await estado(page)).errores, { timeout: 3_000 }).toBe(1)
    await expect(page.getByTestId('mano-derecha')).toContainText('Tocando')
    expect((await estado(page)).posicion).toBe(2) // no avanzó ni se bloqueó
    await separar(page)
    await tocar(page, c)
    // 4.º: se toca; la secuencia termina y arranca otra distinta.
    await tocar(page, d)
    await expect.poll(async () => (await estado(page)).secuencias, { timeout: 6_000 }).toBe(2)
    await expect(page.getByTestId('contador')).toHaveText('3') // 3 toques (el no alcanzado no cuenta)
    const e2 = await estado(page)
    expect(e2.secuencia).not.toEqual(e0.secuencia)

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion`), { timeout: 10_000 })
    const final = escrituras.filter((e) => e.tabla === 'sesiones' && e.metodo === 'PATCH').at(-1)!.cuerpo as { metricas: { contador: number; juego: Record<string, number | null> } }
    const cap = (x: string) => x[0].toUpperCase() + x.slice(1)
    expect(final.metricas.contador).toBe(3)
    expect(final.metricas.juego).toMatchObject({ toques: 3, errores: 1, noAlcanzados: 1, dedosNoAlcanzados: 1, precision: 60 })
    expect(final.metricas.juego[`noAlcanza${cap(b)}`]).toBe(1)
    // La distancia que faltó: el dedo no alcanzado no bajó de ≈ 4 cm.
    const faltante = final.metricas.juego[`distMin${cap(b)}`]!
    expect(faltante).toBeGreaterThanOrEqual(3.5)
    expect(faltante).toBeLessThanOrEqual(4.5)
    for (const x of [a, c, d]) expect(final.metricas.juego[`distMin${cap(x)}`]!).toBeLessThanOrEqual(1)
    const evs = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string; objeto: string | null; datos: Record<string, unknown> | null }[])
    expect(evs.filter((e) => e.tipo === 'toque').map((e) => e.objeto)).toEqual([a, c, d])
    expect(evs.filter((e) => e.tipo === 'error')).toMatchObject([{ objeto: equivocado, datos: { dedo: equivocado, pedido: c } }])
    const na = evs.filter((e) => e.tipo === 'no_alcanzado')
    expect(na).toHaveLength(1)
    expect(na[0]).toMatchObject({ objeto: b, datos: { dedo: b, posicion: 2 } })
    expect(Number(na[0].datos!.distanciaMinCm)).toBeGreaterThanOrEqual(3.5)
    expect(Number(na[0].datos!.distanciaMinCm)).toBeLessThanOrEqual(4.5)
    v.sinErrores()
  })

  test('nivel 5 (memoria): demostración de la secuencia y después se repite sin pista, 2 s por toque', async ({ page }) => {
    test.setTimeout(120_000)
    const escrituras = await sesionFalsa(page, 'pinza-fina', 5, 0, 5)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Pinza fina' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    let e = await estado(page)
    expect(e.fase).toBe('demostrando')
    expect(e.limiteMs).toBe(2000)
    expect(e.objetivo).toBeNull() // durante la demostración no se pide nada
    await expect(page.getByTestId('pista')).toContainText('Mira la secuencia')
    // Tocar durante la demostración no cuenta.
    await poner(page, toca('indice'))
    await page.waitForTimeout(700)
    await separar(page)
    expect((await estado(page)).contador).toBe(0)
    await expect.poll(async () => (await estado(page)).fase, { timeout: 8_000 }).toBe('tocando')
    await expect(page.getByTestId('pista')).toContainText('Ahora repítela de memoria')
    e = await estado(page)
    expect(e.objetivo).toBe(e.secuencia[0])
    // Repetir de memoria dentro del tiempo: los 4 en orden.
    for (const d of e.secuencia) await tocar(page, d)
    await expect(page.getByTestId('contador')).toHaveText('4')
    // Y si no se repite, a los 2 s pasa al siguiente (no_alcanzado) sin quedarse bloqueado.
    await expect.poll(async () => (await estado(page)).fase, { timeout: 6_000 }).toBe('demostrando')
    await expect.poll(async () => (await estado(page)).fase, { timeout: 8_000 }).toBe('tocando')
    await expect.poll(async () => (await estado(page)).posicion, { timeout: 5_000 }).toBe(1)
    expect((await estado(page)).resultados[0]).toBe('perdido')
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion`), { timeout: 10_000 })
    const evs = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string; datos: Record<string, unknown> | null }[])
    expect(evs.filter((x) => x.tipo === 'objetivo_mostrado' && x.datos?.fase === 'demostracion')).toHaveLength(8)
    expect(evs.filter((x) => x.tipo === 'toque')).toHaveLength(4)
    expect(evs.filter((x) => x.tipo === 'no_alcanzado').length).toBeGreaterThanOrEqual(1)
  })
})
