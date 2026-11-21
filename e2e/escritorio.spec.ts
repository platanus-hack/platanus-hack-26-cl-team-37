// Móvil y escritorio: la app cambia de disposición al cruzar 1024 px de ancho, en vivo (sin recargar).
// Móvil: barra de navegación abajo y contenido en una columna. Escritorio: barra lateral con logo y contenido ancho.
import { expect, test, type Page } from '@playwright/test'
import { entrarComo, vigilarErrores } from './ayudas.ts'
import { ID_FALSO, sesionFalsa } from './juegos.ts'

const MOVIL = { width: 390, height: 844 }
const ESCRITORIO = { width: 1440, height: 900 }

type Ventana = { document: { documentElement: { dataset: Record<string, string | undefined> } }; getComputedStyle(e: unknown): { backgroundColor: string } }
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
    // El catálogo pasa a tarjetas individuales en dos columnas, con espacio entre ellas.
    const filas = page.locator('.catalogo-fila')
    const [a, b, c] = [(await filas.nth(0).boundingBox())!, (await filas.nth(1).boundingBox())!, (await filas.nth(2).boundingBox())!]
    expect(b.y).toBeCloseTo(a.y, 0)
    expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(12)
    expect(c.x).toBeCloseTo(a.x, 0)
    expect(c.y - (a.y + a.height)).toBeGreaterThanOrEqual(12)
    expect(await filas.first().evaluate((e) => (globalThis as unknown as Ventana).getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')

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

  test('inicio: «Empezar» va en la tarjeta Ahora (bajo la escena) en escritorio y en la barra de abajo en móvil', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    await page.setViewportSize(ESCRITORIO)
    await page.goto('/inicio')
    const tarjeta = page.locator('.ahora-tarjeta')
    await expect(tarjeta).toBeVisible()
    const empezar = page.getByRole('link', { name: 'Empezar' })
    await expect(empezar).toHaveCount(1)
    await expect(tarjeta.getByRole('link', { name: 'Empezar' })).toBeVisible()
    expect((await empezar.boundingBox())!.y).toBeGreaterThan((await tarjeta.locator('.ahora').boundingBox())!.y)
    await expect(page.locator('.barra-accion')).toHaveCount(0)
    // Columnas independientes: «Hoy» queda pegado bajo la semana (sin hueco por la altura de la tarjeta Ahora).
    const [semana, hoy] = [await caja(page, '.semana'), await caja(page, '.lista-hoy')]
    expect(hoy.y - (semana.y + semana.height)).toBeLessThan(40)

    await page.setViewportSize(MOVIL)
    await expect(page.locator('.ahora-tarjeta')).toHaveCount(0)
    await expect(page.locator('.barra-accion').getByRole('link', { name: 'Empezar' })).toBeVisible()
  })

  test('preparar un ejercicio: ficha a la izquierda y configuración a la derecha en escritorio; una columna en móvil', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    const v = vigilarErrores(page)
    await page.setViewportSize(ESCRITORIO)
    await page.goto('/sesion/caja-juguetes/preparar')
    const ficha = page.getByRole('region', { name: 'Sobre Caja de juguetes' })
    await expect(ficha).toBeVisible()
    await expect(ficha.locator('img')).toBeVisible()
    const f = (await ficha.boundingBox())!
    const mano = (await page.getByRole('group', { name: 'Mano a trabajar' }).boundingBox())!
    expect(mano.x).toBeGreaterThan(f.x + f.width)
    expect(mano.y).toBeLessThan(f.y + f.height)
    await expect(page.getByText('Ponte frente a la cámara del computador, a unos 50 cm')).toBeVisible()
    // «Comenzar» va en la ficha, bajo la imagen, y es el único (no hay barra de acción abajo).
    const comenzar = page.getByRole('button', { name: 'Comenzar' })
    await expect(comenzar).toHaveCount(1)
    await expect(ficha.getByRole('button', { name: 'Comenzar' })).toBeVisible()
    expect((await comenzar.boundingBox())!.y).toBeGreaterThan((await ficha.locator('img').boundingBox())!.y)
    await expect(page.locator('.barra-accion')).toHaveCount(0)
    // El nivel elegido se refleja en la ficha.
    await page.getByRole('button', { name: 'Nivel 3' }).click()
    await expect(ficha).toContainText('Nivel 3')

    // En móvil la ficha desaparece y vuelve el consejo del teléfono, sin recargar.
    await page.setViewportSize(MOVIL)
    await expect(ficha).toHaveCount(0)
    await expect(page.getByText('Apoya el teléfono en horizontal, a unos 50 cm')).toBeVisible()
    await expect(page.locator('.barra-accion').getByRole('button', { name: 'Comenzar' })).toBeVisible()
    v.sinErrores()
  })

  test('la calibración usa toda la pantalla en escritorio (sesión simulada, no escribe en la BD)', async ({ page, context }) => {
    await entrarComo(context, 'paciente')
    await sesionFalsa(page, 'caja-juguetes')
    await page.setViewportSize(ESCRITORIO)
    await page.goto(`/sesion/${ID_FALSO}/calibrar?fuente=sintetica`)
    await expect(page.locator('.calibrar-marco')).toBeVisible()
    const vista = await caja(page, '.calibrar')
    expect(vista.x).toBe(0)
    expect(vista.width).toBeCloseTo(ESCRITORIO.width, 0)
    expect(vista.height).toBeCloseTo(ESCRITORIO.height, 0)
    // Tres columnas: indicaciones a la izquierda, marco al centro y chequeo a la derecha.
    const [ind, marco, chequeo] = [await caja(page, '.calibrar-indicacion'), await caja(page, '.calibrar-marco'), await caja(page, '.calibrar-chequeo')]
    expect(ind.x + ind.width).toBeLessThan(marco.x)
    expect(marco.x + marco.width).toBeLessThan(chequeo.x)
    expect(chequeo.y).toBeLessThan(marco.y + marco.height / 2)

    // En móvil vertical vuelve al diseño de una columna (chequeo abajo).
    await page.setViewportSize(MOVIL)
    const abajo = await caja(page, '.calibrar-chequeo')
    expect(abajo.y + abajo.height).toBeGreaterThan(MOVIL.height * 0.8)
    expect(abajo.width).toBeGreaterThan(MOVIL.width * 0.8)
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
