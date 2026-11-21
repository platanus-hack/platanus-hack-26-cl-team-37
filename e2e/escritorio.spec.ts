// Móvil y escritorio: la app cambia de disposición al cruzar 1024 px de ancho, en vivo (sin recargar).
// Móvil: barra de navegación abajo y contenido en una columna. Escritorio: barra lateral con logo y contenido ancho.
import { expect, test, type Page } from '@playwright/test'
import { entrarComo, vigilarErrores } from './ayudas.ts'

const MOVIL = { width: 390, height: 844 }
const ESCRITORIO = { width: 1440, height: 900 }

type Ventana = { document: { documentElement: { dataset: Record<string, string | undefined> } }; getComputedStyle(e: unknown): { position: string } }
const vista = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).document.documentElement.dataset.vista)
const caja = async (p: Page, selector: string) => (await p.locator(selector).first().boundingBox())!

test.describe('móvil y escritorio', () => {
  test('el paciente pasa de barra inferior a barra lateral y vuelve al cambiar el ancho', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    const v = vigilarErrores(page)
    await page.setViewportSize(MOVIL)
    await page.goto('/ejercicios')
    await expect(page.getByRole('heading', { level: 1, name: 'Ejercicios' })).toBeVisible()

    // Móvil: barra abajo a todo el ancho, sin logo en la barra.
    await expect.poll(() => vista(page)).toBe('movil')
    let barra = await caja(page, '.barra-inferior')
    expect(barra.y + barra.height).toBeCloseTo(MOVIL.height, 0)
    expect(barra.width).toBeCloseTo(MOVIL.width, 0)
    await expect(page.locator('.barra-logo')).toHaveCount(0)

    // Escritorio: barra lateral a la izquierda, de alto completo y con el logo; el contenido no queda debajo.
    await page.setViewportSize(ESCRITORIO)
    await expect.poll(() => vista(page)).toBe('escritorio')
    await expect(page.locator('.barra-logo img')).toBeVisible()
    barra = await caja(page, '.barra-inferior')
    expect(barra.x).toBe(0)
    expect(barra.height).toBeCloseTo(ESCRITORIO.height, 0)
    expect(barra.width).toBeLessThan(300)
    const titulo = await caja(page, 'h1')
    expect(titulo.x).toBeGreaterThan(barra.width)
    // El catálogo pasa a dos columnas.
    const filas = page.locator('.catalogo-fila')
    const [a, b] = [(await filas.nth(0).boundingBox())!, (await filas.nth(1).boundingBox())!]
    expect(b.y).toBeCloseTo(a.y, 0)
    expect(b.x).toBeGreaterThan(a.x + a.width)

    // La navegación sigue funcionando desde la barra lateral.
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Progreso' }).click()
    await expect(page).toHaveURL(/\/progreso$/)

    // De vuelta a móvil, sin recargar.
    await page.setViewportSize(MOVIL)
    await expect.poll(() => vista(page)).toBe('movil')
    await expect(page.locator('.barra-logo')).toHaveCount(0)
    barra = await caja(page, '.barra-inferior')
    expect(barra.y + barra.height).toBeCloseTo(MOVIL.height, 0)
    v.sinErrores()
  })

  test('en escritorio el botón principal de inicio no flota sobre el contenido', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    await page.setViewportSize(ESCRITORIO)
    await page.goto('/inicio')
    const boton = page.locator('.barra-accion')
    await expect(boton).toBeVisible()
    expect(await boton.evaluate((e) => (globalThis as unknown as Ventana).getComputedStyle(e).position)).toBe('sticky')
    // Queda dentro de la columna de contenido, a la derecha de la barra lateral.
    const barra = await caja(page, '.barra-inferior')
    expect((await boton.boundingBox())!.x).toBeGreaterThan(barra.width)
  })

  test('el acceso en escritorio es una columna centrada', async ({ page }) => {
    await page.setViewportSize(ESCRITORIO)
    await page.goto('/acceso')
    await expect.poll(() => vista(page)).toBe('escritorio')
    const app = await caja(page, '.app')
    expect(app.width).toBeLessThanOrEqual(640)
    expect(app.x + app.width / 2).toBeCloseTo(ESCRITORIO.width / 2, 0)
  })
})
