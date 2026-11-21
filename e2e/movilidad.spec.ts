// F11 · Movilidad guiada sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// - Sesión REAL: guion sintético `abrir-cerrar` (un ciclo cada 2 s, en bucle) con meta 6 → el contador llega a 6/6
//   exacto (al cumplir la meta deja de contar), "¡Meta cumplida! 6/6", /sensacion; métricas, eventos
//   (agarre_inicio + soltar{enCaja:true} por ciclo, como el seed) y muestras guardados. Se mide el fps.
//   Con CAPTURA_MOVILIDAD=1 guarda docs/capturas/movilidad.png (mano cerrada siguiendo la guía) y movilidad-meta.png.
// - Sesión falsa, sin meta: 3 ciclos y luego la mano se queda quieta, un cierre a medias (sobre el umbral) no
//   cuenta → 3 exactos; Terminar guarda ciclos 3/3 intentos.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, juego, limpiar, sesionFalsa, type Ventana } from './juegos.ts'

type EstadoMovilidad = { contador: number; meta: number; cerrada: Record<string, boolean>; apertura: number | null; objetivo: number; fase: string; umbrales: { cierre: number; apertura: number }; ciclosT: number[] }
const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<EstadoMovilidad>
const SIN_FPS = '[data-testid=fps] { display: none !important }'

test.describe('Movilidad guiada', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('abrir-cerrar sintético: cuenta ciclos exactos, cumple la meta y termina en /sensacion', async ({ page }, info) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('movilidad-guiada', 5, 6, 2)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=abrir-cerrar&depuracion=1`)

      await expect(page.getByRole('heading', { level: 1, name: 'Movilidad guiada' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('vivo-apertura')).toContainText('%')
      await expect(page.getByText('Apertura de la mano')).toBeVisible()
      await expect(page.getByText('Flexión del índice')).toBeVisible()
      await expect(page.getByText('Ritmo (ciclos/min)')).toBeVisible()
      const e0 = await estado(page)
      expect(e0.meta).toBe(6)
      expect(e0.umbrales).toEqual({ cierre: 0.45, apertura: 0.75 }) // nivel 2

      // Cuenta de a uno, con la mano cerrada en algún momento ("Cerrada" en el panel).
      await expect(page.getByTestId('contador')).toHaveText('1/6', { timeout: 6_000 })
      await expect(page.getByTestId('mano-derecha')).toContainText('Cerrada', { timeout: 3_000 })
      await expect(page.getByTestId('contador')).toHaveText('2/6', { timeout: 4_000 })
      // Ritmo en vivo ≈ 30 ciclos/min (un ciclo cada 2 s).
      await expect(page.getByTestId('contador')).toHaveText('3/6', { timeout: 4_000 })
      const ritmo = (await juego(page))!.vivo.ritmo
      expect(ritmo).toBeGreaterThan(25)
      expect(ritmo).toBeLessThan(35)
      // fps (la calidad adaptativa de la base lo mantiene ≥ 24; con 2 workers en paralelo puede tardar una ventana).
      await expect.poll(async () => (await juego(page))!.fps, { timeout: 6_000 }).toBeGreaterThanOrEqual(24)
      const j0 = (await juego(page))!
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[movilidad] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)
      if (process.env.CAPTURA_MOVILIDAD) {
        await expect.poll(async () => (await estado(page)).cerrada.derecha, { timeout: 3_000 }).toBe(true)
        await page.screenshot({ path: 'docs/capturas/movilidad.png', style: SIN_FPS })
      }

      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 6/6', { timeout: 10_000 })
      if (process.env.CAPTURA_MOVILIDAD) await page.screenshot({ path: 'docs/capturas/movilidad-meta.png', style: SIN_FPS })
      // Durante los 2,5 s del aviso la mano sigue abriendo y cerrando: no cuenta más (contador e intentos = 6, abajo).
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=abrir-cerrar&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Movilidad no usa física').toEqual([])

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      const m = s.metricas
      expect(m).toMatchObject({ agarres: 6, agarresDer: 6, agarresIzq: 0, intentos: 6, precision: 1, contador: 6, meta: 6, metaCumplida: true, motivoFin: 'meta' })
      expect(m.juego.ciclos).toBe(6)
      expect(m.juego.ritmo).toBeGreaterThan(25)
      expect(m.juego.ritmo).toBeLessThan(35)
      expect(m.juego.rango).toBeGreaterThan(80) // el guion va de abierta (1) a puño (0)
      expect(m.juego.aperturaMax).toBe(100)
      expect(m.juego.tiempoMedioCiclo).toBeGreaterThan(0.5)
      expect(m.juego.tiempoMedioCiclo).toBeLessThan(1.5)
      expect(m.tiempoMedioAgarreS).toBeCloseTo(m.juego.tiempoMedioCiclo, 0)
      expect(m.flexionIndiceMax).toBeGreaterThan(120)
      expect(s.muestras.hz).toBe(10)
      expect(s.muestras.canales.aperturaMano.length).toBe(s.muestras.t.length)
      expect(s.muestras.canales.guia.length).toBe(s.muestras.t.length)
      expect(Math.min(...s.muestras.canales.aperturaMano.filter((x: number | null) => x != null))).toBeLessThan(10)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const ciclos = evs.filter((e) => e.objeto === 'ciclo')
      expect(ciclos.map((e) => e.tipo)).toEqual(Array.from({ length: 12 }, (_, i) => (i % 2 ? 'soltar' : 'agarre_inicio')))
      for (const e of ciclos) expect(e.mano).toBe('derecha')
      for (const e of ciclos.filter((e) => e.tipo === 'soltar')) expect(e.datos).toMatchObject({ enCaja: true })
      expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1))
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('sin meta: 3 ciclos y un cierre a medias dan 3 exactos; Terminar guarda los ciclos', async ({ page }) => {
    test.setTimeout(90_000)
    const escrituras = await sesionFalsa(page, 'movilidad-guiada', 5, 0, 3)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Movilidad guiada' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    expect((await estado(page)).umbrales).toEqual({ cierre: 0.3, apertura: 0.8 }) // nivel 3
    // La guía avanza con el tiempo de juego y la pista la sigue.
    await expect.poll(async () => (await estado(page)).fase, { timeout: 4_000 }).toBe('cerrando')
    await expect(page.getByTestId('pista')).toContainText('Cierra la mano despacio')

    // 3 ciclos (abierta → puño → abierta), luego un cierre a medias (apertura 0,5 > umbral 0,3) y queda abierta.
    const poses: { t: number; apertura: number }[] = [{ t: 0, apertura: 1 }]
    let t = 0
    for (let i = 0; i < 3; i++) poses.push({ t: (t += 600), apertura: 0 }, { t: (t += 300), apertura: 0 }, { t: (t += 600), apertura: 1 }, { t: (t += 300), apertura: 1 })
    poses.push({ t: (t += 500), apertura: 0.5 }, { t: (t += 300), apertura: 0.5 }, { t: (t += 500), apertura: 1 })
    await page.evaluate((g) => (globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(g), { bucle: false, manos: [{ lado: 'derecha', poses: poses.map((p) => ({ ...p, x: 0.42 })) }] })
    await page.waitForTimeout(t + 1_500)
    await expect(page.getByTestId('contador')).toHaveText('3')
    expect((await estado(page)).contador).toBe(3)

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion\\?fuente=sintetica&guion=quieta$`), { timeout: 10_000 })
    const final = escrituras.filter((e) => e.tabla === 'sesiones' && e.metodo === 'PATCH').at(-1)!.cuerpo as { metricas: Record<string, unknown> & { juego: Record<string, unknown> } }
    expect(final.metricas).toMatchObject({ agarres: 3, intentos: 3, precision: 1, contador: 3, meta: 0, motivoFin: 'manual' })
    expect(final.metricas.juego).toMatchObject({ ciclos: 3 })
    const eventos = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => e.cuerpo as { tipo: string; objeto: string | null; datos: { enCaja?: boolean } | null }[])
    expect(eventos.filter((e) => e.objeto === 'ciclo').map((e) => e.tipo)).toEqual(['agarre_inicio', 'soltar', 'agarre_inicio', 'soltar', 'agarre_inicio', 'soltar'])
  })
})
