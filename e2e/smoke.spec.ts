// Humo del esqueleto (F02): todas las rutas cargan, protección por sesión y rol, barras y banner.
import { expect, test } from '@playwright/test'
import { entrarComo, vigilarErrores } from './ayudas.ts'

const S = 'S-20261121-01'

const RUTAS_PACIENTE: { ruta: string; titulo: string | RegExp; barra: boolean }[] = [
  { ruta: '/inicio', titulo: /^Hola/, barra: true },
  { ruta: '/ejercicios', titulo: 'Ejercicios', barra: true },
  { ruta: '/sesion/caja-juguetes/preparar', titulo: 'Caja de juguetes', barra: false },
  { ruta: `/sesion/${S}/calibrar`, titulo: 'Calibración', barra: false },
  { ruta: `/sesion/${S}/jugar`, titulo: 'Juego', barra: false },
  { ruta: `/sesion/${S}/sensacion`, titulo: '¿Cómo te sentiste?', barra: false },
  { ruta: `/sesion/${S}/resumen`, titulo: 'Resumen', barra: false },
  { ruta: '/progreso', titulo: 'Progreso', barra: true },
  { ruta: '/historial', titulo: 'Historial', barra: true },
  { ruta: `/historial/${S}`, titulo: 'Historial', barra: true },
  { ruta: '/perfil', titulo: 'Perfil', barra: true },
  { ruta: '/privacidad', titulo: 'Privacidad y datos', barra: false },
  { ruta: '/depuracion', titulo: 'Depuración', barra: false },
]

const RUTAS_TERAPEUTA: { ruta: string; titulo: string; barra: boolean }[] = [
  { ruta: '/terapeuta/pacientes', titulo: 'Mis pacientes', barra: true },
  { ruta: '/terapeuta/pacientes/cualquiera/plan', titulo: 'Plan del paciente', barra: false },
  { ruta: '/terapeuta/alertas', titulo: 'Alertas', barra: true },
  { ruta: '/terapeuta/planes', titulo: 'Planes', barra: true },
  { ruta: '/terapeuta/informes', titulo: 'Informes', barra: true },
  { ruta: `/historial/${S}`, titulo: 'Historial', barra: true },
  { ruta: '/depuracion', titulo: 'Depuración', barra: false },
]

const barraPaciente = (p: import('@playwright/test').Page) => p.getByRole('navigation', { name: 'Navegación principal' })
const barraTerapeuta = (p: import('@playwright/test').Page) => p.getByRole('navigation', { name: 'Navegación del terapeuta' })

test.describe('sin sesión', () => {
  test('/acceso carga sin errores de consola', async ({ page }) => {
    const v = vigilarErrores(page)
    await page.goto('/acceso')
    await expect(page.getByRole('heading', { name: 'Kuwü', level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('/ lleva a /acceso', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/acceso$/)
  })

  for (const ruta of new Set([...RUTAS_PACIENTE, ...RUTAS_TERAPEUTA].map((r) => r.ruta))) {
    test(`ruta protegida ${ruta} redirige a /acceso`, async ({ page }) => {
      const v = vigilarErrores(page)
      await page.goto(ruta)
      await expect(page).toHaveURL(/\/acceso$/)
      await expect(page.getByRole('heading', { name: 'Kuwü' })).toBeVisible()
      v.sinErrores()
    })
  }
})

test.describe('paciente', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'paciente'))

  test('todas las rutas del paciente cargan con su título, sin errores', async ({ page }) => {
    const v = vigilarErrores(page)
    for (const r of RUTAS_PACIENTE) {
      await page.goto(r.ruta)
      await expect(page, r.ruta).toHaveURL(new RegExp(r.ruta.replace(/[?]/g, '\\?') + '$'))
      await expect(page.getByRole('heading', { level: 1, name: r.titulo })).toBeVisible()
      await expect(barraPaciente(page), `barra en ${r.ruta}`).toHaveCount(r.barra ? 1 : 0)
      await expect(barraTerapeuta(page)).toHaveCount(0)
      // El banner de datos ficticios aparece en todo, salvo en el juego a pantalla completa.
      await expect(page.getByRole('note').filter({ hasText: 'Datos de demostración ficticios' }), `banner en ${r.ruta}`).toHaveCount(
        r.ruta.endsWith('/jugar') ? 0 : 1,
      )
    }
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('/ y /acceso llevan al inicio del paciente', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/inicio$/)
    await page.goto('/acceso')
    await expect(page).toHaveURL(/\/inicio$/)
    await page.goto('/no-existe')
    await expect(page).toHaveURL(/\/inicio$/)
  })

  test('no puede abrir rutas de terapeuta', async ({ page }) => {
    await page.goto('/terapeuta/pacientes')
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(page.getByText('Esa sección no está disponible para tu cuenta.')).toBeVisible()
  })

  test('la barra inferior navega entre pestañas', async ({ page }) => {
    await page.goto('/inicio')
    const barra = barraPaciente(page)
    await expect(barra.getByRole('link', { name: 'Inicio' })).toHaveClass(/active/)
    await barra.getByRole('link', { name: 'Progreso' }).click()
    await expect(page).toHaveURL(/\/progreso$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Progreso' })).toBeVisible()
    await expect(barra.getByRole('link', { name: 'Progreso' })).toHaveClass(/active/)
  })

  test('cerrar sesión vuelve a /acceso con aviso y protege de nuevo', async ({ page }) => {
    await page.goto('/perfil')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/acceso$/)
    await expect(page.getByText('Sesión cerrada')).toBeVisible()
    await page.goto('/inicio')
    await expect(page).toHaveURL(/\/acceso$/)
  })
})

test.describe('terapeuta', () => {
  test.beforeEach(async ({ context }) => entrarComo(context, 'terapeuta'))

  test('todas las rutas del terapeuta cargan con su título, sin errores', async ({ page }) => {
    const v = vigilarErrores(page)
    for (const r of RUTAS_TERAPEUTA) {
      await page.goto(r.ruta)
      await expect(page, r.ruta).toHaveURL(new RegExp(r.ruta + '$'))
      await expect(page.getByRole('heading', { level: 1, name: r.titulo })).toBeVisible()
      await expect(barraTerapeuta(page), `barra en ${r.ruta}`).toHaveCount(r.barra ? 1 : 0)
      await expect(barraPaciente(page)).toHaveCount(0)
    }
    await page.waitForLoadState('networkidle')
    v.sinErrores()
  })

  test('no puede abrir rutas de paciente', async ({ page }) => {
    for (const ruta of ['/inicio', `/sesion/${S}/jugar`, '/privacidad']) {
      await page.goto(ruta)
      await expect(page).toHaveURL(/\/terapeuta\/pacientes$/)
    }
  })

  test('/ lleva a mis pacientes', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/terapeuta\/pacientes$/)
  })
})
