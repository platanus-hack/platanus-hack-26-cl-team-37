// F15/F17 · Exportar un período: qué sesiones entran y cómo se nombra el período en el archivo y en la auditoría.
// Lo usan el historial (paciente o terapeuta con ?paciente=) y la pestaña Informes del terapeuta. Funciones puras.
import type { Sesion } from '../domain/types'
import { fechaNumerica } from '../lib/formato'
import { desdeRango, RANGOS, type Rango } from '../metrics/progreso'
import { fechaSesion } from './filas'

export { RANGOS, type Rango }

/** Sesiones CERRADAS del período (las más recientes primero si así venían), desde el inicio del rango hasta hoy. */
export function sesionesDelPeriodo(sesiones: Sesion[], rango: Rango, hoy: Date): Sesion[] {
  const desde = desdeRango(rango, hoy)
  return sesiones.filter((s) => s.estado === 'cerrada' && (!desde || fechaSesion(s).getTime() >= desde.getTime()))
}

/** Nombre del período para el archivo y la auditoría: «4 semanas (hasta 21-11-2026)». */
export function nombrePeriodo(rango: Rango, hoy: Date): string {
  const texto = RANGOS.find((x) => x.id === rango)?.texto ?? ''
  return `${texto} (hasta ${fechaNumerica(hoy)})`
}
