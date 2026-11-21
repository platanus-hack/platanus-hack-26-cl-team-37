// F15 · Exportación CSV. Formato para Excel en español de Chile: separador ";", decimales con coma, UTF-8 con BOM.
// Dos archivos: una fila por sesión y una fila por evento.
import type { EventoSesion, Sesion } from '../domain/types'
import { nombreJuego } from '../games/registry'
import { contadorYMeta, fechaSesion } from './filas'

export type EstadoIntegridad = 'verificado' | 'alterado' | 'sin-hash'
export const BOM = '﻿'
const SEP = ';'

type Celda = string | number | boolean | null | undefined

function celda(v: Celda): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6).replace('.', ',') : ''
  let t = v
  // Evita que una hoja de cálculo ejecute texto libre como fórmula.
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return /[";\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t
}

export function filaCsv(celdas: Celda[]): string {
  return celdas.map(celda).join(SEP)
}

const fechaIso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const COLUMNAS_SESIONES = [
  'id', 'fecha_hora', 'ejercicio', 'nivel', 'mano', 'duracion_prescrita_min', 'prescrito_por', 'plan_version',
  'contador', 'meta', 'agarres_izquierda', 'agarres_derecha', 'intentos', 'precision_pct', 'tiempo_medio_agarre_s',
  'apertura_max_cm_aprox', 'flexion_indice_max_grados_aprox', 'suavidad_0_100', 'calidad_registro_pct', 'duracion_s', 'fps_medio',
  'meta_cumplida', 'dolor_0_10', 'esfuerzo', 'nota', 'camara', 'fps_camara', 'version_app', 'version_modelo', 'integridad', 'hash_sha256',
]

export function csvSesiones(sesiones: Sesion[], integridad: Record<string, EstadoIntegridad> = {}): string {
  const lineas = [COLUMNAS_SESIONES.join(SEP)]
  for (const s of sesiones) {
    const m = s.metricas
    const { contador, meta } = contadorYMeta(s)
    lineas.push(
      filaCsv([
        s.id, fechaIso(fechaSesion(s)), nombreJuego(s.juego), s.parametros?.nivel, s.parametros?.mano, s.parametros?.duracionMin, s.parametros?.prescritoPor, s.planVersion,
        contador, meta, m?.agarresIzq, m?.agarresDer, m?.intentos, m ? m.precision * 100 : null, m?.tiempoMedioAgarreS,
        m?.aperturaMaxCm, m?.flexionIndiceMax, m?.suavidad, m ? m.calidadRegistro * 100 : null, m?.duracionS, m?.fpsMedio,
        m?.metaCumplida, s.dolorEVA, s.esfuerzo, s.nota, s.dispositivo?.camara, s.dispositivo?.fps, s.versionApp, s.versionModelo,
        integridad[s.id] ?? '', s.hash,
      ]),
    )
  }
  return BOM + lineas.join('\r\n') + '\r\n'
}

export const COLUMNAS_EVENTOS = ['sesion_id', 'seq', 't_ms', 'tipo', 'mano', 'objeto', 'datos_json']

export function csvEventos(eventos: EventoSesion[]): string {
  const orden = [...eventos].sort((a, b) => (a.sesionId < b.sesionId ? -1 : a.sesionId > b.sesionId ? 1 : a.seq - b.seq))
  const lineas = [COLUMNAS_EVENTOS.join(SEP)]
  for (const e of orden) lineas.push(filaCsv([e.sesionId, e.seq, e.t, e.tipo, e.mano, e.objeto, e.datos ? JSON.stringify(e.datos) : '']))
  return BOM + lineas.join('\r\n') + '\r\n'
}
