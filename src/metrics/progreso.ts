// F14 · Progreso: cálculos puros sobre las sesiones cerradas del paciente (sin React, sin repos).
// Solo describe los datos; no interpreta ni recomienda.
import type { FlexionDedos, Plan, Sesion } from '../domain/types'
import { calidadSuficiente, claveDia, esSimulada, planificadasPorSemana, variacionPct } from './sesion'

export type Rango = '7d' | '4s' | 'todo'
export const RANGOS: { id: Rango; texto: string }[] = [
  { id: '7d', texto: '7 días' },
  { id: '4s', texto: '4 semanas' },
  { id: 'todo', texto: 'Todo' },
]
export const DEDOS: { id: keyof FlexionDedos; nombre: string }[] = [
  { id: 'pulgar', nombre: 'Pulgar' },
  { id: 'indice', nombre: 'Índice' },
  { id: 'medio', nombre: 'Medio' },
  { id: 'anular', nombre: 'Anular' },
  { id: 'menique', nombre: 'Meñique' },
]

const DIA_MS = 86400000

export function esRango(x: unknown): x is Rango {
  return x === '7d' || x === '4s' || x === 'todo'
}

/** Primer día (a las 00:00) del rango, contando hoy; null = sin límite. */
export function desdeRango(rango: Rango, hoy: Date): Date | null {
  if (rango === 'todo') return null
  const d = new Date(hoy)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (rango === '7d' ? 6 : 27))
  return d
}

export interface PuntoApertura {
  /** Instante de la sesión (ms). */
  t: number
  /** cm, un decimal. */
  cm: number
  juego: string
  id: string
}

export interface FilaDedo {
  id: keyof FlexionDedos
  nombre: string
  /** Máximo de flexión del período (°). */
  grados: number | null
  /** Meta fijada por el terapeuta (°), si existe. */
  metaGrados: number | null
  /** grados / meta × 100 (sin tope) cuando hay meta. */
  pct: number | null
}

export interface TiempoAgarre {
  juego: string
  primero: number
  ultimo: number
}

export interface ProgresoCalculado {
  rango: Rango
  /** Sesiones cerradas del rango (con o sin calidad suficiente). */
  hechas: number
  /** Sesiones cerradas del rango con registro de calidad baja: no entran en los gráficos. */
  excluidas: number
  /** Planificadas en el rango según el plan; null si no hay plan. */
  planificadas: number | null
  /** Sesiones con calidad suficiente (las que se grafican). */
  validas: number
  puntos: PuntoApertura[]
  metaPinzaCm: number | null
  /** Variación % entre el primer y el último punto (null con < 2 puntos o primero = 0). */
  variacionPct: number | null
  dedos: FilaDedo[]
  /** true si todos los dedos con dato tienen meta (barras en %); false = grados. */
  dedosEnPct: boolean
  tiempo: TiempoAgarre | null
  /** Hay menos de 2 sesiones para graficar. */
  vacio: boolean
  /** Dominio del eje de fechas (ms). */
  desde: number
  hasta: number
}

const dentro = (s: Sesion, desde: Date | null, hoy: Date) => {
  const k = claveDia(new Date(s.inicio!))
  return k <= claveDia(hoy) && (!desde || k >= claveDia(desde))
}

/** Mayor meta definida (> 0) entre los ítems del plan; null si no hay. */
function mayor(vals: (number | undefined)[]): number | null {
  const v = vals.filter((x): x is number => typeof x === 'number' && x > 0)
  return v.length ? Math.max(...v) : null
}

/** Tiempo por agarre: primera vs última sesión del período del juego con más sesiones (los tiempos de juegos distintos no se mezclan). */
export function tiempoPorAgarre(validas: Sesion[]): TiempoAgarre | null {
  const porJuego = new Map<string, Sesion[]>()
  for (const s of validas) {
    if (s.metricas?.tiempoMedioAgarreS == null) continue
    porJuego.set(s.juego, [...(porJuego.get(s.juego) ?? []), s])
  }
  let mejor: Sesion[] | null = null
  for (const lista of porJuego.values()) {
    if (lista.length < 2) continue
    if (!mejor || lista.length > mejor.length || (lista.length === mejor.length && lista[lista.length - 1]!.inicio! > mejor[mejor.length - 1]!.inicio!)) mejor = lista
  }
  if (!mejor) return null
  return { juego: mejor[0]!.juego, primero: mejor[0]!.metricas!.tiempoMedioAgarreS!, ultimo: mejor[mejor.length - 1]!.metricas!.tiempoMedioAgarreS! }
}

/** Planificadas del rango = (días de práctica × ejercicios del plan) por semana, prorrateado por los días del rango desde que empezó el plan. */
export function planificadasEnRango(plan: Plan | null, inicioPlan: Date | null, desde: Date | null, hoy: Date): number | null {
  if (!plan || plan.sesionesPorSemana <= 0) return null
  const ini = new Date(Math.max(desde?.getTime() ?? 0, inicioPlan?.getTime() ?? 0) || hoy.getTime())
  ini.setHours(0, 0, 0, 0)
  const fin = new Date(hoy)
  fin.setHours(0, 0, 0, 0)
  const dias = Math.max(1, Math.round((fin.getTime() - ini.getTime()) / DIA_MS) + 1)
  return Math.max(1, Math.round((planificadasPorSemana(plan) * dias) / 7))
}

export function calcularProgreso(sesiones: Sesion[], plan: Plan | null, inicioPlan: Date | null, rango: Rango, hoy: Date): ProgresoCalculado {
  const desdeD = desdeRango(rango, hoy)
  const cerradas = sesiones
    // Las sesiones con mano simulada (pruebas sin cámara) no son ejercicio del paciente: no cuentan ni se grafican.
    .filter((s) => s.estado === 'cerrada' && s.inicio && s.metricas && !esSimulada(s) && dentro(s, desdeD, hoy))
    .sort((a, b) => (a.inicio! < b.inicio! ? -1 : 1))
  const validas = cerradas.filter(calidadSuficiente)

  const puntos: PuntoApertura[] = validas.map((s) => ({ t: new Date(s.inicio!).getTime(), cm: s.metricas!.aperturaMaxCm, juego: s.juego, id: s.id }))
  const variacion = puntos.length >= 2 ? variacionPct(puntos[0]!.cm, puntos[puntos.length - 1]!.cm) : null

  const items = plan?.items ?? []
  const dedos: FilaDedo[] = DEDOS.map(({ id, nombre }) => {
    const vals = validas.map((s) => s.metricas!.flexionMax?.[id]).filter((x): x is number => typeof x === 'number')
    const grados = vals.length ? Math.max(...vals) : null
    const metaGrados = mayor(items.map((it) => it.metaRangoGrados?.[id]))
    return { id, nombre, grados, metaGrados, pct: grados != null && metaGrados ? (grados / metaGrados) * 100 : null }
  })
  const conDato = dedos.filter((d) => d.grados != null)

  const primeraT = puntos[0]?.t
  const desde = desdeD ? desdeD.getTime() : primeraT != null ? new Date(new Date(primeraT).setHours(0, 0, 0, 0)).getTime() : new Date(hoy).setHours(0, 0, 0, 0)
  const hasta = new Date(hoy).setHours(23, 59, 59, 999)

  return {
    rango,
    hechas: cerradas.length,
    excluidas: cerradas.length - validas.length,
    planificadas: planificadasEnRango(plan, inicioPlan, desdeD, hoy),
    validas: validas.length,
    puntos,
    metaPinzaCm: mayor(items.map((it) => it.metaPinzaCm)),
    variacionPct: variacion,
    dedos,
    dedosEnPct: conDato.length > 0 && conDato.every((d) => d.pct != null),
    tiempo: tiempoPorAgarre(validas),
    vacio: validas.length < 2,
    desde,
    hasta,
  }
}

/** Marcas del eje de fechas: `n` instantes repartidos entre desde y hasta (ambos incluidos). */
export function marcasFechas(desde: number, hasta: number, n = 5): number[] {
  if (n < 2 || hasta <= desde) return [desde]
  return Array.from({ length: n }, (_, i) => Math.round(desde + ((hasta - desde) * i) / (n - 1)))
}
