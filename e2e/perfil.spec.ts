// F19 · Perfil del paciente. Lectura y validación con Carmen (no guarda nada); la EDICIÓN del largo de mano usa SOLO al
// paciente de prueba (prueba.demo@example.com) y en un `finally` restaura el valor original y borra las filas de
// auditoría que creó (scripts/prueba-largo-mano.ts → RPC restaurar_largo_mano_prueba, solo service_role). Mientras edita
// toma el candado del paciente de prueba (scripts/bloqueo-prueba.ts) para no cruzarse con privacidad ni prescripción.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { soltarBloqueo, tomarBloqueo } from '../scripts/bloqueo-prueba.ts'
import { restaurarLargoMano } from '../scripts/prueba-largo-mano.ts'

const coma = (n: number) => String(n).replace('.', ',')
/** Igual que num() de src/lib/formato.ts: un decimal con coma. */
const unDecimal = (n: number) => n.toFixed(1).replace('.', ',')
const fechaNumerica = (iso: string) => iso.slice(0, 10).split('-').reverse().join('-')
const caja = async (p: Page, selector: string) => (await p.locator(selector).first().boundingBox())!

type Ventana = { document: { documentElement: { scrollWidth: number; clientWidth: number } } }
const desborde = (p: Page) =>
  p.evaluate(() => {
    const e = (globalThis as unknown as Ventana).document.documentElement
    return e.scrollWidth - e.clientWidth
  })

test.describe('perfil · Carmen (solo lectura)', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('muestra la ficha tal como la registró el terapeuta, el largo de mano y la entrada a privacidad', async ({ page }) => {
    const v = vigilarErrores(page)
    const sb = await clienteComo('paciente')
    const { data: pac, error } = await sb.from('pacientes').select('id, terapeuta_id, mano_afectada, condicion, fecha_inicio, largo_mano_cm').single()
    if (error || !pac) throw new Error('sin paciente: ' + error?.message)
    const { data: ter } = await sb.from('perfiles').select('nombre').eq('id', pac.terapeuta_id).single()
    const { data: cli } = await sb.from('clinicas').select('nombre').single()

    await page.goto('/perfil')
    await expect(page.getByRole('heading', { level: 1, name: 'Perfil' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Carmen R.' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tus datos' }).getByText(cli!.nombre)).toBeVisible()
    await expect(page.getByText('En construcción')).toHaveCount(0)

    const ficha = page.getByRole('region', { name: 'Tu tratamiento' })
    await expect(ficha.locator('.perfil-dato', { hasText: 'Terapeuta' })).toContainText(ter!.nombre)
    await expect(ficha.locator('.perfil-dato', { hasText: 'Mano afectada' })).toContainText({ izquierda: 'Izquierda', derecha: 'Derecha', ambas: 'Ambas' }[pac.mano_afectada as string]!)
    if (pac.condicion) await expect(ficha.locator('.perfil-dato', { hasText: 'Condición' })).toContainText(pac.condicion)
    // Inicio del tratamiento (dd-mm-aaaa) + semana (≥ 1).
    const inicio = ficha.locator('.perfil-dato', { hasText: 'Inicio' })
    await expect(inicio).toContainText(fechaNumerica(pac.fecha_inicio))
    await expect(inicio).toContainText(/semana \d+/)

    // Largo de mano guardado: medida real con regla (coma decimal, sin «aprox.») y para qué sirve.
    const largo = page.getByRole('region', { name: 'Largo de mano' })
    await expect(largo.getByTestId('perfil-largo-guardado')).toHaveText(`${unDecimal(Number(pac.largo_mano_cm))} cm`)
    await expect(largo.getByLabel('Largo de mano en centímetros')).toHaveValue(coma(Number(pac.largo_mano_cm)))
    await expect(largo.getByRole('button', { name: 'Guardar largo de mano' })).toBeDisabled()
    await expect(largo).toContainText('desde el pliegue de la muñeca hasta la punta del dedo medio')
    await expect(largo).toContainText('escala')

    // Privacidad (con el estado del consentimiento) y versión.
    const enlace = page.getByRole('link', { name: /Privacidad y datos/ })
    await expect(enlace).toHaveAttribute('href', '/privacidad')
    await expect(enlace.getByTestId('perfil-consentimiento')).toHaveText('Consentimiento vigente')
    await expect(page.getByText(/versión \d+\.\d+\.\d+/)).toBeVisible()

    // Invariantes de contenido.
    await expect(page.locator('main')).not.toContainText(/fuerza|presión/i)
    v.sinErrores()
  })

  test('valida el largo (10–30 cm, coma o punto) y los pasos avanzan de a 0,5 sin guardar', async ({ page }) => {
    await page.goto('/perfil')
    const campo = page.getByLabel('Largo de mano en centímetros')
    const guardar = page.getByRole('button', { name: 'Guardar largo de mano' })
    const error = page.getByRole('region', { name: 'Largo de mano' }).getByRole('alert')
    await expect(campo).not.toHaveValue('')
    const original = await campo.inputValue()

    await campo.fill('9,5')
    await expect(error).toHaveText('El largo debe estar entre 10 y 30 cm.')
    await expect(campo).toHaveAttribute('aria-invalid', 'true')
    await expect(guardar).toBeDisabled()
    await campo.fill('31')
    await expect(guardar).toBeDisabled()
    await campo.fill('abc')
    await expect(error).toContainText('solo números')
    await expect(guardar).toBeDisabled()
    await campo.fill('')
    await expect(error).toHaveCount(0)
    await expect(guardar).toBeDisabled()

    await campo.fill('18')
    await expect(error).toHaveCount(0)
    await page.getByRole('button', { name: 'Subir largo de mano' }).click()
    await expect(campo).toHaveValue('18,5')
    await page.getByRole('button', { name: 'Bajar largo de mano' }).click()
    await page.getByRole('button', { name: 'Bajar largo de mano' }).click()
    await expect(campo).toHaveValue('17,5')
    await campo.fill('10')
    await expect(page.getByRole('button', { name: 'Bajar largo de mano' })).toBeDisabled()
    await campo.fill('30')
    await expect(page.getByRole('button', { name: 'Subir largo de mano' })).toBeDisabled()
    await expect(guardar).toBeEnabled() // 30 es válido (distinto de lo guardado); NO se guarda

    // Nada se guardó: recargar devuelve el valor original.
    await page.reload()
    await expect(campo).toHaveValue(original)
  })

  test('si el guardado falla, lo dice junto al campo y conserva lo escrito (sin tocar la base)', async ({ page }) => {
    let llamadas = 0
    await page.route('**/rest/v1/rpc/actualizar_largo_mano*', (ruta) => {
      llamadas++
      return ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
    })
    await page.goto('/perfil')
    const largo = page.getByRole('region', { name: 'Largo de mano' })
    const campo = page.getByLabel('Largo de mano en centímetros')
    await expect(campo).not.toHaveValue('')
    const antes = await largo.getByTestId('perfil-largo-guardado').innerText()
    await campo.fill('25')
    await page.getByRole('button', { name: 'Guardar largo de mano' }).click()
    await expect(largo.getByRole('alert')).toHaveText('No se pudo guardar el largo de tu mano. Intenta de nuevo.')
    expect(llamadas).toBe(1)
    await expect(campo).toHaveValue('25')
    await expect(largo.getByTestId('perfil-largo-guardado')).toHaveText(antes)
    await expect(page.getByRole('button', { name: 'Guardar largo de mano' })).toBeEnabled()
  })

  test('la entrada «Privacidad y datos» lleva a /privacidad y su botón volver regresa al perfil', async ({ page }) => {
    await page.goto('/perfil')
    await page.getByRole('link', { name: /Privacidad y datos/ }).click()
    await expect(page).toHaveURL(/\/privacidad$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Privacidad y datos' })).toBeVisible()
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(/\/perfil$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Perfil' })).toBeVisible()
  })

  test('estado de error con reintento y estado sin ficha (cerrar sesión siempre disponible)', async ({ page }) => {
    let falla = true
    await page.route('**/rest/v1/pacientes?*', (ruta) => (falla ? ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }) : ruta.continue()))
    await page.goto('/perfil')
    await expect(page.getByText('No pudimos cargar esto')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
    falla = false
    await page.getByRole('button', { name: /Reintentar/i }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Carmen R.' })).toBeVisible()

    await page.unroute('**/rest/v1/pacientes?*')
    await page.route('**/rest/v1/pacientes?*', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.reload()
    await expect(page.getByText('Tu ficha aún no está lista')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  })

  test('móvil 390×844 y escritorio 1440×900: sin desborde, zonas táctiles ≥ 48 px y dos columnas en escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/perfil')
    await expect(page.getByRole('heading', { level: 2, name: 'Carmen R.' })).toBeVisible()
    expect(await desborde(page)).toBeLessThanOrEqual(0)
    for (const s of ['.perfil-largo .boton-paso', '#perfil-largo', '.perfil-largo .boton.primario', 'a.perfil-enlace', '.perfil-salir']) {
      const c = await caja(page, s)
      expect(c.height, s).toBeGreaterThanOrEqual(48)
      expect(c.width, s).toBeGreaterThanOrEqual(48)
    }
    // Móvil: una columna (ficha, privacidad, largo de mano) y la entrada a Privacidad se ve sin desplazarse.
    const ficha = await caja(page, '.perfil-ficha')
    let largo = await caja(page, '.perfil-largo')
    let enlace = await caja(page, 'a.perfil-enlace')
    const barra = await caja(page, '.barra-inferior')
    expect(enlace.y).toBeGreaterThan(ficha.y + ficha.height - 1)
    expect(largo.y).toBeGreaterThan(enlace.y + enlace.height - 1)
    expect(enlace.y + enlace.height).toBeLessThanOrEqual(barra.y)

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.locator('.barra-logo img')).toBeVisible()
    expect(await desborde(page)).toBeLessThanOrEqual(0)
    const identidad = await caja(page, '.perfil-identidad')
    largo = await caja(page, '.perfil-largo')
    enlace = await caja(page, 'a.perfil-enlace')
    expect(largo.x).toBeGreaterThan(identidad.x + identidad.width)
    expect(Math.abs(largo.y - identidad.y)).toBeLessThan(2)
    expect(Math.abs(enlace.x - identidad.x)).toBeLessThan(2)
    // Todo lo importante cabe sin desplazarse en 900 px de alto.
    const salir = await caja(page, '.perfil-salir')
    expect(salir.y + salir.height).toBeLessThanOrEqual(900)
  })

  test('cerrar sesión vuelve a /acceso', async ({ page }) => {
    await page.goto('/perfil')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/acceso$/)
    await expect(page.getByText('Sesión cerrada')).toBeVisible()
  })
})

test.describe('perfil · paciente de prueba (edición del largo de mano)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

  test('el paciente guarda su largo de mano y queda auditado con antes/después', async ({ page }) => {
    test.setTimeout(180_000) // incluye la espera del candado si otro e2e está usando al paciente de prueba
    const v = vigilarErrores(page)
    const sb = await clienteComo('prueba')
    await tomarBloqueo(120_000)
    let pacienteId: string | null = null
    let original: number | null = null
    try {
      const { data: pac, error } = await sb.from('pacientes').select('id, largo_mano_cm').single()
      if (error || !pac) throw new Error('sin paciente de prueba: ' + error?.message)
      const id: string = pac.id
      original = pac.largo_mano_cm == null ? null : Number(pac.largo_mano_cm)
      pacienteId = id

      await page.goto('/perfil')
      await expect(page.getByRole('heading', { level: 2, name: 'Paciente de prueba' })).toBeVisible()
      const largo = page.getByRole('region', { name: 'Largo de mano' })
      const campo = page.getByLabel('Largo de mano en centímetros')
      const guardar = page.getByRole('button', { name: 'Guardar largo de mano' })

      await campo.fill('19,5')
      await expect(guardar).toBeEnabled()
      await guardar.click()
      await expect(page.getByText('Largo de mano guardado: 19,5 cm')).toBeVisible()
      await expect(guardar).toBeDisabled()
      await expect(largo.getByTestId('perfil-largo-guardado')).toHaveText('19,5 cm')
      await expect(campo).toHaveValue('19,5')

      const bd = await sb.from('pacientes').select('largo_mano_cm').eq('id', id).single()
      expect(Number(bd.data?.largo_mano_cm)).toBe(19.5)
      const aud = await sb.from('auditoria').select('accion, entidad, antes, despues').eq('paciente_id', id).eq('accion', 'largo_mano_actualizado')
      expect(aud.error).toBeNull()
      expect(aud.data).toContainEqual({
        accion: 'largo_mano_actualizado',
        entidad: 'paciente',
        antes: { largoManoCm: original },
        despues: { largoManoCm: 19.5 },
      })

      // Con los pasos: +0,5 y guardar (con Enter); la pantalla se mantiene tras recargar.
      await page.getByRole('button', { name: 'Subir largo de mano' }).click()
      await expect(campo).toHaveValue('20')
      await campo.press('Enter')
      await expect(page.getByText('Largo de mano guardado: 20,0 cm')).toBeVisible()
      await expect(largo.getByTestId('perfil-largo-guardado')).toHaveText('20,0 cm')
      await page.reload()
      await expect(campo).toHaveValue('20')

      // La RPC rechaza lo fuera de rango aunque se salte la validación de la pantalla.
      const fuera = await sb.rpc('actualizar_largo_mano', { p_cm: 31 })
      expect(fuera.error).not.toBeNull()
      const bajo = await sb.rpc('actualizar_largo_mano', { p_cm: 9.9 })
      expect(bajo.error).not.toBeNull()
      v.sinErrores()
    } finally {
      // Siempre: restaurar el valor original (y borrar la auditoría de la prueba) y soltar el candado.
      try {
        if (pacienteId) await restaurarLargoMano(original)
      } finally {
        soltarBloqueo()
      }
    }
    const fin = await sb.from('pacientes').select('largo_mano_cm').eq('id', pacienteId).single()
    expect(fin.data?.largo_mano_cm == null ? null : Number(fin.data.largo_mano_cm)).toBe(original)
    const resto = await sb.from('auditoria').select('id').eq('paciente_id', pacienteId).eq('accion', 'largo_mano_actualizado')
    expect(resto.data ?? []).toHaveLength(0)
  })

  test('un terapeuta no puede usar la RPC (solo pacientes)', async () => {
    const sb = await clienteComo('terapeuta')
    const r = await sb.rpc('actualizar_largo_mano', { p_cm: 18 })
    expect(r.error).not.toBeNull()
  })
})
