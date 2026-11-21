// F03 · Acceso y roles: ingreso real por la pantalla /acceso (Supabase Auth con las cuentas demo ficticias).
import { expect, test, type Page } from '@playwright/test'
import { CLAVE_DEMO, CUENTAS, vigilarErrores } from './ayudas.ts'

const campoCodigo = (p: Page) => p.getByLabel('Código de la clínica')
const botonIngresar = (p: Page) => p.getByRole('button', { name: 'Ingresar', exact: true })

async function llenar(p: Page, d: { rol: 'paciente' | 'terapeuta'; codigo: string; email: string; clave: string }) {
  await p.getByRole('radio', { name: d.rol === 'paciente' ? /Soy paciente/ : /Soy terapeuta/ }).click()
  await campoCodigo(p).fill(d.codigo)
  await p.getByLabel('Correo').fill(d.email)
  await p.getByLabel('Contraseña').fill(d.clave)
}

test.describe('pantalla de acceso', () => {
  test('muestra logo, lema, roles, aviso demo e Ingresar deshabilitado hasta tener datos válidos', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/acceso')
    await expect(page.getByRole('heading', { level: 1, name: 'Kuwü' })).toBeVisible()
    await expect(page.getByText('Rehabilitación que se juega')).toBeVisible()
    await expect(page.getByText('Datos de demostración ficticios')).toBeVisible()
    await expect(page.getByText('Tu terapeuta te entrega este código')).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(2)
    await expect(botonIngresar(page)).toBeDisabled()

    // Solo un rol activo a la vez.
    await page.getByRole('radio', { name: /Soy paciente/ }).click()
    await expect(page.getByRole('radio', { name: /Soy paciente/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('radio', { name: /Soy terapeuta/ }).click()
    await expect(page.getByRole('radio', { name: /Soy paciente/ })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('radio', { name: /Soy terapeuta/ })).toHaveAttribute('aria-checked', 'true')

    await campoCodigo(page).fill('crm4821')
    await expect(campoCodigo(page)).toHaveValue('CRM-4821')
    await expect(botonIngresar(page)).toBeDisabled() // falta correo y contraseña
    await page.getByLabel('Correo').fill('alguien@example.com')
    await page.getByLabel('Contraseña').fill('x')
    await expect(botonIngresar(page)).toBeEnabled()
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('código mal formado muestra error claro en vivo y bloquea Ingresar', async ({ page }) => {
    await page.goto('/acceso')
    await llenar(page, { rol: 'paciente', codigo: 'ABC-12', email: CUENTAS.paciente, clave: CLAVE_DEMO })
    await expect(page.getByRole('alert')).toContainText('CRM-0000')
    await expect(campoCodigo(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(botonIngresar(page)).toBeDisabled()

    // Incompleto: avisa al salir del campo.
    await campoCodigo(page).fill('CRM-48')
    await page.getByLabel('Correo').focus()
    await expect(page.getByRole('alert')).toContainText('4 números')
    await expect(botonIngresar(page)).toBeDisabled()

    await campoCodigo(page).fill('CRM-4821')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(botonIngresar(page)).toBeEnabled()
  })

  test('código de otra clínica o rol equivocado muestra error y no entra', async ({ page }) => {
    await page.goto('/acceso')
    await llenar(page, { rol: 'paciente', codigo: 'CRM-9999', email: CUENTAS.paciente, clave: CLAVE_DEMO })
    await botonIngresar(page).click()
    await expect(page.getByRole('alert')).toContainText('no pertenece a esa clínica')
    await expect(page).toHaveURL(/\/acceso$/)

    // Cuenta de paciente con el rol de terapeuta.
    await page.getByRole('radio', { name: /Soy terapeuta/ }).click()
    await campoCodigo(page).fill('CRM-4821')
    await botonIngresar(page).click()
    await expect(page.getByRole('alert')).toContainText('no es de terapeuta')
    await expect(page).toHaveURL(/\/acceso$/)

    // La sesión fallida no quedó abierta.
    await page.goto('/inicio')
    await expect(page).toHaveURL(/\/acceso$/)
  })

  test('contraseña incorrecta muestra error', async ({ page }) => {
    await page.goto('/acceso')
    await llenar(page, { rol: 'paciente', codigo: 'CRM-4821', email: CUENTAS.paciente, clave: 'otra-clave' })
    await botonIngresar(page).click()
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos')
    await expect(page).toHaveURL(/\/acceso$/)
  })
})

test.describe('ingreso por rol', () => {
  test('paciente entra con el formulario, recarga y sigue dentro; no abre rutas de terapeuta', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/acceso')
    await llenar(page, { rol: 'paciente', codigo: 'CRM-4821', email: CUENTAS.paciente, clave: CLAVE_DEMO })
    await botonIngresar(page).click()
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()

    for (const ruta of ['/terapeuta/pacientes', '/terapeuta/alertas', '/terapeuta/planes', '/terapeuta/informes']) {
      await page.goto(ruta)
      await expect(page, ruta).toHaveURL(/\/inicio$/)
    }
    await expect(page.getByText('Esa sección no está disponible para tu cuenta.')).toBeVisible()

    // Con sesión abierta, /acceso lleva al inicio del rol.
    await page.goto('/acceso')
    await expect(page).toHaveURL(/\/inicio$/)
    v.sinErrores()
  })

  test('terapeuta entra con la cuenta demo, recarga y sigue dentro; no abre rutas de paciente', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/acceso')
    await page.getByRole('radio', { name: /Soy terapeuta/ }).click()
    await page.getByRole('button', { name: 'Entrar con cuenta demo' }).click()
    await expect(page).toHaveURL(/\/terapeuta\/pacientes$/)
    await expect(page.getByRole('navigation', { name: 'Navegación del terapeuta' })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/terapeuta\/pacientes$/)
    await expect(page.getByRole('navigation', { name: 'Navegación del terapeuta' })).toBeVisible()

    for (const ruta of ['/inicio', '/ejercicios', '/progreso', '/perfil']) {
      await page.goto(ruta)
      await expect(page, ruta).toHaveURL(/\/terapeuta\/pacientes$/)
    }
    await expect(page.getByText('Esa sección no está disponible para tu cuenta.')).toBeVisible()
    v.sinErrores()
  })

  test('cuenta demo sin rol elegido entra como paciente', async ({ page }) => {
    await page.goto('/acceso')
    await page.getByRole('button', { name: 'Entrar con cuenta demo' }).click()
    await expect(page).toHaveURL(/\/inicio$/)
  })
})
