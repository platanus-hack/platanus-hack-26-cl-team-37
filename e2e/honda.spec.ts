// F39 · Honda sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390) y una sesión falsa (no toca la BD).
// Las dos manos simuladas toman la banda: quietas marcan el cero solo y cada tirón es un tiro. La carga sale de la misma
// medición del laboratorio (centros de las palmas, escala 3D de cada mano, curva de la Corength de 5 kg en lazo), así
// que se comprueba el resultado de cada tiro y no un número exacto. Nivel 1: zona verde de 30 a 65 % de estiramiento
// (≈ 2,3 a 3,9 kg con esa banda) y sostener 0,5 s. La separación entre las manos simuladas × f da ≈ (f − 1) de estiramiento.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, limpiarPrueba, sesionFalsa, type Ventana } from './juegos.ts'

type Estado = {
  fase: string
  contador: number
  meta: number
  metaKg: number
  topeKg: number
  sostenerS: number
  ceroDudoso: boolean
  banda: string
  reposoCm: number | null
  kg: number | null
  progresoSostener: number
  tiros: { resultado: string; picoKg: number; sostenidoS: number }[]
  vuelo: boolean
}
const PROHIBIDAS = new RegExp(`${'fuer'}za|${'pre'}si[oó]n|${'apr'}(?:e|ie)t`, 'i')
const REPOSO = 0.3

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const guion = (p: Page, g: object) => p.evaluate((x) => (globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(x), g)

/** Las dos manos con separación `sep` (fracción del ancho de la imagen) en cada instante `t` (ms). */
function manos(pasos: [number, number][]) {
  return {
    manos: (['derecha', 'izquierda'] as const).map((lado) => ({
      lado,
      poses: pasos.map(([t, sep]) => ({ t, x: 0.5 + (lado === 'derecha' ? -sep : sep) / 2, y: 0.5 })),
    })),
  }
}
const quietas = (sep: number) => manos([[0, sep], [600_000, sep]])
/** Un tiro: estirar en 0,8 s hasta `factor` × reposo, sostener `ms`, soltar en 0,3 s y quedarse quieta. */
const tiro = (factor: number, ms: number) => manos([[0, REPOSO], [800, REPOSO * factor], [800 + ms, REPOSO * factor], [1100 + ms, REPOSO], [600_000, REPOSO]])

test.describe('Honda', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

  test('nivel 1 (estirar 30 %, sostener 0,5 s), meta 3: aciertos, corto, largo y sin sostener; eventos y métricas guardados', async ({ page }) => {
    test.setTimeout(150_000)
    const errores = vigilarErrores(page)
    const escrituras = await sesionFalsa(page, 'honda', 5, 3, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Honda' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 20_000)
    const inicial = await estado(page)
    expect(inicial).toMatchObject({ sostenerS: 0.5, meta: 3, banda: 'Corength 5 kg × 2 tiras', ceroDudoso: false })
    expect(inicial.metaKg).toBeGreaterThan(2)
    expect(inicial.metaKg).toBeLessThan(2.7)
    expect(inicial.topeKg).toBeGreaterThan(3.5)

    // Una sola mano: no se mide nada y la pista pide las dos.
    await page.waitForTimeout(1_000)
    expect((await estado(page)).fase).toBe('sin-manos')
    await expect(page.getByTestId('pista')).toHaveText('Toma la banda con las dos manos frente a la cámara')

    // Dos manos quietas con la banda tensa: el cero se marca solo.
    await guion(page, quietas(REPOSO))
    await expect.poll(async () => (await estado(page)).reposoCm, { timeout: 8_000 }).not.toBeNull()
    expect((await estado(page)).fase).toBe('listo')
    expect((await estado(page)).kg).toBe(0)

    const tirar = async (factor: number, ms: number, n: number) => {
      await guion(page, tiro(factor, ms))
      await expect.poll(async () => (await estado(page)).tiros.length, { timeout: ms + 6_000 }).toBe(n)
      await expect.poll(async () => (await estado(page)).vuelo, { timeout: 3_000 }).toBe(false)
      return (await estado(page)).tiros[n - 1]
    }
    // Llega a la zona verde (≈ 45 % de estiramiento) y la sostiene 1,5 s: en el blanco.
    await guion(page, tiro(1.45, 1_500))
    // La piedra sale sola al cumplir el sostén, sin gesto de soltar: con la banda aún estirada la fase pide volver al centro.
    await expect.poll(async () => (await estado(page)).fase, { timeout: 4_000, intervals: [50] }).toBe('volver')
    expect((await estado(page)).tiros).toHaveLength(1)
    await page.screenshot({ path: process.env.CAPTURAS ? `${process.env.CAPTURAS}/honda-sostenido.png` : 'test-results/honda-sostenido.png' })
    await expect.poll(async () => (await estado(page)).tiros.length, { timeout: 6_000 }).toBe(1)
    expect((await estado(page)).tiros[0]).toMatchObject({ resultado: 'acierto' })
    await expect.poll(async () => (await estado(page)).vuelo, { timeout: 3_000 }).toBe(false)
    await expect(page.getByTestId('contador')).toHaveText('1/3')

    expect(await tirar(1.15, 1_500, 2)).toMatchObject({ resultado: 'corto' })
    expect(await tirar(1.95, 1_500, 3)).toMatchObject({ resultado: 'largo' })
    expect(await tirar(1.45, 150, 4)).toMatchObject({ resultado: 'sin-sostener' })
    await page.screenshot({ path: process.env.CAPTURAS ? `${process.env.CAPTURAS}/honda-fallos.png` : 'test-results/honda-fallos.png' })
    const picos = (await estado(page)).tiros.map((t) => t.picoKg)
    expect(picos[0]).toBeGreaterThan(inicial.metaKg)
    expect(picos[0]).toBeLessThan(inicial.topeKg)
    expect(picos[1]).toBeLessThan(inicial.metaKg)
    expect(picos[2]).toBeGreaterThan(inicial.topeKg)

    // Dos aciertos más completan la meta: la sesión termina y pasa a la sensación.
    expect(await tirar(1.45, 1_500, 5)).toMatchObject({ resultado: 'acierto' })
    await guion(page, tiro(1.45, 1_500))
    await expect(page).toHaveURL(/\/sensacion/, { timeout: 15_000 })

    // Eventos: zona verde, sostenido, cada tiro con su resultado.
    const eventos = escrituras.filter((e) => e.tabla === 'eventos_sesion').flatMap((e) => (Array.isArray(e.cuerpo) ? e.cuerpo : [e.cuerpo])) as { tipo: string; datos: Record<string, unknown> | null }[]
    const tipos = eventos.map((e) => e.tipo)
    expect(tipos.filter((t) => t === 'soltar')).toHaveLength(6)
    expect(tipos.filter((t) => t === 'acierto')).toHaveLength(3)
    expect(tipos.filter((t) => t === 'no_alcanzado')).toHaveLength(3)
    expect(tipos).toContain('umbral_alcanzado')
    expect(tipos).toContain('sostenido_completo')
    expect(eventos.find((e) => e.tipo === 'soltar')!.datos).toMatchObject({ resultado: 'acierto', sePaso: false })

    // Métricas de la sesión (metricas.juego) para el resumen y la vista del terapeuta.
    const cierre = escrituras.filter((e) => e.tabla === 'sesiones' && e.metodo === 'PATCH').map((e) => e.cuerpo as { metricas?: { juego?: Record<string, number | null> } }).find((c) => c.metricas?.juego)
    expect(cierre?.metricas?.juego).toMatchObject({ aciertos: 3, tiros: 6, precisionPct: 50, cortos: 1, largos: 1 })
    expect(cierre!.metricas!.juego!.cargaMaxKg!).toBeGreaterThan(inicial.topeKg)
    expect(cierre!.metricas!.juego!.tiempoBajoTensionS!).toBeGreaterThan(5)
    errores.sinErrores()
  })

  test('sesión real del paciente de prueba: se guardan eventos, muestras, poses y métricas; el resumen muestra sus tarjetas', async ({ page }) => {
    test.setTimeout(150_000)
    let id = ''
    try {
      id = await crearSesion('honda', 5, 2, 1, 'prueba')
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta`)
      await esperarFase(page, 'jugando', 20_000)
      await guion(page, quietas(REPOSO))
      await expect.poll(async () => (await estado(page)).reposoCm, { timeout: 8_000 }).not.toBeNull()
      await guion(page, tiro(1.45, 1_200))
      await expect.poll(async () => (await estado(page)).tiros.length, { timeout: 8_000 }).toBe(1)
      await page.waitForTimeout(1_600)
      await guion(page, tiro(1.15, 1_200))
      await expect.poll(async () => (await estado(page)).tiros.length, { timeout: 8_000 }).toBe(2)
      await page.waitForTimeout(1_600)
      await guion(page, tiro(1.45, 1_200))
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 15_000 })

      const sb = await clienteComo('prueba')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.metricas.juego).toMatchObject({ aciertos: 2, tiros: 3, precisionPct: 67, cortos: 1, largos: 0, rachaMax: 1 })
      expect(s.metricas.juego.cargaMaxKg).toBeGreaterThan(2.3)
      expect(s.muestras.canales.cargaKg.length).toBe(s.muestras.t.length)
      const poses = s.muestras.poses as { etiqueta: string; lado: string; puntos: unknown[] }[]
      for (const etiqueta of ['reposo', 'pico']) expect(poses.filter((p) => p.etiqueta === etiqueta).map((p) => p.lado).sort(), etiqueta).toEqual(['derecha', 'izquierda'])
      const evs = (await sb.from('eventos_sesion').select('tipo').eq('sesion_id', id).order('seq')).data!.map((e) => e.tipo)
      expect(evs.filter((t) => t === 'soltar')).toHaveLength(3)
      expect(evs.filter((t) => t === 'acierto')).toHaveLength(2)
      expect(JSON.stringify(s.metricas)).not.toMatch(PROHIBIDAS)

      // Sensación → resumen: el anillo con los aciertos y las tarjetas del juego, con «aprox.» en lo que mide la cámara.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('slider', { name: /Dolor durante la sesión/ }).fill('1')
      await page.getByRole('button', { name: 'Suave', exact: true }).click()
      await page.getByRole('button', { name: 'Guardar y ver resumen' }).click()
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/resumen`), { timeout: 10_000 })
      await expect(page.getByTestId('anillo')).toContainText('/2 aciertos')
      await expect(page.locator('.resumen-dato .resumen-dato-nombre')).toHaveText(['En el blanco', 'Carga máx. aprox.', 'Constancia', 'Bajo tensión', 'Dolor reportado'])
      await expect(page.getByTestId('dato-cargaMaxKg')).toContainText(/\d,\d kg aprox\./)
      await expect(page.locator('body')).not.toContainText(PROHIBIDAS)
      if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/honda-resumen.png`, fullPage: true })
      v.sinErrores()
    } finally {
      await page.goto('about:blank').catch(() => undefined)
      limpiarPrueba([id])
    }
  })

  test('la preparación pregunta cuántas tiras hay entre las manos y el juego usa esa banda', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/sesion/honda/preparar')
    const grupo = page.getByRole('group', { name: 'Tiras de banda entre tus manos' })
    await expect(grupo.getByRole('button', { pressed: true })).toHaveText('2 · lazo', { timeout: 10_000 })
    await expect(page.getByTestId('dos-manos')).toBeVisible()
    await grupo.getByRole('button', { name: '4 · doblado' }).click()
    await expect(grupo.getByRole('button', { pressed: true })).toHaveText('4 · doblado')
    // El juego toma las 4 tiras: el mismo nivel carga el doble que con el lazo simple.
    await sesionFalsa(page, 'honda', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await esperarFase(page, 'jugando', 20_000)
    const e = await estado(page)
    expect(e.banda).toBe('Corength 5 kg × 4 tiras')
    expect(e.metaKg).toBeGreaterThan(4.2)
  })

  test('desde el menú se sale al catálogo sin terminar la sesión ni pasar por la encuesta', async ({ page }) => {
    test.setTimeout(60_000)
    const escrituras = await sesionFalsa(page, 'honda', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await esperarFase(page, 'jugando', 20_000)
    await page.getByRole('button', { name: 'Menú' }).click()
    await expect(page.getByTestId('menu-pausa')).toBeVisible()
    await page.getByRole('button', { name: 'Salir a los juegos' }).click()
    await expect(page).toHaveURL(/\/ejercicios/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Ejercicios' })).toBeVisible()
    // No se cerró la sesión ni se guardó el resumen.
    const cierres = escrituras.filter((e) => e.tabla === 'sesiones' && (e.cuerpo as { metricas?: unknown })?.metricas)
    expect(cierres).toEqual([])
  })

  test('«Poner en cero» marca el reposo de nuevo y la pantalla no dice lo que la cámara no mide', async ({ page }) => {
    test.setTimeout(90_000)
    await sesionFalsa(page, 'honda', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await esperarFase(page, 'jugando', 20_000)
    await guion(page, quietas(REPOSO))
    await expect.poll(async () => (await estado(page)).reposoCm, { timeout: 8_000 }).not.toBeNull()
    const antes = (await estado(page)).reposoCm!
    // Las manos quedan un 20 % más separadas (se movió el agarre): con «Poner en cero» ese es el nuevo reposo.
    await guion(page, quietas(REPOSO * 1.2))
    await page.waitForTimeout(500)
    expect((await estado(page)).kg!).toBeGreaterThan(1)
    await page.getByRole('button', { name: 'Poner en cero' }).click()
    await expect.poll(async () => (await estado(page)).reposoCm!, { timeout: 4_000 }).toBeGreaterThan(antes * 1.12)
    expect((await estado(page)).kg).toBe(0)
    expect(await page.locator('body').innerText()).not.toMatch(PROHIBIDAS)
  })
})
