// F15 · Historial, registro de sesión, exportar y auditoría.
// - Lectura de Carmen (19 sesiones cerradas del seed): lista, hoja de registro y "Verificado" en las 19. Solo lecturas.
// - "Alterado": una sesión cerrada es inmutable en la BD, así que se altera la RESPUESTA de Supabase con page.route.
// - Exportar (escribe en Auditoría): SOLO con el paciente de PRUEBA; al final limpiarPrueba(ids) borra sus sesiones y las
//   filas de auditoría de exportación (RPC limpiar_paciente_prueba, migración 20261121500001). Carmen no se ensucia.
import { readFileSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { crearSesion, limpiarPrueba } from './juegos.ts'

type Cliente = Awaited<ReturnType<typeof clienteComo>>

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const NOMBRES: Record<string, string> = { 'caja-juguetes': 'Caja de juguetes', 'movilidad-guiada': 'Movilidad guiada' }
const enSantiago = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { dia: String(Number(p.day)), mes: MESES[Number(p.month) - 1], hora: `${p.hour}:${p.minute}` }
}

async function cerradasDe(sb: Cliente) {
  const r = await sb.from('sesiones').select('id, juego, inicio, parametros, metricas, dolor_eva').eq('estado', 'cerrada').order('inicio', { ascending: false })
  expect(r.error).toBeNull()
  return r.data ?? []
}

const filasSesion = (p: Page) => p.getByTestId('fila-sesion')
const leer = async (d: Download) => readFileSync((await d.path())!)

test.describe('historial de Carmen (solo lectura)', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('lista: contador, orden, filas con fecha, ejercicio, hora, ID y etiquetas; cambios de plan con autor', async ({ page }) => {
    const sb = await clienteComo('paciente')
    const cerradas = await cerradasDe(sb)
    const v = vigilarErrores(page)
    await page.goto('/historial')
    await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible()
    await expect(page.getByText(`${cerradas.length} sesiones registradas`)).toBeVisible()
    expect(cerradas.length).toBe(19)
    await expect(filasSesion(page)).toHaveCount(cerradas.length)

    // Orden: las sesiones aparecen de la más reciente a la más antigua, igual que la BD.
    const ids = await filasSesion(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))
    expect(ids).toEqual(cerradas.map((c) => c.id))

    // Primera fila: oráculo propio desde la BD.
    const c0 = cerradas[0]
    const f0 = filasSesion(page).first()
    const t = enSantiago(c0.inicio)
    await expect(f0).toContainText(NOMBRES[c0.juego])
    await expect(f0).toContainText(`${t.hora} · ${c0.id}`)
    await expect(f0.locator('.historial-fecha')).toHaveText(`${t.dia}${t.mes}`)
    const m = c0.metricas as { agarres: number; precision: number }
    await expect(f0).toContainText(`${m.agarres}/${(c0.parametros as { metaAgarres: number }).metaAgarres}`)
    await expect(f0).toContainText(`${Math.round(m.precision * 100)}%`)
    await expect(f0).toContainText(`Dolor ${c0.dolor_eva}`)

    // Cambios de plan: quién y qué cambió, mezclados en orden cronológico.
    const planes = page.getByTestId('fila-plan')
    await expect(planes).toHaveCount(2)
    await expect(planes.filter({ hasText: 'Plan actualizado' })).toContainText('por Klgo. Diego M.')
    await expect(planes.filter({ hasText: 'Plan actualizado' })).toContainText('Nivel 1 → 2')
    await expect(planes.filter({ hasText: 'Plan creado' })).toContainText('por Klgo. Diego M.')
    const orden = await page.locator('.historial-lista > li > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(orden.indexOf('fila-plan')).toBeGreaterThan(0) // hay sesiones más recientes que el cambio de plan
    expect(orden.at(-1)).toBe('fila-plan') // el plan inicial es el registro más antiguo

    // Tocar un cambio de plan abre su detalle.
    await planes.filter({ hasText: 'Plan actualizado' }).click()
    const hoja = page.getByRole('dialog', { name: 'Plan actualizado' })
    await expect(hoja).toContainText('Caja de juguetes: Nivel 1 → 2')
    await expect(hoja).toContainText('Klgo. Diego M.')
    await hoja.getByRole('button', { name: 'Cerrar' }).click()
    await expect(hoja).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)
    v.sinErrores()
  })

  test('tocar una fila abre la hoja /historial/:id con todos los campos y "Verificado"', async ({ page }) => {
    const sb = await clienteComo('paciente')
    const cerradas = await cerradasDe(sb)
    const c = cerradas[1]
    const bd = (await sb.from('sesiones').select('*').eq('id', c.id).single()).data!
    await page.goto('/historial')
    await filasSesion(page).nth(1).click()
    await expect(page).toHaveURL(new RegExp(`/historial/${c.id}$`))
    const hoja = page.getByRole('dialog', { name: 'Registro de sesión' })
    await expect(hoja.getByRole('heading', { name: 'Registro de sesión' })).toBeVisible()
    await expect(page.getByTestId('integridad')).toHaveText('Verificado')
    await expect(page.getByTestId('reg-id')).toHaveText(c.id)
    const p = bd.parametros as { nivel: number; duracionMin: number; prescritoPor: string }
    await expect(hoja).toContainText(`Nivel ${p.nivel} · ${bd.parametros.mano === 'ambas' ? 'Ambas' : bd.parametros.mano === 'derecha' ? 'Derecha' : 'Izquierda'} · ${p.duracionMin} min`)
    await expect(hoja).toContainText(NOMBRES[c.juego])
    await expect(hoja).toContainText(p.prescritoPor)
    await expect(hoja).toContainText(`${bd.dispositivo.camara} · ${bd.dispositivo.fps} fps`)
    await expect(hoja).toContainText(`App ${bd.version_app} · ${bd.version_modelo}`)
    await expect(page.getByTestId('reg-hash')).toHaveText(`sha-256 ${bd.hash.slice(0, 4)}…${bd.hash.slice(-4)} ✓`)
    await expect(hoja.getByRole('button', { name: 'Exportar PDF' })).toBeVisible()
    await expect(hoja.getByRole('button', { name: 'CSV', exact: true })).toBeVisible()
    // Cerrar vuelve a la lista (la fila queda en la pantalla).
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/historial$/)
    await expect(hoja).toHaveCount(0)
  })

  test('las 19 sesiones de Carmen muestran Verificado (enlace directo a cada una)', async ({ page }) => {
    test.setTimeout(150_000)
    const cerradas = await cerradasDe(await clienteComo('paciente'))
    expect(cerradas).toHaveLength(19)
    const v = vigilarErrores(page)
    for (const c of cerradas) {
      await page.goto(`/historial/${c.id}`)
      await expect(page.getByTestId('integridad'), c.id).toHaveText('Verificado')
      await expect(page.getByTestId('reg-id')).toHaveText(c.id)
    }
    v.sinErrores()
  })

  test('datos alterados en la respuesta de Supabase → "Alterado"', async ({ page }) => {
    const cerradas = await cerradasDe(await clienteComo('paciente'))
    const id = cerradas[2].id
    // La BD no deja editar una sesión cerrada: se cambia lo que llega al navegador (dolor_eva) y el hash ya no calza.
    await page.route('**/rest/v1/sesiones?*', async (route) => {
      const r = await route.fetch()
      const filas = (await r.json()) as { id: string; dolor_eva: number | null }[]
      for (const f of filas) if (f.id === id) f.dolor_eva = ((f.dolor_eva ?? 0) + 3) % 11
      await route.fulfill({ response: r, json: filas })
    })
    await page.goto(`/historial/${id}`)
    await expect(page.getByTestId('integridad')).toHaveText('Alterado')
    await expect(page.getByTestId('integridad')).toHaveClass(/malo/)
    await expect(page.getByTestId('reg-hash')).toContainText('✗')
    // Las demás siguen verificadas.
    await page.goto(`/historial/${cerradas[3].id}`)
    await expect(page.getByTestId('integridad')).toHaveText('Verificado')
  })

  test('estados: vacío y sesión inexistente', async ({ page }) => {
    test.setTimeout(60_000)
    await page.route('**/rest/v1/sesiones?*', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/auditoria?*', (route) => route.fulfill({ json: [] }))
    await page.goto('/historial')
    await expect(page.getByText('Aún no hay registros')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeDisabled()
    await page.unroute('**/rest/v1/sesiones?*')
    await page.unroute('**/rest/v1/auditoria?*')

    // Con datos reales pero una sesión que no existe: la hoja avisa.
    await page.goto('/historial/S-20000101-01')
    await expect(page.getByText('No encontramos esta sesión.')).toBeVisible()

    // El error de red con Reintentar se prueba en inicio y preparar. Aquí no: sin conexión y sin copia local,
    // las listas devuelven vacío a propósito (F20, uso sin conexión), así que no hay estado de error.
  })
})

test.describe('historial visto por el terapeuta', () => {
  test('?paciente=<id> muestra el historial de Carmen; sin paciente pide elegir uno', async ({ page, context }) => {
    await entrarComo(context, 'terapeuta')
    const carmen = (await (await clienteComo('paciente')).from('pacientes').select('id').single()).data!
    await page.goto(`/historial?paciente=${carmen.id}`)
    await expect(page.getByText('19 sesiones registradas')).toBeVisible()
    await filasSesion(page).first().click()
    await expect(page).toHaveURL(new RegExp(`/historial/S-\\d{8}-\\d{2,}\\?paciente=${carmen.id}$`))
    await expect(page.getByTestId('integridad')).toHaveText('Verificado')
    await page.goto('/historial')
    await expect(page.getByText('Elige un paciente')).toBeVisible()
  })
})

test.describe('exportar (paciente de PRUEBA: escribe en Auditoría)', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

  const metricas = (agarres: number, precision: number, apertura: number) => ({
    agarres, agarresIzq: 0, agarresDer: agarres, intentos: Math.round(agarres / precision), precision, tiempoMedioAgarreS: 3.2, aperturaMaxCm: apertura,
    flexionMax: { pulgar: 40, indice: 66, medio: 70, anular: 60, menique: 50 }, flexionIndiceMax: 66, suavidad: 80, calidadRegistro: 0.9,
    duracionS: 180, fpsMedio: 30, metaCumplida: agarres >= 10, contador: agarres, meta: 10, motivoFin: 'tiempo', juego: { agarres },
  })

  test('PDF y CSV de una sesión y de un período se descargan y quedan en Auditoría', async ({ page }) => {
    test.setTimeout(120_000)
    const sb = await clienteComo('prueba')
    const ids: string[] = []
    const ahora = Date.now()
    const fila = (inicio: Date, m: object, dolor: number) => ({ estado: 'en curso', inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 180_000).toISOString(), metricas: m, dolor_eva: dolor, esfuerzo: 'Suave' })
    try {
      const v = vigilarErrores(page)
      // Dos sesiones de Movilidad (niveles 4 y 5, que no usa ninguna otra prueba), cerradas al abrir su resumen.
      ids.push(await crearSesion('movilidad-guiada', 3, 10, 4, 'prueba', fila(new Date(ahora - 3 * 24 * 3600_000), metricas(8, 0.8, 5.5), 3)))
      ids.push(await crearSesion('movilidad-guiada', 3, 10, 5, 'prueba', fila(new Date(ahora - 3600_000), metricas(10, 0.9, 6.2), 1)))
      for (const id of ids) {
        await page.goto(`/sesion/${id}/resumen`)
        await expect(page.getByTestId('dato-dolor')).toBeVisible()
      }

      await page.goto('/historial')
      await expect(page.getByText('2 sesiones registradas')).toBeVisible()
      await expect(filasSesion(page)).toHaveCount(2)

      // --- PDF de una sesión (desde la hoja)
      await filasSesion(page).first().click()
      await expect(page.getByTestId('integridad')).toHaveText('Verificado')
      const dPdf = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Exportar PDF' }).click()
      const pdf = await dPdf
      expect(pdf.suggestedFilename()).toBe(`manoviva-${ids[1]}.pdf`)
      const bytesPdf = await leer(pdf)
      expect(bytesPdf.subarray(0, 5).toString()).toBe('%PDF-')
      const txtPdf = bytesPdf.toString('latin1')
      expect(txtPdf).toContain('Mediciones estimadas con cámara; no reemplazan la evaluación clínica')
      expect(txtPdf).toContain(ids[1])
      expect(txtPdf).toContain('Paciente de prueba')
      await expect(page.getByRole('status').filter({ hasText: 'PDF listo' })).toBeVisible()

      // --- CSV de una sesión: dos archivos (sesiones y eventos)
      const bajadas: Download[] = []
      page.on('download', (d) => bajadas.push(d))
      await page.getByRole('button', { name: 'CSV', exact: true }).click()
      await expect.poll(() => bajadas.length, { timeout: 15_000 }).toBe(2)
      expect(bajadas.map((d) => d.suggestedFilename())).toEqual([`manoviva-${ids[1]}-sesiones.csv`, `manoviva-${ids[1]}-eventos.csv`])
      const csvSes = (await leer(bajadas[0])).toString('utf8')
      expect(csvSes.charCodeAt(0)).toBe(0xfeff)
      const lineas = csvSes.slice(1).trimEnd().split('\r\n')
      expect(lineas).toHaveLength(2)
      expect(lineas[0]).toMatch(/^id;fecha_hora;ejercicio;/)
      expect(lineas[1].startsWith(`${ids[1]};`)).toBe(true)
      expect(lineas[1]).toContain(';Movilidad guiada;')
      expect(lineas[1]).toContain(';verificado;')
      expect(lineas[1]).toContain(';6,2;') // apertura con coma decimal
      expect((await leer(bajadas[1])).toString('utf8').slice(1)).toMatch(/^sesion_id;seq;t_ms;tipo;mano;objeto;datos_json/)

      // --- PDF y CSV de un período (desde Exportar)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Exportar', exact: true }).click()
      const exp = page.getByRole('dialog', { name: 'Exportar historial' })
      await exp.getByRole('button', { name: 'Todo' }).click()
      await expect(exp.getByTestId('cantidad-periodo')).toHaveText('2 sesiones registradas en este período')
      const dPer = page.waitForEvent('download')
      await exp.getByTestId('exportar-periodo-pdf').click()
      const per = await dPer
      expect(per.suggestedFilename()).toMatch(/^manoviva-historial-\d{4}-\d{2}-\d{2}\.pdf$/)
      const txtPer = (await leer(per)).toString('latin1')
      expect(txtPer).toContain(ids[0])
      expect(txtPer).toContain(ids[1])
      expect(txtPer).toContain('Mediciones estimadas con cámara')
      await expect(exp).toHaveCount(0)

      bajadas.length = 0
      await page.getByRole('button', { name: 'Exportar', exact: true }).click()
      await page.getByTestId('exportar-periodo-csv').click()
      await expect.poll(() => bajadas.length, { timeout: 15_000 }).toBe(2)
      const csvPer = (await leer(bajadas[0])).toString('utf8').slice(1).trimEnd().split('\r\n')
      expect(csvPer).toHaveLength(3)

      // --- Cada exportación quedó en Auditoría (quién, cuándo, qué)
      const au = await sb.from('auditoria').select('accion, entidad, entidad_id, cuando, quien, despues').in('accion', ['exportar_pdf', 'exportar_csv']).order('id')
      expect(au.error).toBeNull()
      const mias = (au.data ?? []).filter((a) => (a.despues as { sesiones: string[] }).sesiones.some((s) => ids.includes(s)))
      expect(mias.map((a) => `${a.accion}|${a.entidad}|${a.entidad_id ?? ''}`)).toEqual([
        `exportar_pdf|sesion|${ids[1]}`,
        `exportar_csv|sesion|${ids[1]}`,
        'exportar_pdf|historial|',
        'exportar_csv|historial|',
      ])
      for (const a of mias) {
        expect(a.quien).toBeTruthy()
        expect(Date.now() - new Date(a.cuando).getTime()).toBeLessThan(5 * 60_000)
      }
      expect((mias[2].despues as { sesiones: string[] }).sesiones.sort()).toEqual([...ids].sort())
      v.sinErrores()
    } finally {
      await page.goto('about:blank').catch(() => undefined)
      limpiarPrueba(ids)
    }
    // La limpieza también borró la auditoría de esas exportaciones: Carmen y la demo quedan intactas.
    const resto = await (await clienteComo('prueba')).from('auditoria').select('despues').in('accion', ['exportar_pdf', 'exportar_csv'])
    expect((resto.data ?? []).filter((a) => (a.despues as { sesiones: string[] }).sesiones.some((s) => ids.includes(s)))).toHaveLength(0)
  })
})

test.describe('captura', () => {
  test('capturas de /historial y del registro (10a y 10b)', async ({ page, context }) => {
    test.skip(!process.env.CAPTURA_HISTORIAL, 'solo con CAPTURA_HISTORIAL=1')
    await entrarComo(context, 'paciente')
    const cerradas = await cerradasDe(await clienteComo('paciente'))
    await page.goto('/historial')
    await expect(filasSesion(page)).toHaveCount(19)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'docs/capturas/historial.png' })
    await page.goto(`/historial/${cerradas[0].id}`)
    await expect(page.getByTestId('integridad')).toHaveText('Verificado')
    await page.screenshot({ path: 'docs/capturas/registro-sesion.png' })
  })
})
