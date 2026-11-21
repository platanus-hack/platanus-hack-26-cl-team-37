// F13 · Flujo completo del paciente y resumen con cierre por hash.
// Usa el PACIENTE DE PRUEBA (prueba.demo@example.com): cerrar una sesión la vuelve inmutable, así que estas pruebas no
// tocan a Carmen; al final borran SOLO sus sesiones con limpiarPrueba(ids) (RPC limpiar_paciente_prueba, service_role).
// 1. UI real: preparar (Caja, nivel 1) → calibrar → jugar (sintética) → Terminar → sensación (EVA 2) → resumen.
//    La sesión queda 'cerrada' con un hash que verificarSesion (src/domain/integridad.ts) da por 'verificado',
//    inmutable; sin sesión anterior de ese juego y nivel no hay diferencias.
// 2. Diferencias: A (ayer) y B (hoy), Caja nivel 2 con métricas conocidas → B muestra ▲/▼ contra A (oráculo propio).
//    Con CAPTURA_RESUMEN=1 guarda docs/capturas/resumen.png (como la imagen 08).
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, crearSesion, esperarFase, limpiarPrueba } from './juegos.ts'

type Cliente = Awaited<ReturnType<typeof clienteComo>>

/**
 * Lee la sesión y sus eventos de la BD (RLS del paciente) y los verifica con verificarSesion de la app
 * (src/domain/integridad.ts, cargado del servidor dev dentro de la página, igual que hace verify:db en Node).
 */
async function verificarEnBd(page: Page, sb: Cliente, id: string) {
  const f = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
  const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id)).data ?? []
  const s = {
    id: f.id, pacienteId: f.paciente_id, planVersion: f.plan_version, juego: f.juego, parametros: f.parametros, inicio: f.inicio, fin: f.fin,
    estado: f.estado, calibracion: f.calibracion, metricas: f.metricas, muestras: f.muestras, dolorEVA: f.dolor_eva, esfuerzo: f.esfuerzo,
    nota: f.nota, dispositivo: f.dispositivo, versionApp: f.version_app, versionModelo: f.version_modelo, hash: f.hash,
  }
  const e = evs.map((x) => ({ sesionId: x.sesion_id, seq: x.seq, t: x.t, tipo: x.tipo, mano: x.mano, objeto: x.objeto, datos: x.datos }))
  const verificacion = await page.evaluate(async ({ s, e }) => {
    const ruta = '/src/domain/integridad.ts'
    const mod = await import(/* @vite-ignore */ ruta)
    return (await mod.verificarSesion(s, e)) as string
  }, { s, e })
  return { fila: f, eventos: evs.length, verificacion }
}

/** Restos de una corrida anterior que falló (mismo juego y nivel): se borran para que "sin sesión anterior" sea cierto. */
async function limpiarRestos(sb: Cliente, juego: string, nivel: number) {
  const r = await sb.from('sesiones').select('id').eq('juego', juego).eq('parametros->>nivel', String(nivel))
  limpiarPrueba((r.data ?? []).map((x) => x.id as string))
}

const NOMBRES_CAJA = ['Precisión', 'Tiempo por agarre', 'Apertura de pinza máx.', 'Flexión del índice', 'Suavidad del movimiento', 'Dolor reportado']
const datos = (p: Page) => p.locator('.resumen-dato')

test.describe('flujo del paciente y resumen', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

  test('preparar → calibrar → jugar → sensación → resumen deja la sesión cerrada con hash verificable', async ({ page }) => {
    test.setTimeout(150_000)
    const sb = await clienteComo('prueba')
    await limpiarRestos(sb, 'caja-juguetes', 1)
    let id = ''
    try {
      const v = vigilarErrores(page)
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await page.getByRole('group', { name: 'Dificultad' }).getByRole('button', { name: 'Nivel 1' }).click()
      await page.getByRole('button', { name: 'Comenzar' }).click()
      await expect(page).toHaveURL(/\/sesion\/S-\d{8}-\d{2,}\/calibrar\?fuente=sintetica$/)
      id = new URL(page.url()).pathname.split('/')[2]

      // Calibración sintética completa sola y pasa a /jugar.
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/jugar\\?fuente=sintetica$`), { timeout: 40_000 })
      await page.setViewportSize(HORIZONTAL)
      await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible({ timeout: 15_000 })
      await esperarFase(page, 'jugando', 15_000)
      await page.waitForTimeout(3_000)
      await page.getByRole('button', { name: 'Menú' }).click()
      await page.getByRole('button', { name: 'Terminar sesión' }).click()

      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica$`), { timeout: 15_000 })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('slider', { name: /Dolor durante la sesión/ }).fill('2')
      await page.getByRole('button', { name: 'Suave', exact: true }).click()
      await page.getByRole('button', { name: 'Guardar y ver resumen' }).click()

      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/resumen\\?fuente=sintetica$`), { timeout: 10_000 })
      await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()
      await expect(page.getByText(/^Caja de juguetes · \d+:\d\d min · Nivel 1$/)).toBeVisible()
      await expect(page.getByTestId('meta')).toHaveText(/^Meta (cumplida|no alcanzada)$/)
      await expect(page.getByTestId('anillo')).toContainText('/12 agarres')
      await expect(datos(page).locator('.resumen-dato-nombre')).toHaveText(NOMBRES_CAJA)
      await expect(page.getByTestId('dato-dolor')).toContainText('2/10')
      await expect(page.getByTestId('dato-dolor')).toContainText('Leve')
      // Sin sesión anterior de Caja nivel 1: ninguna diferencia.
      await expect(page.getByTestId('cambio')).toHaveCount(0)
      await expect(page.getByTestId('comparacion')).toContainText('Primera sesión de este juego en este nivel')
      await expect(page.getByRole('link', { name: 'Ver mi progreso' })).toHaveAttribute('href', '/progreso')
      await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)

      // Cerrada con hash verificable sobre lo que quedó en la BD, e inmutable.
      const r = await verificarEnBd(page, sb, id)
      expect(r.fila.estado).toBe('cerrada')
      expect(r.fila.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(r.fila.dolor_eva).toBe(2)
      expect(r.fila.esfuerzo).toBe('Suave')
      expect(r.fila.metricas).toMatchObject({ motivoFin: 'manual', meta: 12 })
      expect(r.eventos).toBeGreaterThan(0) // al menos pausa/reanudar del Menú
      expect(r.verificacion).toBe('verificado')
      const upd = await sb.from('sesiones').update({ dolor_eva: 9 }).eq('id', id).select()
      expect(upd.error?.message).toMatch(/inmutable/)
      const ev = await sb.from('eventos_sesion').insert({ sesion_id: id, seq: 9999, t: 1, tipo: 'pausa' })
      expect(ev.error).toBeTruthy()

      // Volver a entrar al resumen no la cierra de nuevo ni cambia el hash.
      await page.reload()
      await expect(page.getByTestId('dato-dolor')).toContainText('2/10')
      expect((await sb.from('sesiones').select('hash').eq('id', id).single()).data!.hash).toBe(r.fila.hash)
      // Sensación de una sesión cerrada ya no deja editar.
      await page.goto(`/sesion/${id}/sensacion`)
      await expect(page.getByText('Esta sesión ya está cerrada')).toBeVisible()
      v.sinErrores()
    } finally {
      await page.goto('about:blank').catch(() => undefined)
      limpiarPrueba([id])
    }
  })

  test('diferencias contra la sesión anterior del mismo juego y nivel (y la primera sin diferencias)', async ({ page }) => {
    test.setTimeout(60_000)
    const sb = await clienteComo('prueba')
    await limpiarRestos(sb, 'caja-juguetes', 2)
    const ids: string[] = []
    const ahora = Date.now()
    const inicioA = new Date(ahora - 24 * 3600_000)
    const metricas = (j: { precision: number; tiempoMedioAgarre: number; aperturaMax: number; flexionIndiceMax: number; suavidad: number }, izq: number, der: number, intentos: number) => ({
      agarres: izq + der, agarresIzq: izq, agarresDer: der, intentos, precision: (izq + der) / intentos, tiempoMedioAgarreS: j.tiempoMedioAgarre,
      aperturaMaxCm: j.aperturaMax, flexionMax: { pulgar: 40, indice: j.flexionIndiceMax, medio: 70, anular: 60, menique: 50 }, flexionIndiceMax: j.flexionIndiceMax,
      suavidad: j.suavidad, calidadRegistro: 0.95, duracionS: 360, fpsMedio: 30, metaCumplida: izq + der >= 12, contador: izq + der, meta: 12, motivoFin: 'tiempo',
      juego: { agarres: izq + der, intentos, ...j },
    })
    const fila = (inicio: Date, m: object, dolor: number) => ({
      estado: 'en curso', inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 360_000).toISOString(), metricas: m, dolor_eva: dolor, esfuerzo: 'Moderado',
    })
    try {
      const v = vigilarErrores(page)
      // A: la primera de Caja nivel 2 → sin diferencias.
      ids.push(await crearSesion('caja-juguetes', 6, 12, 2, 'prueba', fila(inicioA, metricas({ precision: 88, tiempoMedioAgarre: 4.4, aperturaMax: 5.7, flexionIndiceMax: 65, suavidad: 86 }, 4, 6, 11), 3)))
      await page.goto(`/sesion/${ids[0]}/resumen`)
      await expect(page.getByTestId('dato-dolor')).toContainText('3/10')
      await expect(page.getByTestId('cambio')).toHaveCount(0)
      await expect(page.getByTestId('comparacion')).toContainText('Primera sesión')
      await expect(page.getByTestId('meta')).toHaveText('Meta no alcanzada')

      // B: hoy, mismo juego y nivel → compara contra A.
      ids.push(await crearSesion('caja-juguetes', 6, 12, 2, 'prueba', fila(new Date(ahora - 10 * 60_000), metricas({ precision: 92, tiempoMedioAgarre: 3.8, aperturaMax: 6.1, flexionIndiceMax: 68, suavidad: 86 }, 5, 7, 13), 2)))
      await page.goto(`/sesion/${ids[1]}/resumen`)
      await expect(page.getByText('Caja de juguetes · 6:00 min · Nivel 2')).toBeVisible()
      await expect(page.getByTestId('contador')).toHaveText('12')
      await expect(page.getByTestId('anillo')).toContainText('/12 agarres')
      await expect(page.getByTestId('meta')).toHaveText('Meta cumplida')
      await expect(page.getByTestId('mano-izq')).toContainText('5')
      await expect(page.getByTestId('mano-der')).toContainText('7')
      const dato = (id: string) => page.getByTestId(`dato-${id}`)
      await expect(dato('precision')).toContainText('92%')
      await expect(dato('precision').getByTestId('cambio')).toHaveText(/▲.*4 pts$/)
      await expect(dato('precision').getByTestId('cambio')).toHaveClass(/mejor/)
      await expect(dato('tiempoMedioAgarre')).toContainText('3,8 s')
      await expect(dato('tiempoMedioAgarre').getByTestId('cambio')).toHaveText(/▼.*0,6 s$/)
      await expect(dato('tiempoMedioAgarre').getByTestId('cambio')).toHaveClass(/mejor/)
      await expect(dato('aperturaMax')).toContainText('6,1 cm aprox.')
      await expect(dato('aperturaMax').getByTestId('cambio')).toHaveText(/▲.*0,4 cm$/)
      await expect(dato('flexionIndiceMax')).toContainText('68°')
      await expect(dato('flexionIndiceMax').getByTestId('cambio')).toHaveText(/▲.*3°$/)
      await expect(dato('suavidad')).toContainText('86%')
      await expect(dato('suavidad').getByTestId('cambio')).toHaveText('= igual')
      await expect(page.getByTestId('dato-dolor')).toContainText('2/10')
      await expect(page.getByTestId('dato-dolor')).toContainText('Leve')
      const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', day: 'numeric', month: 'numeric' }).formatToParts(inicioA)
      const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
      const diaA = `${partes.find((p) => p.type === 'day')!.value} ${MESES[Number(partes.find((p) => p.type === 'month')!.value) - 1]}`
      await expect(page.getByTestId('comparacion')).toHaveText(`Comparado con tu sesión del ${diaA}`)
      await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)
      if (process.env.CAPTURA_RESUMEN) {
        await page.waitForLoadState('networkidle')
        await page.screenshot({ path: 'docs/capturas/resumen.png' })
      }

      for (const id of ids) {
        const r = await verificarEnBd(page, sb, id)
        expect(r.fila.estado).toBe('cerrada')
        expect(r.verificacion).toBe('verificado')
      }
      v.sinErrores()
    } finally {
      await page.goto('about:blank').catch(() => undefined)
      limpiarPrueba(ids)
    }
  })
})
