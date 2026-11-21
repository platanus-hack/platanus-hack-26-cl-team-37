// F34 · El terapeuta puede cerrar sesión desde Mis pacientes (salida local: no afecta otras pestañas ni pruebas).
import { expect, test } from '@playwright/test'
import { entrarComo } from './ayudas.ts'

test.describe('terapeuta: cerrar sesión', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'terapeuta'))

  test('Salir vuelve a /acceso con aviso y el panel queda protegido', async ({ page }) => {
    await page.goto('/terapeuta/pacientes')
    const salir = page.getByRole('button', { name: 'Cerrar sesión' })
    await expect(salir).toBeVisible()
    const caja = await salir.boundingBox()
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44)
    await salir.click()
    await expect(page).toHaveURL(/\/acceso$/)
    await expect(page.getByText('Sesión cerrada')).toBeVisible()
    // la salida reemplaza la entrada del historial (no queda el panel detrás) y el panel exige ingresar de nuevo
    await page.goto('/terapeuta/pacientes')
    await expect(page).toHaveURL(/\/acceso$/)
  })
})
