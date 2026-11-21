// Geometría de la mano sobre los 21 puntos de MediaPipe Hands.
// Índices: 0 muñeca · pulgar 1-4 · índice 5-8 · medio 9-12 · anular 13-16 · meñique 17-20.

export interface P3 {
  x: number
  y: number
  z: number
}

export type Dedo = 'pulgar' | 'indice' | 'medio' | 'anular' | 'menique'
export const DEDOS: Dedo[] = ['pulgar', 'indice', 'medio', 'anular', 'menique']

export const CONEXIONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export function resta(a: P3, b: P3): P3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function norma(v: P3): number {
  return Math.hypot(v.x, v.y, v.z)
}

export function distancia(a: P3, b: P3): number {
  return norma(resta(a, b))
}

/** Ángulo en grados entre dos vectores (0 = paralelos). */
export function anguloEntre(u: P3, v: P3): number {
  const nu = norma(u)
  const nv = norma(v)
  if (nu === 0 || nv === 0) return 0
  const c = (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI
}

/**
 * Flexión de una articulación: ángulo entre el segmento proximal (a→b) y el distal (b→c).
 * 0° = dedo recto; crece al flexionar.
 */
export function flexionArticulacion(a: P3, b: P3, c: P3): number {
  return anguloEntre(resta(b, a), resta(c, b))
}

/** Tripletas [proximal, articulación, distal] para MCP y PIP de cada dedo (en el pulgar: MCP e IP). */
export const ARTICULACIONES: Record<Dedo, { mcp: [number, number, number]; pip: [number, number, number] }> = {
  pulgar: { mcp: [1, 2, 3], pip: [2, 3, 4] },
  indice: { mcp: [0, 5, 6], pip: [5, 6, 7] },
  medio: { mcp: [0, 9, 10], pip: [9, 10, 11] },
  anular: { mcp: [0, 13, 14], pip: [13, 14, 15] },
  menique: { mcp: [0, 17, 18], pip: [17, 18, 19] },
}

/**
 * Flexión de un dedo = flexión MCP + flexión PIP (grados).
 * Se omite la DIP porque MediaPipe la estima con más ruido.
 */
export function flexionDedo(puntos: P3[], dedo: Dedo): number {
  const { mcp, pip } = ARTICULACIONES[dedo]
  return (
    flexionArticulacion(puntos[mcp[0]], puntos[mcp[1]], puntos[mcp[2]]) +
    flexionArticulacion(puntos[pip[0]], puntos[pip[1]], puntos[pip[2]])
  )
}

export function flexionTodos(puntos: P3[]): Record<Dedo, number> {
  return {
    pulgar: flexionDedo(puntos, 'pulgar'),
    indice: flexionDedo(puntos, 'indice'),
    medio: flexionDedo(puntos, 'medio'),
    anular: flexionDedo(puntos, 'anular'),
    menique: flexionDedo(puntos, 'menique'),
  }
}

/**
 * Largo de la mano: muñeca (0) a punta del dedo medio (12), sumando los segmentos 0-9-10-11-12.
 * Con worldLandmarks (metros) devuelve metros.
 */
export function largoMano(puntos: P3[]): number {
  const cadena = [0, 9, 10, 11, 12]
  let total = 0
  for (let i = 1; i < cadena.length; i++) total += distancia(puntos[cadena[i - 1]], puntos[cadena[i]])
  return total
}

/** Distancia pulgar (4) – índice (8) en las mismas unidades que los puntos. */
export function aperturaPinza(puntos: P3[]): number {
  return distancia(puntos[4], puntos[8])
}

/**
 * Escala cm por unidad de worldLandmarks. Si el perfil tiene un largo medido con regla,
 * se usa como referencia; si no, se asume que worldLandmarks están en metros.
 */
export function escalaCm(largoWorld: number, largoReglaCm: number | null): number {
  if (largoReglaCm && largoWorld > 0) return largoReglaCm / largoWorld
  return 100
}

export function aperturaPinzaCm(puntosWorld: P3[], escalaCmPorUnidad: number): number {
  return aperturaPinza(puntosWorld) * escalaCmPorUnidad
}

/**
 * Apertura de la mano normalizada (0 = puño, ~1 = abierta): distancia media de las puntas
 * a la muñeca dividida por el largo de la palma (0→9). Independiente de la escala.
 */
export function aperturaMano(puntos: P3[]): number {
  const palma = distancia(puntos[0], puntos[9])
  if (palma === 0) return 0
  const puntas = [8, 12, 16, 20]
  const media = puntas.reduce((s, i) => s + distancia(puntos[0], puntos[i]), 0) / puntas.length
  // puño cerrado ≈ 0.9 palmas, mano abierta ≈ 1.9 palmas
  return Math.min(1.2, Math.max(0, (media / palma - 0.9) / 1.0))
}

/**
 * Distancia aproximada cámara–mano con modelo pinhole.
 * focalPx ≈ 0,8 × ancho de imagen (cámara frontal con ~64° de campo horizontal).
 */
export function distanciaAproxCm(largoManoPx: number, anchoImagenPx: number, largoRealCm: number): number | null {
  if (largoManoPx <= 0) return null
  const focalPx = 0.8 * anchoImagenPx
  return (focalPx * largoRealCm) / largoManoPx
}

/** Luminancia media (0..255) de un buffer RGBA, muestreando cada `paso` píxeles. */
export function luminanciaMedia(rgba: ArrayLike<number>, paso = 16): number {
  let suma = 0
  let n = 0
  for (let i = 0; i + 2 < rgba.length; i += 4 * paso) {
    suma += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
    n++
  }
  return n ? suma / n : 0
}

export type NivelLuz = 'poca' | 'buena' | 'excesiva'
export function clasificarLuz(lum: number): NivelLuz {
  if (lum < 60) return 'poca'
  if (lum > 215) return 'excesiva'
  return 'buena'
}
