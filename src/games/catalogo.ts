// Catálogo de ejercicios (F05): qué juegos ve el paciente, cuáles tiene asignados y en qué nivel va.
// Funciones puras: la pantalla /ejercicios solo las llama con el registro, el plan vigente y sus sesiones.
import type { PlanItem, Sesion } from '../domain/types'
import type { FiltroGesto, Juego } from './registry'

export const NIVEL_MAX = 5

export interface EntradaCatalogo {
  juego: Juego
  /** El juego está en el plan vigente. */
  asignado: boolean
  /** Nivel actual del paciente en ese juego (1–5). */
  nivel: number
}

const acotar = (n: number) => Math.min(NIVEL_MAX, Math.max(1, Math.round(n) || 1))

/**
 * Nivel actual: el del plan vigente si el juego está asignado (si aparece varias veces, el mayor);
 * si no, el de la última sesión cerrada de ese juego; si nunca lo jugó, 1.
 */
export function nivelActual(juegoId: string, items: Pick<PlanItem, 'juego' | 'nivel'>[], sesiones: Pick<Sesion, 'juego' | 'estado' | 'inicio' | 'parametros'>[]): number {
  const delPlan = items.filter((it) => it.juego === juegoId).map((it) => it.nivel)
  if (delPlan.length) return acotar(Math.max(...delPlan))
  const ultima = sesiones
    .filter((s) => s.juego === juegoId && s.estado === 'cerrada' && s.inicio)
    .sort((a, b) => (a.inicio! < b.inicio! ? 1 : -1))[0]
  return ultima ? acotar(ultima.parametros?.nivel ?? 1) : 1
}

/** Arma el catálogo en el orden del registro, con "asignado" y nivel; `filtro` null = Todos. */
export function catalogo(
  juegos: Juego[],
  items: Pick<PlanItem, 'juego' | 'nivel'>[],
  sesiones: Pick<Sesion, 'juego' | 'estado' | 'inicio' | 'parametros'>[],
  filtro: FiltroGesto | null,
): EntradaCatalogo[] {
  const asignados = new Set(items.map((it) => it.juego))
  return juegos
    .filter((j) => !filtro || j.filtros.includes(filtro))
    .map((juego) => ({ juego, asignado: asignados.has(juego.id), nivel: nivelActual(juego.id, items, sesiones) }))
}
