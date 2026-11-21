// F17 · Prescripción del plan (/terapeuta/pacientes/:id/plan).
// Parte 1 (solo lectura, Carmen): encabezado, tendencia, filas con los valores del plan vigente, resaltado amarillo,
// resumen de cambios y mensaje. NADA se envía: los planes son inmutables y la demo debe quedar intacta.
// Parte 2 (paciente de PRUEBA, con candado y service_role): se envía un plan de verdad. scripts/prueba-plan.ts lo deja
// compartiendo métricas con su terapeuta (la RPC lo exige) y con plan versión 1; al final borra las versiones > 1 y su
// auditoría (RPC limpiar_planes_prueba) y vuelve a compartir_metricas = false. Carmen, Luis, Marta y Jorge no se tocan.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { crearSesion, limpiarPrueba } from './juegos.ts'
import { prepararPlanPrueba, restaurarPlanPrueba } from '../scripts/prueba-plan.ts'
import { soltarBloqueo, tomarBloqueo } from '../scripts/bloqueo-prueba.ts'

interface Item {
  juego: string
  nivel: number
  metaPinzaCm: number
  [k: string]: unknown
}
interface FilaPlan {
  version: number
  sesiones_por_semana: number
  umbral_dolor: number
  mensaje: string | null
  items: Item[]
}

const NOMBRE: Record<string, string> = { 'caja-juguetes': 'Caja de juguetes', 'movilidad-guiada': 'Movilidad guiada' }
const coma = (n: number) => n.toFixed(1).replace('.', ',')

const valor = (p: Page, testid: string) => p.getByTestId(testid).locator('.valor')
const subir = (p: Page, etiqueta: string) => p.getByRole('button', { name: `Subir ${etiqueta}` })
const bajar = (p: Page, etiqueta: string) => p.getByRole('button', { name: `Bajar ${etiqueta}` })
const enviar = (p: Page) => p.getByRole('button', { name: 'Enviar plan' })
const hoja = (p: Page) => p.getByRole('dialog', { name: 'Confirmar plan nuevo' })

async function planesDe(como: 'terapeuta' | 'paciente' | 'prueba', pacienteId: string): Promise<FilaPlan[]> {
  const sb = await clienteComo(como)
  const r = await sb.from('planes').select('version, sesiones_por_semana, umbral_dolor, mensaje, items').eq('paciente_id', pacienteId).order('version')
  if (r.error) throw new Error(r.error.message)
  return r.data as FilaPlan[]
}

async function idDeCarmen(): Promise<string> {
  const sb = await clienteComo('terapeuta')
  const ps = await sb.from('pacientes').select('id, perfil:perfiles!pacientes_usuario_id_fkey(nombre)')
  const c = (ps.data ?? []).find((x) => String((x.perfil as unknown as { nombre: string }).nombre).startsWith('Carmen'))
  if (!c) throw new Error('no se encontró a Carmen')
  return c.id as string
}

// ---------------------------------------------------------------------------------------------- Carmen (solo lectura)
test.describe('prescripción · plan de Carmen (sin enviar nada)', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'terapeuta'))

  test('encabezado, tendencia y filas coinciden con la BD; los cambios se resaltan hasta enviar', async ({ page }) => {
    const v = vigilarErrores(page)
    const id = await idDeCarmen()
    const versiones = await planesDe('terapeuta', id)
    const vigente = versiones.at(-1)!
    await page.goto(`/terapeuta/pacientes/${id}/plan`)

    await expect(page.getByRole('heading', { level: 1, name: 'Carmen R.' })).toBeVisible()
    await expect(page.locator('.encabezado')).toContainText(/Fractura de muñeca · semana \d+/)
    await expect(page.getByTestId('version-plan')).toHaveText(`Versión ${vigente.version} del plan`)
    await expect(page.getByRole('navigation')).toHaveCount(0) // sin barra inferior (imagen 12)

    // Tendencia: primero → último de las últimas 4 semanas, con coma decimal.
    const tendencia = page.getByTestId('tendencia')
    await expect(tendencia).toContainText('Apertura de pinza · 4 semanas')
    await expect(tendencia).toContainText(/\d,\d → \d,\d cm/)

    // Una fila de nivel por juego del plan + frecuencia, meta de pinza y aviso por dolor.
    const juegos = [...new Set(vigente.items.map((i) => i.juego))]
    for (const j of juegos) {
      const nivel = Math.max(...vigente.items.filter((i) => i.juego === j).map((i) => i.nivel))
      await expect(page.getByTestId(`fila-nivel-${j}`)).toContainText(NOMBRE[j]!)
      await expect(page.getByTestId(`fila-nivel-${j}`)).toContainText('Nivel de dificultad')
      await expect(valor(page, `fila-nivel-${j}`)).toHaveText(String(nivel))
    }
    await expect(valor(page, 'fila-sesiones')).toHaveText(String(vigente.sesiones_por_semana))
    await expect(valor(page, 'fila-meta')).toHaveText(coma(Math.max(...vigente.items.map((i) => i.metaPinzaCm))))
    await expect(page.getByTestId('fila-meta')).toContainText('Meta de pinza')
    await expect(valor(page, 'fila-umbral')).toHaveText(String(vigente.umbral_dolor))
    await expect(page.getByTestId('fila-umbral')).toContainText('Alertarme si EVA es ≥')

    // Sin cambios: nada resaltado y "Enviar plan" deshabilitado.
    await expect(page.locator('[data-cambiado="si"]')).toHaveCount(0)
    await expect(enviar(page)).toBeDisabled()

    // Cambiar nivel (de un juego), sesiones y meta (paso 0,5): se resaltan en amarillo y se habilita el envío.
    const j0 = juegos[0]!
    const nivel0 = Number(await valor(page, `fila-nivel-${j0}`).textContent())
    await (nivel0 < 5 ? subir : bajar)(page, `nivel de ${NOMBRE[j0]}`).click()
    await expect(valor(page, `fila-nivel-${j0}`)).toHaveText(String(nivel0 < 5 ? nivel0 + 1 : nivel0 - 1))
    await expect(page.getByTestId(`fila-nivel-${j0}`)).toHaveAttribute('data-cambiado', 'si')
    await expect(valor(page, `fila-nivel-${j0}`)).toHaveClass(/cambiado/)
    await expect(valor(page, `fila-nivel-${j0}`)).toHaveCSS('color', 'rgb(255, 200, 61)') // --acento (amarillo)
    for (const j of juegos.slice(1)) await expect(page.getByTestId(`fila-nivel-${j}`)).toHaveAttribute('data-cambiado', 'no')

    const meta0 = Math.max(...vigente.items.map((i) => i.metaPinzaCm))
    await subir(page, 'meta de pinza en centímetros').click()
    await expect(valor(page, 'fila-meta')).toHaveText(coma(meta0 + 0.5))
    await bajar(page, 'sesiones por semana').click()
    await bajar(page, 'aviso por dolor').click()
    await expect(page.locator('[data-cambiado="si"]')).toHaveCount(4)
    await expect(enviar(page)).toBeEnabled()

    // El resumen muestra antes → después y se puede cancelar sin enviar.
    await enviar(page).click()
    await expect(hoja(page)).toContainText(`Se creará la versión ${vigente.version + 1}`)
    const filas = hoja(page).getByTestId('cambio')
    await expect(filas).toHaveCount(4)
    await expect(filas.filter({ hasText: 'Meta de pinza' })).toContainText(`${coma(meta0)} cm → ${coma(meta0 + 0.5)} cm`)
    await expect(filas.filter({ hasText: 'Sesiones por semana' })).toContainText(`${vigente.sesiones_por_semana} → ${vigente.sesiones_por_semana - 1}`)
    await expect(filas.filter({ hasText: 'Aviso por dolor' })).toContainText(`EVA ≥ ${vigente.umbral_dolor} → EVA ≥ ${vigente.umbral_dolor - 1}`)
    await hoja(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(hoja(page)).toHaveCount(0)

    // Volver al valor original quita el resaltado de ese campo.
    await subir(page, 'sesiones por semana').click()
    await expect(page.getByTestId('fila-sesiones')).toHaveAttribute('data-cambiado', 'no')
    await expect(page.locator('[data-cambiado="si"]')).toHaveCount(3)

    // Nada de "fuerza" ni "presión" en la pantalla.
    await expect(page.locator('main')).not.toContainText(/fuerza|presi[oó]n/i)
    // Sin enviar: la BD de Carmen sigue igual.
    expect((await planesDe('terapeuta', id)).length).toBe(versiones.length)
    v.sinErrores()
  })

  test('mensaje opcional: contador, tope de 280 caracteres y resaltado', async ({ page }) => {
    const id = await idDeCarmen()
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    const caja = page.getByLabel('Mensaje para el paciente')
    await expect(caja).toHaveValue('')
    await expect(enviar(page)).toBeDisabled() // un plan sin cambios ni mensaje no se envía
    await caja.fill('x'.repeat(300))
    await expect(caja).toHaveValue('x'.repeat(280))
    await expect(page.getByText('280/280')).toBeVisible()
    await expect(enviar(page)).toBeEnabled()
    await enviar(page).click()
    await expect(hoja(page).getByTestId('cambio')).toHaveCount(1)
    await expect(hoja(page).getByTestId('cambio')).toContainText('Mensaje para el paciente')
    await hoja(page).getByRole('button', { name: 'Cancelar' }).click()
    await caja.fill('   ')
    await expect(enviar(page)).toBeDisabled() // solo espacios no cuenta como mensaje
  })

  test('paciente inexistente o que no comparte métricas: aviso, sin plan editable', async ({ page }) => {
    await page.goto('/terapeuta/pacientes/00000000-0000-0000-0000-000000000000/plan')
    await expect(page.getByText('No hay un plan para mostrar')).toBeVisible()
    await expect(enviar(page)).toHaveCount(0)
  })

  test('error al enviar: se avisa, no se pierde lo editado y no se crea versión', async ({ page }) => {
    const id = await idDeCarmen()
    const antes = (await planesDe('terapeuta', id)).length
    await page.route('**/rest/v1/rpc/crear_version_plan', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'falla simulada' }) }))
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    await page.getByLabel('Mensaje para el paciente').fill('Prueba de error')
    await enviar(page).click()
    await hoja(page).getByRole('button', { name: 'Confirmar y enviar' }).click()
    await expect(hoja(page).getByRole('alert')).toContainText('No se pudo enviar el plan')
    await expect(page.getByLabel('Mensaje para el paciente')).toHaveValue('Prueba de error')
    expect((await planesDe('terapeuta', id)).length).toBe(antes)
  })
})

// ---------------------------------------------------------------------------------------------- paciente de prueba
test.describe('prescripción · envío real con el paciente de prueba', () => {
  test.describe.configure({ mode: 'serial' })
  let pacienteId = ''
  const MENSAJE = '¡Buen avance! Subimos un nivel 💪'

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    await tomarBloqueo()
    try {
      pacienteId = (await prepararPlanPrueba()).pacienteId
    } catch (e) {
      soltarBloqueo()
      throw e
    }
  })
  test.afterAll(async () => {
    try {
      await restaurarPlanPrueba()
    } finally {
      soltarBloqueo()
    }
  })

  test('"Enviar plan" crea la versión 2 sin tocar la 1, escribe auditoría y deja la pantalla coherente', async ({ page, context }) => {
    await entrarComo(context, 'terapeuta')
    const v = vigilarErrores(page)
    const antes = await planesDe('terapeuta', pacienteId)
    expect(antes.map((p) => p.version)).toEqual([1])
    const base = antes[0]!
    const caja = base.items.find((i) => i.juego === 'caja-juguetes')!
    const meta = Math.max(...base.items.map((i) => i.metaPinzaCm))

    await page.goto(`/terapeuta/pacientes/${pacienteId}/plan`)
    await expect(page.getByRole('heading', { level: 1, name: 'Paciente de prueba' })).toBeVisible()
    await expect(page.getByTestId('version-plan')).toHaveText('Versión 1 del plan')

    await subir(page, 'nivel de Caja de juguetes').click()
    await subir(page, 'sesiones por semana').click()
    await subir(page, 'meta de pinza en centímetros').click()
    await bajar(page, 'aviso por dolor').click()
    await page.getByLabel('Mensaje para el paciente').fill(MENSAJE)
    await expect(page.locator('[data-cambiado="si"]')).toHaveCount(5) // 4 filas + el mensaje
    await expect(page.locator('.presc-fila.cambiado')).toHaveCount(4)

    await enviar(page).click()
    const filas = hoja(page).getByTestId('cambio')
    await expect(filas).toHaveCount(5)
    await expect(filas.filter({ hasText: 'Caja de juguetes' })).toContainText(`${caja.nivel} → ${caja.nivel + 1}`)
    await expect(filas.filter({ hasText: 'Mensaje' })).toContainText(MENSAJE)
    await hoja(page).getByRole('button', { name: 'Confirmar y enviar' }).click()

    // Aviso, hoja cerrada, versión nueva cargada y resaltados limpios.
    await expect(page.getByText('Plan actualizado', { exact: true })).toBeVisible()
    await expect(hoja(page)).toHaveCount(0)
    await expect(page.getByTestId('version-plan')).toHaveText('Versión 2 del plan')
    await expect(page.locator('[data-cambiado="si"]')).toHaveCount(0)
    await expect(valor(page, 'fila-nivel-caja-juguetes')).toHaveText(String(caja.nivel + 1))
    await expect(valor(page, 'fila-sesiones')).toHaveText(String(base.sesiones_por_semana + 1))
    await expect(valor(page, 'fila-meta')).toHaveText(coma(meta + 0.5))
    await expect(valor(page, 'fila-umbral')).toHaveText(String(base.umbral_dolor - 1))
    await expect(page.getByLabel('Mensaje para el paciente')).toHaveValue('')
    await expect(enviar(page)).toBeDisabled()

    // BD: versión 2 nueva, versión 1 intacta.
    const despues = await planesDe('terapeuta', pacienteId)
    expect(despues.map((p) => p.version)).toEqual([1, 2])
    expect(despues[0]).toEqual(base)
    const v2 = despues[1]!
    expect(v2.sesiones_por_semana).toBe(base.sesiones_por_semana + 1)
    expect(v2.umbral_dolor).toBe(base.umbral_dolor - 1)
    expect(v2.mensaje).toBe(MENSAJE)
    expect(v2.items.find((i) => i.juego === 'caja-juguetes')!.nivel).toBe(caja.nivel + 1)
    expect(v2.items.find((i) => i.juego === 'movilidad-guiada')!.nivel).toBe(base.items.find((i) => i.juego === 'movilidad-guiada')!.nivel)
    expect(v2.items.every((i) => i.metaPinzaCm === meta + 0.5)).toBe(true)
    expect(v2.items.find((i) => i.juego === 'caja-juguetes')!.duracionMin).toBe(caja.duracionMin) // lo no editado se conserva

    // Auditoría: antes y después del cambio.
    const sb = await clienteComo('terapeuta')
    const a = await sb.from('auditoria').select('accion, entidad, antes, despues').eq('paciente_id', pacienteId).eq('entidad', 'plan')
    expect(a.error).toBeNull()
    expect(a.data).toHaveLength(1)
    const fila = a.data![0] as { accion: string; antes: FilaPlan & { sesionesPorSemana: number }; despues: { version: number; sesionesPorSemana: number; umbralDolor: number; mensaje: string } }
    expect(fila.accion).toBe('plan_actualizado')
    expect(fila.antes).toMatchObject({ version: 1, sesionesPorSemana: base.sesiones_por_semana, umbralDolor: base.umbral_dolor })
    expect(fila.despues).toMatchObject({ version: 2, sesionesPorSemana: base.sesiones_por_semana + 1, umbralDolor: base.umbral_dolor - 1, mensaje: MENSAJE })
    v.sinErrores()
  })

  test('el paciente ve el mensaje en /inicio y el cambio en /historial; las sesiones nuevas usan la versión 2 y las viejas conservan la 1', async ({ page, context }) => {
    await entrarComo(context, 'prueba')
    const antiguo = await crearSesion('caja-juguetes', 5, 10, 2, 'prueba', { plan_version: 1 })
    let nueva = ''
    try {
      // /inicio: el mensaje del terapeuta aparece (versión 2 > último mensaje visto).
      await page.goto('/inicio')
      const mensaje = page.getByRole('status', { name: 'Mensaje de tu terapeuta' })
      await expect(mensaje).toBeVisible()
      await expect(mensaje).toContainText(MENSAJE)

      // /historial: el cambio de plan, con lo que cambió.
      await page.goto('/historial')
      const fila = page.getByTestId('fila-plan').filter({ hasText: 'Plan actualizado' })
      await expect(fila).toHaveCount(1)
      await expect(fila).toContainText('por Klgo. Diego M.')
      await expect(fila).toContainText('Sesiones por semana 5 → 6')
      await fila.click()
      const detalle = page.getByRole('dialog', { name: 'Plan actualizado' })
      await expect(detalle).toContainText(/Caja de juguetes: Nivel \d → \d/)
      await detalle.getByRole('button', { name: 'Cerrar' }).click()

      // Una sesión nueva se prepara con el nivel del plan nuevo y queda atada a la versión 2.
      const v2 = (await planesDe('prueba', pacienteId)).at(-1)!
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await page.getByRole('button', { name: 'Comenzar' }).click()
      await page.waitForURL(/\/sesion\/S-\d{8}-\d+\/calibrar/)
      nueva = page.url().match(/S-\d{8}-\d+/)![0]
      const sb = await clienteComo('prueba')
      const s = await sb.from('sesiones').select('id, plan_version, parametros').in('id', [antiguo, nueva])
      const porId = Object.fromEntries((s.data ?? []).map((x) => [x.id as string, x as { plan_version: number; parametros: { nivel: number } }]))
      expect(porId[nueva]!.plan_version).toBe(2)
      expect(porId[nueva]!.parametros.nivel).toBe(v2.items.find((i) => i.juego === 'caja-juguetes')!.nivel)
      expect(porId[antiguo]!.plan_version).toBe(1) // la sesión anterior sigue apuntando al plan con que se hizo
      expect((await planesDe('prueba', pacienteId))[0]!.version).toBe(1) // y la versión 1 sigue existiendo
    } finally {
      limpiarPrueba([antiguo, nueva])
    }
  })
})
