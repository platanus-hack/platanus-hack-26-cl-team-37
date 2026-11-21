// Manos sintéticas: generador procedural de poses con la misma forma que MediaPipe (21 puntos image + world, lado).
// Puro (sin DOM): lo usan la fuente `sintetica`, las pruebas unitarias y los e2e de los juegos (F09–F27).
//
// ── API ─────────────────────────────────────────────────────────────────────────────────────────────
//  manoSintetica(pose, camara?)       → ManoSeguida para una pose fija (ver PoseMano y CamaraSintetica).
//  manosEnGuion(guion, tMs)           → { manos, luz } del guion en el instante tMs (determinista).
//  secuencia([[durMs, pose], ...])    → PoseClave[] con t acumulado (cada pose dura/llega en durMs).
//  guionPreset(nombre, lado?)         → guiones listos: GUIONES_PRESET (quieta, abrir-cerrar, pinza, mover,
//                                        calibracion, sin-mano, ambas).
//  Ejemplo:
//    const g: GuionSintetico = { manos: [{ lado: 'derecha', poses: secuencia([
//      [0, { apertura: 1 }], [800, { apertura: 0 }], [800, { apertura: 1, pinzaCm: 0.5 }] ]) }] }
//  En la app: ?fuente=sintetica&guion=pinza&lado=izquierda, o en vivo (e2e):
//    window.__manoviva.fuente.cargarGuion(g) · .fijarPose({ apertura: 0 }) · .ocultar()
//
// Semántica del guion: cada PoseClave hereda los campos no indicados de la anterior (`dedos` se reemplaza
// entero). Entre dos claves se interpola linealmente; `visible` cambia en la clave. Antes de la primera clave
// rige la primera; después de la última rige la última o, con `bucle` (por defecto true), se repite.
//
// Modelo: mano derecha adulta promedio (largo muñeca→punta del medio 18,2 cm), palma hacia la cámara, dedos
// hacia arriba en la imagen. Imagen = proyección pinhole con f = factorFocal × ancho a `distanciaCm` del centro
// de la palma. La mano derecha del sujeto aparece a la izquierda de la imagen cruda (sin espejo), con el pulgar
// hacia +x, como la ve la cámara frontal. La izquierda es su espejo.

import { DEDOS, type Dedo, type P3 } from '../metrics/geometria'
import type { LadoMano, ManoSeguida } from './tipos'

export interface PoseMano {
  /** 0 = puño, 1 = mano abierta. Da la flexión de los dedos que no estén en `dedos`. */
  apertura: number
  /** Flexión 0..1 por dedo (sobrescribe apertura para ese dedo). */
  dedos: Partial<Record<Dedo, number>>
  /** Pinza pulgar–dedo: distancia entre puntas en cm (null = pulgar libre según apertura). */
  pinzaCm: number | null
  /** Con qué dedo hace la pinza `pinzaCm` (por defecto el índice). Lo usa Pinza fina (F23) para tocar cada dedo. */
  pinzaDedo: Exclude<Dedo, 'pulgar'>
  /** Centro de la palma en la imagen cruda, 0..1. */
  x: number
  y: number
  /** Distancia de la cámara al centro de la palma (cm). */
  distanciaCm: number
  /** Giro en el plano de la imagen (grados, positivo = horario en la imagen para la derecha). */
  giroDeg: number
  /** Prono-supinación (giro del antebrazo): 0 = palma a la cámara, 180 = dorso. */
  pronacionDeg: number
  /** Inclinación (dedos hacia/desde la cámara). */
  inclinacionDeg: number
  confianza: number
  visible: boolean
}

export interface CamaraSintetica {
  ancho: number
  alto: number
  /** f = factorFocal × ancho (por defecto 0,8, el mismo que asume el estimador de distancia). */
  factorFocal: number
  /** Largo real de la mano simulada (cm). El mundo se entrega siempre con la mano promedio, como MediaPipe. */
  largoManoRealCm: number | null
}

export type PoseClave = { t: number } & Partial<PoseMano>

export interface GuionMano {
  lado: LadoMano
  poses: PoseClave[]
}

export interface GuionSintetico {
  manos: GuionMano[]
  /** Repetir al terminar (por defecto true). */
  bucle?: boolean
  /** Luminancia simulada 0..255 (por defecto 140, "buena"). */
  luz?: number
  camara?: Partial<CamaraSintetica>
}

export const POSE_BASE: PoseMano = {
  apertura: 1,
  dedos: {},
  pinzaCm: null,
  pinzaDedo: 'indice',
  x: 0.5,
  y: 0.55,
  distanciaCm: 50,
  giroDeg: 0,
  pronacionDeg: 0,
  inclinacionDeg: 0,
  confianza: 0.95,
  visible: true,
}

export const CAMARA_BASE: CamaraSintetica = { ancho: 640, alto: 480, factorFocal: 0.8, largoManoRealCm: null }

// ── Modelo de la mano (metros, mano derecha, palma a la cámara: x derecha, y abajo, z hacia adelante) ──

type V = [number, number, number]
const suma = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const res = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const por = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const largo = (a: V) => Math.hypot(a[0], a[1], a[2])
const unit = (a: V, resp: V = [1, 0, 0]): V => {
  const l = largo(a)
  return l < 1e-9 ? resp : por(a, 1 / l)
}
const mezcla = (a: V, b: V, k: number): V => suma(a, por(res(b, a), k))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lim = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const RAD = Math.PI / 180

const MUNECA: V = [0, 0, 0]
const CMC_PULGAR: V = [0.022, -0.025, -0.008]
const BASES: Record<Exclude<Dedo, 'pulgar'>, { mcp: V; dir: V; seg: [number, number, number] }> = {
  indice: { mcp: [0.026, -0.085, 0], dir: unit([0.1, -1, 0]), seg: [0.04, 0.024, 0.02] },
  medio: { mcp: [0.004, -0.088, 0], dir: [0, -1, 0], seg: [0.045, 0.028, 0.021] },
  anular: { mcp: [-0.016, -0.083, 0], dir: unit([-0.1, -1, 0]), seg: [0.042, 0.027, 0.021] },
  menique: { mcp: [-0.034, -0.073, 0], dir: unit([-0.2, -1, 0]), seg: [0.032, 0.019, 0.018] },
}
const SEG_PULGAR = [0.044, 0.032, 0.028]
const DIR_PULGAR_META = unit([0.78, -0.62, -0.1])
const DIR_PULGAR_FALANGES = unit([0.62, -0.78, -0.1])
/** Punta del pulgar con el puño cerrado: delante de la palma, sobre el índice/medio. */
const PUNTA_PULGAR_CERRADO: V = [0.005, -0.075, -0.03]
/** Flexión máxima por articulación (MCP, PIP, DIP) en grados. */
const FLEX_MAX = [80, 100, 70]
const PALMA = [0, 5, 9, 13, 17]
/** Landmark de la punta de cada dedo largo. */
const PUNTA_DEDO: Record<Exclude<Dedo, 'pulgar'>, number> = { indice: 8, medio: 12, anular: 16, menique: 20 }

function dedoLargo(mcp: V, dir: V, seg: number[], flex: number): V[] {
  const out: V[] = [mcp]
  let ang = 0
  let p = mcp
  for (let k = 0; k < 3; k++) {
    ang += FLEX_MAX[k] * flex * RAD
    // Flexionar = girar la dirección del dedo hacia la cámara (−z), porque la palma mira a la cámara.
    const d: V = suma(por(dir, Math.cos(ang)), [0, 0, -Math.sin(ang)])
    p = suma(p, por(d, seg[k]))
    out.push(p)
  }
  return out
}

function pulgarAbierto(): V[] {
  const p1 = CMC_PULGAR
  const p2 = suma(p1, por(DIR_PULGAR_META, SEG_PULGAR[0]))
  const p3 = suma(p2, por(DIR_PULGAR_FALANGES, SEG_PULGAR[1]))
  const p4 = suma(p3, por(DIR_PULGAR_FALANGES, SEG_PULGAR[2]))
  return [p1, p2, p3, p4]
}
const PULGAR_ABIERTO = pulgarAbierto()

/** FABRIK con raíz fija: lleva la punta de la cadena al objetivo manteniendo largos. Determinista. */
function fabrik(inicial: V[], largos: number[], objetivo: V, iter = 24): V[] {
  const q = inicial.map((p) => [...p] as V)
  const raiz = q[0]
  const total = largos.reduce((s, l) => s + l, 0)
  if (largo(res(objetivo, raiz)) >= total) {
    const d = unit(res(objetivo, raiz))
    for (let i = 1; i < q.length; i++) q[i] = suma(q[i - 1], por(d, largos[i - 1]))
    return q
  }
  for (let it = 0; it < iter; it++) {
    q[q.length - 1] = objetivo
    for (let i = q.length - 2; i >= 0; i--) q[i] = suma(q[i + 1], por(unit(res(q[i], q[i + 1])), largos[i]))
    q[0] = raiz
    for (let i = 1; i < q.length; i++) q[i] = suma(q[i - 1], por(unit(res(q[i], q[i - 1])), largos[i - 1]))
  }
  return q
}

export function flexionDe(pose: Pick<PoseMano, 'apertura' | 'dedos'>, dedo: Dedo): number {
  return lim(pose.dedos[dedo] ?? 1 - pose.apertura)
}

/** 21 puntos de la mano derecha canónica (m), sin centrar ni rotar. */
export function puntosCanonicos(pose: Pick<PoseMano, 'apertura' | 'dedos' | 'pinzaCm'> & { pinzaDedo?: PoseMano['pinzaDedo'] }): V[] {
  const pts: V[] = Array.from({ length: 21 }, () => [0, 0, 0] as V)
  pts[0] = MUNECA
  const dedos: [Exclude<Dedo, 'pulgar'>, number][] = [['indice', 5], ['medio', 9], ['anular', 13], ['menique', 17]]
  for (const [d, i0] of dedos) {
    const b = BASES[d]
    dedoLargo(b.mcp, b.dir, b.seg, flexionDe(pose, d)).forEach((p, k) => (pts[i0 + k] = p))
  }
  // Pulgar: objetivo natural según su flexión; con pinza, la punta va a pinzaCm de la punta del índice.
  const fp = flexionDe(pose, 'pulgar')
  let objetivo = mezcla(PULGAR_ABIERTO[3], PUNTA_PULGAR_CERRADO, fp)
  if (pose.pinzaCm != null) {
    const punta = pts[PUNTA_DEDO[pose.pinzaDedo ?? 'indice']]
    const dir = unit(res(objetivo, punta))
    objetivo = suma(punta, por(dir, Math.max(0, pose.pinzaCm) / 100))
  }
  fabrik(PULGAR_ABIERTO, SEG_PULGAR, objetivo).forEach((p, k) => (pts[1 + k] = p))
  return pts
}

function rotar(p: V, giro: number, incl: number, pron: number): V {
  // R = Rz(giro) · Rx(inclinación) · Ry(pronación)
  let [x, y, z] = p
  const cy = Math.cos(pron * RAD), sy = Math.sin(pron * RAD)
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  const cx = Math.cos(incl * RAD), sx = Math.sin(incl * RAD)
  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
  const cz = Math.cos(giro * RAD), sz = Math.sin(giro * RAD)
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
  return [x, y, z]
}

const aP3 = (v: V): P3 => ({ x: v[0], y: v[1], z: v[2] })

/** Largo muñeca→punta del medio del modelo (cm), con la mano abierta. */
export const LARGO_MODELO_CM = (() => {
  const p = puntosCanonicos({ apertura: 1, dedos: {}, pinzaCm: null })
  const cadena = [0, 9, 10, 11, 12]
  let l = 0
  for (let i = 1; i < cadena.length; i++) l += largo(res(p[cadena[i]], p[cadena[i - 1]]))
  return l * 100
})()

export function manoSintetica(
  poseParcial: Partial<PoseMano> & { lado?: LadoMano },
  camaraParcial: Partial<CamaraSintetica> = {},
): ManoSeguida {
  const pose = { ...POSE_BASE, ...poseParcial }
  const lado = poseParcial.lado ?? 'derecha'
  const cam = { ...CAMARA_BASE, ...camaraParcial }
  const canon = puntosCanonicos(pose)
  const centro = por(PALMA.reduce<V>((s, i) => suma(s, canon[i]), [0, 0, 0]), 1 / PALMA.length)
  const mundo = canon.map((p) => {
    const r = rotar(res(p, centro), pose.giroDeg, pose.inclinacionDeg, pose.pronacionDeg)
    return (lado === 'izquierda' ? [-r[0], r[1], r[2]] : r) as V
  })
  const escalaReal = cam.largoManoRealCm ? cam.largoManoRealCm / LARGO_MODELO_CM : 1
  const f = cam.factorFocal * cam.ancho
  const D = pose.distanciaCm / 100
  const C: V = [((pose.x - 0.5) * cam.ancho * D) / f, ((pose.y - 0.5) * cam.alto * D) / f, D]
  const camara = mundo.map((p) => suma(C, por(p, escalaReal)))
  const zMuneca = camara[0][2]
  const landmarks = camara.map((p) => ({
    x: (f * p[0]) / p[2] / cam.ancho + 0.5,
    y: (f * p[1]) / p[2] / cam.alto + 0.5,
    z: ((p[2] - zMuneca) * (f / zMuneca)) / cam.ancho,
  }))
  return { lado, landmarks, worldLandmarks: mundo.map(aP3), confianza: pose.confianza }
}

// ── Guiones ─────────────────────────────────────────────────────────────────────────────────────────

type PoseCompleta = PoseMano & { dedos: Record<Dedo, number> }

function completar(p: PoseMano): PoseCompleta {
  const dedos = {} as Record<Dedo, number>
  for (const d of DEDOS) dedos[d] = flexionDe(p, d)
  return { ...p, dedos }
}

/** Claves con todos los campos (herencia aplicada), ordenadas por t. */
export function resolverClaves(poses: PoseClave[]): { t: number; pose: PoseMano }[] {
  const orden = [...poses].sort((a, b) => a.t - b.t)
  let previa: PoseMano = POSE_BASE
  return orden.map(({ t, ...resto }) => {
    previa = { ...previa, ...resto }
    return { t, pose: previa }
  })
}

function interpolar(a: PoseMano, b: PoseMano, k: number): PoseMano {
  const A = completar(a)
  const B = completar(b)
  const dedos = {} as Record<Dedo, number>
  for (const d of DEDOS) dedos[d] = lerp(A.dedos[d], B.dedos[d], k)
  // Pinza: se mezcla el objetivo del pulgar pasando por la distancia natural si un extremo no tiene pinza.
  let pinzaCm: number | null
  if (a.pinzaCm != null && b.pinzaCm != null) pinzaCm = lerp(a.pinzaCm, b.pinzaCm, k)
  else if (a.pinzaCm == null && b.pinzaCm == null) pinzaCm = null
  else {
    const libre = a.pinzaCm == null ? a : b
    const natural = pinzaNaturalCm({ ...libre, dedos, pinzaDedo: (a.pinzaCm == null ? b : a).pinzaDedo })
    pinzaCm = a.pinzaCm != null ? lerp(a.pinzaCm, natural, k) : lerp(natural, b.pinzaCm as number, k)
  }
  // Con pinza en ambos extremos sobre dedos distintos, el dedo cambia a mitad del tramo.
  const pinzaDedo = a.pinzaCm != null && (b.pinzaCm == null || k < 0.5) ? a.pinzaDedo : b.pinzaCm != null ? b.pinzaDedo : a.pinzaDedo
  return {
    apertura: lerp(a.apertura, b.apertura, k),
    dedos,
    pinzaCm,
    pinzaDedo,
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    distanciaCm: lerp(a.distanciaCm, b.distanciaCm, k),
    giroDeg: lerp(a.giroDeg, b.giroDeg, k),
    pronacionDeg: lerp(a.pronacionDeg, b.pronacionDeg, k),
    inclinacionDeg: lerp(a.inclinacionDeg, b.inclinacionDeg, k),
    confianza: lerp(a.confianza, b.confianza, k),
    visible: a.visible,
  }
}

/** Distancia pulgar–punta del dedo (índice por defecto) en cm con el pulgar libre. */
export function pinzaNaturalCm(pose: Pick<PoseMano, 'apertura' | 'dedos'> & { pinzaDedo?: PoseMano['pinzaDedo'] }): number {
  const p = puntosCanonicos({ ...pose, pinzaCm: null })
  return largo(res(p[4], p[PUNTA_DEDO[pose.pinzaDedo ?? 'indice']])) * 100
}

export function poseEn(poses: PoseClave[], tMs: number, bucle = true): PoseMano {
  const claves = resolverClaves(poses)
  if (claves.length === 0) return { ...POSE_BASE, visible: false }
  const fin = claves[claves.length - 1].t
  let t = tMs
  if (bucle && fin > 0) t = ((tMs % fin) + fin) % fin
  if (t <= claves[0].t) return claves[0].pose
  if (t >= fin) return claves[claves.length - 1].pose
  let i = 0
  while (i < claves.length - 1 && claves[i + 1].t <= t) i++
  const a = claves[i]
  const b = claves[i + 1]
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1
  return interpolar(a.pose, b.pose, k)
}

export function manosEnGuion(guion: GuionSintetico, tMs: number): { manos: ManoSeguida[]; luz: number } {
  const manos: ManoSeguida[] = []
  for (const g of guion.manos) {
    const pose = poseEn(g.poses, tMs, guion.bucle ?? true)
    if (pose.visible) manos.push(manoSintetica({ ...pose, lado: g.lado }, guion.camara))
  }
  return { manos, luz: guion.luz ?? 140 }
}

/** Arma claves con tiempos relativos: cada paso indica cuántos ms después de la clave anterior llega. */
export function secuencia(pasos: [number, Partial<PoseMano>][], desdeMs = 0): PoseClave[] {
  let t = desdeMs
  return pasos.map(([dur, pose]) => {
    t += dur
    return { t, ...pose }
  })
}

// ── Guiones preparados ────────────────────────────────────────────────────────────────────────────

export const GUIONES_PRESET = ['calibracion', 'quieta', 'abrir-cerrar', 'pinza', 'mover', 'sin-mano', 'ambas'] as const
export type NombreGuion = (typeof GUIONES_PRESET)[number]

const X_POR_LADO: Record<LadoMano, number> = { derecha: 0.42, izquierda: 0.58 }

export function guionPreset(nombre: NombreGuion, lado: LadoMano = 'derecha'): GuionSintetico {
  const x = X_POR_LADO[lado]
  const una = (pasos: [number, Partial<PoseMano>][], inicio: Partial<PoseMano> = { x }): GuionSintetico => ({
    manos: [{ lado, poses: secuencia([[0, inicio], ...pasos.map(([d, p]) => [d, p] as [number, Partial<PoseMano>])]) }],
  })
  switch (nombre) {
    case 'quieta':
      return una([[1000, {}]])
    case 'abrir-cerrar':
      return una([[400, {}], [600, { apertura: 0 }], [400, {}], [600, { apertura: 1 }]])
    case 'pinza':
      return una([
        [500, {}],
        [700, { apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: 0.5 }],
        [1200, {}],
        [700, { apertura: 1, dedos: {}, pinzaCm: null }],
      ])
    case 'mover':
      return una([[300, {}], [2000, { x: 0.25 }], [4000, { x: 0.75 }], [2000, { x }]])
    case 'sin-mano':
      return { manos: [] }
    case 'ambas':
      return {
        manos: (['derecha', 'izquierda'] as LadoMano[]).map((l) => ({
          lado: l,
          poses: secuencia([[0, { x: l === 'derecha' ? 0.32 : 0.68 }], [400, {}], [600, { apertura: 0 }], [400, {}], [600, { apertura: 1 }]]),
        })),
      }
    case 'calibracion': {
      // Los pasos de la calibración (F08): abierta 2,5 s, abrir y cerrar 3 veces, pinza 1,5 s, soltar.
      // Como un teléfono en vertical: cámara 480×640 y mano centrada (x = y = 0,5), para que quepa en el marco guía.
      const ciclo: [number, Partial<PoseMano>][] = [[450, { apertura: 0 }], [200, {}], [450, { apertura: 1 }], [200, {}]]
      const g = una([
        [2500, {}],
        ...ciclo, ...ciclo, ...ciclo,
        [700, { apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: 0.5 }],
        [1500, {}],
        [700, { apertura: 1, dedos: {}, pinzaCm: null }],
        [600, {}],
      ], { x: 0.5, y: 0.5 })
      return { ...g, camara: { ancho: 480, alto: 640 } }
    }
  }
}
