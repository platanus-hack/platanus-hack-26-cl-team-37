// F12 · Dolor y esfuerzo en /sesion/:id/sensacion.
// - Sesión falsa (PostgREST simulado, sin tocar la BD): no deja guardar sin EVA, botones − / + y deslizador, esfuerzo de
//   una sola opción, nota ≤ 280; guarda dolor/esfuerzo/nota (sin cambiar el estado) y va al resumen con el query;
//   bajo el umbral no hay alerta, sobre el umbral avisa al paciente y crea la alerta. Estados: no existe, cerrada,
//   preparada. Con CAPTURA_SENSACION=1 guarda docs/capturas/sensacion-llena.png (como la imagen 07) y sensacion-alerta.png.
// - Sesión REAL 'en curso': EVA = umbral del plan vigente crea UNA fila en alertas (guardar dos veces no la repite) y
//   la Sesion queda con dolor_eva, esfuerzo y nota, todavía 'en curso'. Se limpia con limpiar(desde, id) (borra también
//   sus alertas: limpiar_sesiones_prueba).
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { CALIBRACION, ID_FALSO, crearSesion, limpiar, parametros } from './juegos.ts'

type Escritura = { tabla: string; metodo: string; cuerpo: unknown }

/** Sesión falsa en el estado pedido + plan con umbral + alertas; devuelve las escrituras. */
async function falsa(page: Page, estado: string | null, umbral = 5, extra: Record<string, unknown> = {}): Promise<Escritura[]> {
  const escrituras: Escritura[] = []
  const pacienteId = '00000000-0000-0000-0000-000000000000'
  const fila = {
    id: ID_FALSO, paciente_id: pacienteId, plan_version: null, juego: 'caja-juguetes', parametros: parametros(5, 12), inicio: new Date().toISOString(),
    fin: new Date().toISOString(), estado, calibracion: CALIBRACION, metricas: { agarres: 12 }, muestras: null, dolor_eva: null, esfuerzo: null, nota: null,
    dispositivo: null, version_app: null, version_modelo: null, hash: null, creada: new Date().toISOString(), ...extra,
  }
  const plan = { id: 'p1', paciente_id: pacienteId, version: 3, vigente_desde: new Date().toISOString(), creado_por: null, autor: null, sesiones_por_semana: 5, umbral_dolor: umbral, mensaje: null, items: [] }
  await page.route('**/rest/v1/sesiones?*', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ json: estado ? [fila] : [] })
    escrituras.push({ tabla: 'sesiones', metodo: m, cuerpo: route.request().postDataJSON() })
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/rest/v1/planes?*', (route) => route.fulfill({ json: [plan] }))
  await page.route('**/rest/v1/alertas*', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ json: [] })
    escrituras.push({ tabla: 'alertas', metodo: m, cuerpo: route.request().postDataJSON() })
    return route.fulfill({ status: 201, body: '' })
  })
  return escrituras
}

const guardar = (p: Page) => p.getByRole('button', { name: 'Guardar y ver resumen' })
const eva = (p: Page) => p.getByTestId('eva')
const deslizador = (p: Page) => p.getByRole('slider', { name: /Dolor durante la sesión/ })
const aviso = (p: Page) => p.getByText('Tu terapeuta será avisado de este dolor al guardar.')

test.describe('Dolor y esfuerzo', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('no deja guardar sin EVA; − / + y deslizador; esfuerzo único; nota ≤ 280; guarda sin cerrar y sin alerta bajo el umbral', async ({ page }) => {
    const v = vigilarErrores(page)
    const escrituras = await falsa(page, 'en curso', 5)
    await page.goto(`/sesion/${ID_FALSO}/sensacion?fuente=sintetica`)
    await expect(page.getByRole('heading', { level: 1, name: '¡Sesión completada!' })).toBeVisible()
    await expect(page.getByText('Cuéntanos cómo te sentiste')).toBeVisible()
    for (const t of ['Sin dolor', 'Moderado', 'Máximo']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible()

    // Sin valor preseleccionado: no se puede guardar.
    await expect(eva(page)).toHaveText('–/10')
    await expect(deslizador(page)).toHaveAttribute('aria-valuetext', 'Sin marcar')
    await expect(guardar(page)).toBeDisabled()
    await expect(page.getByText('Marca tu dolor (toca la barra o +) para guardar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Menos dolor' })).toBeDisabled()

    // + empieza en 0 (Sin dolor); − queda deshabilitado en 0.
    await page.getByRole('button', { name: 'Más dolor' }).click()
    await expect(eva(page)).toHaveText('0/10')
    await expect(guardar(page)).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Menos dolor' })).toBeDisabled()
    await page.getByRole('button', { name: 'Más dolor' }).click()
    await page.getByRole('button', { name: 'Más dolor' }).click()
    await expect(eva(page)).toHaveText('2/10')
    await page.getByRole('button', { name: 'Menos dolor' }).click()
    await expect(eva(page)).toHaveText('1/10')
    // Deslizador.
    await deslizador(page).fill('4')
    await expect(eva(page)).toHaveText('4/10')
    await expect(deslizador(page)).toHaveAttribute('aria-valuetext', '4 de 10')
    await expect(aviso(page)).toHaveCount(0) // 4 < umbral 5
    await deslizador(page).fill('10')
    await expect(page.getByRole('button', { name: 'Más dolor' })).toBeDisabled()
    await expect(aviso(page)).toBeVisible()
    await deslizador(page).fill('2')
    await expect(aviso(page)).toHaveCount(0)

    // Esfuerzo: una sola opción (tocar de nuevo la quita).
    const op = (n: string) => page.getByRole('group', { name: 'Esfuerzo percibido' }).getByRole('button', { name: n, exact: true })
    await expect(page.getByRole('group', { name: 'Esfuerzo percibido' }).getByRole('button')).toHaveText(['Muy suave', 'Suave', 'Moderado', 'Fuerte', 'Muy fuerte'])
    await op('Fuerte').click()
    await op('Moderado').click()
    await expect(op('Moderado')).toHaveAttribute('aria-pressed', 'true')
    await expect(op('Fuerte')).toHaveAttribute('aria-pressed', 'false')
    await op('Moderado').click()
    await expect(page.getByRole('group', { name: 'Esfuerzo percibido' }).locator('[aria-pressed=true]')).toHaveCount(0)
    await op('Moderado').click()

    // Nota: máximo 280.
    const nota = page.getByRole('textbox', { name: 'Nota para tu terapeuta' })
    await nota.fill('x'.repeat(300))
    await expect(nota).toHaveValue('x'.repeat(280))
    await expect(page.getByTestId('contador-nota')).toHaveText('280/280')
    await nota.fill('  Molestia leve en el pulgar al final.')
    await expect(page.getByTestId('contador-nota')).toHaveText('38/280')

    if (process.env.CAPTURA_SENSACION) await page.screenshot({ path: 'docs/capturas/sensacion-llena.png' })

    await guardar(page).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/resumen\\?fuente=sintetica$`))
    expect(escrituras).toEqual([{ tabla: 'sesiones', metodo: 'PATCH', cuerpo: { dolor_eva: 2, esfuerzo: 'Moderado', nota: 'Molestia leve en el pulgar al final.' } }])
    v.sinErrores()
  })

  test('dolor sobre el umbral: avisa al paciente y crea la alerta; tocar la barra sin valor marca ese punto', async ({ page }) => {
    const escrituras = await falsa(page, 'en curso', 6)
    await page.goto(`/sesion/${ID_FALSO}/sensacion?fuente=grabacion`)
    await expect(guardar(page)).toBeDisabled()
    // Tocar justo el centro (donde está el punto invisible) también marca: 5.
    await deslizador(page).click()
    await expect(eva(page)).toHaveText('5/10')
    await expect(aviso(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Más dolor' }).click()
    await page.getByRole('button', { name: 'Más dolor' }).click()
    await expect(eva(page)).toHaveText('7/10')
    await expect(aviso(page)).toBeVisible()
    if (process.env.CAPTURA_SENSACION) await page.screenshot({ path: 'docs/capturas/sensacion-alerta.png' })
    await guardar(page).click()
    await expect(page.getByText('Avisamos a tu terapeuta de tu dolor.')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/sesion/${ID_FALSO}/resumen\\?fuente=grabacion$`))
    expect(escrituras).toEqual([
      { tabla: 'sesiones', metodo: 'PATCH', cuerpo: { dolor_eva: 7, esfuerzo: null, nota: null } },
      { tabla: 'alertas', metodo: 'POST', cuerpo: { paciente_id: '00000000-0000-0000-0000-000000000000', sesion_id: ID_FALSO, tipo: 'dolor', valor: 7 } },
    ])
  })

  test('estados: sesión inexistente, cerrada y sin jugar; al volver muestra lo ya guardado', async ({ page }) => {
    await falsa(page, null)
    await page.goto(`/sesion/${ID_FALSO}/sensacion`)
    await expect(page.getByRole('heading', { level: 1, name: '¿Cómo te sentiste?' })).toBeVisible()
    await expect(page.getByText('No encontramos esta sesión')).toBeVisible()
    await page.unrouteAll()

    await falsa(page, 'cerrada')
    await page.goto(`/sesion/${ID_FALSO}/sensacion?fuente=sintetica`)
    await expect(page.getByText('Esta sesión ya está cerrada')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver resumen' })).toHaveAttribute('href', `/sesion/${ID_FALSO}/resumen?fuente=sintetica`)
    await expect(guardar(page)).toHaveCount(0)
    await page.unrouteAll()

    await falsa(page, 'preparada')
    await page.goto(`/sesion/${ID_FALSO}/sensacion`)
    await expect(page.getByText('Esta sesión todavía no se juega')).toBeVisible()
    await page.unrouteAll()

    await falsa(page, 'en curso', 5, { dolor_eva: 3, esfuerzo: 'Suave', nota: 'Bien' })
    await page.goto(`/sesion/${ID_FALSO}/sensacion`)
    await expect(eva(page)).toHaveText('3/10')
    await expect(page.getByRole('button', { name: 'Suave', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('textbox', { name: 'Nota para tu terapeuta' })).toHaveValue('Bien')
    await expect(guardar(page)).toBeEnabled()
  })

  test('sesión real: EVA ≥ umbral del plan crea una fila en alertas (una sola) y guarda dolor/esfuerzo/nota sin cerrar', async ({ page }) => {
    test.setTimeout(60_000)
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      const sb = await clienteComo('paciente')
      id = await crearSesion('caja-juguetes', 5, 12, 2)
      const up = await sb.from('sesiones').update({ estado: 'en curso', inicio: new Date().toISOString(), fin: new Date().toISOString() }).eq('id', id)
      expect(up.error).toBeNull()
      const pac = await sb.from('pacientes').select('id').single()
      const plan = await sb.from('planes').select('umbral_dolor').eq('paciente_id', pac.data!.id).order('version', { ascending: false }).limit(1).single()
      const umbral = plan.data!.umbral_dolor as number

      const v = vigilarErrores(page)
      await page.goto(`/sesion/${id}/sensacion?fuente=sintetica`)
      await expect(page.getByRole('heading', { level: 1, name: '¡Sesión completada!' })).toBeVisible({ timeout: 15_000 })
      await expect(guardar(page)).toBeDisabled()
      await deslizador(page).fill(String(umbral - 1))
      await expect(aviso(page)).toHaveCount(0)
      await deslizador(page).fill(String(umbral))
      await expect(aviso(page)).toBeVisible()
      await page.getByRole('button', { name: 'Fuerte', exact: true }).click()
      await page.getByRole('textbox', { name: 'Nota para tu terapeuta' }).fill('Dolor en la muñeca al final (prueba e2e).')
      await guardar(page).click()
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/resumen\\?fuente=sintetica$`))

      const s = await sb.from('sesiones').select('estado, dolor_eva, esfuerzo, nota, hash').eq('id', id).single()
      expect(s.data).toEqual({ estado: 'en curso', dolor_eva: umbral, esfuerzo: 'Fuerte', nota: 'Dolor en la muñeca al final (prueba e2e).', hash: null })
      const a1 = await sb.from('alertas').select('tipo, valor, estado').eq('sesion_id', id)
      expect(a1.data).toEqual([{ tipo: 'dolor', valor: umbral, estado: 'abierta' }])

      // Vuelve atrás y guarda de nuevo: se ve lo guardado y la alerta no se repite.
      await page.goto(`/sesion/${id}/sensacion?fuente=sintetica`)
      await expect(eva(page)).toHaveText(`${umbral}/10`)
      await guardar(page).click()
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/resumen\\?fuente=sintetica$`))
      const a2 = await sb.from('alertas').select('id').eq('sesion_id', id)
      expect(a2.data).toHaveLength(1)
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
    // La limpieza borró la sesión y su alerta.
    const sb = await clienteComo('paciente')
    expect((await sb.from('alertas').select('id').eq('sesion_id', id)).data).toEqual([])
  })
})
