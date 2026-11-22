// F17 · Pestaña Informes (/terapeuta/informes): el terapeuta elige paciente y período y descarga PDF o CSV.
// Parte 1 (solo lectura, pacientes demo): selector, período, cantidad igual a la BD. No se exporta nada: exportar
// escribe en Auditoría y los pacientes demo no se ensucian (contratos §5). Por si acaso, la escritura queda bloqueada.
// Parte 2 (paciente de PRUEBA, con candado): scripts/prueba-plan.ts lo deja visible para el terapeuta, se le cierran dos
// sesiones, el terapeuta exporta CSV y PDF de verdad y se revisa la auditoría. Al final limpiarPrueba(ids) borra esas
// sesiones y la auditoría de sus exportaciones (RPC limpiar_paciente_prueba) y restaurarPlanPrueba lo vuelve a ocultar.
import { readFileSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { crearSesion, limpiarPrueba } from './juegos.ts'
import { prepararPlanPrueba, restaurarPlanPrueba } from '../scripts/prueba-plan.ts'
import { soltarBloqueo, tomarBloqueo } from '../scripts/bloqueo-prueba.ts'

const selector = (p: Page) => p.getByLabel('Paciente', { exact: true })
const cantidad = (p: Page) => p.getByTestId('cantidad-informe')
const leer = async (d: Download) => readFileSync((await d.path())!)

// Fechas como las ve la app (el navegador de las pruebas está en America/Santiago): día de calendario YYYY-MM-DD.
const diaSantiago = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' })
/** ¿La sesión cae en el rango? Igual que desdeRango (src/metrics/progreso.ts): desde las 00:00 de hace 6 o 27 días. */
function enRango(inicio: string, rango: '7d' | '4s'): boolean {
  const hoy = new Date(diaSantiago(new Date()) + 'T12:00:00Z')
  const primero = new Date(hoy.getTime() - (rango === '7d' ? 6 : 27) * 86_400_000).toISOString().slice(0, 10)
  return diaSantiago(new Date(inicio)) >= primero
}

async function cerradasDe(pacienteId: string) {
  const sb = await clienteComo('terapeuta')
  const r = await sb.from('sesiones').select('id, inicio').eq('paciente_id', pacienteId).eq('estado', 'cerrada')
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as { id: string; inicio: string }[]
}

test.describe.configure({ mode: 'serial' })
// Candado: la parte 2 hace visible al paciente de prueba (terapeuta.spec.ts cuenta 4 pacientes).
test.beforeAll(async () => {
  test.setTimeout(300_000)
  await tomarBloqueo()
})
test.afterAll(() => soltarBloqueo())

test.describe('informes · pacientes demo (sin exportar)', () => {
  test.beforeEach(async ({ context }) => {
    await entrarComo(context, 'terapeuta')
    await context.route(/\/rest\/v1\/auditoria/, (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, json: { message: 'bloqueado en la prueba' } }) : route.continue()))
  })

  test('selector de paciente y período; la cantidad coincide con la BD', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/terapeuta/informes')
    await expect(page.getByRole('heading', { level: 1, name: 'Informes' })).toBeVisible()
    await expect(page.getByText('Aún no se pueden exportar')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Exportar informe' })).toBeVisible()

    // Los 4 pacientes demo, en orden alfabético; por defecto el primero (Carmen R.).
    await expect(selector(page).locator('option')).toHaveText(['Carmen R.', 'Jorge P.', 'Luis A.', 'Marta S.'])
    const carmen = await selector(page).inputValue()
    await expect(page).toHaveURL(/\/terapeuta\/informes$/)
    const sesiones = await cerradasDe(carmen)
    const en4s = sesiones.filter((s) => enRango(s.inicio, '4s')).length
    const en7d = sesiones.filter((s) => enRango(s.inicio, '7d')).length
    expect(sesiones.length).toBeGreaterThan(0)
    const texto = (n: number) => (n === 0 ? /No hay sesiones cerradas/ : `${n} ${n === 1 ? 'sesión cerrada' : 'sesiones cerradas'} en este período`)

    // Período: 4 semanas por defecto; 7 días y Todo.
    await expect(page.getByRole('button', { name: '4 semanas' })).toHaveAttribute('aria-pressed', 'true')
    await expect(cantidad(page)).toHaveText(texto(en4s))
    await page.getByRole('button', { name: '7 días' }).click()
    await expect(cantidad(page)).toHaveText(texto(en7d))
    await page.getByRole('button', { name: 'Todo', exact: true }).click()
    await expect(cantidad(page)).toHaveText(texto(sesiones.length))
    await expect(page.getByTestId('informe-csv')).toBeEnabled()
    await expect(page.getByTestId('informe-pdf')).toBeEnabled()

    // Elegir desde el resumen: cambia el selector y queda en la URL.
    const resumen = page.getByRole('list', { name: 'Pacientes' }).getByTestId('fila-informe')
    await expect(resumen).toHaveCount(4)
    await resumen.filter({ hasText: 'Luis A.' }).click()
    await expect(resumen.filter({ hasText: 'Luis A.' })).toHaveAttribute('aria-pressed', 'true')
    await expect(selector(page).locator('option:checked')).toHaveText('Luis A.')
    const luis = await selector(page).inputValue()
    await expect(page).toHaveURL(new RegExp(`\\?paciente=${luis}$`))
    await expect(cantidad(page)).toHaveText(texto((await cerradasDe(luis)).length))
    await expect(resumen.filter({ hasText: 'Luis A.' })).toContainText(/\d+ sesi(ón cerrada|ones cerradas)/)

    await expect(page.locator('main')).not.toContainText(/fuerza|presi[oó]n/i)
    v.sinErrores()
  })

  test('escritorio (1440×900): exportación y resumen en dos columnas, sin desborde', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/terapeuta/informes')
    const exp = await page.locator('.informes-exportar').boundingBox()
    const fila = await page.getByTestId('fila-informe').first().boundingBox()
    expect(fila!.x).toBeGreaterThan(exp!.x + exp!.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('informes · exportar de verdad (paciente de PRUEBA)', () => {
  let pacienteId = ''
  const ids: string[] = []

  test.beforeAll(async () => {
    pacienteId = (await prepararPlanPrueba()).pacienteId
  })
  test.afterAll(async () => {
    try {
      limpiarPrueba(ids)
    } finally {
      await restaurarPlanPrueba()
    }
  })

  const metricas = (agarres: number, apertura: number) => ({
    agarres, agarresIzq: 0, agarresDer: agarres, intentos: agarres + 2, precision: agarres / (agarres + 2), tiempoMedioAgarreS: 3.1, aperturaMaxCm: apertura,
    flexionMax: { pulgar: 40, indice: 66, medio: 70, anular: 60, menique: 50 }, flexionIndiceMax: 66, suavidad: 80, calidadRegistro: 0.9,
    duracionS: 180, fpsMedio: 30, metaCumplida: true, contador: agarres, meta: 10, motivoFin: 'tiempo', juego: { agarres },
  })

  test('período vacío deshabilita; CSV y PDF se descargan y cada exportación queda en Auditoría', async ({ page, context, browser }) => {
    test.setTimeout(150_000)
    await entrarComo(context, 'terapeuta')
    const v = vigilarErrores(page)

    // Sin sesiones cerradas en el período elegido: botones deshabilitados y un mensaje claro.
    const previas = await cerradasDe(pacienteId)
    await page.goto(`/terapeuta/informes?paciente=${pacienteId}`)
    await expect(selector(page).locator('option:checked')).toHaveText('Paciente de prueba')
    await page.getByRole('button', { name: 'Todo', exact: true }).click()
    if (previas.length === 0) {
      await expect(cantidad(page)).toHaveText('No hay sesiones cerradas en este período. Elige otro período u otro paciente.')
      await expect(page.getByTestId('informe-csv')).toBeDisabled()
      await expect(page.getByTestId('informe-pdf')).toBeDisabled()
    }

    // Dos sesiones del paciente de prueba, cerradas al abrir su resumen (como en historial.spec.ts).
    const fila = (horas: number, m: object) => ({ estado: 'en curso', inicio: new Date(Date.now() - horas * 3600_000).toISOString(), fin: new Date(Date.now() - horas * 3600_000 + 180_000).toISOString(), metricas: m, dolor_eva: 2, esfuerzo: 'Suave' })
    ids.push(await crearSesion('caja-juguetes', 3, 10, 4, 'prueba', fila(30, metricas(9, 5.4))))
    ids.push(await crearSesion('caja-juguetes', 3, 10, 5, 'prueba', fila(2, metricas(11, 6.3))))
    const ctxPrueba = await browser.newContext()
    await entrarComo(ctxPrueba, 'prueba')
    const pp = await ctxPrueba.newPage()
    for (const id of ids) {
      await pp.goto(`/sesion/${id}/resumen`)
      await expect(pp.getByTestId('dato-dolor')).toBeVisible()
    }
    await ctxPrueba.close()

    await page.reload()
    await page.getByRole('button', { name: 'Todo', exact: true }).click()
    await expect(cantidad(page)).toHaveText(`${previas.length + 2} sesiones cerradas en este período`)

    // CSV: dos archivos (sesiones y eventos) con las sesiones del período.
    const bajadas: Download[] = []
    page.on('download', (d) => bajadas.push(d))
    await page.getByTestId('informe-csv').click()
    await expect.poll(() => bajadas.length, { timeout: 20_000 }).toBe(2)
    expect(bajadas.map((d) => d.suggestedFilename())).toEqual([expect.stringMatching(/^kuwu-historial-\d{4}-\d{2}-\d{2}-sesiones\.csv$/), expect.stringMatching(/-eventos\.csv$/)])
    const csv = (await leer(bajadas[0]!)).toString('utf8').slice(1).trimEnd().split('\r\n')
    expect(csv[0]).toMatch(/^id;fecha_hora;ejercicio;/)
    expect(csv).toHaveLength(previas.length + 3)
    for (const id of ids) expect(csv.some((l) => l.startsWith(`${id};`) && l.includes(';Caja de juguetes;') && l.includes(';verificado;'))).toBe(true)
    await expect(page.getByRole('status').filter({ hasText: 'CSV listo' })).toBeVisible()

    // PDF del mismo período.
    bajadas.length = 0
    await page.getByTestId('informe-pdf').click()
    await expect.poll(() => bajadas.length, { timeout: 30_000 }).toBe(1)
    const pdf = await leer(bajadas[0]!)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const txt = pdf.toString('latin1')
    expect(txt).toContain('Paciente de prueba')
    for (const id of ids) expect(txt).toContain(id)

    // Auditoría: dos filas (CSV y PDF) hechas por el terapeuta, con el período y las sesiones exportadas.
    const sb = await clienteComo('terapeuta')
    const yo = (await sb.auth.getUser()).data.user?.id
    const au = await sb.from('auditoria').select('accion, entidad, quien, paciente_id, despues').eq('paciente_id', pacienteId).in('accion', ['exportar_pdf', 'exportar_csv']).order('id')
    expect(au.error).toBeNull()
    const mias = (au.data ?? []).filter((a) => (a.despues as { sesiones: string[] }).sesiones.some((s) => ids.includes(s)))
    expect(mias.map((a) => `${a.accion}|${a.entidad}`)).toEqual(['exportar_csv|historial', 'exportar_pdf|historial'])
    for (const a of mias) {
      expect(a.quien).toBe(yo)
      const d = a.despues as { periodo: string; sesiones: string[] }
      expect(d.periodo).toMatch(/^Todo \(hasta \d{2}-\d{2}-\d{4}\)$/)
      expect(d.sesiones).toEqual(expect.arrayContaining(ids))
    }
    v.sinErrores()

    // Limpieza ahora (y no solo en afterAll) para comprobar que no queda rastro.
    limpiarPrueba(ids.splice(0))
    const resto = await sb.from('auditoria').select('id, despues').eq('paciente_id', pacienteId).in('accion', ['exportar_pdf', 'exportar_csv'])
    expect((resto.data ?? []).filter((a) => mias.some((m) => JSON.stringify(m.despues) === JSON.stringify(a.despues)))).toHaveLength(0)
  })
})
