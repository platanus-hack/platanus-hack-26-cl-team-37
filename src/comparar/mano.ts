// F38 · Mano 3D de comparación: partes puras (sin three.js) para poder probarlas.
//  - Modelo paramétrico: 21 puntos (orden MediaPipe) a partir de la flexión máxima de cada dedo y un avance 0..1
//    (0 = mano abierta, 1 = flexión máxima guardada). La apertura pulgar–índice se invierte para animar con la curva real.
//  - Ejes de la mano y paso de una pose real a los ejes de la mano neutra (muñeca 3D).
import type { FlexionDedos, LadoMano } from '../domain/types'

export type V3 = [number, number, number]

export const DEDOS_ORDEN: (keyof FlexionDedos)[] = ['pulgar', 'indice', 'medio', 'anular', 'menique']
/** Punta de cada dedo en los 21 puntos. */
export const PUNTA: Record<keyof FlexionDedos, number> = { pulgar: 4, indice: 8, medio: 12, anular: 16, menique: 20 }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norma = (a: V3) => Math.hypot(a[0], a[1], a[2])
export function unitario(a: V3): V3 {
  const n = norma(a)
  return n > 1e-9 ? mul(a, 1 / n) : [0, 0, 0]
}

/** Gira el vector unitario `a` hacia `b` una fracción `t` del ángulo que los separa (slerp). */
export function girarHacia(a: V3, b: V3, t: number): V3 {
  const eje = cross(a, b)
  const sen = norma(eje)
  const cos = Math.max(-1, Math.min(1, dot(a, b)))
  if (sen < 1e-9) return a
  const k = unitario(eje)
  const ang = Math.atan2(sen, cos) * t
  // Rodrigues
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return add(add(mul(a, c), mul(cross(k, a), s)), mul(k, dot(k, a) * (1 - c)))
}

// ejes locales: muñeca en el origen, dedos hacia +Y, palma hacia +Z (mm); pulgar hacia +X
const LARGOS = [
  { id: 'indice' as const, base: [24, 84, 0] as V3, largo: 72, abre: 0.1 },
  { id: 'medio' as const, base: [5, 88, 0] as V3, largo: 80, abre: 0 },
  { id: 'anular' as const, base: [-14, 84, 0] as V3, largo: 75, abre: -0.08 },
  { id: 'menique' as const, base: [-31, 76, 0] as V3, largo: 60, abre: -0.18 },
]
const TRAMOS = [0.46, 0.3, 0.24]
const U_ABIERTO = unitario([0.62, 0.75, 0.22])
const U_CERRADO = unitario([-0.55, 0.45, 0.72])
/** Largo de referencia del modelo (muñeca a punta del medio, mm): 88 + 80 + algo. El modelo se escala con el largo de mano real. */
export const LARGO_MODELO_MM = 184

/**
 * Los 21 puntos de la mano modelo (mm). `flex` = flexión máxima (MCP + PIP) de cada dedo en grados; `s` = cuánto de esa
 * flexión (0 abierta … 1 máxima); `escala` multiplica todo (largo de mano real / 18,4 cm); `lado` izquierda = espejo en x.
 */
export function poseModelo(flex: Partial<FlexionDedos>, s: number, escala = 1, lado: LadoMano = 'derecha'): V3[] {
  const p: V3[] = Array.from({ length: 21 }, () => [0, 0, 0] as V3)
  const t = s * Math.min(1.2, (flex.pulgar || 0) / 65)
  let pos: V3 = [20, 22, 6]
  p[1] = pos
  const tramosPulgar: [number, number][] = [
    [38, 0.55],
    [30, 0.85],
    [26, 1],
  ]
  tramosPulgar.forEach(([l, w], i) => {
    pos = add(pos, mul(girarHacia(U_ABIERTO, U_CERRADO, Math.min(1, t * w)), l))
    p[2 + i] = pos
  })
  LARGOS.forEach((d, k) => {
    const th = (s * (flex[d.id] || 0) * Math.PI) / 180
    const ang = [th / 2, th / 2, (th / 2) * 0.65]
    let q: V3 = d.base
    let phi = 0
    const i0 = 5 + k * 4
    p[i0] = q
    ang.forEach((a, j) => {
      phi += a
      const dir = unitario([d.abre * (1 - phi / Math.PI), Math.cos(phi), Math.sin(phi)])
      q = add(q, mul(dir, d.largo * TRAMOS[j]!))
      p[i0 + 1 + j] = q
    })
  })
  const f = lado === 'izquierda' ? -1 : 1
  return p.map((v) => [v[0] * escala * f, v[1] * escala, v[2] * escala] as V3)
}

/** Distancia pulgar–índice en cm (puntos en mm). */
export function distanciaPinzaCm(p: V3[]): number {
  return norma(sub(p[4]!, p[8]!)) / 10
}

/** Tabla apertura(cm) para s = 0, 1/n … 1; sirve para invertir muchas veces sin recalcular la pose. */
export function tablaApertura(flex: Partial<FlexionDedos>, escala = 1, n = 100): number[] {
  return Array.from({ length: n + 1 }, (_, j) => distanciaPinzaCm(poseModelo(flex, j / n, escala)))
}

/** s (0..1) cuya apertura pulgar–índice del modelo se parece más a `cm`. */
export function sParaApertura(tabla: number[], cm: number): number {
  let mejor = 0
  let dif = Infinity
  tabla.forEach((d, j) => {
    const x = Math.abs(d - cm)
    if (x < dif) {
      dif = x
      mejor = j
    }
  })
  return mejor / (tabla.length - 1)
}

// ---------------------------------------------------------------------------------------------------------------
// Poses reales

/** Cámara (x derecha, y abajo, z adelante) → escena de three.js (y arriba, z hacia quien mira): como la ve la cámara. */
export function camaraAEscena(p: V3): V3 {
  return [p[0], -p[1], -p[2]]
}

export interface Ejes {
  x: V3
  y: V3
  z: V3
}

/**
 * Ejes de la mano: y = muñeca→nudillo del medio, x = (nudillo índice − nudillo meñique) ortogonalizado respecto de y,
 * z = x × y (invertido en la mano izquierda para que ambas manos queden comparables).
 */
export function ejesDeMano(p: V3[], lado: LadoMano): Ejes {
  const y = unitario(sub(p[9]!, p[0]!))
  const v = sub(p[5]!, p[17]!)
  const x = unitario(sub(v, mul(y, dot(v, y))))
  const z0 = cross(x, y)
  return { x, y, z: lado === 'izquierda' ? mul(z0, -1) : z0 }
}

/** Expresa los puntos en los ejes dados, con origen en la muñeca de la propia pose. */
export function aEjes(p: V3[], ejes: Ejes): V3[] {
  const o = p[0]!
  return p.map((q) => {
    const d = sub(q, o)
    return [dot(d, ejes.x), dot(d, ejes.y), dot(d, ejes.z)] as V3
  })
}

/** Ejes desde una matriz 3×3 en orden de filas (r0_00…r0_22) cuyas COLUMNAS son los ejes x, y, z de la mano neutra. */
export function ejesDeMatriz(r: number[]): Ejes | null {
  if (r.length !== 9 || r.some((v) => !Number.isFinite(v))) return null
  return { x: [r[0]!, r[3]!, r[6]!], y: [r[1]!, r[4]!, r[7]!], z: [r[2]!, r[5]!, r[8]!] }
}

/** Lee r0_00…r0_22 de `metricas.juego`; null si falta alguno. */
export function matrizNeutra(juego: Record<string, number | null> | undefined): number[] | null {
  if (!juego) return null
  const r: number[] = []
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const v = juego[`r0_${i}${j}`]
      if (typeof v !== 'number') return null
      r.push(v)
    }
  return r
}

/** Dirección de los dedos (muñeca→nudillo medio) en los puntos dados, unitaria. */
export function direccionDedos(p: V3[]): V3 {
  return unitario(sub(p[9]!, p[0]!))
}

/**
 * Mano de reposo del modelo girada alrededor de la muñeca: flexión (+) / extensión (−) sobre el eje x y desviación
 * radial (+) / cubital (−) sobre el eje z, en grados. Sirve cuando la sesión no guardó los puntos de la pose.
 */
export function poseMunecaModelo(flexExtGrados: number, desvGrados: number, escala = 1, lado: LadoMano = 'derecha'): V3[] {
  const base = poseModelo({}, 0, escala, lado)
  const a = (flexExtGrados * Math.PI) / 180
  const b = ((lado === 'izquierda' ? -desvGrados : desvGrados) * Math.PI) / 180
  const giro = (v: V3): V3 => {
    // flexión: los dedos (y) se inclinan hacia la palma (+z) alrededor de x
    const y1 = v[1] * Math.cos(a) - v[2] * Math.sin(a)
    const z1 = v[1] * Math.sin(a) + v[2] * Math.cos(a)
    // desviación: los dedos se inclinan hacia el pulgar (+x) alrededor de z
    const x2 = v[0] * Math.cos(b) + y1 * Math.sin(b)
    const y2 = -v[0] * Math.sin(b) + y1 * Math.cos(b)
    return [x2, y2, z1]
  }
  return base.map(giro)
}
