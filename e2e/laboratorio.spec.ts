// Laboratorio de banda (/laboratorio): carga estimada de una banda elástica, con manos simuladas. Público, sin sesión.
// El guion `banda` sostiene la banda 2,5 s en reposo, la estira en 1,2 s, la mantiene 0,6 s y vuelve (ciclo de 6,5 s).
import { expect, test, type Page } from '@playwright/test'
import { vigilarErrores } from './ayudas.ts'

const URL_SIMULADA = '/laboratorio?fuente=sintetica&guion=banda-lab'
const texto = (page: Page, id: string) => page.getByTestId(id)

test.beforeEach(async ({ page }) => {
  // Cada prueba parte sin preferencias guardadas (curva, tiras, meta, calibración).
  await page.addInitScript(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('manoviva.laboratorio.')) localStorage.removeItem(k)
  })
})

test('marca el reposo, mide el estiramiento y cuenta repeticiones', async ({ page }) => {
  test.setTimeout(45_000)
  const v = vigilarErrores(page)
  await page.goto(URL_SIMULADA)
  await expect(page.getByRole('heading', { name: 'Laboratorio de banda', level: 1 })).toBeVisible()
  await expect(texto(page, 'largo')).toHaveText(/\d+ cm/)

  // Con la banda quieta el reposo se marca solo (las manos están ocupadas con la banda).
  await expect(texto(page, 'reposo')).toHaveText(/\d+ cm/, { timeout: 10_000 })
  await expect(texto(page, 'indicacion')).toHaveText(/Estira despacio/)
  await expect(page.getByRole('button', { name: 'Poner en cero' })).toBeVisible()

  // Una ida y vuelta completa cuenta una repetición, con un pico de carga sobre cero.
  await expect(texto(page, 'repeticiones')).toHaveText('1', { timeout: 12_000 })
  await expect(page.locator('.lab-picos li')).toHaveCount(1)
  await expect(page.getByRole('listitem').filter({ hasText: 'Estira y vuelve' })).toHaveAttribute('data-estado', 'hecho')

  // La interfaz habla de la carga de la banda, nunca de la persona.
  await expect(page.locator('body')).not.toContainText(/fuerza|presión/i)
  v.sinErrores()
})

test('«Poner en cero» fija el reposo al instante', async ({ page }) => {
  await page.goto(URL_SIMULADA)
  await expect(texto(page, 'reposo')).toHaveText(/\d+ cm/, { timeout: 10_000 })
  // En reposo el estiramiento informa 0 (zona muerta), no décimas de temblor.
  await expect(texto(page, 'estiramiento')).toHaveText('0 %', { timeout: 8_000 })
  await page.getByRole('button', { name: 'Poner en cero' }).click()
  await expect(page.getByRole('button', { name: 'Poner en cero' })).toBeVisible({ timeout: 3_000 })
  await expect(texto(page, 'reposo')).toHaveText(/\d+ cm/)
})

test('las tiras escalan la curva y la meta se marca en las repeticiones', async ({ page }) => {
  await page.goto(URL_SIMULADA)
  const curva = page.getByRole('img', { name: /Curva de Corength 5 kg/ })
  await expect(curva).toHaveAttribute('aria-label', /hasta 8,8 kilos/)
  // El envase mide el lazo entero (2 tiras): con una sola tira la misma curva da la mitad.
  await page.getByRole('group', { name: 'Tiras entre las manos' }).getByRole('button', { name: '1 tira' }).click()
  await expect(curva).toHaveAttribute('aria-label', /hasta 4,4 kilos/)
  // La banda doblada otra vez (4 tiras): el doble que el lazo entero.
  await page.getByRole('group', { name: 'Tiras entre las manos' }).getByRole('button', { name: '4 tiras' }).click()
  await expect(curva).toHaveAttribute('aria-label', /hasta 17,5 kilos/)

  const subir = page.getByRole('button', { name: 'Subir la meta por repetición' })
  for (let i = 0; i < 4; i++) await subir.click()
  await expect(page.getByRole('group', { name: 'la meta por repetición' })).toContainText('2,0 kg')
  await expect(page.getByRole('img', { name: /meta 2,0 kilos/ })).toBeVisible()
})

test('graba la prueba (solo puntos) y la repite sin cámara', async ({ page }) => {
  await page.goto(URL_SIMULADA)
  const grabar = page.getByRole('button', { name: 'Grabar prueba' })
  await grabar.click()
  await expect(texto(page, 'grabando')).toHaveText(/Grabando 0:0[1-9]/, { timeout: 5_000 })
  await page.getByRole('button', { name: 'Detener' }).click()

  const repetir = page.getByRole('button', { name: /Repetir \(\d+ s\)/ })
  await expect(repetir).toBeVisible()
  await repetir.click()
  await expect(page).toHaveURL(/fuente=grabacion/)
  await expect(page.locator('.lab-chip').first()).toHaveText('Grabación')
  await expect(texto(page, 'largo')).toHaveText(/\d+ cm/)
  await expect(texto(page, 'indicacion')).not.toHaveText(/No se pudo abrir/)
})

test('la calibración con pesos crea la curva propia', async ({ page }) => {
  await page.goto(URL_SIMULADA)
  await page.getByText('Calibrar mi banda con pesos').click()
  await page.getByLabel('Largo sin peso (cm)').fill('52')
  await page.getByLabel('Peso 1, en kilos').fill('1')
  await page.getByLabel('Largo con el peso 1, en centímetros').fill('60,5')
  await page.getByLabel('Peso 2, en kilos').fill('2')
  await page.getByLabel('Largo con el peso 2, en centímetros').fill('74')
  await page.getByLabel('Peso 3, en kilos').fill('3')
  await page.getByLabel('Largo con el peso 3, en centímetros').fill('50')
  await expect(page.getByText('La medida 3 es más corta que el reposo.')).toBeVisible()
  await page.getByLabel('Largo con el peso 3, en centímetros').fill('92')
  await expect(page.getByText('La medida 3 es más corta que el reposo.')).toBeHidden()

  await page.getByRole('button', { name: 'Usar mi calibración' }).click()
  await expect(page.getByLabel('Curva que se usa')).toHaveValue('propia')
  await expect(page.getByText('Calibrada con 3 pesos colgados, en 2 tiras.')).toBeVisible()
})
