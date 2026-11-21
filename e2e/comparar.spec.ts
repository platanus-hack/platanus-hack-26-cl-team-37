/// <reference lib="dom" />
// F38 · Comparar sesiones en 3D: el terapeuta lo abre desde la lista de pacientes (Carmen: Movilidad guiada y Caja de
// juguetes con ≥ 2 sesiones válidas) y el paciente desde /progreso. Solo lectura.
import { expect, test, type Page } from '@playwright/test'
import { entrarComo, vigilarErrores } from './ayudas.ts'

async function sinScrollHorizontal(page: Page) {
  const r = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }))
  expect(r.ancho, 'scroll horizontal').toBeLessThanOrEqual(r.visible)
}

async function comprobarVista(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Comparar sesiones' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Movilidad guiada/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Caja de juguetes/ })).toBeVisible()
  // KPIs con su diferencia
  await expect(page.locator('[data-testid^="kpi-"]').first()).toBeVisible()
  expect(await page.locator('[data-testid^="delta-"]').count()).toBeGreaterThan(0)
  // vista 3D: canvas con tamaño, etiquetas que no capturan el toque y aviso de qué mano se ve
  const canvas = page.locator('.cmp-estadio canvas')
  await expect(canvas).toHaveCount(1)
  const caja = (await canvas.boundingBox())!
  expect(caja.width).toBeGreaterThan(200)
  expect(caja.height).toBeGreaterThan(200)
  await expect(page.getByTestId('fuente-mano')).toContainText('mano modelo (ángulos guardados)')
  await expect(page.locator('.cmp-etq').first()).toBeVisible()
  expect(await page.locator('.cmp-etq').first().evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
  // gráficos
  await expect(page.getByTestId('grafico-evolucion')).toBeVisible()
  // nada de "fuerza" ni "presión" en la pantalla
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(/fuerza|presión/)
  await sinScrollHorizontal(page)
}

test.describe('comparar sesiones', () => {
  test('el terapeuta abre Comparar desde la lista de pacientes', async ({ page, context }) => {
    await entrarComo(context, 'terapeuta')
    const v = vigilarErrores(page)
    await page.goto('/terapeuta/pacientes')
    await page.getByRole('link', { name: 'Comparar sesiones de Carmen R.' }).click()
    await expect(page).toHaveURL(/\/terapeuta\/pacientes\/[^/]+\/comparar$/)
    await comprobarVista(page)

    // Caja: tira de agarres y repetición; Movilidad: mano que sigue la curva real
    await expect(page.getByTestId('tira-antes')).toBeVisible()
    await page.getByRole('tab', { name: /Movilidad guiada/ }).click()
    await expect(page.getByRole('tab', { name: /Movilidad guiada/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: /Curva real/ })).toBeVisible()
    await page.getByRole('button', { name: /Máx\. flexión/ }).click()
    await expect(page.getByTestId('barra-indice')).toBeVisible()
    await expect(page.getByTestId('delta-apertura')).toBeVisible()

    // elegir otras sesiones: dejar «antes» en la última pasa a ordenar el par
    const opciones = await page.getByTestId('sel-antes').locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
    expect(opciones.length).toBeGreaterThanOrEqual(2)
    await page.getByTestId('sel-antes').selectOption(opciones[opciones.length - 1]!)
    const a = await page.getByTestId('sel-antes').inputValue()
    const d = await page.getByTestId('sel-despues').inputValue()
    expect(a).not.toBe(d)
    expect(opciones.indexOf(a)).toBeLessThan(opciones.indexOf(d))
    v.sinErrores()
  })

  test('el paciente abre Comparar desde Progreso', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    const v = vigilarErrores(page)
    await page.goto('/progreso')
    await page.getByTestId('ir-comparar').click()
    await expect(page).toHaveURL(/\/progreso\/comparar$/)
    await comprobarVista(page)
    // en el teléfono se puede volver
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(/\/progreso$/)
    v.sinErrores()
  })

  test('la ruta del terapeuta no es del paciente', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    await page.goto('/terapeuta/pacientes/cualquiera/comparar')
    await expect(page).toHaveURL(/\/inicio$/)
  })
})
