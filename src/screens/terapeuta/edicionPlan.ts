// F17 · Prescripción del plan (edicionPlan.ts): lógica pura (borrador, diferencias antes → después, validación y tendencia de pinza).
// Solo describe y compara valores; no interpreta ni recomienda. Sin React ni repos.
import type { Plan, PlanItem, Sesion } from '../../domain/types'
import { nombreJuego } from '../../games/registry'
import { calcularProgreso } from '../../metrics/progreso'
import { num } from '../../lib/formato'

export const NIVEL_MIN = 1
export const NIVEL_MAX = 5
export const SESIONES_MIN = 1
export const SESIONES_MAX = 14
export const META_PINZA_MIN = 1
export const META_PINZA_MAX = 15
export const META_PINZA_PASO = 0.5
export const UMBRAL_MIN = 1
export const UMBRAL_MAX = 10
export const MENSAJE_MAX = 280

/** Valores editables del plan. La meta de pinza es una sola y se aplica a todos los ejercicios del plan. */
export interface Borrador {
  /** Nivel por juego (id del registro). */
  niveles: Record<string, number>
  sesionesPorSemana: number
  metaPinzaCm: number
  umbralDolor: number
  mensaje: string
}

export type Campo = 'nivel' | 'sesiones' | 'metaPinza' | 'umbral' | 'mensaje'

export interface Cambio {
  campo: Campo
  /** Id del juego cuando el campo es 'nivel'. */
  juego?: string
  etiqueta: string
  antes: string
  despues: string
}

const redondear = (n: number) => Math.round(n * 1000) / 1000

/** Meta de pinza del plan: la mayor meta (> 0) entre sus ejercicios (como Progreso); 0 si ninguno tiene. */
export function metaPinzaDe(items: PlanItem[]): number {
  const v = items.map((i) => i.metaPinzaCm).filter((x) => typeof x === 'number' && x > 0)
  return v.length ? Math.max(...v) : 0
}

/** Ajusta una meta al paso de 0,5 y a los límites. */
export function ajustarMeta(v: number): number {
  const paso = Math.round(v / META_PINZA_PASO) * META_PINZA_PASO
  return redondear(Math.min(META_PINZA_MAX, Math.max(META_PINZA_MIN, paso)))
}

/** Borrador inicial = el plan vigente (sin mensaje). Con dos ítems del mismo juego se usa el nivel mayor. */
export function borradorDe(plan: Plan): Borrador {
  const niveles: Record<string, number> = {}
  for (const it of plan.items) niveles[it.juego] = Math.max(niveles[it.juego] ?? 0, it.nivel)
  const meta = metaPinzaDe(plan.items)
  return {
    niveles,
    sesionesPorSemana: plan.sesionesPorSemana,
    metaPinzaCm: meta > 0 ? ajustarMeta(meta) : META_PINZA_MIN,
    umbralDolor: plan.umbralDolor,
    mensaje: '',
  }
}

/** Juegos del plan en orden, sin repetir. */
export function juegosDelPlan(plan: Plan): string[] {
  return [...new Set(plan.items.map((i) => i.juego))]
}

/** ¿Este campo (y juego) difiere del plan vigente? Sirve para resaltarlo en amarillo hasta enviar. */
export function cambiado(plan: Plan, b: Borrador, campo: Campo, juego?: string): boolean {
  const base = borradorDe(plan)
  switch (campo) {
    case 'nivel':
      return juego != null && b.niveles[juego] !== base.niveles[juego]
    case 'sesiones':
      return b.sesionesPorSemana !== base.sesionesPorSemana
    case 'metaPinza':
      return b.metaPinzaCm !== base.metaPinzaCm
    case 'umbral':
      return b.umbralDolor !== base.umbralDolor
    case 'mensaje':
      return b.mensaje.trim() !== ''
  }
}

export const textoMeta = (cm: number) => `${num(cm, 1)} cm`
export const textoUmbral = (n: number) => `EVA ≥ ${n}`

/** Lista de diferencias antes → después, en el orden de la pantalla. */
export function cambios(plan: Plan, b: Borrador): Cambio[] {
  const base = borradorDe(plan)
  const out: Cambio[] = []
  for (const juego of juegosDelPlan(plan)) {
    if (cambiado(plan, b, 'nivel', juego))
      out.push({ campo: 'nivel', juego, etiqueta: `${nombreJuego(juego)} · nivel de dificultad`, antes: String(base.niveles[juego]), despues: String(b.niveles[juego]) })
  }
  if (cambiado(plan, b, 'sesiones')) out.push({ campo: 'sesiones', etiqueta: 'Sesiones por semana', antes: String(base.sesionesPorSemana), despues: String(b.sesionesPorSemana) })
  if (cambiado(plan, b, 'metaPinza')) out.push({ campo: 'metaPinza', etiqueta: 'Meta de pinza', antes: textoMeta(base.metaPinzaCm), despues: textoMeta(b.metaPinzaCm) })
  if (cambiado(plan, b, 'umbral')) out.push({ campo: 'umbral', etiqueta: 'Aviso por dolor', antes: textoUmbral(base.umbralDolor), despues: textoUmbral(b.umbralDolor) })
  if (cambiado(plan, b, 'mensaje')) out.push({ campo: 'mensaje', etiqueta: 'Mensaje para el paciente', antes: '—', despues: b.mensaje.trim() })
  return out
}

export const hayCambios = (plan: Plan, b: Borrador) => cambios(plan, b).length > 0

/** Texto del error de validación (null si el borrador se puede enviar). */
export function validar(plan: Plan, b: Borrador): string | null {
  const entero = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max
  for (const j of juegosDelPlan(plan)) {
    if (!entero(b.niveles[j] ?? NaN, NIVEL_MIN, NIVEL_MAX)) return `El nivel de ${nombreJuego(j)} va de ${NIVEL_MIN} a ${NIVEL_MAX}.`
  }
  if (!entero(b.sesionesPorSemana, SESIONES_MIN, SESIONES_MAX)) return `Las sesiones por semana van de ${SESIONES_MIN} a ${SESIONES_MAX}.`
  if (!(b.metaPinzaCm >= META_PINZA_MIN && b.metaPinzaCm <= META_PINZA_MAX) || redondear(b.metaPinzaCm / META_PINZA_PASO) % 1 !== 0)
    return `La meta de pinza va de ${num(META_PINZA_MIN)} a ${num(META_PINZA_MAX)} cm, de 0,5 en 0,5.`
  if (!entero(b.umbralDolor, UMBRAL_MIN, UMBRAL_MAX)) return `El aviso por dolor va de ${UMBRAL_MIN} a ${UMBRAL_MAX}.`
  if (b.mensaje.trim().length > MENSAJE_MAX) return `El mensaje puede tener hasta ${MENSAJE_MAX} caracteres.`
  return null
}

/**
 * Ítems de la versión nueva: parte de los del plan vigente (conserva duración, mano, metas por dedo, etc.) y solo
 * cambia lo editado. La meta de pinza se escribe en todos los ítems únicamente si el terapeuta la modificó.
 */
export function itemsNuevos(plan: Plan, b: Borrador): PlanItem[] {
  const tocaMeta = cambiado(plan, b, 'metaPinza')
  return plan.items.map((it) => ({
    ...it,
    nivel: b.niveles[it.juego] ?? it.nivel,
    ...(tocaMeta ? { metaPinzaCm: b.metaPinzaCm } : {}),
  }))
}

/** Datos para `repos.planes.crearVersion` (la RPC crea la versión N+1 y escribe la auditoría). */
export function datosDeEnvio(plan: Plan, b: Borrador) {
  return { sesionesPorSemana: b.sesionesPorSemana, umbralDolor: b.umbralDolor, mensaje: b.mensaje.trim(), items: itemsNuevos(plan, b) }
}

export interface Tendencia {
  /** Valores en cm (sesiones con calidad suficiente de las últimas 4 semanas). */
  valores: number[]
  primero: number | null
  ultimo: number | null
  /** Variación % entre el primero y el último (null con < 2 valores). */
  pct: number | null
}

/** Apertura de pinza de las últimas 4 semanas (misma lógica que Progreso, F14). */
export function tendenciaPinza(sesiones: Sesion[], plan: Plan | null, hoy: Date): Tendencia {
  const p = calcularProgreso(sesiones, plan, null, '4s', hoy)
  const valores = p.puntos.map((x) => x.cm)
  return { valores, primero: valores[0] ?? null, ultimo: valores[valores.length - 1] ?? null, pct: p.variacionPct }
}
