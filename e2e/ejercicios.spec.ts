// F05 · Catálogo de ejercicios: filtros, "Asignado" según el plan vigente, nivel y "Próximamente" que no navega.
// Sesión inyectada (entrarComo) y cliente con la misma sesión para leer la BD: sin ingresos extra.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'

// Oráculo independiente del registro de la app (spec §8 + Prompt 3).
const TODOS = ['caja-juguetes', 'movilidad-guiada', 'torre-cubos', 'pinza-fina', 'atrapa-burbujas', 'exprime-naranja', 'memoria-cartas', 'piano-dedos']
const DISPONIBLES = ['caja-juguetes', 'movilidad-guiada', 'pinza-fina', 'atrapa-burbujas', 'piano-dedos', 'memoria-cartas']
const POR_FILTRO: Record<string, string[]> = {
  Pinza: ['caja-juguetes', 'torre-cubos', 'pinza-fina'],
  Agarre: ['caja-juguetes', 'movilidad-guiada', 'torre-cubos', 'exprime-naranja'],
  Alcance: ['caja-juguetes', 'atrapa-burbujas'],
}

interface Item {
  juego: string
  nivel: number
}

async function planBD() {
  const sb = await clienteComo('paciente')
  const { data: pac, error: e1 } = await sb.from('pacientes').select('id').single()
  if (e1 || !pac) throw new Error('sin paciente: ' + e1?.message)
  const { data: plan, error: e2 } = await sb.from('planes').select('version, items').eq('paciente_id', pac.id).order('version', { ascending: false }).limit(1).single()
  if (e2 || !plan) throw new Error('sin plan: ' + e2?.message)
  return plan as { version: number; items: Item[] }
}

const tarjetas = (p: Page) => p.getByRole('list', { name: 'Catálogo de ejercicios' }).locator('[data-juego]')
const tarjeta = (p: Page, id: string) => p.locator(`[data-juego="${id}"]`)
const ids = (p: Page) => tarjetas(p).evaluateAll((els) => els.map((e) => e.getAttribute('data-juego')))

test.describe('catálogo de ejercicios', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('Todos: registro completo, Asignado y nivel según el plan vigente de la BD', async ({ page }) => {
    const plan = await planBD()
    const v = vigilarErrores(page)
    await page.goto('/ejercicios')
    await expect(page.getByRole('heading', { level: 1, name: 'Ejercicios' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    await expect(tarjetas(page)).toHaveCount(TODOS.length)
    expect(await ids(page)).toEqual(TODOS)

    const asignados = new Set(plan.items.map((it) => it.juego))
    for (const id of TODOS) {
      const t = tarjeta(page, id)
      if (asignados.has(id)) {
        await expect(t.getByText('Asignado', { exact: true })).toBeVisible()
        const nivel = Math.max(...plan.items.filter((it) => it.juego === id).map((it) => it.nivel))
        await expect(t.getByTestId('nivel')).toHaveText(`Nivel ${nivel}`)
      } else {
        await expect(t.getByText('Asignado', { exact: true })).toHaveCount(0)
      }
      await expect(t.getByText('Próximamente', { exact: true })).toHaveCount(DISPONIBLES.includes(id) ? 0 : 1)
    }
    await expect(tarjeta(page, 'caja-juguetes')).toContainText('Pinza · Agarre · Traslado')
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('los filtros dejan solo los juegos de ese gesto', async ({ page }) => {
    await page.goto('/ejercicios')
    await expect(tarjetas(page)).toHaveCount(TODOS.length)
    for (const [filtro, esperado] of Object.entries(POR_FILTRO)) {
      await page.getByRole('button', { name: filtro, exact: true }).click()
      await expect(page.getByRole('button', { name: filtro, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false')
      await expect(tarjetas(page)).toHaveCount(esperado.length)
      expect(await ids(page)).toEqual(esperado)
      await expect(page).toHaveURL(new RegExp(`gesto=${filtro}$`))
    }
    await page.getByRole('button', { name: 'Todos' }).click()
    await expect(tarjetas(page)).toHaveCount(TODOS.length)
    // El filtro se recuerda en la URL al volver.
    await page.goto('/ejercicios?gesto=Alcance')
    await expect(tarjetas(page)).toHaveCount(POR_FILTRO.Alcance.length)
  })

  test('Asignado sigue al plan vigente (plan simulado)', async ({ page }) => {
    await page.route('**/rest/v1/planes?*', async (route) => {
      const r = await route.fetch()
      const cuerpo = await r.json()
      const cambiar = (f: Record<string, unknown>) => ({
        ...f,
        items: [{ juego: 'pinza-fina', nivel: 3, duracionMin: 5, mano: 'ambas', metaAgarres: 10, metaPinzaCm: 3 }],
      })
      await route.fulfill({ response: r, json: Array.isArray(cuerpo) ? cuerpo.map(cambiar) : cambiar(cuerpo) })
    })
    await page.goto('/ejercicios')
    await expect(tarjeta(page, 'pinza-fina').getByText('Asignado', { exact: true })).toBeVisible()
    await expect(tarjeta(page, 'pinza-fina').getByTestId('nivel')).toHaveText('Nivel 3')
    await expect(page.getByText('Asignado', { exact: true })).toHaveCount(1)
    await expect(tarjeta(page, 'caja-juguetes').getByText('Asignado', { exact: true })).toHaveCount(0)
  })

  test("'Próximamente' no navega; un juego disponible lleva a /sesion/:juego/preparar", async ({ page }) => {
    await page.goto('/ejercicios')
    const proximo = TODOS.find((x) => !DISPONIBLES.includes(x))!
    const torre = tarjeta(page, proximo)
    await expect(torre).toHaveAttribute('aria-disabled', 'true')
    await expect(torre.locator('a')).toHaveCount(0)
    await torre.click()
    await page.waitForTimeout(300)
    await expect(page).toHaveURL(/\/ejercicios$/)
    for (const id of TODOS.filter((x) => !DISPONIBLES.includes(x))) {
      expect(await tarjeta(page, id).evaluate((e) => e.tagName)).not.toBe('A')
    }
    await tarjeta(page, 'caja-juguetes').click()
    await expect(page).toHaveURL(/\/sesion\/caja-juguetes\/preparar$/)
  })

  test('error al cargar muestra Reintentar y los filtros siguen visibles', async ({ page }) => {
    await page.route('**/rest/v1/planes?*', (route) => route.fulfill({ status: 500, json: { message: 'falla simulada' } }))
    await page.goto('/ejercicios')
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pinza', exact: true })).toBeVisible()
  })
})
