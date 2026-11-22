// F38 · Comparar sesiones: qué sesiones cuentan, cómo se agrupan por juego y cuáles se eligen por defecto.
// Funciones puras (sin React ni repos). Solo describe datos.
import type { PoseClave, Sesion } from '../domain/types'
import { JUEGOS, juegoPorId } from '../games/registry'

/** Juegos nuevos (banda, muñeca, honda): sesiones más cortas, así que bastan 20 s. */
export const JUEGOS_CORTOS = ['banda-elastica', 'muneca-3d', 'honda']
export const DURACION_MIN_S = 60
export const DURACION_MIN_CORTOS_S = 20

/** Nombres de juegos que el registro de esta rama aún puede no traer (los agregan otras líneas de trabajo). */
const NOMBRES_RESPALDO: Record<string, string> = { 'banda-elastica': 'Banda elástica', 'muneca-3d': 'Muñeca 3D' }

export function nombreDe(juego: string): string {
  return juegoPorId(juego)?.nombre ?? NOMBRES_RESPALDO[juego] ?? juego
}

export function duracionMinima(juego: string): number {
  return JUEGOS_CORTOS.includes(juego) ? DURACION_MIN_CORTOS_S : DURACION_MIN_S
}

/** Hubo movimiento medido: agarres/contador, alguna métrica del juego distinta de cero o poses guardadas. */
export function hayActividad(s: Pick<Sesion, 'metricas' | 'muestras'>): boolean {
  const m = s.metricas
  if (!m) return false
  if ((m.contador ?? 0) > 0 || (m.agarres ?? 0) > 0) return true
  if (m.juego && Object.values(m.juego).some((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) return true
  return (s.muestras?.poses?.length ?? 0) > 0
}

/** Sesión válida para comparar: cerrada, con métricas, duración suficiente y algo de actividad (no vacías ni de prueba). */
export function esValida(s: Sesion): boolean {
  if (s.estado !== 'cerrada' || !s.inicio || !s.metricas) return false
  if ((s.metricas.duracionS ?? 0) < duracionMinima(s.juego)) return false
  return hayActividad(s)
}

const momento = (s: Sesion) => new Date(s.inicio ?? s.creada ?? 0).getTime()

/** Sesiones válidas de un juego, de la más antigua a la más reciente. */
export function validasDe(sesiones: Sesion[], juego: string): Sesion[] {
  return sesiones.filter((s) => s.juego === juego && esValida(s)).sort((a, b) => momento(a) - momento(b))
}

export interface GrupoJuego {
  juego: string
  nombre: string
  /** Válidas, de la más antigua a la más reciente. */
  validas: Sesion[]
}

/**
 * Juegos con al menos 2 sesiones válidas (los demás no se pueden comparar), en el orden del registro y, al final, los
 * ids que el registro aún no conoce.
 */
export function juegosComparables(sesiones: Sesion[]): GrupoJuego[] {
  const ids = [...new Set(sesiones.map((s) => s.juego))]
  const orden = (id: string) => {
    const i = JUEGOS.findIndex((j) => j.id === id)
    return i < 0 ? 1000 : i
  }
  return ids
    .sort((a, b) => orden(a) - orden(b) || a.localeCompare(b))
    .map((juego) => ({ juego, nombre: nombreDe(juego), validas: validasDe(sesiones, juego) }))
    .filter((g) => g.validas.length >= 2)
}

/** Selección por defecto: la primera y la última sesión válidas. */
export function seleccionInicial(validas: Sesion[]): { antes: string; despues: string } | null {
  if (validas.length < 2) return null
  return { antes: validas[0]!.id, despues: validas[validas.length - 1]!.id }
}

/**
 * Corrige una selección: si algún id ya no está entre las válidas, vuelve a la primera/última. Si las dos elegidas son la
 * misma, la segunda pasa a la última sesión distinta. Siempre deja «antes» no posterior a «después» (se ordenan).
 */
export function ajustarSeleccion(validas: Sesion[], antes: string | null, despues: string | null): { antes: string; despues: string } | null {
  const base = seleccionInicial(validas)
  if (!base) return null
  const ids = new Set(validas.map((s) => s.id))
  let a = antes && ids.has(antes) ? antes : base.antes
  let d = despues && ids.has(despues) ? despues : base.despues
  if (a === d) d = validas.find((s) => s.id !== a && s.id !== validas[validas.length - 1]!.id)?.id ?? validas.find((s) => s.id !== a)!.id
  const orden = (id: string) => validas.findIndex((s) => s.id === id)
  if (orden(a) > orden(d)) [a, d] = [d, a]
  return { antes: a, despues: d }
}

/** Pose clave guardada de una sesión por etiqueta; si hay varias manos, prefiere la que se pide. */
export function poseDe(s: Pick<Sesion, 'muestras'>, etiqueta: string, lado?: PoseClave['lado'] | null): PoseClave | null {
  const poses = (s.muestras?.poses ?? []).filter((p) => p.etiqueta === etiqueta && Array.isArray(p.puntos) && p.puntos.length === 21)
  if (!poses.length) return null
  return (lado ? poses.find((p) => p.lado === lado) : null) ?? poses[0]!
}

/** Mano de la sesión: la afectada si es una sola; con «ambas», la derecha. */
export function ladoDeSesion(s: Pick<Sesion, 'parametros'>): 'izquierda' | 'derecha' {
  return s.parametros?.mano === 'izquierda' ? 'izquierda' : 'derecha'
}
