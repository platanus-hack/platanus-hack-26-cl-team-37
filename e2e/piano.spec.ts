// F27 · Piano de dedos sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética baja dedos sueltos (`dedos: { medio: 0.6 }`) y se maneja leyendo el estado del juego
// (window.__manoviva.juego.estado(): fase, reposo, dedos abajo, nota con la ventana abierta). Nada depende del audio.
// - Sesión REAL, nivel 1, meta 4, mano derecha: reposo de 3 s → acierto limpísimo (independencia alta) → dos dedos a la vez
//   (no es acierto limpio, la independencia de ese dedo baja) → nota perdida → acierto → "¡Meta cumplida! 4/4" y /sensacion.
//   Con CAPTURA_PIANO=1 guarda docs/capturas/piano-dedos.png. Mide el fps.
// - Sesión REAL, nivel 1, meta 2, mano IZQUIERDA: acierto con el dedo pedido y dedo equivocado (otro dedo) sin acierto.
// - Sesión falsa, nivel 5 (dos manos): cada mano recibe sus notas y sus aciertos se anotan con su lado.
// Sesiones reales: terminan en /sensacion sin cerrarse; se limpian por id explícito.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, parametros, sesionFalsa, type Ventana } from './juegos.ts'

type Dedo = 'pulgar' | 'indice' | 'medio' | 'anular' | 'menique'
type Lado = 'derecha' | 'izquierda'
type Estado = {
  fase: 'calibrando' | 'jugando' | 'fin'
  contador: number
  meta: number
  lados: Lado[]
  reloj: number
  progresoReposo: Partial<Record<Lado, number>>
  reposoListo: Partial<Record<Lado, boolean>>
  abajo: Partial<Record<Lado, Dedo[]>>
  notas: { i: number; lado: Lado; dedo: Dedo; faltaMs: number }[]
  activa: Partial<Record<Lado, { dedo: Dedo; faltaMs: number } | null>>
  ventanaMs: number
  aciertos: number
  perdidas: number
  equivocados: number
  independencia: number | null
  desfaseMedio: number | null
  silencio: boolean
}
const SIN_FPS = '[data-testid=fps] { display: none !important }'
const ORDEN: Dedo[] = ['pulgar', 'indice', 'medio', 'anular', 'menique']
const X_DOS: Record<Lado, number> = { derecha: 0.32, izquierda: 0.68 }

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const fuente = <T extends unknown[]>(p: Page, fn: string, ...args: T) =>
  p.evaluate(([f, a]) => ((globalThis as unknown as Ventana).__manoviva!.fuente as unknown as Record<string, (...x: unknown[]) => void>)[f as string](...(a as unknown[])), [fn, args] as const)

/** Deja `lado` con esos dedos abajo (flexión 0,6 ≈ 48° de MCP) y el resto en reposo. */
const bajar = (p: Page, lado: Lado, dedos: Dedo[]) => fuente(p, 'fijarPose', { apertura: 1, dedos: Object.fromEntries(dedos.map((d) => [d, 0.6])) }, lado)
const soltar = (p: Page, lado: Lado) => fuente(p, 'fijarPose', { apertura: 1 }, lado)
async function esperarSoltado(p: Page, lado: Lado) {
  await expect.poll(async () => (await estado(p)).abajo[lado]?.length ?? 0, { timeout: 4_000 }).toBe(0)
}
/** Espera a que la nota de esa mano tenga la ventana abierta y devuelve su dedo. */
async function notaAbierta(p: Page, lado: Lado, timeout = 12_000): Promise<Dedo> {
  let dedo: Dedo | null = null
  await expect
    .poll(async () => (dedo = (await estado(p)).activa[lado]?.dedo ?? null), { timeout, intervals: [40] })
    .not.toBeNull()
  return dedo as unknown as Dedo
}
/** Pasa el reposo (la mano sintética ya está quieta) y espera a que empiecen las notas. */
async function pasarReposo(p: Page) {
  await esperarFase(p, 'jugando', 15_000)
  await expect.poll(async () => (await estado(p)).fase, { timeout: 10_000 }).toBe('jugando')
}

test.describe('Piano de dedos', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('derecha, nivel 1, meta 4: acierto limpio, dos dedos a la vez (no limpio), nota perdida y acierto; meta 4/4, eventos y métricas guardados', async ({ page }, info) => {
    test.setTimeout(150_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('piano-dedos', 5, 4, 1)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Piano de dedos' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('contador')).toHaveText('0/4')
      await expect(page.getByText('Independencia de dedos')).toBeVisible()
      await expect(page.getByText('Aciertos', { exact: true })).toBeVisible()
      await expect(page.getByText('Desfase', { exact: true })).toBeVisible()

      // Paso guiado: 3 s con la mano quieta fijan el reposo; las notas no corren antes.
      let e = await estado(page)
      expect(e.fase).toBe('calibrando')
      expect(e.notas).toEqual([])
      expect(e.lados).toEqual(['derecha'])
      await expect(page.getByTestId('pista')).toContainText('Deja la mano quieta')
      await expect(page.getByTestId('mano-derecha')).toContainText('Quieta')
      await pasarReposo(page)
      await expect(page.getByTestId('mano-derecha')).toContainText(/Índice|Medio/)
      await expect(page.getByTestId('pista')).toContainText('Baja solo el dedo de la tecla que se enciende')
      e = await estado(page)
      expect(e.ventanaMs).toBe(1100)

      // Botón de sonido: existe, se puede silenciar y volver a activar (sin depender del audio).
      const sonido = page.getByTestId('piano-silencio')
      await expect(sonido).toBeVisible()
      await sonido.click()
      await expect(sonido).toHaveAttribute('aria-pressed', 'true')
      expect((await estado(page)).silencio).toBe(true)
      await sonido.click()
      await expect(sonido).toHaveAttribute('aria-pressed', 'false')

      // Nota 1: solo el dedo pedido → acierto.
      const d1 = await notaAbierta(page, 'derecha')
      expect(['indice', 'medio']).toContain(d1)
      await bajar(page, 'derecha', [d1])
      await expect.poll(async () => (await estado(page)).aciertos, { timeout: 4_000 }).toBe(1)
      await expect(page.getByTestId('contador')).toHaveText('1/4')
      await expect(page.getByTestId('vivo-aciertos')).toContainText('1')
      await expect(page.getByTestId('vivo-independencia')).toContainText('%')
      await expect(page.getByTestId('vivo-desfase')).toContainText('ms')
      expect((await estado(page)).independencia!).toBeGreaterThan(90)
      await soltar(page, 'derecha')
      await esperarSoltado(page, 'derecha')

      // Nota 2: dos dedos a la vez (el pedido y el anular) → no es acierto limpio y la independencia de ese dedo baja.
      const d2 = await notaAbierta(page, 'derecha', 15_000)
      expect(d2).not.toBe(d1)
      await bajar(page, 'derecha', [d2, 'anular'])
      await expect.poll(async () => (await estado(page)).equivocados, { timeout: 4_000 }).toBe(1)
      expect((await estado(page)).aciertos).toBe(1)
      expect((await estado(page)).contador).toBe(1) // la nota sigue abierta
      await soltar(page, 'derecha')
      await esperarSoltado(page, 'derecha')
      // Sin repetirla, termina la ventana: nota perdida.
      await expect.poll(async () => (await estado(page)).perdidas, { timeout: 6_000 }).toBe(1)
      await expect(page.getByTestId('contador')).toHaveText('2/4')

      // Nota 3: no se hace nada → nota perdida.
      await notaAbierta(page, 'derecha', 15_000)
      await expect.poll(async () => (await estado(page)).perdidas, { timeout: 8_000 }).toBe(2)
      await expect(page.getByTestId('contador')).toHaveText('3/4')

      // Captura "en acción" (como la imagen de referencia): el dedo pedido de la nota 4 abajo.
      if (process.env.CAPTURA_PIANO) {
        // La nota 4 cae a media altura (como las notas sueltas de la imagen de referencia).
        await expect.poll(async () => (await estado(page)).notas.some((n) => n.faltaMs < 1500 && n.faltaMs > 900), { timeout: 10_000, intervals: [30] }).toBe(true)
        await page.screenshot({ path: 'docs/capturas/piano-dedos.png', style: SIN_FPS })
      }
      const d4 = await notaAbierta(page, 'derecha', 15_000)
      const j0 = (await juego(page))!
      await bajar(page, 'derecha', [d4])
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 4/4', { timeout: 6_000 })
      if (process.env.CAPTURA_PIANO) await page.screenshot({ path: 'docs/capturas/piano-dedos-meta.png', style: SIN_FPS })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'El piano no usa física').toEqual([])
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[piano] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas).toMatchObject({ contador: 4, meta: 4, metaCumplida: true, motivoFin: 'meta' })
      const m = s.metricas.juego as Record<string, number | null>
      expect(m).toMatchObject({ aciertos: 2, notasPerdidas: 2, dedosEquivocados: 1 })
      expect(m.independencia!).toBeLessThan(100) // la pulsación doble bajó el promedio
      expect(m.independencia!).toBeGreaterThan(70)
      expect(m.desfaseMedio!).toBeGreaterThanOrEqual(0)
      expect(m.desfaseMedio!).toBeLessThan(1100)
      const cap = (x: string) => x[0].toUpperCase() + x.slice(1)
      // La independencia del dedo de la nota 2 bajó frente a la del dedo de la nota 1: el anular se movió igual que él (75 %) y
      // con solo dos dedos en juego la nota 4 vuelve a ser la de ese dedo (acierto limpio, ≈ 100 %), así que su promedio queda ≈ 87 %.
      expect(d4).toBe(d2)
      expect(m[`independencia${cap(d1)}`]!).toBeGreaterThan(95)
      expect(m[`independencia${cap(d2)}`]!).toBeLessThan(m[`independencia${cap(d1)}`]!)
      expect(m[`independencia${cap(d2)}`]!).toBeLessThan(92)
      expect(m[`independencia${cap(d2)}`]!).toBeGreaterThan(70)
      // Errores por dedo: la nota 2 (perdida y con dedo de más) cuenta UNA vez para su dedo.
      expect(m[`errores${cap(d2)}`]).toBeGreaterThanOrEqual(1)
      expect(ORDEN.reduce((t, d) => t + (m[`errores${cap(d)}`] ?? 0), 0)).toBe(2 + 0) // nota 2 y nota 3
      expect(s.muestras.canales.dedosAbajo.length).toBe(s.muestras.t.length)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1))
      expect(evs.filter((e) => e.tipo === 'nota_mostrada').map((e) => e.datos.posicion)).toEqual([1, 2, 3, 4])
      const ac = evs.filter((e) => e.tipo === 'acierto')
      expect(ac).toHaveLength(2)
      expect(ac[0]).toMatchObject({ mano: 'derecha', objeto: d1, datos: { dedo: d1 } })
      expect(ac[0].datos.independencia).toBeGreaterThan(90)
      expect(Math.abs(ac[0].datos.desfase)).toBeLessThan(1100)
      expect(ac[1].objeto).toBe(d4)
      const eq = evs.filter((e) => e.tipo === 'dedo_equivocado')
      expect(eq).toHaveLength(1)
      expect(eq[0]).toMatchObject({ mano: 'derecha', objeto: 'anular', datos: { dedo: 'anular', pedido: d2, simultaneo: true } })
      expect(evs.filter((e) => e.tipo === 'nota_perdida').map((e) => e.datos.posicion)).toEqual([2, 3])
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('mano IZQUIERDA, nivel 1, meta 2: acierto con el dedo pedido y un dedo equivocado no es acierto', async ({ page }) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('piano-dedos', 5, 2, 1, 'paciente', { parametros: { ...parametros(5, 2, 1), mano: 'izquierda' } })
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&lado=izquierda`)
      await expect(page.getByRole('heading', { level: 1, name: 'Piano de dedos' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      expect((await estado(page)).lados).toEqual(['izquierda'])
      await expect(page.getByTestId('mano-izquierda')).toContainText('Quieta')
      await pasarReposo(page)
      await expect(page.getByTestId('mano-izquierda')).toContainText(/Índice|Medio/)

      const d1 = await notaAbierta(page, 'izquierda')
      await bajar(page, 'izquierda', [d1])
      await expect.poll(async () => (await estado(page)).aciertos, { timeout: 4_000 }).toBe(1)
      expect((await estado(page)).independencia!).toBeGreaterThan(90)
      await soltar(page, 'izquierda')
      await esperarSoltado(page, 'izquierda')

      // Otro dedo (no el pedido): dedo equivocado, no acierto; la nota se pierde al terminar su ventana.
      const d2 = await notaAbierta(page, 'izquierda', 15_000)
      const otro: Dedo = d2 === 'menique' ? 'indice' : 'menique'
      await bajar(page, 'izquierda', [otro])
      await expect.poll(async () => (await estado(page)).equivocados, { timeout: 4_000 }).toBe(1)
      expect((await estado(page)).aciertos).toBe(1)
      await soltar(page, 'izquierda')
      await esperarSoltado(page, 'izquierda')
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 2/2', { timeout: 8_000 })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.metricas.juego).toMatchObject({ aciertos: 1, notasPerdidas: 1, dedosEquivocados: 1 })
      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      expect(evs.filter((e) => e.tipo === 'acierto')).toMatchObject([{ mano: 'izquierda', objeto: d1 }])
      expect(evs.filter((e) => e.tipo === 'dedo_equivocado')).toMatchObject([{ mano: 'izquierda', objeto: otro, datos: { pedido: d2, simultaneo: false } }])
      expect(evs.filter((e) => e.tipo === 'nota_perdida')).toMatchObject([{ mano: 'izquierda', objeto: d2 }])
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('nivel 5 (dos manos): cada mano fija su reposo, recibe sus notas y sus aciertos se anotan con su lado', async ({ page }) => {
    test.setTimeout(150_000)
    const escrituras = await sesionFalsa(page, 'piano-dedos', 5, 8, 5)
    await page.setViewportSize(HORIZONTAL)
    const v = vigilarErrores(page)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=ambas`)
    await expect(page.getByRole('heading', { level: 1, name: 'Piano de dedos' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    // Las dos manos quietas (el guion 'ambas' mueve los dedos: se fijan quietas).
    const quietas = async (poses: Partial<Record<Lado, Dedo[]>>) =>
      fuente(page, 'cargarGuion', {
        manos: (['derecha', 'izquierda'] as Lado[]).map((lado) => ({ lado, poses: [{ t: 0, apertura: 1, dedos: Object.fromEntries((poses[lado] ?? []).map((d) => [d, 0.6])), x: X_DOS[lado], y: 0.55 }] })),
      })
    await quietas({})
    expect((await estado(page)).lados).toEqual(['derecha', 'izquierda'])
    expect((await estado(page)).ventanaMs).toBe(400)
    await expect.poll(async () => (await estado(page)).reposoListo, { timeout: 12_000 }).toEqual({ derecha: true, izquierda: true })
    await expect.poll(async () => (await estado(page)).fase, { timeout: 5_000 }).toBe('jugando')
    await expect(page.getByTestId('mano-derecha')).toBeVisible()
    await expect(page.getByTestId('mano-izquierda')).toBeVisible()

    // Responde a la nota que abra su ventana, de cualquiera de las dos manos, hasta lograr 3 aciertos.
    const intentos: Record<Lado, number> = { derecha: 0, izquierda: 0 }
    const inicio = Date.now()
    while ((await estado(page)).aciertos < 3 && Date.now() - inicio < 60_000) {
      const e = await estado(page)
      const lado = (['derecha', 'izquierda'] as Lado[]).find((l) => e.activa[l] && (e.activa[l]!.faltaMs ?? 0) > -250)
      if (!lado) {
        await page.waitForTimeout(30)
        continue
      }
      intentos[lado]++
      const antes = e.aciertos + e.perdidas
      await quietas({ [lado]: [e.activa[lado]!.dedo] })
      await expect.poll(async () => { const x = await estado(page); return x.aciertos + x.perdidas > antes || (x.abajo[lado]?.length ?? 0) > 0 }, { timeout: 3_000 }).toBe(true)
      await page.waitForTimeout(420) // deja que la pulsación se cierre
      await quietas({})
      await expect.poll(async () => ((await estado(page)).abajo[lado]?.length ?? 0), { timeout: 3_000 }).toBe(0)
    }
    const fin = await estado(page)
    expect(fin.aciertos).toBeGreaterThanOrEqual(3)
    expect(fin.independencia!).toBeGreaterThan(85)

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion`), { timeout: 10_000 })
    const evs = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string; mano: string | null; objeto: string | null }[])
    const mostradas = new Set(evs.filter((e) => e.tipo === 'nota_mostrada').map((e) => e.mano))
    expect(mostradas).toEqual(new Set(['derecha', 'izquierda'])) // el nivel 5 reparte notas a las dos manos
    for (const lado of ['derecha', 'izquierda'] as Lado[]) {
      if (intentos[lado] >= 2) expect(evs.filter((e) => e.tipo === 'acierto' && e.mano === lado).length).toBeGreaterThanOrEqual(1)
    }
    expect(evs.filter((e) => e.tipo === 'acierto').length).toBeGreaterThanOrEqual(3)
    v.sinErrores()
  })
})
