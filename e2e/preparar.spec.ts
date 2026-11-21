// F06 · Preparar la sesión: valores por defecto del plan, "Comenzar" crea la Sesion "preparada" (S-AAAAMMDD-NN)
// con parámetros congelados y versión del plan, y sin consentimiento se va a /privacidad.
// Sesión inyectada (entrarComo) + cliente con la misma sesión para leer la BD: sin ingresos extra.
// La sesión "preparada" que crea la prueba se borra al final con scripts/limpiar-preparadas.ts (service_role, solo demo).
import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'

interface Item {
  juego: string
  nivel: number
  duracionMin: number
  mano: 'izquierda' | 'derecha' | 'ambas'
  metaAgarres: number
  metaPinzaCm: number
}

// Oráculo independiente de la app.
const MANO: Record<Item['mano'], string> = { izquierda: 'Izquierda', derecha: 'Derecha', ambas: 'Ambas' }
const NOMBRE_NIVEL_CAJA = ['Objetos grandes', 'Objetos medianos', 'Objetos medianos, más lejos', 'Objetos pequeños', 'Objetos pequeños, lejos']
const cm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

async function bd() {
  const sb = await clienteComo('paciente')
  const { data: pac, error: e1 } = await sb.from('pacientes').select('id').single()
  if (e1 || !pac) throw new Error('sin paciente: ' + e1?.message)
  const { data: plan, error: e2 } = await sb
    .from('planes')
    .select('version, items, autor:perfiles!planes_creado_por_fkey(nombre, titulo)')
    .eq('paciente_id', pac.id)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  if (e2 || !plan) throw new Error('sin plan: ' + e2?.message)
  const a = (Array.isArray(plan.autor) ? plan.autor[0] : plan.autor) as { nombre: string; titulo: string | null } | null
  return { sb, pacienteId: pac.id as string, plan: plan as { version: number; items: Item[] }, autor: a ? [a.titulo, a.nombre].filter(Boolean).join(' ') : null }
}

const grupoMano = (p: Page) => p.getByRole('group', { name: 'Mano a trabajar' })
const comenzar = (p: Page) => p.getByRole('button', { name: 'Comenzar' })

async function revisarDefectos(page: Page, it: Item, autor: string | null) {
  await expect(grupoMano(page).getByRole('button', { name: MANO[it.mano] })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('nivel')).toContainText(`Nivel ${it.nivel}`)
  await expect(page.getByRole('group', { name: 'Dificultad' }).getByRole('button', { name: `Nivel ${it.nivel}` })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('duracion')).toHaveText(`${it.duracionMin} minutos`)
  await expect(page.getByRole('slider', { name: 'Duración en minutos' })).toHaveValue(String(it.duracionMin))
  const meta = page.getByTestId('meta')
  await expect(meta).toContainText(`${it.metaAgarres} agarres`)
  await expect(meta).toContainText(`Pinza ≥ ${cm(it.metaPinzaCm)} cm`)
  await expect(meta).toContainText(`Definida por ${autor}`)
}

test.describe('preparar la sesión', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('valores por defecto vienen del plan vigente (Caja y Movilidad)', async ({ page }) => {
    const d = await bd()
    const v = vigilarErrores(page)
    for (const juego of ['caja-juguetes', 'movilidad-guiada']) {
      const it = d.plan.items.find((x) => x.juego === juego)
      expect(it, `el plan demo incluye ${juego}`).toBeTruthy()
      await page.goto(`/sesion/${juego}/preparar`)
      await expect(page.getByText('Configura tu sesión')).toBeVisible()
      await revisarDefectos(page, it!, d.autor)
    }
    // Nivel con nombre y detalle desde el registro.
    const caja = d.plan.items.find((x) => x.juego === 'caja-juguetes')!
    await page.goto('/sesion/caja-juguetes/preparar')
    await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible()
    await expect(page.getByTestId('nivel')).toHaveText(`Nivel ${caja.nivel} · ${NOMBRE_NIVEL_CAJA[caja.nivel - 1]}`)
    await expect(page.getByTestId('detalle-nivel')).not.toBeEmpty()
    await expect(page.getByText('Apoya el teléfono en horizontal, a unos 50 cm')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('controles: mano, nivel, duración con +/− (límites 2–10) y deslizador', async ({ page }) => {
    await page.goto('/sesion/caja-juguetes/preparar')
    await grupoMano(page).getByRole('button', { name: 'Derecha' }).click()
    await expect(grupoMano(page).getByRole('button', { name: 'Derecha' })).toHaveAttribute('aria-pressed', 'true')
    await expect(grupoMano(page).getByRole('button', { name: 'Ambas' })).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: 'Nivel 5' }).click()
    await expect(page.getByTestId('nivel')).toHaveText('Nivel 5 · Objetos pequeños, lejos')

    const menos = page.getByRole('button', { name: 'Menos un minuto' })
    const mas = page.getByRole('button', { name: 'Más un minuto' })
    const slider = page.getByRole('slider', { name: 'Duración en minutos' })
    await slider.fill('2')
    await expect(page.getByTestId('duracion')).toHaveText('2 minutos')
    await expect(menos).toBeDisabled()
    await mas.click()
    await expect(page.getByTestId('duracion')).toHaveText('3 minutos')
    await slider.fill('10')
    await expect(page.getByTestId('duracion')).toHaveText('10 minutos')
    await expect(mas).toBeDisabled()
    await menos.click()
    await expect(slider).toHaveValue('9')
  })

  test("'Comenzar' crea la Sesion preparada S-AAAAMMDD-NN con parámetros congelados y versión del plan", async ({ page }) => {
    const d = await bd()
    const caja = d.plan.items.find((x) => x.juego === 'caja-juguetes')!
    const desde = new Date(Date.now() - 5_000).toISOString()
    try {
      const v = vigilarErrores(page)
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await revisarDefectos(page, caja, d.autor)
      await grupoMano(page).getByRole('button', { name: 'Derecha' }).click()
      await page.getByRole('button', { name: 'Nivel 3' }).click()
      const duracion = caja.duracionMin < 10 ? caja.duracionMin + 1 : caja.duracionMin - 1
      await page.getByRole('button', { name: caja.duracionMin < 10 ? 'Más un minuto' : 'Menos un minuto' }).click()
      await comenzar(page).click()

      await expect(page).toHaveURL(/\/sesion\/S-\d{8}-\d{2,}\/calibrar\?fuente=sintetica$/)
      const id = new URL(page.url()).pathname.split('/')[2]
      const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }).replaceAll('-', '')
      const hoyUtc = new Date().toISOString().slice(0, 10).replaceAll('-', '')
      expect([hoy, hoyUtc]).toContain(id.slice(2, 10))

      const { data: s, error } = await d.sb.from('sesiones').select('*').eq('id', id).single()
      expect(error).toBeNull()
      expect(s.estado).toBe('preparada')
      expect(s.paciente_id).toBe(d.pacienteId)
      expect(s.juego).toBe('caja-juguetes')
      expect(s.plan_version).toBe(d.plan.version)
      expect(s.parametros).toEqual({
        mano: 'derecha',
        nivel: 3,
        duracionMin: duracion,
        metaAgarres: caja.metaAgarres,
        metaPinzaCm: caja.metaPinzaCm,
        prescritoPor: d.autor,
      })
      expect(s.inicio).toBeNull()
      expect(s.hash).toBeNull()
      v.sinErrores()
    } finally {
      execSync(`npx tsx scripts/limpiar-preparadas.ts ${desde}`, { stdio: 'inherit' })
    }
  })

  test('sin consentimiento firmado va a /privacidad y no crea sesión', async ({ page }) => {
    let insertos = 0
    await page.route('**/rest/v1/consentimientos?*', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/sesiones*', (route) => {
      if (route.request().method() === 'POST') insertos++
      return route.continue()
    })
    await page.goto('/sesion/caja-juguetes/preparar')
    await expect(page).toHaveURL(/\/privacidad$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Privacidad y datos' })).toBeVisible()
    expect(insertos).toBe(0)
  })

  test('error de carga muestra Reintentar; juego inexistente o Próximamente no se prepara', async ({ page }) => {
    let fallar = true
    await page.route('**/rest/v1/planes?*', (route) => (fallar ? route.abort('failed') : route.continue()))
    await page.goto('/sesion/caja-juguetes/preparar')
    await expect(page.getByText('No pudimos cargar esto')).toBeVisible()
    fallar = false
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(comenzar(page)).toBeVisible()

    for (const ruta of ['/sesion/no-existe/preparar', '/sesion/torre-cubos/preparar']) {
      await page.goto(ruta)
      await expect(page.getByText('Este ejercicio no está disponible')).toBeVisible()
      await expect(comenzar(page)).toHaveCount(0)
    }
  })
})
