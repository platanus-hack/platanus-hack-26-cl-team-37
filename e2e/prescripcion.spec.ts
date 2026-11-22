// F17 · Prescripción del plan (/terapeuta/pacientes/:id/plan).
// Parte 1 (solo lectura, Carmen): encabezado, tendencia, filas con los valores del plan vigente, destacado de lo
// modificado, resumen de cambios y mensaje. NADA se envía: los planes son inmutables y la demo debe quedar intacta.
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
  metaAgarres: number
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
const mensaje = (p: Page) => p.getByLabel(/^Mensaje para /)
const cambiados = (p: Page) => p.locator('[data-cambiado="si"]')

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
  test.beforeEach(async ({ context }) => {
    await entrarComo(context, 'terapeuta')
    // Seguro: en estas pruebas ninguna llamada a crear_version_plan llega a la BD (Carmen es paciente demo).
    await context.route(/\/rpc\/crear_version_plan/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'falla simulada' }) }))
  })

  test('encabezado, tendencia y filas coinciden con la BD; los cambios se destacan hasta enviar', async ({ page }) => {
    const v = vigilarErrores(page)
    const id = await idDeCarmen()
    const versiones = await planesDe('terapeuta', id)
    const vigente = versiones.at(-1)!
    await page.goto(`/terapeuta/pacientes/${id}/plan`)

    await expect(page.getByRole('heading', { level: 1, name: 'Carmen R.' })).toBeVisible()
    await expect(page.locator('.encabezado')).toContainText(/Fractura de muñeca · semana \d+/)
    await expect(page.getByTestId('version-plan')).toContainText(`Versión ${vigente.version} · desde el`)
    await expect(page.getByRole('navigation')).toHaveCount(0) // sin barra de navegación (imagen 12)

    // Tendencia: primero → último de las últimas 4 semanas, con coma decimal.
    const tendencia = page.getByTestId('tendencia')
    await expect(tendencia).toContainText('Apertura de pinza · 4 semanas')
    await expect(tendencia).toContainText(/\d,\d → \d+,\d cm/)

    // Frecuencia, meta de pinza y aviso por dolor; y por cada juego del plan, su nivel y su meta por sesión.
    await expect(valor(page, 'fila-sesiones')).toHaveText(String(vigente.sesiones_por_semana))
    await expect(page.getByTestId('fila-sesiones')).toContainText('Sesiones por semana')
    const meta0 = Math.max(...vigente.items.map((i) => i.metaPinzaCm))
    await expect(valor(page, 'fila-pinza')).toHaveText(coma(meta0))
    await expect(page.getByTestId('fila-pinza')).toContainText('Meta de pinza')
    await expect(valor(page, 'fila-umbral')).toHaveText(String(vigente.umbral_dolor))
    await expect(page.getByTestId('fila-umbral')).toContainText(/Alertarme si EVA es\s≥/)
    const juegos = [...new Set(vigente.items.map((i) => i.juego))]
    for (const j of juegos) {
      const deJuego = vigente.items.filter((i) => i.juego === j)
      await expect(page.getByTestId(`juego-${j}`)).toContainText(NOMBRE[j]!)
      await expect(page.getByTestId(`fila-nivel-${j}`)).toContainText('Nivel de dificultad')
      await expect(valor(page, `fila-nivel-${j}`)).toHaveText(String(Math.max(...deJuego.map((i) => i.nivel))))
      await expect(page.getByTestId(`fila-meta-${j}`)).toContainText('Meta por sesión')
      await expect(valor(page, `fila-meta-${j}`)).toHaveText(String(Math.max(...deJuego.map((i) => i.metaAgarres))))
    }

    // Sin cambios: nada destacado y «Enviar plan» deshabilitado.
    await expect(cambiados(page)).toHaveCount(0)
    await expect(page.getByTestId('estado-cambios')).toHaveText('Sin cambios por enviar')
    await expect(enviar(page)).toBeDisabled()

    // Cambiar el nivel de un juego: se destaca solo esa fila y se habilita el envío.
    const j0 = juegos[0]!
    const nivel0 = Number(await valor(page, `fila-nivel-${j0}`).textContent())
    await (nivel0 < 5 ? subir : bajar)(page, `nivel de ${NOMBRE[j0]}`).click()
    await expect(valor(page, `fila-nivel-${j0}`)).toHaveText(String(nivel0 < 5 ? nivel0 + 1 : nivel0 - 1))
    await expect(page.getByTestId(`fila-nivel-${j0}`)).toHaveAttribute('data-cambiado', 'si')
    await expect(valor(page, `fila-nivel-${j0}`)).toHaveClass(/cambiado/)
    await expect(valor(page, `fila-nivel-${j0}`)).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)') // píldora amarilla
    await expect(valor(page, 'fila-sesiones')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.getByTestId(`fila-meta-${j0}`)).toHaveAttribute('data-cambiado', 'no')
    for (const j of juegos.slice(1)) await expect(page.getByTestId(`fila-nivel-${j}`)).toHaveAttribute('data-cambiado', 'no')
    await expect(page.getByTestId('estado-cambios')).toHaveText('1 cambio por enviar')

    // Meta de pinza en pasos de 0,5; sesiones, aviso por dolor y la meta del juego.
    await subir(page, 'meta de pinza en centímetros').click()
    await expect(valor(page, 'fila-pinza')).toHaveText(coma(meta0 + 0.5))
    await bajar(page, 'sesiones por semana').click()
    await bajar(page, 'aviso por dolor').click()
    const metaJuego0 = Number(await valor(page, `fila-meta-${j0}`).textContent())
    await subir(page, `meta de ${NOMBRE[j0]}`).click()
    await expect(valor(page, `fila-meta-${j0}`)).toHaveText(String(metaJuego0 + 1))
    await expect(cambiados(page)).toHaveCount(5)
    await expect(page.getByTestId('estado-cambios')).toHaveText('5 cambios por enviar')
    await expect(enviar(page)).toBeEnabled()

    // El resumen muestra antes → después y se puede cancelar sin enviar.
    await enviar(page).click()
    await expect(hoja(page)).toContainText(`Se creará la versión ${vigente.version + 1}`)
    const filas = hoja(page).getByTestId('cambio')
    await expect(filas).toHaveCount(5)
    await expect(filas.filter({ hasText: 'Meta de pinza' })).toContainText(`${coma(meta0)} cm → ${coma(meta0 + 0.5)} cm`)
    await expect(filas.filter({ hasText: 'Sesiones por semana' })).toContainText(`${vigente.sesiones_por_semana} → ${vigente.sesiones_por_semana - 1}`)
    await expect(filas.filter({ hasText: 'Aviso por dolor' })).toContainText(`EVA ≥ ${vigente.umbral_dolor} → EVA ≥ ${vigente.umbral_dolor - 1}`)
    await expect(filas.filter({ hasText: 'meta por sesión' })).toContainText(`${metaJuego0} → ${metaJuego0 + 1}`)
    await hoja(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(hoja(page)).toHaveCount(0)

    // Volver al valor original quita el destacado de ese campo.
    await subir(page, 'sesiones por semana').click()
    await expect(page.getByTestId('fila-sesiones')).toHaveAttribute('data-cambiado', 'no')
    await expect(cambiados(page)).toHaveCount(4)

    // Nada de "fuerza" ni "presión" en la pantalla.
    await expect(page.locator('main')).not.toContainText(/fuerza|presi[oó]n/i)
    // Sin enviar: la BD de Carmen sigue igual.
    expect((await planesDe('terapeuta', id)).length).toBe(versiones.length)
    v.sinErrores()
  })

  test('mensaje opcional: contador, tope de 280 caracteres y cuenta como cambio', async ({ page }) => {
    const id = await idDeCarmen()
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    const caja = mensaje(page)
    await expect(page.getByText('Mensaje para Carmen (opcional)')).toBeVisible()
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
    const v = vigilarErrores(page)
    await page.goto('/terapeuta/pacientes/00000000-0000-0000-0000-000000000000/plan')
    await expect(page.getByRole('heading', { level: 1, name: 'Plan del paciente' })).toBeVisible()
    await expect(page.getByText('No hay un plan para mostrar')).toBeVisible()
    await expect(enviar(page)).toHaveCount(0)
    await page.getByRole('link', { name: 'Ver pacientes' }).click()
    await expect(page).toHaveURL(/\/terapeuta\/pacientes$/)
    v.sinErrores()
  })

  test('error al enviar: se avisa, no se pierde lo editado y no se crea versión', async ({ page }) => {
    const id = await idDeCarmen()
    const antes = (await planesDe('terapeuta', id)).length
    // La llamada nunca llega a la BD: el beforeEach la responde con un error.
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    await mensaje(page).fill('Prueba de error')
    await enviar(page).click()
    await hoja(page).getByRole('button', { name: 'Confirmar y enviar' }).click()
    await expect(hoja(page).getByRole('alert')).toContainText('No se pudo enviar el plan')
    await expect(mensaje(page)).toHaveValue('Prueba de error')
    expect((await planesDe('terapeuta', id)).length).toBe(antes)
  })

  test('desde el plan se abre el historial de ese paciente', async ({ page }) => {
    const id = await idDeCarmen()
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    await page.getByRole('link', { name: 'Ver historial' }).click()
    await expect(page).toHaveURL(new RegExp(`/historial\\?paciente=${id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible()
    await expect(page.getByTestId('fila-plan').first()).toBeVisible()
  })

  test('escritorio (1440×900): dos columnas y la misma edición', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const id = await idDeCarmen()
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    await expect(page.getByRole('heading', { level: 1, name: 'Carmen R.' })).toBeVisible()
    const izq = await page.getByTestId('fila-sesiones').boundingBox()
    const der = await page.getByTestId('fila-nivel-caja-juguetes').boundingBox()
    expect(der!.x).toBeGreaterThan(izq!.x + izq!.width) // los ejercicios van en la columna de la derecha
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true) // sin desborde horizontal
    await bajar(page, 'aviso por dolor').click()
    await expect(page.getByTestId('fila-umbral')).toHaveAttribute('data-cambiado', 'si')
    await expect(enviar(page)).toBeEnabled()
  })

  test('quitar y agregar ejercicios: se destacan, van al resumen y se pueden deshacer (sin enviar)', async ({ page }) => {
    const v = vigilarErrores(page)
    const id = await idDeCarmen()
    const vigente = (await planesDe('terapeuta', id)).at(-1)!
    const juegos = [...new Set(vigente.items.map((i) => i.juego))]
    expect(juegos.length).toBeGreaterThanOrEqual(2)
    await page.goto(`/terapeuta/pacientes/${id}/plan`)
    const [j0, j1] = [juegos[0]!, juegos[1]!]

    // Quitar el primero: queda a la vista, marcado «Se quita», y el último que queda no se puede quitar.
    await page.getByRole('button', { name: `Quitar ${NOMBRE[j0]} del plan` }).click()
    await expect(page.getByTestId(`juego-${j0}`)).toHaveAttribute('data-estado', 'quitado')
    await expect(page.getByTestId(`juego-${j0}`)).toContainText('Se quita')
    if (juegos.length === 2) {
      await expect(page.getByRole('button', { name: `Quitar ${NOMBRE[j1]} del plan` })).toBeDisabled()
      await expect(page.getByText('El plan necesita al menos un ejercicio.')).toBeVisible()
    }
    await expect(enviar(page)).toBeEnabled()
    await enviar(page).click()
    await expect(hoja(page).getByTestId('cambio')).toHaveCount(1)
    await expect(hoja(page).getByTestId('cambio')).toContainText(`${NOMBRE[j0]} · ejercicio`)
    await expect(hoja(page).getByTestId('cambio')).toContainText('En el plan → Se quita')
    await hoja(page).getByRole('button', { name: 'Cancelar' }).click()

    // Deshacer lo devuelve tal cual: sin cambios.
    await page.getByTestId(`juego-${j0}`).getByRole('button', { name: 'Deshacer' }).click()
    await expect(page.getByTestId(`juego-${j0}`)).toHaveAttribute('data-estado', 'igual')
    await expect(enviar(page)).toBeDisabled()

    // Agregar uno del catálogo: nivel 1 y meta 10 por defecto, con sus controles; «No agregar» lo saca.
    const agregar = page.getByLabel('Agregar un ejercicio')
    const opciones = await agregar.locator('option').allTextContents()
    expect(opciones).toContain('Pinza fina')
    for (const j of juegos) expect(opciones).not.toContain(NOMBRE[j]) // los que ya están en el plan no se ofrecen
    await agregar.selectOption({ label: 'Pinza fina' })
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    const nuevo = page.getByTestId('juego-pinza-fina')
    await expect(nuevo).toHaveAttribute('data-estado', 'nuevo')
    await expect(nuevo).toContainText('Nuevo')
    await expect(valor(page, 'fila-nivel-pinza-fina')).toHaveText('1')
    await expect(valor(page, 'fila-meta-pinza-fina')).toHaveText('10')
    await subir(page, 'nivel de Pinza fina').click()
    await enviar(page).click()
    await expect(hoja(page).getByTestId('cambio')).toHaveCount(1)
    await expect(hoja(page).getByTestId('cambio')).toContainText('Pinza fina · ejercicio')
    await expect(hoja(page).getByTestId('cambio')).toContainText('No está → Se agrega: nivel 2, meta 10')
    await hoja(page).getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('button', { name: 'Quitar Pinza fina del plan' }).click()
    await expect(page.getByTestId('juego-pinza-fina')).toHaveCount(0)
    await expect(enviar(page)).toBeDisabled()
    expect((await planesDe('terapeuta', id)).at(-1)!.version).toBe(vigente.version) // nada se envió
    v.sinErrores()
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

  test('«Enviar plan» crea la versión 2 sin tocar la 1, escribe auditoría y deja la pantalla coherente', async ({ page, context }) => {
    await entrarComo(context, 'terapeuta')
    const v = vigilarErrores(page)
    const antes = await planesDe('terapeuta', pacienteId)
    expect(antes.map((p) => p.version)).toEqual([1])
    const base = antes[0]!
    const caja = base.items.find((i) => i.juego === 'caja-juguetes')!
    const movilidad = base.items.find((i) => i.juego === 'movilidad-guiada')!
    const meta = Math.max(...base.items.map((i) => i.metaPinzaCm))

    await page.goto(`/terapeuta/pacientes/${pacienteId}/plan`)
    await expect(page.getByRole('heading', { level: 1, name: 'Paciente de prueba' })).toBeVisible()
    await expect(page.getByTestId('version-plan')).toContainText('Versión 1 ·')

    await subir(page, 'nivel de Caja de juguetes').click()
    await subir(page, 'meta de Caja de juguetes').click()
    await subir(page, 'sesiones por semana').click()
    await subir(page, 'meta de pinza en centímetros').click()
    await bajar(page, 'aviso por dolor').click()
    await mensaje(page).fill(MENSAJE)
    await expect(cambiados(page)).toHaveCount(6) // 5 filas + el mensaje
    await expect(page.locator('.presc-fila[data-cambiado="si"]')).toHaveCount(5)

    await enviar(page).click()
    const filas = hoja(page).getByTestId('cambio')
    await expect(filas).toHaveCount(6)
    await expect(filas.filter({ hasText: 'Caja de juguetes · nivel' })).toContainText(`${caja.nivel} → ${caja.nivel + 1}`)
    await expect(filas.filter({ hasText: 'Caja de juguetes · meta' })).toContainText(`${caja.metaAgarres} → ${caja.metaAgarres + 1}`)
    await expect(filas.filter({ hasText: 'Mensaje' })).toContainText(MENSAJE)
    await hoja(page).getByRole('button', { name: 'Confirmar y enviar' }).click()

    // Aviso, hoja cerrada, versión nueva cargada y nada destacado.
    await expect(page.getByText('Plan actualizado', { exact: true })).toBeVisible()
    await expect(hoja(page)).toHaveCount(0)
    await expect(page.getByTestId('version-plan')).toContainText('Versión 2 ·')
    await expect(cambiados(page)).toHaveCount(0)
    await expect(valor(page, 'fila-nivel-caja-juguetes')).toHaveText(String(caja.nivel + 1))
    await expect(valor(page, 'fila-meta-caja-juguetes')).toHaveText(String(caja.metaAgarres + 1))
    await expect(valor(page, 'fila-sesiones')).toHaveText(String(base.sesiones_por_semana + 1))
    await expect(valor(page, 'fila-pinza')).toHaveText(coma(meta + 0.5))
    await expect(valor(page, 'fila-umbral')).toHaveText(String(base.umbral_dolor - 1))
    await expect(mensaje(page)).toHaveValue('')
    await expect(enviar(page)).toBeDisabled()

    // BD: versión 2 nueva, versión 1 intacta.
    const despues = await planesDe('terapeuta', pacienteId)
    expect(despues.map((p) => p.version)).toEqual([1, 2])
    expect(despues[0]).toEqual(base)
    const v2 = despues[1]!
    expect(v2.sesiones_por_semana).toBe(base.sesiones_por_semana + 1)
    expect(v2.umbral_dolor).toBe(base.umbral_dolor - 1)
    expect(v2.mensaje).toBe(MENSAJE)
    const caja2 = v2.items.find((i) => i.juego === 'caja-juguetes')!
    const movilidad2 = v2.items.find((i) => i.juego === 'movilidad-guiada')!
    expect(caja2.nivel).toBe(caja.nivel + 1)
    expect(caja2.metaAgarres).toBe(caja.metaAgarres + 1)
    expect(caja2.duracionMin).toBe(caja.duracionMin) // lo no editado se conserva
    expect(caja2.mano).toBe(caja.mano)
    expect(movilidad2.nivel).toBe(movilidad.nivel)
    expect(movilidad2.metaAgarres).toBe(movilidad.metaAgarres)
    expect(v2.items.every((i) => i.metaPinzaCm === meta + 0.5)).toBe(true)

    // Auditoría: antes y después del cambio.
    const sb = await clienteComo('terapeuta')
    const a = await sb.from('auditoria').select('accion, entidad, antes, despues').eq('paciente_id', pacienteId).eq('entidad', 'plan')
    expect(a.error).toBeNull()
    expect(a.data).toHaveLength(1)
    const fila = a.data![0] as { accion: string; antes: { version: number; sesionesPorSemana: number; umbralDolor: number }; despues: { version: number; sesionesPorSemana: number; umbralDolor: number; mensaje: string } }
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
      const aviso = page.getByRole('status', { name: 'Mensaje de tu terapeuta' })
      await expect(aviso).toBeVisible()
      await expect(aviso).toContainText(MENSAJE)

      // /historial: el cambio de plan, con lo que cambió.
      await page.goto('/historial')
      const fila = page.getByTestId('fila-plan').filter({ hasText: 'Plan actualizado' })
      await expect(fila).toHaveCount(1)
      await expect(fila).toContainText('por Klgo. Diego M.')
      await expect(fila).toContainText('Sesiones por semana 5 → 6')
      await fila.click()
      const detalle = page.getByRole('dialog', { name: 'Plan actualizado' })
      await expect(detalle).toContainText(/Caja de juguetes: Nivel \d → \d/)
      await expect(detalle).toContainText(/Meta de pinza 7 cm → 7,5 cm/) // con coma decimal (src/historial/filas.ts)
      await expect(detalle).toContainText(MENSAJE)
      await detalle.getByRole('button', { name: 'Cerrar' }).click()

      // Una sesión nueva se prepara con el nivel del plan nuevo y queda atada a la versión 2.
      const v2 = (await planesDe('prueba', pacienteId)).at(-1)!
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await page.getByRole('button', { name: 'Comenzar' }).click()
      await page.waitForURL(/\/sesion\/S-\d{8}-\d+\/calibrar/)
      nueva = page.url().match(/S-\d{8}-\d+/)![0]
      const sb = await clienteComo('prueba')
      const s = await sb.from('sesiones').select('id, plan_version, parametros').in('id', [antiguo, nueva])
      const porId = Object.fromEntries((s.data ?? []).map((x) => [x.id as string, x as { plan_version: number; parametros: { nivel: number; metaAgarres: number } }]))
      const caja2 = v2.items.find((i) => i.juego === 'caja-juguetes')!
      expect(porId[nueva]!.plan_version).toBe(2)
      expect(porId[nueva]!.parametros.nivel).toBe(caja2.nivel)
      expect(porId[nueva]!.parametros.metaAgarres).toBe(caja2.metaAgarres)
      expect(porId[antiguo]!.plan_version).toBe(1) // la sesión anterior sigue apuntando al plan con que se hizo
      expect((await planesDe('prueba', pacienteId))[0]!.version).toBe(1) // y la versión 1 sigue existiendo
    } finally {
      limpiarPrueba([antiguo, nueva])
    }
  })

  test('quitar un ejercicio y agregar otro crea la versión 3 con los ítems correctos', async ({ page, context }) => {
    await entrarComo(context, 'terapeuta')
    const v = vigilarErrores(page)
    const v2 = (await planesDe('terapeuta', pacienteId)).at(-1)!
    expect(v2.version).toBe(2)
    await page.goto(`/terapeuta/pacientes/${pacienteId}/plan`)
    await expect(page.getByTestId('version-plan')).toContainText('Versión 2 ·')

    await page.getByRole('button', { name: 'Quitar Movilidad guiada del plan' }).click()
    await page.getByLabel('Agregar un ejercicio').selectOption({ label: 'Pinza fina' })
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Quitar Caja de juguetes del plan' })).toBeEnabled()
    await enviar(page).click()
    const filas = hoja(page).getByTestId('cambio')
    await expect(filas).toHaveCount(2)
    await expect(filas.filter({ hasText: 'Movilidad guiada' })).toContainText('Se quita')
    await expect(filas.filter({ hasText: 'Pinza fina' })).toContainText('Se agrega: nivel 1, meta 10')
    await hoja(page).getByRole('button', { name: 'Confirmar y enviar' }).click()
    await expect(page.getByText('Plan actualizado', { exact: true })).toBeVisible()
    await expect(page.getByTestId('version-plan')).toContainText('Versión 3 ·')
    await expect(page.getByTestId('juego-movilidad-guiada')).toHaveCount(0)
    await expect(page.getByTestId('juego-pinza-fina')).toHaveAttribute('data-estado', 'igual')

    // BD: la versión 3 lleva Caja tal como estaba y Pinza fina con valores por defecto; la 2 no cambia.
    const todas = await planesDe('terapeuta', pacienteId)
    expect(todas.map((p) => p.version)).toEqual([1, 2, 3])
    expect(todas[1]).toEqual(v2)
    const v3 = todas[2]!
    const caja2 = v2.items.find((i) => i.juego === 'caja-juguetes')!
    expect(v3.items.map((i) => i.juego)).toEqual(['caja-juguetes', 'pinza-fina'])
    expect(v3.items[0]).toEqual(caja2)
    expect(v3.items[1]).toEqual({ juego: 'pinza-fina', nivel: 1, duracionMin: 5, mano: caja2.mano, metaAgarres: 10, metaPinzaCm: caja2.metaPinzaCm })
    expect(v3.sesiones_por_semana).toBe(v2.sesiones_por_semana)
    expect(v3.mensaje).toBeNull()
    v.sinErrores()
  })
})
