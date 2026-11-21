// Preparar la sesión (F06): valores por defecto desde el plan y la Sesion "preparada" con parámetros congelados.
// Funciones puras: la pantalla /sesion/:juego/preparar solo las llama con lo que trae de repos.
import type { Mano, ParametrosSesion, Plan, Sesion } from '../domain/types'
import { nivelActual, NIVEL_MAX } from './catalogo'

export const DURACION_MIN = 2
export const DURACION_MAX = 10
/** Duración si el juego no está en el plan. */
export const DURACION_POR_DEFECTO = 5

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n) || min))

export interface Preparacion {
  mano: Mano
  nivel: number
  duracionMin: number
  /** Meta del plan (solo lectura). null = el juego no está en el plan: práctica libre, sin meta. */
  meta: { agarres: number; pinzaCm: number; autor: string | null } | null
  /** Versión del plan vigente (se congela en la sesión), o null si no hay plan. */
  planVersion: number | null
}

/**
 * Valores por defecto: el ítem del plan vigente para ese juego (si aparece varias veces, el primero).
 * Sin ítem: mano afectada del paciente, nivel actual (última sesión cerrada o 1) y 5 minutos, sin meta.
 */
export function valoresPorDefecto(
  juegoId: string,
  plan: Pick<Plan, 'version' | 'items' | 'creadoPorNombre'> | null,
  manoAfectada: Mano,
  sesiones: Pick<Sesion, 'juego' | 'estado' | 'inicio' | 'parametros'>[],
): Preparacion {
  const item = plan?.items.find((it) => it.juego === juegoId)
  if (item)
    return {
      mano: item.mano,
      nivel: acotar(item.nivel, 1, NIVEL_MAX),
      duracionMin: acotar(item.duracionMin, DURACION_MIN, DURACION_MAX),
      meta: { agarres: item.metaAgarres, pinzaCm: item.metaPinzaCm, autor: plan?.creadoPorNombre ?? null },
      planVersion: plan!.version,
    }
  return {
    mano: manoAfectada,
    nivel: nivelActual(juegoId, [], sesiones),
    duracionMin: DURACION_POR_DEFECTO,
    meta: null,
    planVersion: plan?.version ?? null,
  }
}

/** Datos de la Sesion "preparada": parámetros congelados + versión del plan. El resto se llena al calibrar/jugar/cerrar. */
export function sesionPreparada(pacienteId: string, juegoId: string, p: Preparacion): Omit<Sesion, 'id'> {
  const parametros: ParametrosSesion = {
    mano: p.mano,
    nivel: acotar(p.nivel, 1, NIVEL_MAX),
    duracionMin: acotar(p.duracionMin, DURACION_MIN, DURACION_MAX),
    metaAgarres: p.meta?.agarres ?? 0,
    metaPinzaCm: p.meta?.pinzaCm ?? 0,
    prescritoPor: p.meta?.autor ?? null,
  }
  return {
    pacienteId,
    planVersion: p.planVersion,
    juego: juegoId,
    parametros,
    inicio: null,
    fin: null,
    estado: 'preparada',
    calibracion: null,
    metricas: null,
    muestras: null,
    dolorEVA: null,
    esfuerzo: null,
    nota: null,
    dispositivo: null,
    versionApp: null,
    versionModelo: null,
    hash: null,
  }
}
