// F14 · Progreso: valores contra la BD (oráculo independiente), rangos, calidad baja excluida, vacío y barras en %.
// Solo lectura contra los datos de Carmen: no crea ni cierra sesiones.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'

const TZ = 'America/Santiago' // igual que playwright.config.ts
const diaDe = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })
const mover = (clave: string, n: number) => {
  const d = new Date(clave + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const coma = (n: number, dec = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

interface Fila {
  juego: string
  inicio: string
  metricas: { aperturaMaxCm: number; calidadRegistro: number; tiempoMedioAgarreS: number | null; flexionMax: Record<string, number> }
}

async function sesionesBD(): Promise<Fila[]> {
  const sb = await clienteComo('paciente')
  const { data, error } = await sb.from('sesiones').select('juego, inicio, metricas').eq('estado', 'cerrada').order('inicio')
  if (error) throw new Error(error.message)
  return (data ?? []) as Fila[]
}

function enRango(f: Fila[], dias: number | null) {
  const hoy = diaDe(new Date())
  const desde = dias ? mover(hoy, -(dias - 1)) : '0000-00-00'
  return f.filter((s) => diaDe(s.inicio) >= desde && diaDe(s.inicio) <= hoy)
}
const validas = (f: Fila[]) => f.filter((s) => s.metricas.calidadRegistro >= 0.7)

const grafico = (p: Page) => p.getByRole('img', { name: /^Apertura de pinza máxima por sesión/ })

test.describe('progreso del paciente', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('4 semanas: línea, meta, variación, dedos, tiempo y sesiones coinciden con la BD', async ({ page }) => {
    const todas = await sesionesBD()
    const per = enRango(todas, 28)
    const ok = validas(per)
    const primero = ok[0]!.metricas.aperturaMaxCm
    const ultimo = ok[ok.length - 1]!.metricas.aperturaMaxCm
    const v = vigilarErrores(page)
    await page.goto('/progreso')
    await expect(page.getByRole('heading', { level: 1, name: 'Progreso' })).toBeVisible()
    await expect(page.getByRole('button', { name: '4 semanas' })).toHaveAttribute('aria-pressed', 'true')

    // Con carmen.demo la apertura sube de ~4,2 a ~6,1 cm.
    expect(primero).toBeGreaterThan(4.0)
    expect(primero).toBeLessThan(4.45)
    expect(ultimo).toBeGreaterThan(5.8)
    expect(ultimo).toBeLessThan(6.4)
    await expect(grafico(page)).toHaveAttribute('data-puntos', String(ok.length))
    await expect(grafico(page)).toHaveAttribute('aria-label', new RegExp(`de ${coma(primero)} cm el .* a ${coma(ultimo)} cm el .*; meta 7,0 cm`))
    await expect(page.getByTestId('apertura-valor')).toContainText(`${coma(ultimo)} cm`)
    await expect(page.getByTestId('apertura-variacion')).toContainText(`${Math.round(((ultimo - primero) / primero) * 100)}%`)
    await expect(page.getByTestId('apertura-variacion')).toContainText('▲')
    await expect(page.getByTestId('apertura-meta')).toHaveText('Meta 7,0 cm')
    await expect(page.locator('.progreso-grafico svg .recharts-reference-line line')).toHaveAttribute('stroke-dasharray', /\d/)

    // Barras por dedo: sin meta de rango en el plan, grados (máximo del período).
    for (const dedo of ['pulgar', 'indice', 'medio', 'anular', 'menique']) {
      const max = Math.max(...ok.map((s) => s.metricas.flexionMax[dedo]!))
      await expect(page.getByTestId(`dedo-${dedo}`)).toContainText(`${max}°`)
    }
    await expect(page.locator('.progreso-unidad')).toHaveText('grados')

    // Tiempo por agarre: primera vs última de Caja de juguetes.
    const caja = ok.filter((s) => s.juego === 'caja-juguetes' && s.metricas.tiempoMedioAgarreS != null)
    await expect(page.getByTestId('tiempo')).toContainText(`${coma(caja[0]!.metricas.tiempoMedioAgarreS!)}`)
    await expect(page.getByTestId('tiempo')).toContainText(`${coma(caja[caja.length - 1]!.metricas.tiempoMedioAgarreS!)} s`)

    // Sesiones hechas (todas las cerradas del período) de las planificadas.
    await expect(page.getByTestId('sesiones')).toHaveText(new RegExp(`^${per.length} de \\d+$`))

    // Calidad baja: excluida del gráfico y anotada al pie.
    const excluidas = per.length - ok.length
    expect(excluidas).toBeGreaterThanOrEqual(1) // el seed deja una sesión con 62 %
    await expect(page.getByTestId('nota-calidad')).toContainText(excluidas === 1 ? 'Se excluyó 1 sesión' : `Se excluyeron ${excluidas} sesiones`)
    await expect(page.getByTestId('nota-calidad')).toContainText('menos de 70 %')
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('el rango cambia los datos y queda en la URL', async ({ page }) => {
    const todas = await sesionesBD()
    await page.goto('/progreso')
    await page.getByRole('button', { name: '7 días' }).click()
    await expect(page).toHaveURL(/rango=7d/)
    const sem = validas(enRango(todas, 7))
    await expect(page.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true')
    await expect(grafico(page)).toHaveAttribute('data-puntos', String(sem.length))
    await expect(page.getByTestId('sesiones')).toHaveText(new RegExp(`^${enRango(todas, 7).length} de \\d+$`))

    await page.getByRole('button', { name: 'Todo' }).click()
    await expect(page).toHaveURL(/rango=todo/)
    await expect(grafico(page)).toHaveAttribute('data-puntos', String(validas(todas).length))
    await page.reload()
    await expect(page.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('con meta de rango por dedo en el plan, las barras son % de la meta', async ({ page }) => {
    const todas = await sesionesBD()
    const ok = validas(enRango(todas, 28))
    const meta = { pulgar: 80, indice: 90, medio: 90, anular: 90, menique: 90 }
    await page.route('**/rest/v1/planes?*', async (route) => {
      const r = await route.fetch()
      const cuerpo = await r.json()
      const parchar = (f: { items?: object[] }) => ({ ...f, items: (f.items ?? []).map((it) => ({ ...it, metaRangoGrados: meta })) })
      await route.fulfill({ response: r, json: Array.isArray(cuerpo) ? cuerpo.map(parchar) : parchar(cuerpo) })
    })
    await page.goto('/progreso')
    await expect(page.locator('.progreso-unidad')).toHaveText('% de la meta')
    for (const [dedo, m] of Object.entries(meta)) {
      const max = Math.max(...ok.map((s) => s.metricas.flexionMax[dedo]!))
      await expect(page.getByTestId(`dedo-${dedo}`)).toContainText(String(Math.round((max / m) * 100)))
    }
    // Barra al ancho proporcional a la meta (tope 100 %).
    const ancho = await page.locator('[data-dedo="pulgar"] .progreso-relleno').evaluate((e) => (e as unknown as { style: { width: string } }).style.width)
    const maxPulgar = Math.max(...ok.map((s) => s.metricas.flexionMax.pulgar!))
    expect(parseFloat(ancho)).toBeCloseTo(Math.min(100, (maxPulgar / meta.pulgar) * 100), 0)
  })

  test('estado vacío con menos de 2 sesiones', async ({ page }) => {
    await page.route('**/rest/v1/sesiones?*', (route) => route.fulfill({ json: [] }))
    await page.goto('/progreso')
    await expect(page.getByRole('heading', { name: 'Aún no hay suficientes sesiones' })).toBeVisible()
    await expect(page.getByRole('button', { name: '7 días' })).toBeVisible() // el rango sigue disponible
    await expect(grafico(page)).toHaveCount(0)
  })

  test('si todas las sesiones tienen registro de baja calidad: vacío con la nota', async ({ page }) => {
    const todas = await sesionesBD()
    const malas = enRango(todas, 28)
      .slice(0, 3)
      .map((s, i) => ({ id: `X-${i}`, paciente_id: 'p', estado: 'cerrada', juego: s.juego, inicio: s.inicio, parametros: {}, metricas: { ...s.metricas, calidadRegistro: 0.5 } }))
    await page.route('**/rest/v1/sesiones?*', (route) => route.fulfill({ json: malas }))
    await page.goto('/progreso')
    await expect(page.getByRole('heading', { name: 'Aún no hay suficientes sesiones' })).toBeVisible()
    await expect(page.getByTestId('nota-calidad')).toContainText('Se excluyeron 3 sesiones')
    await expect(grafico(page)).toHaveCount(0)
  })

  test('error de carga: aviso con reintento', async ({ page }) => {
    await page.route('**/rest/v1/sesiones?*', (route) => route.fulfill({ status: 500, json: { message: 'falla' } }))
    await page.goto('/progreso')
    await expect(page.getByRole('button', { name: /Reintentar/i })).toBeVisible()
  })

  test('sin palabras prohibidas en la pantalla', async ({ page }) => {
    await page.goto('/progreso')
    await expect(grafico(page)).toBeVisible()
    const texto = (await page.locator('main').innerText()).toLowerCase()
    expect(texto).not.toMatch(/fuerza|presión|presion/)
  })
})
