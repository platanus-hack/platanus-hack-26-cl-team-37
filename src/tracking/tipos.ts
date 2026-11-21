// Tipos comunes del seguimiento de manos. Toda fuente (camara | grabacion | sintetica) entrega lo mismo,
// con la forma del resultado de MediaPipe HandLandmarker, para que juegos y calibración no sepan de dónde viene.
//
// Convención de coordenadas (igual que MediaPipe sobre el video SIN espejo):
// - landmarks: x, y normalizados 0..1 al ancho/alto de la imagen (x crece a la derecha de la imagen cruda,
//   y hacia abajo); z = profundidad relativa a la muñeca, en la misma escala que x (negativo = más cerca).
//   Para dibujar en espejo (selfie) usar `espejarX` (1 − x).
// - worldLandmarks: metros, centrados en la mano, orientados como la cámara (x derecha, y abajo, z adelante).
// - lado: mano del sujeto ('derecha' | 'izquierda').

import type { LadoMano } from '../domain/types'
import type { P3 } from '../metrics/geometria'

export type { LadoMano, P3 }

export type TipoFuente = 'camara' | 'grabacion' | 'sintetica'
export const TIPOS_FUENTE: TipoFuente[] = ['camara', 'grabacion', 'sintetica']

export interface ManoSeguida {
  lado: LadoMano
  /** 21 puntos normalizados a la imagen (ver convención arriba). */
  landmarks: P3[]
  /** 21 puntos en metros, centrados en la mano. */
  worldLandmarks: P3[]
  /** Puntaje de lateralidad/detección 0..1. */
  confianza: number
}

export interface CuadroManos {
  /** Marca de tiempo en ms (reloj de la fuente; en grabación, ms desde el inicio). */
  t: number
  manos: ManoSeguida[]
  /** Tamaño de la imagen en px (para pasar landmarks a px). */
  ancho: number
  alto: number
}

/**
 * Estados de la fuente. Los cuatro del prompt (sin permiso | buscando | detectada | perdida) más
 * 'iniciando' (cargando modelo/cámara), 'sin camara' (no hay dispositivo) y 'error' (otro fallo),
 * que la calibración necesita para explicar qué pasó.
 */
export type EstadoSeguimiento =
  | 'iniciando'
  | 'sin permiso'
  | 'sin camara'
  | 'error'
  | 'buscando'
  | 'detectada'
  | 'perdida'

export interface FuenteManos {
  readonly tipo: TipoFuente
  readonly estado: EstadoSeguimiento
  /** Cuadros procesados por segundo (media móvil). */
  readonly fps: number
  /** Último cuadro publicado (null antes del primero). */
  readonly ultimo: CuadroManos | null
  /** ms (reloj de la fuente) de la última vez que hubo al menos una mano; null si nunca. */
  readonly ultimaDeteccion: number | null
  /** Luminancia media 0..255 del último cuadro muestreado (cámara) o simulada; null si no se sabe. */
  readonly luminancia: number | null
  /** Solo cámara: el <video> en vivo para mostrarlo (nunca se guarda ni se envía). */
  readonly video: HTMLVideoElement | null
  /** Mensaje técnico del último error (para depuración). */
  readonly detalleError: string | null
  iniciar(): Promise<void>
  detener(): void
  /** Se llama con cada cuadro nuevo. Devuelve la función para desuscribirse. */
  alCuadro(fn: (c: CuadroManos) => void): () => void
  alEstado(fn: (e: EstadoSeguimiento) => void): () => void
}

export function espejarX<T extends P3>(p: T): T {
  return { ...p, x: 1 - p.x }
}

/** Landmarks normalizados → px de la imagen. */
export function aPx(puntos: P3[], ancho: number, alto: number): P3[] {
  return puntos.map((p) => ({ x: p.x * ancho, y: p.y * alto, z: p.z * ancho }))
}
