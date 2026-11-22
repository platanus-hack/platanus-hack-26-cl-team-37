// F36 · Banda elástica sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// El guion 'banda' (src/tracking/sintetica.ts) pone las dos manos en reposo ~3,5 s y hace tres tirones de +40 %, +60 % y
// +50 % de separación (con bucle). La distancia entre nudillos en píxeles sale de landmarks sintéticos, así que los
// porcentajes se comprueban con tolerancia (±8 puntos), no exactos.
// - Sesión REAL del paciente de prueba, nivel 3 (6 kg), meta 3: el reposo se marca solo, el contador llega a 3/3, la
//   sesión guarda eventos (umbral_alcanzado), muestras (estiramientoCm, cargaKg), poses 'reposo' y 'pico' de AMBOS
//   lados y las métricas del contrato; luego sensación → resumen (la cierra) con las tarjetas. Se limpia al final.
// - Sesión falsa, nivel 5 (10 kg), sin meta: una sola mano → mensaje y sin medir; dos manos quietas → pista del
//   reposo; el botón marca el reposo; separar las manos da estiramiento y carga aprox.; volver a marcar lo reemplaza.
// - Ningún texto del juego (código ni pantalla) dice lo que la cámara no mide.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, crearSesion, esperarFase, limpiarPrueba, sesionFalsa, type Ventana } from './juegos.ts'

type Estado = {
  contador: number
  meta: number
  fase: string
  manos: number
  kgBanda: number
  reposoCm: number | null
  estiramientoCm: number | null
  estiramientoPct: number | null
  cargaKg: number | null
  maxPct: number
  maxCm: number
  repeticiones: number
  incompletas: number
  fragmentos: number
  picosPct: number[]
  progresoReposo: number
  posesPico: number
  posesReposo: number
}
// Las palabras que la cámara no puede respaldar (fuerza, presión, apretar/apretones/apretando): se arman por partes
// para que este archivo no las contenga.
const PROHIBIDAS = new RegExp(`${'fuer'}za|${'pre'}si[oó]n|${'apr'}(?:e|ie)t`, 'i')
const SIN_FPS = '[data-testid=fps] { display: none !important }'
const PISTA_REPOSO = 'Toma la banda con las dos manos, recién tensa, y quédate quieto'

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const guion = (p: Page, g: object) => p.evaluate((x) => (globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(x), g)
/** Las dos manos quietas, con `sep` de separación en la imagen (fracción del ancho; el reposo del guion es 0,30). */
const dosManos = (sep: number) => ({
  manos: [
    { lado: 'derecha', poses: [{ t: 0, x: 0.5 - sep / 2, y: 0.5 }] },
    { lado: 'izquierda', poses: [{ t: 0, x: 0.5 + sep / 2, y: 0.5 }] },
  ],
})
const unaMano = { manos: [{ lado: 'derecha', poses: [{ t: 0, x: 0.42, y: 0.5 }] }] }

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]))
}

test.describe('Banda elástica', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

  test('guion banda: reposo automático, 3 repeticiones contadas, métricas del contrato, poses y resumen', async ({ page }, info) => {
    test.setTimeout(150_000)
    let id = ''
    try {
      id = await crearSesion('banda-elastica', 5, 3, 3, 'prueba')
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=banda&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Banda elástica' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByTestId('contador')).toHaveText(/^0\/3$/)
      expect(await estado(page)).toMatchObject({ meta: 3, kgBanda: 6 })
      await expect(page.getByTestId('mano-derecha')).toBeVisible()
      await expect(page.getByTestId('vivo-cargaKg')).toBeVisible()
      await expect(page.getByTestId('vivo-estiramientoCm')).toBeVisible()

      // El reposo se marca solo con las manos quietas; después hay estiramiento y carga aprox. en vivo.
      await expect.poll(async () => (await estado(page)).reposoCm, { timeout: 25_000 }).not.toBeNull()
      const e1 = await estado(page)
      expect(e1.reposoCm!).toBeGreaterThan(15)
      expect(e1.reposoCm!).toBeLessThan(23)
      await expect(page.getByTestId('pista')).toContainText(/Estira la banda|Estira un poco más/)
      await expect.poll(async () => (await estado(page)).posesReposo, { timeout: 3_000 }).toBeGreaterThan(0)

      // En un tirón: más de 25 % de estiramiento, carga = 6 kg × % y se ve en el panel.
      // Cada 50 ms: el pico de un tirón dura medio segundo y con el intervalo creciente de expect.poll (hasta 1 s) se perdía,
      // y al cumplirse la meta el juego se desmonta (fallaba según la carga del equipo).
      await expect.poll(async () => (await estado(page)).estiramientoPct ?? 0, { timeout: 15_000, intervals: [50] }).toBeGreaterThan(40)
      if (process.env.CAPTURA_BANDA) await page.screenshot({ path: 'docs/capturas/banda-elastica.png', style: SIN_FPS })
      const mid = await estado(page)
      expect(mid.cargaKg!).toBeCloseTo((6 * mid.estiramientoPct!) / 100, 0)
      await expect(page.getByTestId('vivo-cargaKg')).toContainText(/\d,\d kg/)
      await expect(page.locator('body')).not.toContainText(PROHIBIDAS)

      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 3/3', { timeout: 40_000 })
      const j0 = (await (await page.evaluate(() => (globalThis as unknown as Ventana).__manovivaJuego ?? null)))!
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[banda-elastica] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)
      const e = await estado(page)
      expect(e).toMatchObject({ contador: 3, repeticiones: 3, incompletas: 0 })
      expect(e.picosPct).toHaveLength(3)
      expect(e.picosPct[0]).toBeGreaterThan(32)
      expect(e.picosPct[0]).toBeLessThan(48)
      expect(e.picosPct[1]).toBeGreaterThan(52)
      expect(e.picosPct[1]).toBeLessThan(68)
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=banda&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Banda elástica no usa física').toEqual([])

      const sb = await clienteComo('prueba')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas).toMatchObject({ contador: 3, meta: 3, metaCumplida: true, motivoFin: 'meta' })
      const m = s.metricas.juego
      expect(Object.keys(m).sort()).toEqual(['cambioPicoPct', 'cargaMaxKg', 'estiramientoMaxCm', 'estiramientoMaxPct', 'kgBanda', 'repeticiones', 'reposoCm', 'tiempoBajoTensionS'])
      expect(m).toMatchObject({ repeticiones: 3, kgBanda: 6 })
      expect(m.estiramientoMaxPct).toBeGreaterThan(52)
      expect(m.estiramientoMaxPct).toBeLessThan(68)
      expect(m.estiramientoMaxCm).toBeCloseTo((m.estiramientoMaxPct / 100) * m.reposoCm, 0)
      expect(m.cargaMaxKg).toBeCloseTo((6 * m.estiramientoMaxPct) / 100, 0)
      expect(m.reposoCm).toBeGreaterThan(15)
      expect(m.reposoCm).toBeLessThan(23)
      expect(m.tiempoBajoTensionS).toBeGreaterThan(0.5)
      expect(m.cambioPicoPct).toBeGreaterThan(8) // pico 1 ≈ 40 %, pico 3 ≈ 50 %: ≈ +25 %
      expect(m.cambioPicoPct).toBeLessThan(45)

      // Muestras a 10 Hz con los dos canales del contrato.
      expect(s.muestras.hz).toBe(10)
      expect(s.muestras.canales.estiramientoCm.length).toBe(s.muestras.t.length)
      expect(s.muestras.canales.cargaKg.length).toBe(s.muestras.t.length)
      const cm = (s.muestras.canales.estiramientoCm as (number | null)[]).filter((x) => x != null) as number[]
      expect(Math.max(...cm)).toBeGreaterThan(6)

      // Poses clave de AMBOS lados: reposo y pico (valor = estiramiento en cm, queda el mayor).
      const poses = s.muestras.poses as { etiqueta: string; lado: string; valor: number | null; puntos: unknown[] }[]
      for (const etiqueta of ['reposo', 'pico']) expect(poses.filter((p) => p.etiqueta === etiqueta).map((p) => p.lado).sort(), etiqueta).toEqual(['derecha', 'izquierda'])
      for (const p of poses) expect(p.puntos).toHaveLength(21)
      for (const p of poses.filter((x) => x.etiqueta === 'pico')) {
        expect(p.valor!).toBeGreaterThan(0.8 * m.estiramientoMaxCm)
        expect(p.valor!).toBeLessThanOrEqual(m.estiramientoMaxCm + 0.2)
      }

      // Eventos: solo tipos existentes, uno por repetición con sus datos.
      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      expect(evs.map((x) => x.tipo)).toEqual(['umbral_alcanzado', 'umbral_alcanzado', 'umbral_alcanzado'])
      evs.forEach((x, i) => {
        expect(x.datos).toMatchObject({ rep: i + 1 })
        expect(x.datos.estiramientoCm).toBeGreaterThan(3)
        expect(x.datos.cargaKg).toBeCloseTo((6 * x.datos.estiramientoPct) / 100, 1)
      })
      expect(evs.map((x) => x.seq)).toEqual([1, 2, 3])
      expect(JSON.stringify([s.metricas, evs])).not.toMatch(PROHIBIDAS)

      // Sensación → resumen: tarjetas del juego con "aprox." y sin palabras prohibidas.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('slider', { name: /Dolor durante la sesión/ }).fill('1')
      await page.getByRole('button', { name: 'Suave', exact: true }).click()
      await page.getByRole('button', { name: 'Guardar y ver resumen' }).click()
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/resumen`), { timeout: 10_000 })
      await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()
      await expect(page.getByTestId('anillo')).toContainText('/3 repeticiones')
      await expect(page.locator('.resumen-dato .resumen-dato-nombre')).toHaveText(['Estiramiento máx.', 'Estiramiento máx. %', 'Carga máx. aprox.', 'Bajo tensión', 'Cambio del pico', 'Dolor reportado'])
      await expect(page.getByTestId('dato-cargaMaxKg')).toContainText(/^Carga máx\. aprox\.\d,\d kg aprox\./)
      await expect(page.getByTestId('dato-estiramientoMaxCm')).toContainText(/cm aprox\./)
      await expect(page.getByTestId('dato-tiempoBajoTensionS')).toContainText(/\d,\d s/)
      await expect(page.locator('body')).not.toContainText(PROHIBIDAS)
      if (process.env.CAPTURA_BANDA) await page.screenshot({ path: 'docs/capturas/banda-elastica-resumen.png', fullPage: true })
      expect((await sb.from('sesiones').select('estado').eq('id', id).single()).data!.estado).toBe('cerrada')
      v.sinErrores()
    } finally {
      await page.goto('about:blank').catch(() => undefined)
      limpiarPrueba([id])
    }
  })

  test('una mano no se mide; el botón marca el reposo; el estiramiento da carga aprox. según la banda del nivel', async ({ page }) => {
    test.setTimeout(90_000)
    const escrituras = await sesionFalsa(page, 'banda-elastica', 5, 0, 5)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await expect(page.getByRole('heading', { level: 1, name: 'Banda elástica' })).toBeVisible({ timeout: 15_000 })
    await esperarFase(page, 'jugando', 15_000)
    expect(await estado(page)).toMatchObject({ kgBanda: 10, meta: 0 })

    // Una sola mano (la del guion 'quieta'): mensaje claro y nada medido.
    await expect(page.getByTestId('pista')).toContainText('Veo solo una mano')
    await page.waitForTimeout(2_600)
    let e = await estado(page)
    expect(e).toMatchObject({ fase: 'una-mano', manos: 1, reposoCm: null, estiramientoPct: null, cargaKg: null })
    await expect(page.getByTestId('vivo-estiramientoCm')).toContainText('—')
    await expect(page.getByTestId('contador')).toHaveText('0')

    // Dos manos quietas: la pista del reposo; antes de los 2 s el botón lo marca de inmediato.
    await guion(page, dosManos(0.3))
    await expect(page.getByTestId('pista')).toHaveText(PISTA_REPOSO)
    await expect.poll(async () => (await estado(page)).fase).toBe('buscando-reposo')
    expect((await estado(page)).reposoCm).toBeNull()
    await page.getByRole('button', { name: 'Marcar reposo de nuevo' }).click()
    await expect.poll(async () => (await estado(page)).reposoCm, { timeout: 3_000 }).not.toBeNull()
    e = await estado(page)
    expect(e.fase).toBe('listo')
    expect(e.reposoCm!).toBeGreaterThan(15)
    expect(e.reposoCm!).toBeLessThan(23)
    const reposo1 = e.reposoCm!

    // Separar las manos un 50 %: estiramiento ≈ 50 % del reposo y carga = 10 kg × % (≈ 5 kg), "aprox.".
    await guion(page, dosManos(0.45))
    await expect.poll(async () => (await estado(page)).estiramientoPct ?? 0, { timeout: 3_000 }).toBeGreaterThan(40)
    e = await estado(page)
    expect(e.estiramientoPct!).toBeLessThan(60)
    expect(e.estiramientoCm!).toBeCloseTo((e.estiramientoPct! / 100) * reposo1, 0)
    expect(e.cargaKg!).toBeCloseTo((10 * e.estiramientoPct!) / 100, 0)
    await expect(page.getByTestId('vivo-cargaKg')).toContainText(/\d,\d kg/)
    await expect(page.getByTestId('vivo-estiramientoPct')).toContainText('%')
    await expect(page.getByText('Carga aprox.').first()).toBeVisible()
    await expect(page.getByTestId('mano-derecha')).toContainText('Estirando')
    await expect(page.locator('body')).not.toContainText(PROHIBIDAS)

    // Volver a una sola mano deja de medir (no se inventa nada).
    await guion(page, unaMano)
    await expect.poll(async () => (await estado(page)).estiramientoPct, { timeout: 3_000 }).toBeNull()
    await expect(page.getByTestId('pista')).toContainText('Veo solo una mano')

    // Marcar el reposo de nuevo con las manos separadas lo reemplaza: ahí el estiramiento vuelve a ser 0.
    await guion(page, dosManos(0.45))
    await expect.poll(async () => (await estado(page)).estiramientoPct ?? 0, { timeout: 3_000 }).toBeGreaterThan(40)
    await page.getByRole('button', { name: 'Marcar reposo de nuevo' }).click()
    await expect.poll(async () => (await estado(page)).estiramientoPct ?? 99, { timeout: 3_000 }).toBeLessThan(5)
    expect((await estado(page)).reposoCm!).toBeGreaterThan(reposo1 * 1.3)

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/sensacion`), { timeout: 10_000 })
    const final = escrituras.filter((x) => x.tabla === 'sesiones' && x.metodo === 'PATCH').at(-1)!.cuerpo as { metricas: Record<string, unknown> & { juego: Record<string, number | null> } }
    // Separar las manos y perderlas cierra un tramo de ≈ 50 %, que cuenta como repetición (0 o 1 según el momento exacto).
    expect(final.metricas).toMatchObject({ meta: 0, motivoFin: 'manual' })
    expect(final.metricas.juego).toMatchObject({ kgBanda: 10 })
    expect(final.metricas.juego.repeticiones).toBe(final.metricas.contador)
    expect(final.metricas.juego.estiramientoMaxPct).toBeGreaterThan(40)
    expect(final.metricas.juego.cargaMaxKg).toBeGreaterThan(4)
  })

  test('el código del juego no dice lo que la cámara no mide', () => {
    const lista = archivos(join(process.cwd(), 'src', 'games', 'banda'))
    expect(lista.length).toBeGreaterThanOrEqual(4)
    for (const f of lista) expect(readFileSync(f, 'utf8'), f).not.toMatch(PROHIBIDAS)
  })

  test('la preparación pregunta las tiras y la carga se multiplica: 4 tiras = el doble que el lazo', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/sesion/banda-elastica/preparar')
    const grupo = page.getByRole('group', { name: 'Tiras de banda entre tus manos' })
    await expect(grupo.getByRole('button', { pressed: true })).toHaveText('2 · lazo', { timeout: 10_000 })
    await grupo.getByRole('button', { name: '4 · doblado' }).click()
    await sesionFalsa(page, 'banda-elastica', 5, 0, 3)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar?fuente=sintetica&guion=quieta`)
    await esperarFase(page, 'jugando', 15_000)
    // Nivel 3 = banda verde de 6 kg en lazo; con 4 tiras, 12 kg.
    expect(await estado(page)).toMatchObject({ kgBanda: 12 })
  })

})
