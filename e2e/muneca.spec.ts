// F37 · Muñeca 3D sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética sigue el guion `muneca` (neutro 2,5 s; luego flexión 45°, extensión 38°, desviación radial 22° y
// cubital 28°, cada una sostenida 2,2 s): se carga con cargarGuion cuando el juego ya está 'jugando', así el reloj del
// guion y el del juego coinciden.
// - Sesión REAL, mano derecha, nivel 2 (40/33/13/20°, sostener 1,25 s), meta 4: neutro automático, cuatro fases, contador
//   exacto 4/4, "¡Meta cumplida!", /sensacion; máximos medidos dentro de ±8° de los ángulos del guion, R0 (r0_ij), canales
//   a 10 Hz, poses clave y eventos guardados. Con CAPTURA_MUNECA=1 guarda capturas del juego.
// - Sesión falsa, mano IZQUIERDA, nivel 1, sin meta: mismos ángulos; el giro grande avisa "puede ser el antebrazo" y no
//   cuenta; no_alcanzado tras 12 s; "Repetir neutro".
// - Ningún texto del juego (código ni pantalla) dice lo que la cámara no mide.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, crearSesion, esperarFase, limpiar, parametros, type Ventana } from './juegos.ts'

type Estado = {
  contador: number
  meta: number
  lado: string
  neutro: boolean
  progresoNeutro: number
  fase: 'flexion' | 'extension' | 'radial' | 'cubital'
  etapa: 'ir' | 'volver'
  objetivo: number
  sostenerMs: number
  sostenidoMs: number
  flexExt: number | null
  desviacion: number | null
  giro: number | null
  aviso: boolean
  aciertos: number
  noAlcanzados: number
  muestras: number
  poses: Record<string, number>
}
const SIN_FPS = '[data-testid=fps] { display: none !important }'
const PROHIBIDAS = new RegExp(`${'fuer'}za|${'pre'}si[oó]n|${'apr'}(?:e|ie)t`, 'i')
const GUION = '/src/tracking/sintetica.ts'

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const poner = (p: Page, pose: object, lado = 'derecha') => p.evaluate(([po, l]) => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose(po as object, l as string), [pose, lado] as const)
/** Carga el guion preset `muneca` en la fuente viva (se reinicia su reloj). */
const cargarGuionMuneca = (p: Page, lado: string) =>
  p.evaluate(
    async ([ruta, l]) => {
      const m = (await import(/* @vite-ignore */ ruta)) as { guionPreset(n: string, l: string): object }
      ;(globalThis as unknown as Ventana).__manoviva!.fuente!.cargarGuion(m.guionPreset('muneca', l))
    },
    [GUION, lado] as const,
  )

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]))
}

test.describe('Muñeca 3D', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('mano derecha, nivel 2, meta 4: neutro automático, cuatro fases, máximos dentro de ±8° y datos guardados', async ({ page }) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('muneca-3d', 5, 4, 2)
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&depuracion=1`)
      await expect(page.getByRole('heading', { level: 1, name: 'Muñeca 3D' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await expect(page.getByText('Movimientos')).toBeVisible()
      await expect(page.getByTestId('contador')).toHaveText('0/4')
      await expect(page.getByTestId('vivo-flexExt')).toContainText('Flexión')
      await expect(page.getByTestId('vivo-desviacion')).toContainText('cubital')
      await expect(page.getByTestId('vivo-giro')).toContainText('aprox.')
      expect(await estado(page)).toMatchObject({ meta: 4, lado: 'derecha', neutro: false, contador: 0, sostenerMs: 1250, objetivo: 40 })

      await cargarGuionMuneca(page, 'derecha')
      await expect(page.getByTestId('pista')).toContainText('Quieta')
      await expect.poll(async () => (await estado(page)).neutro, { timeout: 5_000 }).toBe(true)
      await expect(page.getByTestId('pista')).toContainText('Flexión')
      await expect(page.getByTestId('mano-derecha')).toBeVisible()
      // En el neutro los tres ángulos están cerca de 0.
      const e0 = await estado(page)
      expect(Math.abs(e0.flexExt ?? 0)).toBeLessThan(5)

      // Flexión sostenida: el contador sube y el HUD muestra el ángulo.
      await expect.poll(async () => (await estado(page)).flexExt, { timeout: 8_000 }).toBeGreaterThan(30)
      if (process.env.CAPTURA_MUNECA) await page.screenshot({ path: 'docs/capturas/muneca-3d.png', style: SIN_FPS })
      await expect.poll(async () => (await estado(page)).contador, { timeout: 8_000 }).toBe(1)
      await expect(page.getByTestId('contador')).toHaveText('1/4')
      await expect(page.locator('body')).not.toContainText(PROHIBIDAS)

      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 4/4', { timeout: 40_000 })
      if (process.env.CAPTURA_MUNECA) await page.screenshot({ path: 'docs/capturas/muneca-3d-meta.png', style: SIN_FPS })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.metricas).toMatchObject({ contador: 4, meta: 4, metaCumplida: true, motivoFin: 'meta' })
      const m = s.metricas.juego as Record<string, number | null>
      expect(m.movimientos).toBe(4)
      const cerca = (valor: number | null, esperado: number) => {
        expect(valor).not.toBeNull()
        expect(Math.abs((valor as number) - esperado), `${valor} vs ${esperado}`).toBeLessThanOrEqual(8)
      }
      cerca(m.flexionMax, 45)
      cerca(m.extensionMax, 38)
      cerca(m.radialMax, 22)
      cerca(m.cubitalMax, 28)
      expect(m.conoMax).toBeGreaterThanOrEqual(36)
      expect(m.giroPosMax).toBeLessThan(10)
      expect(m.giroNegMax).toBeLessThan(10)
      // R0: nueve números, casi la identidad de la mano sintética (palma a la cámara: x radial, y largo, z hacia la cámara).
      const R0 = [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[`r0_${i}${j}`] as number))
      for (const f of R0) for (const x of f) expect(Number.isFinite(x)).toBe(true)
      expect(Math.hypot(...R0.map((f) => f[1]))).toBeCloseTo(1, 2) // columna y unitaria
      expect(R0[0][0]).toBeGreaterThan(0.99)
      expect(R0[2][2]).toBeLessThan(-0.99) // z = palma, hacia la cámara (−z de MediaPipe)

      // Canales a 10 Hz alineados con t.
      expect(s.muestras.hz).toBe(10)
      const c = s.muestras.canales
      for (const k of ['flexExt', 'desviacion', 'giro', 'dirX', 'dirY', 'dirZ']) expect(c[k].length, k).toBe(s.muestras.t.length)
      const num = (a: (number | null)[]) => a.filter((x): x is number => x != null)
      expect(Math.max(...num(c.flexExt))).toBeGreaterThan(35)
      expect(Math.min(...num(c.flexExt))).toBeLessThan(-30)
      expect(Math.max(...num(c.desviacion))).toBeGreaterThan(18)
      expect(Math.min(...num(c.desviacion))).toBeLessThan(-22)
      const modulos = (c.dirX as (number | null)[]).flatMap((x, i) => (x == null ? [] : [Math.hypot(x, c.dirY[i], c.dirZ[i])]))
      expect(modulos.length).toBeGreaterThan(50)
      for (const mod of modulos) expect(mod).toBeGreaterThan(0.97)
      expect(Math.min(...num(c.dirY))).toBeLessThan(0.8) // los dedos se separan de la dirección neutra

      // Poses clave: el neutro y el máximo de cada movimiento, con su ángulo.
      const poses = (s.muestras.poses ?? []) as { etiqueta: string; lado: string; valor: number | null; puntos: number[][] }[]
      const por = Object.fromEntries(poses.map((p) => [p.etiqueta, p]))
      expect(Object.keys(por).sort()).toEqual(['cubital-max', 'extension-max', 'flexion-max', 'neutro', 'radial-max'])
      for (const p of poses) {
        expect(p.lado).toBe('derecha')
        expect(p.puntos).toHaveLength(21)
      }
      expect(por.neutro.valor).toBeNull()
      cerca(por['flexion-max'].valor, 45)
      cerca(por['extension-max'].valor, 38)
      cerca(por['radial-max'].valor, 22)
      cerca(por['cubital-max'].valor, 28)

      // Eventos: solo tipos existentes; objetivo → acierto por fase.
      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const juegoEvs = evs.filter((x) => !['pausa', 'reanudar', 'perdida_seguimiento'].includes(x.tipo))
      expect(juegoEvs.map((x) => `${x.tipo}:${x.datos.fase}`)).toEqual([
        'objetivo_mostrado:flexion', 'acierto:flexion',
        'objetivo_mostrado:extension', 'acierto:extension',
        'objetivo_mostrado:radial', 'acierto:radial',
        'objetivo_mostrado:cubital', 'acierto:cubital',
      ])
      expect(juegoEvs[0].datos).toMatchObject({ fase: 'flexion', objetivoGrados: 40 })
      expect(juegoEvs[1].datos.grados).toBeGreaterThanOrEqual(40)
      for (const x of juegoEvs) expect(x.mano).toBe('derecha')
      expect(JSON.stringify([s.metricas, evs])).not.toMatch(PROHIBIDAS)
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('mano izquierda: mismos ángulos; giro grande avisa y no cuenta; no_alcanzado a los 12 s; Repetir neutro', async ({ page }) => {
    test.setTimeout(120_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('muneca-3d', 5, 0, 1, 'paciente', { parametros: { ...parametros(5, 0, 1), mano: 'izquierda' } })
      await page.setViewportSize(HORIZONTAL)
      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&lado=izquierda`)
      await expect(page.getByRole('heading', { level: 1, name: 'Muñeca 3D' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      expect(await estado(page)).toMatchObject({ lado: 'izquierda', objetivo: 30, sostenerMs: 1000, meta: 0 })

      // Neutro con la mano quieta; con el giro grande (60° sobre el eje largo) avisa del antebrazo.
      await expect.poll(async () => (await estado(page)).neutro, { timeout: 6_000 }).toBe(true)
      await expect(page.getByTestId('mano-izquierda')).toBeVisible()
      await poner(page, { pronacionDeg: 60 }, 'izquierda')
      await expect.poll(async () => (await estado(page)).aviso, { timeout: 4_000 }).toBe(true)
      await expect(page.getByTestId('pista')).toContainText('Puede ser el antebrazo: mantenlo quieto')
      expect(Math.abs((await estado(page)).giro ?? 0)).toBeGreaterThan(45)
      // Con ese giro no suma sostén aunque la flexión pase del objetivo.
      await poner(page, { pronacionDeg: 60, inclinacionDeg: 40 }, 'izquierda')
      await page.waitForTimeout(1_500)
      expect((await estado(page)).aciertos).toBe(0)
      await poner(page, {}, 'izquierda')
      await expect.poll(async () => (await estado(page)).aviso, { timeout: 4_000 }).toBe(false)

      // Repetir neutro: vuelve a tomarlo.
      await page.getByRole('button', { name: 'Repetir neutro' }).click()
      await expect.poll(async () => (await estado(page)).neutro, { timeout: 1_000 }).toBe(false)
      await expect.poll(async () => (await estado(page)).neutro, { timeout: 6_000 }).toBe(true)
      await expect(page.getByTestId('pista')).toContainText('Flexión')

      // Flexión de la mano izquierda: 40° > 30° sostenidos 1 s → acierto con el mismo signo que la derecha.
      await poner(page, { inclinacionDeg: 40 }, 'izquierda')
      await expect.poll(async () => (await estado(page)).aciertos, { timeout: 5_000 }).toBe(1)
      expect((await estado(page)).flexExt).toBeGreaterThan(30)
      await poner(page, {}, 'izquierda')
      await expect.poll(async () => (await estado(page)).fase, { timeout: 5_000 }).toBe('extension')
      // Extensión pedida y no se mueve nada: a los 12 s queda como no alcanzada.
      await expect.poll(async () => (await estado(page)).noAlcanzados, { timeout: 16_000 }).toBe(1)
      await expect(page.getByTestId('pista')).toContainText('Extensión: llegaste a unos')
      await expect(page.locator('body')).not.toContainText(PROHIBIDAS)

      await page.getByRole('button', { name: 'Menú' }).click()
      await page.getByRole('button', { name: 'Terminar sesión' }).click()
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })
      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.metricas).toMatchObject({ contador: 1, meta: 0, motivoFin: 'manual' })
      const m = s.metricas.juego as Record<string, number | null>
      expect(m.movimientos).toBe(1)
      expect(m.flexionMax).toBeGreaterThan(33)
      expect(m.flexionMax).toBeLessThan(47)
      // Repetir neutro descartó las series anteriores (el giro de 60° era respecto del neutro viejo).
      expect(Math.max(m.giroPosMax ?? 99, m.giroNegMax ?? 99)).toBeLessThan(10)
      expect(s.muestras.poses.every((p: { lado: string }) => p.lado === 'izquierda')).toBe(true)
      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!.filter((x) => !['pausa', 'reanudar', 'perdida_seguimiento'].includes(x.tipo))
      // Repetir neutro vuelve a mostrar el objetivo de flexión (por eso hay dos); tras fallar la extensión llega el de radial.
      expect(evs.filter((x) => x.tipo !== 'objetivo_mostrado').map((x) => `${x.tipo}:${x.datos.fase}`)).toEqual(['acierto:flexion', 'no_alcanzado:extension'])
      expect(evs.filter((x) => x.tipo === 'objetivo_mostrado').map((x) => x.datos.fase).slice(0, 3)).toEqual(['flexion', 'flexion', 'extension'])
      expect(evs.find((x) => x.tipo === 'no_alcanzado')!.datos.maxGrados).toBeLessThan(10)
      for (const x of evs) expect(x.mano).toBe('izquierda')
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })

  test('el código del juego no dice lo que la cámara no mide', () => {
    const dir = join(process.cwd(), 'src', 'games', 'muneca')
    const lista = archivos(dir).filter((f) => !f.endsWith('.test.ts'))
    expect(lista.length).toBeGreaterThanOrEqual(3)
    for (const f of lista) expect(readFileSync(f, 'utf8'), f).not.toMatch(PROHIBIDAS)
  })
})
