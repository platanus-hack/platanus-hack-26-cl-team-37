// F04 · Inicio del paciente: datos coherentes con la BD, "Siguiente", mensaje del terapeuta una vez y estados.
// Usa la sesión inyectada (entrarComo) y un cliente con la misma sesión para leer la BD: no hace ingresos extra.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'

const TZ = 'America/Santiago' // igual que playwright.config.ts
const diaDe = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }) // AAAA-MM-DD
const moverDia = (clave: string, n: number) => {
  const d = new Date(clave + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface Item {
  juego: string
  duracionMin: number
}

async function datosBD() {
  const sb = await clienteComo('paciente')
  const { data: pac, error: e1 } = await sb.from('pacientes').select('id, ultimo_mensaje_visto').single()
  if (e1 || !pac) throw new Error('sin paciente: ' + e1?.message)
  const { data: plan, error: e2 } = await sb
    .from('planes')
    .select('version, sesiones_por_semana, mensaje, items')
    .eq('paciente_id', pac.id)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  if (e2 || !plan) throw new Error('sin plan: ' + e2?.message)
  const { data: sesiones, error: e3 } = await sb.from('sesiones').select('juego, inicio').eq('paciente_id', pac.id).eq('estado', 'cerrada')
  if (e3) throw new Error(e3.message)
  return { pac, plan: plan as { version: number; sesiones_por_semana: number; mensaje: string | null; items: Item[] }, sesiones: (sesiones ?? []).filter((s) => s.inicio) }
}

/** Lo que la pantalla debería mostrar, calculado aparte de la app (oráculo independiente). */
function esperado(d: Awaited<ReturnType<typeof datosBD>>) {
  const hoy = diaDe(new Date())
  const items = d.plan.items
  const porDia = new Map<string, number>()
  const hoyPorJuego = new Map<string, number>()
  for (const s of d.sesiones) {
    const k = diaDe(s.inicio)
    porDia.set(k, (porDia.get(k) ?? 0) + 1)
    if (k === hoy) hoyPorJuego.set(s.juego, (hoyPorJuego.get(s.juego) ?? 0) + 1)
  }
  let siguiente = false
  const estados = items.map((it) => {
    const n = hoyPorJuego.get(it.juego) ?? 0
    if (n > 0) {
      hoyPorJuego.set(it.juego, n - 1)
      return 'hecho'
    }
    if (!siguiente) {
      siguiente = true
      return 'siguiente'
    }
    return 'pendiente'
  })
  let k = porDia.has(hoy) ? hoy : moverDia(hoy, -1)
  let racha = 0
  while (porDia.has(k)) {
    racha++
    k = moverDia(k, -1)
  }
  const desde = moverDia(hoy, -6)
  const hechas7 = d.sesiones.filter((s) => diaDe(s.inicio) >= desde && diaDe(s.inicio) <= hoy).length
  const adherencia = Math.round(Math.min(1, hechas7 / (d.plan.sesiones_por_semana * Math.max(1, items.length))) * 100)
  const dow = (new Date(hoy + 'T12:00:00Z').getUTCDay() + 6) % 7
  const lunes = moverDia(hoy, -dow)
  const semana = Array.from({ length: 7 }, (_, i) => {
    const c = moverDia(lunes, i)
    const n = porDia.get(c) ?? 0
    return c > hoy ? 'futuro' : n >= Math.max(1, items.length) ? 'cumplido' : n > 0 ? 'parcial' : 'pendiente'
  })
  return { estados, racha, adherencia, semana, hechos: estados.filter((e) => e === 'hecho').length }
}

const planHoy = (p: Page) => p.getByRole('heading', { level: 2, name: 'Hoy' })

test.describe('inicio del paciente', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('arco de la semana, plan de hoy y cita coinciden con la BD', async ({ page }) => {
    const bd = await datosBD()
    const e = esperado(bd)
    test.info().annotations.push({ type: 'esperado', description: JSON.stringify(e) })
    const v = vigilarErrores(page)
    await page.goto('/inicio')
    await expect(page.getByRole('heading', { level: 1, name: /^Hola, Carmen/ })).toBeVisible()
    await expect(planHoy(page)).toBeVisible()

    const total = bd.plan.items.length
    const min = bd.plan.items.reduce((a, it) => a + Math.min(5, Math.max(1, it.duracionMin)), 0) // 1–5 min por sesión
    await expect(page.getByText(new RegExp(`^${total} ejercicios?, ${min} minutos\\.`))).toBeVisible()
    await expect(page.getByText(/Indicado por Klgo\. Diego/)).toBeVisible()

    // La tarjeta Ahora (el siguiente) y las filas de lo hecho y lo que viene: un elemento por ejercicio del plan.
    const filas = page.getByRole('main').locator('[data-estado]')
    await expect(filas).toHaveCount(total)
    for (const estado of ['hecho', 'siguiente', 'pendiente'] as const)
      await expect(page.getByRole('main').locator(`[data-estado="${estado}"]`)).toHaveCount(e.estados.filter((x) => x === estado).length)

    // Arco de la semana: días cumplidos de las sesiones indicadas.
    const cumplidos = e.semana.filter((x) => x === 'cumplido').length
    const porSemana = bd.plan.sesiones_por_semana
    await expect(page.getByRole('img', { name: `${cumplidos} de ${porSemana} ${porSemana === 1 ? 'sesión' : 'sesiones'} esta semana` })).toBeVisible()
    await expect(page.getByTestId('sesiones-semana')).toHaveText(String(cumplidos))

    const dias = page.getByRole('region', { name: 'Esta semana' }).getByRole('listitem')
    await expect(dias).toHaveCount(7)
    for (let i = 0; i < 7; i++) await expect(dias.nth(i)).toHaveAttribute('data-dia', e.semana[i] === 'cumplido' ? 'hecha' : 'pendiente')
    await expect(page.getByRole('region', { name: 'Esta semana' }).locator('li[aria-current="date"]')).toHaveCount(1)

    await expect(page.getByRole('region', { name: 'Próxima cita' })).toContainText('Control con Klgo. Diego')
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test("tocar la tarjeta 'Ahora' lleva a /sesion/:juego/preparar", async ({ page }) => {
    const bd = await datosBD()
    const e = esperado(bd)
    const i = e.estados.indexOf('siguiente')
    test.skip(i < 0, 'el plan de hoy ya está completo en la BD demo (npm run db:seed lo repone)')
    await page.goto('/inicio')
    const siguiente = page.getByRole('link', { name: /^Ahora:/ })
    await expect(siguiente).toHaveCount(1)
    await siguiente.click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${bd.plan.items[i].juego}/preparar$`))
  })

  test('el mensaje nuevo del terapeuta se muestra una sola vez', async ({ page }) => {
    const bd = await datosBD()
    test.skip(!bd.plan.mensaje, 'el plan vigente no tiene mensaje')
    // La BD demo ya pudo marcarlo visto: se simula "no visto" en la respuesta y se sigue lo que la app marca.
    let visto = 0
    const marcados: number[] = []
    await page.route('**/rest/v1/pacientes?*', async (route) => {
      const r = await route.fetch()
      const cuerpo = await r.json()
      const fijar = (f: Record<string, unknown>) => ({ ...f, ultimo_mensaje_visto: visto })
      await route.fulfill({ response: r, json: Array.isArray(cuerpo) ? cuerpo.map(fijar) : fijar(cuerpo) })
    })
    await page.route('**/rest/v1/rpc/marcar_mensaje_visto', async (route) => {
      const v = Number(route.request().postDataJSON().p_version)
      marcados.push(v)
      visto = Math.max(visto, v)
      await route.continue()
    })

    await page.goto('/inicio')
    const mensaje = page.getByRole('status', { name: 'Mensaje de tu terapeuta' })
    await expect(mensaje).toBeVisible()
    await expect(mensaje).toContainText(bd.plan.mensaje!)
    await expect.poll(() => marcados).toEqual([bd.plan.version])
    await page.screenshot({ path: 'docs/capturas/inicio-mensaje.png' })
    // Cerrar lo oculta en esta visita
    await mensaje.getByRole('button', { name: 'Cerrar mensaje' }).click()
    await expect(mensaje).toHaveCount(0)

    // Al volver ya no aparece
    await page.reload()
    await expect(planHoy(page)).toBeVisible()
    await expect(page.getByRole('status', { name: 'Mensaje de tu terapeuta' })).toHaveCount(0)
    expect(marcados).toEqual([bd.plan.version])
  })

  test('estado de carga', async ({ page }) => {
    await page.route('**/rest/v1/planes?*', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.goto('/inicio')
    await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Cargando' })).toBeVisible()
    await expect(planHoy(page)).toBeVisible()
  })

  test('estado vacío: sin plan', async ({ page }) => {
    await page.route('**/rest/v1/planes?*', (route) => route.fulfill({ json: [] }))
    await page.goto('/inicio')
    await expect(page.getByRole('heading', { name: 'Aún no tienes un plan' })).toBeVisible()
    await expect(planHoy(page)).toHaveCount(0)
    await page.getByRole('link', { name: 'Ver ejercicios' }).click()
    await expect(page).toHaveURL(/\/ejercicios$/)
  })

  test('estado de error con reintento', async ({ page }) => {
    await page.route('**/rest/v1/planes?*', (route) => route.abort('failed'))
    await page.goto('/inicio')
    // supabase-js reintenta las lecturas fallidas con espera creciente: margen amplio si el equipo está cargado.
    await expect(page.getByRole('alert')).toContainText('No pudimos cargar esto', { timeout: 25_000 })
    await page.unroute('**/rest/v1/planes?*')
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(planHoy(page)).toBeVisible()
  })
})
