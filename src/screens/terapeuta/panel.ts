// F16 · Cálculos puros del panel del terapeuta (pacientes, alertas, indicadores). Sin acceso a datos.
import type { Alerta, Paciente, Plan, Sesion } from '../../domain/types'
import { adherencia, claveDia, esSimulada, semanaTratamiento } from '../../metrics/sesion'

/** Días sin sesiones a partir de los cuales se avisa (configurable en la pestaña Alertas). */
export const DIAS_SIN_SESION_DEFECTO = 3
export const DIAS_SIN_SESION_MIN = 1
export const DIAS_SIN_SESION_MAX = 14
/** Cuántas sesiones recientes dibuja el minigráfico. */
export const PUNTOS_MINIGRAFICO = 12

export interface AvisoDolor {
  alertaId: string
  valor: number
  creada: string
}

export interface FilaPaciente {
  paciente: Paciente
  plan: Plan | null
  /** Sesiones cerradas del paciente, de la más reciente a la más antigua. */
  sesiones: Sesion[]
  semana: number
  /** Adherencia de los últimos 7 días (0..1) o null si no hay plan. */
  adherencia: number | null
  /** Apertura máxima de pinza (cm, estimada) de las últimas sesiones, de la más antigua a la más reciente. */
  serie: number[]
  dolor: AvisoDolor | null
  /** Días sin sesiones (solo si alcanza el umbral configurado). */
  sinSesiones: number | null
  conAlerta: boolean
}

/** Días de calendario (zona local) entre una fecha y hoy; nunca negativo. */
export function diasCalendario(desde: string | Date, hoy: Date): number {
  const a = typeof desde === 'string' ? (desde.length <= 10 ? new Date(desde + 'T00:00:00') : new Date(desde)) : new Date(desde)
  a.setHours(0, 0, 0, 0)
  const b = new Date(hoy)
  b.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}

export function cerradas(sesiones: Sesion[]): Sesion[] {
  return sesiones.filter((s) => s.estado === 'cerrada' && s.inicio).sort((x, y) => (x.inicio! < y.inicio! ? 1 : -1))
}

/**
 * Días desde la última sesión cerrada. Si el paciente aún no tiene ninguna, se cuenta desde que empezó su
 * tratamiento (así un paciente nuevo no avisa el primer día, pero tampoco queda sin aviso si nunca entrena).
 */
export function diasSinSesion(sesiones: Sesion[], fechaInicio: string, hoy: Date): number {
  const ultima = cerradas(sesiones)[0]
  return diasCalendario(ultima ? ultima.inicio! : fechaInicio, hoy)
}

/** Apertura máxima de pinza por sesión cerrada (las últimas `max`), en orden cronológico. Sin las de mano simulada (pruebas). */
export function serieApertura(sesiones: Sesion[], max = PUNTOS_MINIGRAFICO): number[] {
  return cerradas(sesiones)
    .filter((s) => s.metricas && Number.isFinite(s.metricas.aperturaMaxCm) && !esSimulada(s))
    .slice(0, max)
    .reverse()
    .map((s) => s.metricas!.aperturaMaxCm)
}

/** La alerta de dolor abierta más reciente del paciente (o null). */
export function dolorAbierto(alertas: Alerta[], pacienteId: string): AvisoDolor | null {
  const propias = alertas
    .filter((a) => a.pacienteId === pacienteId && a.tipo === 'dolor' && a.estado === 'abierta' && a.valor != null)
    .sort((x, y) => (x.creada < y.creada ? 1 : -1))
  const a = propias[0]
  return a ? { alertaId: a.id, valor: a.valor!, creada: a.creada } : null
}

export interface EntradaFila {
  paciente: Paciente
  plan: Plan | null
  sesiones: Sesion[]
  alertas: Alerta[]
  hoy: Date
  umbralDias: number
}

export function armarFila(e: EntradaFila): FilaPaciente {
  const { paciente, plan, hoy } = e
  const dias = diasSinSesion(e.sesiones, paciente.fechaInicio, hoy)
  const sinSesiones = dias >= e.umbralDias ? dias : null
  const dolor = dolorAbierto(e.alertas, paciente.id)
  return {
    paciente,
    plan,
    sesiones: cerradas(e.sesiones),
    semana: semanaTratamiento(paciente.fechaInicio, hoy),
    adherencia: adherencia(e.sesiones, plan, hoy),
    serie: serieApertura(e.sesiones),
    dolor,
    sinSesiones,
    conAlerta: dolor != null || sinSesiones != null,
  }
}

/** Con alertas primero (dolor, luego días sin sesiones); dentro de cada grupo, por nombre. */
export function ordenar(filas: FilaPaciente[]): FilaPaciente[] {
  const rango = (f: FilaPaciente) => (f.dolor ? 0 : f.sinSesiones != null ? 1 : 2)
  return [...filas].sort((a, b) => rango(a) - rango(b) || a.paciente.nombre.localeCompare(b.paciente.nombre, 'es'))
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

export function filtrarPorNombre(filas: FilaPaciente[], texto: string): FilaPaciente[] {
  const q = sinTildes(texto)
  return q ? filas.filter((f) => sinTildes(f.paciente.nombre).includes(q)) : filas
}

export interface Indicadores {
  activos: number
  alertas: number
  adherenciaMedia: number | null
}

/** Alertas abiertas = alertas de dolor abiertas + pacientes que superan los días sin sesiones. */
export function indicadores(filas: FilaPaciente[], alertas: Alerta[]): Indicadores {
  const ids = new Set(filas.map((f) => f.paciente.id))
  const dolor = alertas.filter((a) => ids.has(a.pacienteId) && a.tipo === 'dolor' && a.estado === 'abierta').length
  const inactivos = filas.filter((f) => f.sinSesiones != null).length
  const adh = filas.map((f) => f.adherencia).filter((x): x is number => x != null)
  return {
    activos: filas.length,
    alertas: dolor + inactivos,
    adherenciaMedia: adh.length ? adh.reduce((a, b) => a + b, 0) / adh.length : null,
  }
}

/** "Fractura de muñeca" o, si el terapeuta no anotó condición, "Mano izquierda" / "Ambas manos". */
export function condicionOMano(p: Pick<Paciente, 'condicion' | 'manoAfectada'>): string {
  if (p.condicion && p.condicion.trim()) return p.condicion.trim()
  return p.manoAfectada === 'ambas' ? 'Ambas manos' : `Mano ${p.manoAfectada}`
}

export function textoSinSesiones(dias: number): string {
  return `Sin sesiones hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

export function textoDolor(valor: number): string {
  return `Dolor ${valor}/10 en la última sesión`
}

/** Clave de día (YYYY-MM-DD) de la última sesión cerrada, o null. */
export function ultimoDia(f: FilaPaciente): string | null {
  const s = f.sesiones[0]
  return s?.inicio ? claveDia(new Date(s.inicio)) : null
}
