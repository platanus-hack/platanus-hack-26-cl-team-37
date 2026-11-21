// F18 · Privacidad y datos: interruptores, consentimiento obligatorio antes de la primera sesión, descarga JSON/CSV y
// eliminación con doble confirmación. SOLO con el paciente de prueba (prueba.demo@example.com): nunca toca a Carmen,
// Luis, Marta ni Jorge. Estas pruebas cambian su consentimiento / ajustes / datos, así que van en serie y al final
// (y antes de empezar) lo devuelven al estado del seed con scripts/prueba-privacidad.ts (service_role).
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { crearSesion, limpiarPrueba } from './juegos.ts'
import { restaurarPrueba, sinConsentimiento } from '../scripts/prueba-privacidad.ts'

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => restaurarPrueba())
test.afterAll(async () => restaurarPrueba())
test.beforeEach(async ({ context }) => entrarComo(context, 'prueba'))

const interruptor = (p: Page, nombre: string) => p.getByRole('switch', { name: nombre })

async function bd() {
  const sb = await clienteComo('prueba')
  const { data: pac, error } = await sb.from('pacientes').select('id, compartir_metricas, datos_investigacion').single()
  if (error || !pac) throw new Error('sin paciente de prueba: ' + error?.message)
  const acciones = async () => {
    const r = await sb.from('auditoria').select('accion, entidad, despues').eq('paciente_id', pac.id).order('id')
    if (r.error) throw new Error(r.error.message)
    return r.data as { accion: string; entidad: string; despues: Record<string, unknown> | null }[]
  }
  const conteo = async (tabla: 'planes' | 'consentimientos' | 'sesiones') => {
    const r = await sb.from(tabla).select('id', { count: 'exact', head: true }).eq('paciente_id', pac.id)
    if (r.error) throw new Error(r.error.message)
    return r.count ?? 0
  }
  const ajustes = async () => {
    const r = await sb.from('pacientes').select('compartir_metricas, datos_investigacion').eq('id', pac.id).single()
    return r.data as { compartir_metricas: boolean; datos_investigacion: boolean }
  }
  return { sb, pacienteId: pac.id as string, acciones, conteo, ajustes }
}

test.describe('privacidad y datos', () => {
  test('muestra la tarjeta, los 4 interruptores y el consentimiento vigente', async ({ page }) => {
    const v = vigilarErrores(page)
    const { sb, pacienteId } = await bd()
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacidad y datos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tu video no se guarda' })).toBeVisible()
    await expect(page.getByText('La cámara se analiza en tu teléfono. Solo se guardan los puntos de la mano y tus resultados.')).toBeVisible()

    // Analizar en el dispositivo: siempre activo y bloqueado. Guardar video: apagado y no disponible.
    await expect(interruptor(page, 'Analizar en el dispositivo')).toBeChecked()
    await expect(interruptor(page, 'Analizar en el dispositivo')).toBeDisabled()
    await expect(page.getByText('Siempre activo')).toBeVisible()
    await expect(interruptor(page, 'Guardar video de la sesión')).not.toBeChecked()
    await expect(interruptor(page, 'Guardar video de la sesión')).toBeDisabled()
    await expect(page.getByText('Desactivado')).toBeVisible()
    // Investigación: apagado por defecto y opcional.
    await expect(interruptor(page, 'Datos anónimos para investigación')).not.toBeChecked()
    await expect(page.getByText('Opcional')).toBeVisible()
    await expect(page.getByText('Klgo. Diego M.')).toBeVisible()

    // Consentimiento: versión y fecha de firma salen de la BD.
    const c = await sb.from('consentimientos').select('version, firmado_el').eq('paciente_id', pacienteId).order('firmado_el', { ascending: false }).limit(1).single()
    const d = new Date(c.data!.firmado_el)
    const fecha = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
    await expect(page.getByRole('button', { name: /Consentimiento informado/ })).toContainText(`Firmado el ${fecha}`)
    await expect(page.getByRole('button', { name: /Consentimiento informado/ })).toContainText('Vigente')
    await page.getByRole('button', { name: /Consentimiento informado/ }).click()
    const hoja = page.getByRole('dialog', { name: 'Consentimiento informado' })
    await expect(hoja).toContainText('TEXTO PROVISORIO') // el texto sale de src/legal/consentimiento-v1.md
    await expect(hoja).toContainText(`Versión ${c.data!.version}`)
    await expect(hoja.getByRole('button', { name: 'Firmar consentimiento' })).toHaveCount(0) // ya vigente
    await hoja.getByRole('button', { name: 'Cerrar' }).click()
    // Nada de "fuerza" ni "presión" en la pantalla.
    await expect(page.locator('main')).not.toContainText(/fuerza|presi[oó]n/i)
    v.sinErrores()
  })

  test('compartir con el terapeuta e investigación: cambian en la BD y quedan en Auditoría', async ({ page }) => {
    const { pacienteId, acciones, ajustes } = await bd()
    await page.goto('/privacidad')
    const compartir = interruptor(page, 'Compartir métricas con mi terapeuta')
    const inv = interruptor(page, 'Datos anónimos para investigación')
    await expect(compartir).not.toBeChecked() // el paciente de prueba no comparte (así el terapeuta no lo ve)
    try {
      await compartir.click({ force: true })
      await expect(compartir).toBeChecked()
      await expect.poll(async () => (await ajustes()).compartir_metricas).toBe(true)
      await inv.click({ force: true })
      await expect(inv).toBeChecked()
      await expect.poll(async () => (await ajustes()).datos_investigacion).toBe(true)
      await compartir.click({ force: true }) // el paciente puede apagarlo
      await expect(compartir).not.toBeChecked()
      await expect.poll(async () => (await ajustes()).compartir_metricas).toBe(false)
      await inv.click({ force: true })
      await expect(inv).not.toBeChecked()
      await expect.poll(async () => (await ajustes()).datos_investigacion).toBe(false)

      const privacidad = (await acciones()).filter((a) => a.accion === 'privacidad_actualizada')
      expect(privacidad.map((a) => a.despues)).toEqual([
        { compartirMetricas: true, datosInvestigacion: false },
        { compartirMetricas: true, datosInvestigacion: true },
        { compartirMetricas: false, datosInvestigacion: true },
        { compartirMetricas: false, datosInvestigacion: false },
      ])
      expect(pacienteId).toBeTruthy()
    } finally {
      await restaurarPrueba()
    }
  })

  test('sin consentimiento no hay primera sesión: se firma en /privacidad y vuelve a preparar', async ({ page }) => {
    const { conteo, acciones, sb, pacienteId } = await bd()
    try {
      await sinConsentimiento()
      expect(await conteo('consentimientos')).toBe(0)
      await page.goto('/sesion/caja-juguetes/preparar?fuente=sintetica')
      await expect(page).toHaveURL(/\/privacidad$/)
      await expect(page.getByRole('button', { name: /Consentimiento informado/ })).toContainText('Pendiente')
      // Al venir de una sesión, el texto se abre solo; no se puede firmar sin marcar que se leyó.
      const hoja = page.getByRole('dialog', { name: 'Consentimiento informado' })
      await expect(hoja).toBeVisible()
      const firmar = hoja.getByRole('button', { name: 'Firmar consentimiento' })
      await expect(firmar).toBeDisabled()
      expect(await conteo('consentimientos')).toBe(0)
      await hoja.getByRole('checkbox').check()
      await expect(firmar).toBeEnabled()
      await firmar.click()

      // Vuelve a donde estaba (state.volver) y la sesión ya se puede preparar.
      await expect(page).toHaveURL(/\/sesion\/caja-juguetes\/preparar\?fuente=sintetica$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Caja de juguetes' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
      const c = await sb.from('consentimientos').select('version, opciones').eq('paciente_id', pacienteId)
      expect(c.data).toHaveLength(1)
      expect(c.data![0].version).toBe('1.0')
      expect(c.data![0].opciones).toMatchObject({ analisisEnDispositivo: true })
      // Auditoría del consentimiento.
      expect((await acciones()).filter((a) => a.accion === 'consentimiento_firmado').map((a) => a.despues?.version)).toEqual(['1.0'])
      // En /privacidad ahora figura Vigente.
      await page.goto('/privacidad')
      await expect(page.getByRole('button', { name: /Consentimiento informado/ })).toContainText('Vigente')
    } finally {
      await restaurarPrueba()
    }
  })

  test('Descargar mis datos: JSON y CSV con todo lo del paciente y registro en Auditoría', async ({ page }) => {
    test.setTimeout(60_000)
    const { acciones, pacienteId } = await bd()
    const id = await crearSesion('caja-juguetes', 5, 10, 1, 'prueba')
    try {
      await page.goto('/privacidad')
      await page.getByRole('button', { name: 'Descargar mis datos' }).click()
      const [dj] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar JSON' }).click()])
      expect(dj.suggestedFilename()).toMatch(/^manoviva-mis-datos-\d{4}-\d{2}-\d{2}\.json$/)
      const json = JSON.parse(readFileSync((await dj.path())!, 'utf8'))
      expect(Object.keys(json)).toEqual(expect.arrayContaining(['perfil', 'planes', 'sesiones', 'eventos', 'consentimientos', 'alertas', 'auditoria']))
      expect(json.perfil.paciente.id).toBe(pacienteId)
      expect(json.perfil.usuario.nombre).toBe('Paciente de prueba')
      expect(json.planes.map((p: { version: number }) => p.version)).toEqual([1])
      expect(json.sesiones.map((s: { id: string }) => s.id)).toContain(id)
      expect(json.consentimientos).toHaveLength(1)
      expect(JSON.stringify(json)).not.toMatch(/video"\s*:/i)

      await page.getByRole('button', { name: 'Descargar mis datos' }).click()
      const [dc] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar CSV' }).click()])
      expect(dc.suggestedFilename()).toMatch(/\.csv$/)
      const csv = readFileSync((await dc.path())!, 'utf8').replace(/^﻿/, '')
      const filas = csv.trim().split('\r\n')
      expect(filas[0]).toBe('tabla,registro,campo,valor')
      expect(filas).toContain(`sesion,${id},juego,caja-juguetes`)
      expect(filas).toContain('plan,v1,version,1')
      expect(filas.some((f) => f.startsWith('consentimiento,') && f.endsWith(',version,1.0'))).toBe(true)

      const desc = (await acciones()).filter((a) => a.accion === 'datos_descargados')
      expect(desc.map((a) => a.despues?.formato)).toEqual(['json', 'csv'])
    } finally {
      limpiarPrueba([id])
      await restaurarPrueba()
    }
  })

  test('Eliminar pide doble confirmación y borra los datos del paciente de prueba', async ({ page }) => {
    test.setTimeout(60_000)
    const { conteo, acciones } = await bd()
    try {
      await page.goto('/privacidad')
      expect(await conteo('planes')).toBe(1)

      // Primera confirmación: Cancelar no borra nada.
      await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
      const uno = page.getByRole('alertdialog', { name: 'Eliminar mis datos' })
      await expect(uno).toContainText('¿Eliminar tus datos?')
      await uno.getByRole('button', { name: 'Cancelar' }).click()
      await expect(uno).toHaveCount(0)
      expect(await conteo('planes')).toBe(1)

      // Segunda confirmación: hay que escribir ELIMINAR.
      await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
      await uno.getByRole('button', { name: 'Continuar' }).click()
      const dos = page.getByRole('alertdialog', { name: 'Confirmar eliminación' })
      await expect(dos).toContainText('Esta acción no se puede deshacer')
      const final = dos.getByRole('button', { name: 'Eliminar definitivamente' })
      await expect(final).toBeDisabled()
      await dos.getByLabel('Escribe ELIMINAR').fill('eliminar ya')
      await expect(final).toBeDisabled()
      expect(await conteo('planes')).toBe(1)
      await dos.getByLabel('Escribe ELIMINAR').fill('ELIMINAR')
      await expect(final).toBeEnabled()
      await final.click()

      await expect(dos).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Consentimiento informado/ })).toContainText('Pendiente')
      expect(await conteo('planes')).toBe(0)
      expect(await conteo('consentimientos')).toBe(0)
      expect(await conteo('sesiones')).toBe(0)
      expect((await acciones()).map((a) => a.accion)).toContain('datos_eliminados_por_titular')
    } finally {
      await restaurarPrueba() // vuelve a dejar consentimiento y plan v1 del paciente de prueba
    }
    expect(await conteo('planes')).toBe(1)
    expect(await conteo('consentimientos')).toBe(1)
  })
})
