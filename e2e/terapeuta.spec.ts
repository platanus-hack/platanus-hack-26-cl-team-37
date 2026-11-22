// F16 · Pacientes del terapeuta y alertas.
// Con los datos demo (solo lectura): Luis con "Dolor 6/10", Jorge con "Sin sesiones hace N días" (N sale de la BD),
// orden, buscador, indicadores, navegación al plan y pestañas. El paciente de prueba (no comparte métricas) no se ve.
// Marcar revisada MUTA datos: se hace sobre una alerta que crea el propio test (scripts/alerta-prueba.ts, service_role)
// y se limpia con su auditoría al final; la alerta original de Luis (6/10) queda abierta.
import { execSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { soltarBloqueo, tomarBloqueo } from '../scripts/bloqueo-prueba.ts'

test.describe.configure({ mode: 'serial' })
// Candado: prescripcion.spec.ts (F17) hace visible un momento al paciente de prueba, y aquí se cuentan 4 pacientes.
test.beforeAll(async () => {
  test.setTimeout(300_000)
  await tomarBloqueo()
})
test.afterAll(() => soltarBloqueo())

const fila = (page: Page, nombre: string) => page.getByTestId('fila-paciente').filter({ hasText: nombre })
const diaSantiago = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' })

/** Días de calendario (Santiago) desde la última sesión cerrada de Jorge, leídos de la BD con la sesión del terapeuta. */
async function diasDeJorge(): Promise<number> {
  const sb = await clienteComo('terapeuta')
  const ps = await sb.from('pacientes').select('id, perfil:perfiles!pacientes_usuario_id_fkey(nombre)')
  const jorge = (ps.data ?? []).find((x) => String((x.perfil as unknown as { nombre: string }).nombre).startsWith('Jorge'))!
  const r = await sb.from('sesiones').select('inicio').eq('paciente_id', jorge.id).eq('estado', 'cerrada').order('inicio', { ascending: false }).limit(1).single()
  const a = new Date(diaSantiago(new Date(r.data!.inicio)) + 'T00:00:00Z').getTime()
  const b = new Date(diaSantiago(new Date()) + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

test.describe('Pacientes del terapeuta', () => {
  test.beforeEach(async ({ context }) => {
    await entrarComo(context, 'terapeuta')
  })

  test('encabezado, indicadores, orden y alertas con los datos demo', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/terapeuta/pacientes')
    await expect(page.getByRole('heading', { name: 'Mis pacientes' })).toBeVisible()
    await expect(page.getByText('Klgo. Diego M.')).toBeVisible()
    await expect(page.getByTestId('fila-paciente')).toHaveCount(4)
    // El paciente de prueba no comparte métricas: no aparece.
    await expect(page.getByText('Paciente de prueba')).toHaveCount(0)

    // Con alertas primero: Luis (dolor), Jorge (sin sesiones); luego Carmen y Marta.
    const nombres = await page.getByTestId('fila-paciente').locator('.ter-nombre').allTextContents()
    expect(nombres).toEqual(['Luis A.', 'Jorge P.', 'Carmen R.', 'Marta S.'])

    await expect(fila(page, 'Luis A.')).toContainText('Mano izquierda · semana')
    await expect(fila(page, 'Luis A.').getByTestId('aviso-dolor')).toHaveText('Dolor 6/10 en la última sesión')
    await expect(fila(page, 'Carmen R.')).toContainText('Fractura de muñeca · semana')
    const n = await diasDeJorge()
    expect(n).toBeGreaterThanOrEqual(3)
    await expect(fila(page, 'Jorge P.').getByTestId('aviso-inactividad')).toHaveText(`Sin sesiones hace ${n} días`)
    await expect(fila(page, 'Carmen R.').getByTestId('aviso-dolor')).toHaveCount(0)
    await expect(fila(page, 'Marta S.').getByTestId('aviso-inactividad')).toHaveCount(0)

    // Minigráfico y adherencia en cada fila.
    for (const nombre of ['Luis A.', 'Jorge P.', 'Carmen R.', 'Marta S.']) {
      await expect(fila(page, nombre).locator('svg polyline')).toHaveCount(1)
      await expect(fila(page, nombre).locator('.ter-adh')).toHaveText(/^\d{1,3}%$/)
    }

    // Indicadores: 4 activos, 2 alertas (dolor de Luis + inactividad de Jorge) y adherencia media = promedio de las filas.
    await expect(page.getByTestId('ind-activos')).toHaveText('4')
    await expect(page.getByTestId('ind-alertas')).toHaveText('2')
    const adh = (await page.locator('.ter-adh').allTextContents()).map((t) => parseInt(t, 10))
    const media = adh.reduce((a, b) => a + b, 0) / adh.length
    const mostrada = parseInt((await page.getByTestId('ind-adherencia').textContent())!, 10)
    expect(Math.abs(mostrada - media)).toBeLessThanOrEqual(1)

    // Barra del terapeuta: solo Pacientes (Alertas, Planes e Informes están ocultas; sus pantallas siguen por URL).
    const barra = page.getByRole('navigation', { name: 'Navegación del terapeuta' })
    await expect(barra.getByRole('link')).toHaveCount(1)
    await expect(barra.getByText('Pacientes', { exact: true })).toBeVisible()
    for (const t of ['Alertas', 'Planes', 'Informes']) await expect(barra.getByText(t, { exact: true })).toHaveCount(0)
    v.sinErrores()
  })

  test('buscador por nombre y navegación al plan del paciente', async ({ page }) => {
    await page.goto('/terapeuta/pacientes')
    await expect(page.getByTestId('fila-paciente')).toHaveCount(4)
    const buscar = page.getByRole('searchbox', { name: 'Buscar paciente por nombre' })
    await buscar.fill('mar')
    await expect(page.getByTestId('fila-paciente')).toHaveCount(1)
    await expect(fila(page, 'Marta S.')).toBeVisible()
    await buscar.fill('zzz')
    await expect(page.getByText('Sin resultados')).toBeVisible()
    await buscar.fill('')
    await expect(page.getByTestId('fila-paciente')).toHaveCount(4)

    await fila(page, 'Luis A.').click()
    await expect(page).toHaveURL(/\/terapeuta\/pacientes\/[0-9a-f-]{36}\/plan$/)
    // F17: la prescripción del plan de ese paciente (su detalle se prueba en prescripcion.spec.ts).
    await expect(page.getByRole('heading', { level: 1, name: 'Luis A.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Plan semanal' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enviar plan' })).toBeDisabled()
  })

  test('pantallas Alertas, Planes e Informes (sin pestaña, por URL); días sin sesiones configurables', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/terapeuta/pacientes')
    const barra = page.getByRole('navigation', { name: 'Navegación del terapeuta' })

    await page.goto('/terapeuta/alertas')
    const dolor = page.getByTestId('alerta-dolor')
    await expect(dolor).toHaveCount(1)
    await expect(dolor).toContainText('Luis A.')
    await expect(dolor).toContainText('Dolor 6/10 en la última sesión')
    await expect(page.getByTestId('alerta-inactividad')).toContainText('Jorge P.')
    await expect(page.getByRole('button', { name: 'Marcar revisada' })).toHaveCount(1)

    // Con 14 días como umbral, Jorge deja de tener la alerta (y se recuerda al volver a Pacientes).
    for (let i = 0; i < 11; i++) await page.getByRole('button', { name: 'Subir días sin sesiones' }).click()
    await expect(page.getByTestId('alerta-inactividad')).toHaveCount(0)
    await barra.getByText('Pacientes', { exact: true }).click()
    await expect(page.getByTestId('fila-paciente')).toHaveCount(4)
    await expect(page.getByTestId('aviso-inactividad')).toHaveCount(0)
    await expect(page.getByTestId('ind-alertas')).toHaveText('1')

    await page.goto('/terapeuta/planes')
    await expect(page.getByTestId('fila-plan')).toHaveCount(4)
    await expect(page.getByTestId('fila-plan').filter({ hasText: 'Carmen R.' })).toContainText(/Versión \d+ · \d+ días por semana/)
    await expect(page.getByText('Paciente de prueba')).toHaveCount(0)

    await page.goto('/terapeuta/informes')
    // F17: exportar el período de un paciente (el detalle y la descarga se prueban en informes.spec.ts).
    await expect(page.getByRole('heading', { name: 'Exportar informe' })).toBeVisible()
    await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
    await expect(page.getByRole('list', { name: 'Pacientes' }).getByRole('listitem')).toHaveCount(4)
    v.sinErrores()
  })

  test('marcar una alerta como revisada la quita y queda en auditoría (alerta de prueba)', async ({ page }) => {
    const id = execSync('npx tsx scripts/alerta-prueba.ts crear 9', { encoding: 'utf8' }).trim().split(/\s+/).pop()!
    try {
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
      await page.goto('/terapeuta/alertas')
      const prueba = page.getByTestId('alerta-dolor').filter({ hasText: 'Dolor 9/10' })
      await expect(prueba).toHaveCount(1)
      await expect(page.getByTestId('alerta-dolor')).toHaveCount(2)
      await prueba.getByRole('button', { name: 'Marcar revisada' }).click()
      await expect(page.getByText('Alerta marcada como revisada.')).toBeVisible()
      await expect(page.getByTestId('alerta-dolor').filter({ hasText: 'Dolor 9/10' })).toHaveCount(0)
      // La original de Luis sigue abierta.
      await expect(page.getByTestId('alerta-dolor').filter({ hasText: 'Dolor 6/10' })).toHaveCount(1)

      // En la BD: revisada, con quién y cuándo, y una fila de auditoría.
      const sb = await clienteComo('terapeuta')
      const a = await sb.from('alertas').select('estado, revisada_por, revisada_el').eq('id', id).single()
      expect(a.data).toMatchObject({ estado: 'revisada' })
      expect(a.data!.revisada_por).toBeTruthy()
      expect(a.data!.revisada_el).toBeTruthy()
      const au = await sb.from('auditoria').select('accion, entidad, despues').eq('entidad_id', id)
      expect(au.data).toHaveLength(1)
      expect(au.data![0]).toMatchObject({ accion: 'alerta_revisada', entidad: 'alerta', despues: { estado: 'revisada' } })
    } finally {
      execSync(`npx tsx scripts/alerta-prueba.ts limpiar ${id}`, { stdio: 'inherit' })
    }
  })
})
