// Utilidades e2e de los juegos sobre la base común (F09+): sesiones reales o falsas, estado del juego y limpieza.
// Sesión real: `crearSesion(juego, duracionMin, meta, nivel)` + `limpiar(desde, id)` en un finally.
// Sesión falsa: `sesionFalsa(page, juego, …)` simula PostgREST (GET devuelve la fila; PATCH/POST se guardan).
import { execSync } from 'node:child_process'
import { expect, type Page } from '@playwright/test'
import { clienteComo, type Como } from './ayudas.ts'

// e2e se tipa sin DOM: tipos mínimos de lo que se toca en el navegador.
export type EstadoJuego = { fase: string; motivo: string | null; fps: number; calidad: number; pixelRatio: number; jugadoMs: number; contador: number; eventos: number; muestras: number; fisica: boolean; vivo: Record<string, number | null> }
export type FuenteViva = { fijarPose(p: object, lado?: string): void; ocultar(): void; cargarGuion(g: object): void }
export type Ventana = { __manovivaJuego?: EstadoJuego; __manoviva?: { fuente?: FuenteViva; juego?: { estado(): unknown } } }

export const HORIZONTAL = { width: 844, height: 390 }
export const CALIBRACION = {
  largoManoCm: 18.2,
  largoManoFuente: 'estimado',
  largoManoEstimadoCm: 18.2,
  aperturaPinzaMaxCm: 9.5,
  rangoAbrirCerrar: { min: 0.05, max: 1.0 },
  fps: 30,
  confianzaMedia: 0.95,
  escalaCmPorUnidad: 100,
}
export const parametros = (duracionMin: number, meta: number, nivel = 2) => ({ mano: 'derecha', nivel, duracionMin, metaAgarres: meta, metaPinzaCm: 0, prescritoPor: null })

export const juego = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manovivaJuego ?? null)
export async function esperarFase(p: Page, fase: string, timeout = 10_000) {
  await expect.poll(async () => (await juego(p))?.fase, { timeout }).toBe(fase)
}

/**
 * Crea una sesión real 'preparada' de Carmen (con la sesión demo del e2e, sin ingreso extra).
 * `como: 'prueba'` la crea para el paciente de prueba (obligatorio si la prueba la va a CERRAR; limpiar con limpiarPrueba).
 * `extra` agrega/reemplaza columnas de la fila (p. ej. { estado: 'en curso', metricas, dolor_eva, inicio }).
 */
export async function crearSesion(juegoId: string, duracionMin: number, meta: number, nivel = 2, como: Como = 'paciente', extra: Record<string, unknown> = {}): Promise<string> {
  const sb = await clienteComo(como)
  const pac = await sb.from('pacientes').select('id').single()
  if (pac.error) throw new Error(pac.error.message)
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }).replaceAll('-', '')
  for (let i = 0; i < 4; i++) {
    const id = await sb.rpc('siguiente_id_sesion', { p_dia: dia })
    if (id.error) throw new Error(id.error.message)
    const r = await sb.from('sesiones').insert({ id: id.data, paciente_id: pac.data.id, juego: juegoId, estado: 'preparada', parametros: parametros(duracionMin, meta, nivel), calibracion: CALIBRACION, ...extra })
    if (!r.error) return id.data as string
    if (!/duplicate key/i.test(r.error.message)) throw new Error(r.error.message)
  }
  throw new Error('no se pudo asignar id')
}
/** Borra solo la sesión de esta prueba (los e2e corren en paralelo). Sin id (falló antes de crearla), todo desde `desde`. */
export const limpiar = (desde: string, id: string) => execSync(`npx tsx scripts/limpiar-preparadas.ts ${desde} ${id}`, { stdio: 'inherit' })
/**
 * Borra sesiones del PACIENTE DE PRUEBA, también las cerradas (scripts/limpiar-prueba.ts, RPC solo service_role).
 * Pasar siempre los ids de la prueba: sin ids borra TODO lo del paciente de prueba (otra prueba en paralelo lo perdería).
 */
export const limpiarPrueba = (ids: string[]) => {
  const lista = ids.filter(Boolean)
  if (lista.length) execSync(`npx tsx scripts/limpiar-prueba.ts ${lista.join(' ')}`, { stdio: 'inherit' })
}

export const ID_FALSO = 'S-20990101-01'
export type Escritura = { tabla: string; metodo: string; cuerpo: unknown }
/** Sesión falsa: GET devuelve la fila; PATCH/POST se aceptan sin tocar la BD y se guardan para revisarlos. */
export async function sesionFalsa(page: Page, juegoId: string, duracionMin = 5, meta = 0, nivel = 2): Promise<Escritura[]> {
  const escrituras: Escritura[] = []
  const fila = {
    id: ID_FALSO, paciente_id: '00000000-0000-0000-0000-000000000000', plan_version: null, juego: juegoId, parametros: parametros(duracionMin, meta, nivel),
    inicio: null, fin: null, estado: 'preparada', calibracion: CALIBRACION, metricas: null, muestras: null, dolor_eva: null, esfuerzo: null, nota: null,
    dispositivo: null, version_app: null, version_modelo: null, hash: null, creada: new Date().toISOString(),
  }
  await page.route('**/rest/v1/sesiones?*', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ json: [fila] })
    escrituras.push({ tabla: 'sesiones', metodo: m, cuerpo: route.request().postDataJSON() })
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/rest/v1/eventos_sesion?*', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ json: [] })
    escrituras.push({ tabla: 'eventos_sesion', metodo: m, cuerpo: route.request().postDataJSON() })
    return route.fulfill({ status: 201, json: [] })
  })
  return escrituras
}
