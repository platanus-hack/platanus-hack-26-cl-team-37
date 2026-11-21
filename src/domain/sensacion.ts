// F12 · Reglas puras de /sesion/:id/sensacion (dolor EVA, esfuerzo, nota y alerta por dolor).
import type { Esfuerzo, Plan, Sesion } from './types'

export const EVA_MIN = 0
export const EVA_MAX = 10
export const NOTA_MAX = 280

/** Botones − / +: sin valor marcado, "+" empieza en 0 (Sin dolor) y "−" no hace nada. */
export function pasoEva(actual: number | null, delta: -1 | 1): number | null {
  if (actual === null) return delta > 0 ? EVA_MIN : null
  return Math.min(EVA_MAX, Math.max(EVA_MIN, actual + delta))
}

/** Plan que rige la sesión: la versión congelada en la sesión si existe; si no, el vigente. */
export function planDeSesion(sesion: Pick<Sesion, 'planVersion'>, versiones: Plan[], vigente: Plan | null): Plan | null {
  if (sesion.planVersion != null) {
    const p = versiones.find((v) => v.version === sesion.planVersion)
    if (p) return p
  }
  return vigente
}

/** Dolor igual o mayor al umbral del plan → alerta para el terapeuta. Sin plan (sin umbral) no hay alerta. */
export function requiereAlerta(dolor: number | null, umbral: number | null | undefined): boolean {
  return dolor !== null && umbral != null && dolor >= umbral
}

export interface Sensacion {
  dolorEVA: number
  esfuerzo: Esfuerzo | null
  nota: string | null
}

/** Lo que se escribe en la Sesion. Null si falta el EVA (obligatorio). La nota se recorta y vacía = null. */
export function sensacionAGuardar(dolor: number | null, esfuerzo: Esfuerzo | null, nota: string): Sensacion | null {
  if (dolor === null || !Number.isInteger(dolor) || dolor < EVA_MIN || dolor > EVA_MAX) return null
  const n = nota.trim().slice(0, NOTA_MAX)
  return { dolorEVA: dolor, esfuerzo, nota: n || null }
}
