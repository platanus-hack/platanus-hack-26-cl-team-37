// F19 · Perfil del paciente. Lectura y validación con Carmen (no guarda nada); la EDICIÓN del largo de mano usa SOLO al
// paciente de prueba (prueba.demo@example.com) y en un `finally` restaura el valor original y borra las filas de
// auditoría que creó (scripts/prueba-largo-mano.ts → RPC restaurar_largo_mano_prueba, solo service_role).
import { expect, test } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { restaurarLargoMano } from '../scripts/prueba-largo-mano.ts'

const coma = (n: number) => String(n).replace('.', ',')

test.describe('perfil · Carmen (solo lectura)', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('muestra la ficha tal como la registró el terapeuta, versión y estado del consentimiento', async ({ page }) => {
    const v = vigilarErrores(page)
    const sb = await clienteComo('paciente')
    const { data: pac, error } = await sb.from('pacientes').select('id, terapeuta_id, mano_afectada, condicion, fecha_inicio, largo_mano_cm').single()
    if (error || !pac) throw new Error('sin paciente: ' + error?.message)
    const { data: ter } = await sb.from('perfiles').select('nombre').eq('id', pac.terapeuta_id).single()
    const { data: cli } = await sb.from('clinicas').select('nombre').single()

    await page.goto('/perfil')
    await expect(page.getByRole('heading', { level: 1, name: 'Perfil' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Carmen R.' })).toBeVisible()
    await expect(page.getByText(cli!.nombre)).toBeVisible()

    const ficha = page.getByRole('region', { name: 'Tu tratamiento' })
    await expect(ficha.getByText(ter!.nombre, { exact: false })).toBeVisible()
    await expect(ficha.getByText({ izquierda: 'Izquierda', derecha: 'Derecha', ambas: 'Ambas' }[pac.mano_afectada as string]!, { exact: true })).toBeVisible()
    if (pac.condicion) await expect(ficha.getByText(pac.condicion)).toBeVisible()
    // Inicio del tratamiento + semana (≥ 1).
    const inicio = ficha.locator('.perfil-dato', { hasText: 'Inicio del tratamiento' })
    await expect(inicio).toContainText(String(pac.fecha_inicio.slice(0, 4)))
    await expect(ficha.locator('.perfil-dato', { hasText: 'Semana de tratamiento' })).toContainText(/Semana \d+/)

    // Largo de mano guardado (coma decimal).
    const largo = page.getByRole('region', { name: 'Largo de mano' })
    await expect(largo.getByLabel('Largo de mano en centímetros')).toHaveValue(coma(Number(pac.largo_mano_cm)))
    await expect(largo.getByRole('button', { name: 'Guardar largo de mano' })).toBeDisabled()

    // Consentimiento y versión.
    await expect(page.getByRole('link', { name: /Privacidad y datos/ })).toContainText('Vigente')
    await expect(page.getByText(/versión \d+\.\d+\.\d+/)).toBeVisible()
    v.sinErrores()
  })

  test('valida el largo (10–30 cm, coma o punto) y el stepper avanza de a 0,5 sin guardar', async ({ page }) => {
    await page.goto('/perfil')
    const campo = page.getByLabel('Largo de mano en centímetros')
    const guardar = page.getByRole('button', { name: 'Guardar largo de mano' })
    const original = await campo.inputValue()

    await campo.fill('9,5')
    await expect(page.getByRole('alert')).toHaveText('El largo debe estar entre 10 y 30 cm.')
    await expect(guardar).toBeDisabled()
    await campo.fill('31')
    await expect(guardar).toBeDisabled()
    await campo.fill('abc')
    await expect(page.getByRole('alert')).toContainText('solo números')
    await expect(guardar).toBeDisabled()
    await campo.fill('')
    await expect(guardar).toBeDisabled()

    await campo.fill('18')
    await expect(page.getByRole('alert')).toHaveCount(0)
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

  test('el enlace lleva a /privacidad', async ({ page }) => {
    await page.goto('/perfil')
    await page.getByRole('link', { name: /Privacidad y datos/ }).click()
    await expect(page).toHaveURL(/\/privacidad$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Privacidad y datos' })).toBeVisible()
  })

  test('estado de error con reintento y estado sin ficha', async ({ page }) => {
    let falla = true
    await page.route('**/rest/v1/pacientes?*', (ruta) => (falla ? ruta.fulfill({ status: 500, json: { message: 'boom' } }) : ruta.continue()))
    await page.goto('/perfil')
    await expect(page.getByText('No pudimos cargar esto')).toBeVisible()
    falla = false
    await page.getByRole('button', { name: /Reintentar/i }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Carmen R.' })).toBeVisible()

    await page.unroute('**/rest/v1/pacientes?*')
    await page.route('**/rest/v1/pacientes?*', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.reload()
    await expect(page.getByText('Tu ficha aún no está lista')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  })

  test('cerrar sesión vuelve a /acceso', async ({ page }) => {
    await page.goto('/perfil')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/acceso$/)
  })
})

test.describe('perfil · paciente de prueba (edición del largo de mano)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

  test('el paciente guarda su largo de mano y queda auditado con antes/después', async ({ page }) => {
    const v = vigilarErrores(page)
    const sb = await clienteComo('prueba')
    const { data: pac, error } = await sb.from('pacientes').select('id, largo_mano_cm').single()
    if (error || !pac) throw new Error('sin paciente de prueba: ' + error?.message)
    const original = pac.largo_mano_cm == null ? null : Number(pac.largo_mano_cm)
    try {
      await page.goto('/perfil')
      await expect(page.getByRole('heading', { level: 2, name: 'Paciente de prueba' })).toBeVisible()
      const campo = page.getByLabel('Largo de mano en centímetros')
      const guardar = page.getByRole('button', { name: 'Guardar largo de mano' })

      await campo.fill('19,5')
      await expect(guardar).toBeEnabled()
      await guardar.click()
      await expect(page.getByText('Largo de mano guardado: 19,5 cm')).toBeVisible()
      await expect(guardar).toBeDisabled()
      await expect(page.getByRole('region', { name: 'Largo de mano' }).locator('.insignia')).toHaveText('19,5 cm')

      const bd = await sb.from('pacientes').select('largo_mano_cm').eq('id', pac.id).single()
      expect(Number(bd.data?.largo_mano_cm)).toBe(19.5)
      const aud = await sb.from('auditoria').select('accion, entidad, antes, despues').eq('paciente_id', pac.id).eq('accion', 'largo_mano_actualizado')
      expect(aud.error).toBeNull()
      expect(aud.data).toContainEqual({
        accion: 'largo_mano_actualizado',
        entidad: 'paciente',
        antes: { largoManoCm: original },
        despues: { largoManoCm: 19.5 },
      })

      // Con el stepper: +0,5 y guardar; la pantalla se mantiene tras recargar.
      await page.getByRole('button', { name: 'Subir largo de mano' }).click()
      await expect(campo).toHaveValue('20')
      await guardar.click()
      await expect(page.getByText('Largo de mano guardado: 20,0 cm')).toBeVisible()
      await page.reload()
      await expect(campo).toHaveValue('20')

      // La RPC rechaza lo fuera de rango aunque se salte la validación de la pantalla.
      const fuera = await sb.rpc('actualizar_largo_mano', { p_cm: 31 })
      expect(fuera.error).not.toBeNull()
      const bajo = await sb.rpc('actualizar_largo_mano', { p_cm: 9.9 })
      expect(bajo.error).not.toBeNull()
      v.sinErrores()
    } finally {
      await restaurarLargoMano(original)
    }
    const fin = await sb.from('pacientes').select('largo_mano_cm').eq('id', pac.id).single()
    expect(fin.data?.largo_mano_cm == null ? null : Number(fin.data.largo_mano_cm)).toBe(original)
    const resto = await sb.from('auditoria').select('id').eq('paciente_id', pac.id).eq('accion', 'largo_mano_actualizado')
    expect(resto.data ?? []).toHaveLength(0)
  })

  test('un terapeuta no puede usar la RPC (solo pacientes)', async () => {
    const sb = await clienteComo('terapeuta')
    const r = await sb.rpc('actualizar_largo_mano', { p_cm: 18 })
    expect(r.error).not.toBeNull()
  })
})
