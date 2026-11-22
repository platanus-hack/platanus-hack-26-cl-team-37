// Reporte de la cámara de este teléfono: qué entregó de verdad el navegador (no lo que se pidió) y qué permite ajustar.
// Sirve para comparar teléfonos del equipo: se copia como texto y se pega en el chat.
//
// El navegador no informa la distancia focal ni el campo de visión; por eso la banda se mide contra el tamaño de la
// mano en el mismo plano (ver medicion.ts) y este reporte solo trae lo que sí se puede saber.

import type { FuenteManos } from '../tracking/tipos'

/** Ajustes de imagen que algunos navegadores dejan controlar (Chrome en Android; Safari casi ninguno). */
export const CONTROLES_POSIBLES = ['exposureMode', 'exposureTime', 'exposureCompensation', 'focusMode', 'focusDistance', 'whiteBalanceMode', 'iso', 'zoom', 'torch'] as const

export interface ReporteCamara {
  fuente: FuenteManos['tipo']
  /** Tamaño real del video, px. */
  ancho: number | null
  alto: number | null
  /** Cuadros por segundo que declara la cámara. */
  cuadrosCamara: number | null
  /** Cuadros por segundo que el seguimiento alcanza a procesar. */
  cuadrosSeguimiento: number
  /** Máximos que la cámara dice soportar. */
  anchoMax: number | null
  altoMax: number | null
  cuadrosMax: number | null
  camara: string | null
  /** Dónde corre el modelo de manos. */
  delegado: 'GPU' | 'CPU' | null
  /** Luminancia media 0..255. */
  luz: number | null
  /** Ajustes de imagen que este navegador deja controlar. */
  controles: string[]
  navegador: string
}

type Rango = { max?: number } | undefined

/** Lo que se saca de la pista de video. Pura: recibe lo que devuelven getSettings() y getCapabilities(). */
export function resumirPista(ajustes: MediaTrackSettings, capacidades: MediaTrackCapabilities | null) {
  const c = (capacidades ?? {}) as Record<string, unknown>
  const max = (r: unknown) => (r as Rango)?.max ?? null
  return {
    ancho: ajustes.width ?? null,
    alto: ajustes.height ?? null,
    cuadrosCamara: ajustes.frameRate ?? null,
    anchoMax: max(c.width),
    altoMax: max(c.height),
    cuadrosMax: max(c.frameRate),
    camara: ajustes.facingMode === 'user' ? 'Frontal' : ajustes.facingMode === 'environment' ? 'Trasera' : null,
    controles: CONTROLES_POSIBLES.filter((k) => k in c),
  }
}

/** Lee el estado actual de la fuente. Con fuentes simuladas no hay pista de video: quedan los datos del seguimiento. */
export function leerCamara(fuente: FuenteManos): ReporteCamara {
  const flujo = fuente.video?.srcObject
  const pista = typeof MediaStream !== 'undefined' && flujo instanceof MediaStream ? (flujo.getVideoTracks()[0] ?? null) : null
  const datos = pista
    ? resumirPista(pista.getSettings(), typeof pista.getCapabilities === 'function' ? pista.getCapabilities() : null)
    : { ancho: fuente.ultimo?.ancho ?? null, alto: fuente.ultimo?.alto ?? null, cuadrosCamara: null, anchoMax: null, altoMax: null, cuadrosMax: null, camara: null, controles: [] }
  return {
    fuente: fuente.tipo,
    ...datos,
    cuadrosSeguimiento: fuente.fps,
    delegado: 'delegado' in fuente ? (fuente.delegado as ReporteCamara['delegado']) : null,
    luz: fuente.luminancia,
    navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  }
}

const dato = (v: number | string | null, sufijo = '') => (v == null || v === '' ? 'sin dato' : `${typeof v === 'number' ? Math.round(v) : v}${sufijo}`)

/** Texto corto para pegar en el chat del equipo. */
export function textoReporte(r: ReporteCamara): string {
  return [
    `Fuente: ${r.fuente}`,
    `Video: ${r.ancho && r.alto ? `${r.ancho}×${r.alto}` : 'sin dato'} a ${dato(r.cuadrosCamara, ' cuadros/s')}`,
    `Máximo de la cámara: ${r.anchoMax && r.altoMax ? `${r.anchoMax}×${r.altoMax}` : 'sin dato'} a ${dato(r.cuadrosMax, ' cuadros/s')}`,
    `Seguimiento: ${dato(r.cuadrosSeguimiento, ' cuadros/s')} en ${dato(r.delegado)}`,
    `Luz: ${dato(r.luz, ' de 255')}`,
    `Ajustes que deja controlar: ${r.controles.length ? r.controles.join(', ') : 'ninguno'}`,
    `Navegador: ${r.navegador || 'sin dato'}`,
  ].join('\n')
}
