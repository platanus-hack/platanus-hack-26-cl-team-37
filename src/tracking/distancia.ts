// Distancia cámara–mano de bajo cómputo (spec §6). Sin modelos extra: usa los mismos datos de HandLandmarker.
//
// 1. Perspectiva débil: escala s (px por metro) por mínimos cuadrados entre los puntos de la imagen (px) y los
//    worldLandmarks (m), ambos centrados. La fórmula del spec es s = Σ(u·X + v·Y) / Σ(X² + Y²); aquí se usa su
//    versión invariante a la rotación en el plano y al espejo (Procrustes 2D):
//      a = Σ(u·X + v·Y), b = Σ(u·Y − v·X)  →  s = √(a² + b²) / Σ(X² + Y²)   (y lo mismo con u → −u)
//    (igual a la del spec cuando imagen y mundo están alineados; se prueba también con x espejada).
//    Luego Z ≈ f / s, con f ≈ 0,8 × ancho (cámara frontal ~64° horizontal). Se ajusta con los 21 puntos (menos
//    ruido) y se refiere al centro de la palma (0, 5, 9, 13, 17) con la diferencia de z de los worldLandmarks.
// 2. Regla: si hay largo de mano medido, el mundo se escala por largoRegla / largoMundo (MediaPipe usa una mano
//    de tamaño promedio): Z = f · k / s.
// 3. Respaldo pinhole (geometria.distanciaAproxCm) si faltan worldLandmarks o el ajuste es degenerado.
// 4. EstimadorDistancia suaviza con One Euro por lado. Mostrar siempre como "aprox.".

import { distanciaAproxCm, largoMano, type P3 } from '../metrics/geometria'
import { FiltroOneEuro } from './oneEuro'
import type { LadoMano, ManoSeguida } from './tipos'

export const FACTOR_FOCAL = 0.8
/** Largo muñeca→punta del dedo medio promedio de un adulto (cm), para el respaldo pinhole. */
export const LARGO_MANO_PROMEDIO_CM = 18.5
export const PUNTOS_PALMA = [0, 5, 9, 13, 17]
export const TODOS_LOS_PUNTOS = Array.from({ length: 21 }, (_, i) => i)

export interface OpcionesDistancia {
  /** Focal en px. Por defecto FACTOR_FOCAL × ancho. */
  focalPx?: number
  /** Largo de mano medido con regla (cm), si el perfil lo tiene. */
  largoReglaCm?: number | null
  /** Índices usados en el ajuste (por defecto los 21). */
  indices?: number[]
}

export interface EstimacionDistancia {
  cm: number
  metodo: 'perspectiva' | 'pinhole'
  /** px por metro de mundo (solo perspectiva). */
  escalaPxPorM: number | null
}

/** Escala px/m entre landmarks (normalizados) y worldLandmarks (m), por mínimos cuadrados. null si degenerado. */
export function escalaPerspectivaDebil(
  landmarks: P3[],
  world: P3[],
  ancho: number,
  alto: number,
  indices: number[] = TODOS_LOS_PUNTOS,
): number | null {
  const n = indices.length
  if (n < 3 || landmarks.length < 21 || world.length < 21) return null
  let mu = 0, mv = 0, mX = 0, mY = 0
  for (const i of indices) {
    mu += landmarks[i].x * ancho
    mv += landmarks[i].y * alto
    mX += world[i].x
    mY += world[i].y
  }
  mu /= n; mv /= n; mX /= n; mY /= n
  // a, b: ajuste directo; ae, be: con la imagen espejada (x → −x). Se queda el mejor de los dos.
  let a = 0, b = 0, ae = 0, be = 0, den = 0
  for (const i of indices) {
    const u = landmarks[i].x * ancho - mu
    const v = landmarks[i].y * alto - mv
    const X = world[i].x - mX
    const Y = world[i].y - mY
    a += u * X + v * Y
    b += u * Y - v * X
    ae += -u * X + v * Y
    be += -u * Y - v * X
    den += X * X + Y * Y
  }
  if (den < 1e-8) return null
  const s = Math.max(Math.hypot(a, b), Math.hypot(ae, be)) / den
  return s > 0 && Number.isFinite(s) ? s : null
}

/** Distancia aproximada (cm) de la cámara al centro de la mano. null si no hay datos. */
export function estimarDistanciaCm(
  mano: Pick<ManoSeguida, 'landmarks' | 'worldLandmarks'>,
  ancho: number,
  alto: number,
  opciones: OpcionesDistancia = {},
): EstimacionDistancia | null {
  const f = opciones.focalPx ?? FACTOR_FOCAL * ancho
  const regla = opciones.largoReglaCm ?? null
  const largoMundoM = mano.worldLandmarks.length >= 21 ? largoMano(mano.worldLandmarks) : 0
  const s = escalaPerspectivaDebil(mano.landmarks, mano.worldLandmarks, ancho, alto, opciones.indices)
  if (s != null && largoMundoM > 0) {
    const k = regla && regla > 0 ? regla / 100 / largoMundoM : 1
    // f·k/s es la profundidad del centroide de los puntos usados; se lleva al centro de la palma con la
    // diferencia de z del mundo (con el puño, los dedos quedan más cerca de la cámara que la palma).
    const ind = opciones.indices ?? TODOS_LOS_PUNTOS
    const zMedia = (idx: number[]) => idx.reduce((t, i) => t + mano.worldLandmarks[i].z, 0) / idx.length
    const ajuste = k * (zMedia(PUNTOS_PALMA) - zMedia(ind))
    return { cm: ((f * k) / s + ajuste) * 100, metodo: 'perspectiva', escalaPxPorM: s }
  }
  if (mano.landmarks.length < 21) return null
  // Respaldo pinhole: largo de la mano en px de la imagen (segmentos 0-9-10-11-12, solo x, y).
  const px = mano.landmarks.map((p) => ({ x: p.x * ancho, y: p.y * alto, z: 0 }))
  const largoPx = largoMano(px)
  const cm = distanciaAproxCm(largoPx * ((FACTOR_FOCAL * ancho) / f), ancho, regla ?? LARGO_MANO_PROMEDIO_CM)
  return cm == null ? null : { cm, metodo: 'pinhole', escalaPxPorM: null }
}

/**
 * Focal del dispositivo a partir de una distancia medida con regla (calibración opcional en /depuracion):
 * f = Z · s / k.
 */
export function focalDesdeDistanciaConocida(
  mano: Pick<ManoSeguida, 'landmarks' | 'worldLandmarks'>,
  ancho: number,
  alto: number,
  distanciaRealCm: number,
  largoReglaCm: number | null = null,
): number | null {
  const s = escalaPerspectivaDebil(mano.landmarks, mano.worldLandmarks, ancho, alto)
  const largoMundoM = largoMano(mano.worldLandmarks)
  if (s == null || largoMundoM <= 0) return null
  const k = largoReglaCm ? largoReglaCm / 100 / largoMundoM : 1
  return ((distanciaRealCm / 100) * s) / k
}

/** Estimador con suavizado One Euro por lado de mano. */
export class EstimadorDistancia {
  private filtros = new Map<LadoMano, FiltroOneEuro>()
  opciones: OpcionesDistancia
  constructor(opciones: OpcionesDistancia = {}) {
    this.opciones = opciones
  }

  estimar(mano: ManoSeguida, ancho: number, alto: number, tMs: number): EstimacionDistancia | null {
    const e = estimarDistanciaCm(mano, ancho, alto, this.opciones)
    if (!e) return null
    let f = this.filtros.get(mano.lado)
    if (!f) {
      f = new FiltroOneEuro(0.8, 0.2)
      this.filtros.set(mano.lado, f)
    }
    return { ...e, cm: f.filtrar(e.cm, tMs) }
  }

  reiniciar(lado?: LadoMano) {
    if (lado) this.filtros.get(lado)?.reiniciar()
    else this.filtros.forEach((f) => f.reiniciar())
  }
}
