// Muñeca 3D (F37): matemática pura (sin three.js ni DOM), con pruebas en muneca.test.ts.
//
// Qué mide: la ROTACIÓN 3D de la mano respecto de su posición NEUTRA (mano recta, dedos arriba, quieta), descompuesta en
// los ejes de esa mano neutra. Es el port de prueba-angulos/angulos3d.py (prototipo validado a ojo):
//   - flexExt:    flexión (+, los dedos van hacia el lado de la palma) / extensión (−, hacia el dorso)
//   - desviacion: radial (+, hacia el pulgar) / cubital (−, hacia el meñique)
//   - giro:       rotación sobre el eje largo de la mano (el antebrazo gira si el codo no se queda quieto)
// Supuesto: el antebrazo se queda quieto (la cámara no ve el codo, todo movimiento se atribuye a la muñeca). La
// orientación sale de las worldLandmarks de MediaPipe con UNA cámara: los giros hacia o desde la cámara son los menos
// precisos (error típico 10-15°). Todo son estimaciones ("aprox."), no un goniómetro.
//
// Marco de la mano (matriz 3×3, columnas = ejes): x = radial (meñique 17 → índice 5, ortogonalizado), y = muñeca 0 →
// base del medio 9, z = normal de la palma. En la mano izquierda z se invierte (z = −x×y) para que "z" sea siempre el
// lado de la palma; así los ángulos de una mano izquierda son los de su espejo derecho. La matriz es entonces impropia
// (det −1) y está pensada solo para `R0ᵀ·R`, que sí es una rotación.
import type { LadoMano } from '../../domain/types'
import type { P3 } from '../../metrics/geometria'

export type V3 = [number, number, number]
/** Matriz 3×3 por filas: m[fila][columna]. Las COLUMNAS son los ejes x, y, z de la mano. */
export type Mat3 = [V3, V3, V3]

const GRAD = 180 / Math.PI

// ── Álgebra mínima ────────────────────────────────────────────────────────────────────────────────

const resta = (a: P3, b: P3): V3 => [a.x - b.x, a.y - b.y, a.z - b.z]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norma = (a: V3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: V3): V3 | null => {
  const n = norma(a)
  return n < 1e-9 ? null : [a[0] / n, a[1] / n, a[2] / n]
}
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]]

export const IDENTIDAD: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

export const columna = (m: Mat3, k: number): V3 => [m[0][k], m[1][k], m[2][k]]
const desdeColumnas = (x: V3, y: V3, z: V3): Mat3 => [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]]
export const transpuesta = (m: Mat3): Mat3 => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]
export function mult(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
  return r
}
const sumaMat = (a: Mat3, b: Mat3): Mat3 => a.map((f, i) => f.map((v, j) => v + b[i][j])) as Mat3
const det = (m: Mat3) => dot(m[0], cruz(m[1], m[2]))
/** Inversa de una 3×3 (null si es singular). */
function inversa(m: Mat3): Mat3 | null {
  const d = det(m)
  if (Math.abs(d) < 1e-12) return null
  const c0 = cruz(m[1], m[2])
  const c1 = cruz(m[2], m[0])
  const c2 = cruz(m[0], m[1])
  return [[c0[0] / d, c1[0] / d, c2[0] / d], [c0[1] / d, c1[1] / d, c2[1] / d], [c0[2] / d, c1[2] / d, c2[2] / d]]
}

/**
 * Matriz ortogonal más cercana (factor polar, el equivalente a U·Vᵀ de la SVD): iteración de Newton R ← (R + R⁻ᵀ)/2.
 * Conserva el signo del determinante (sirve también para los marcos impropios de la mano izquierda).
 */
export function ortogonalMasCercana(m: Mat3): Mat3 {
  let r = m
  for (let i = 0; i < 16; i++) {
    const inv = inversa(r)
    if (!inv) return IDENTIDAD
    const s = transpuesta(inv)
    const n: Mat3 = [0, 1, 2].map((a) => [0, 1, 2].map((b) => 0.5 * (r[a][b] + s[a][b]))) as Mat3
    let cambio = 0
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cambio = Math.max(cambio, Math.abs(n[a][b] - r[a][b]))
    r = n
    if (cambio < 1e-10) break
  }
  return r
}

/** Promedio de orientaciones: factor ortogonal de la suma (como el SVD del prototipo). */
export function promediarMarcos(marcos: readonly Mat3[]): Mat3 {
  if (marcos.length === 0) return IDENTIDAD
  return ortogonalMasCercana(marcos.reduce<Mat3>((s, m) => sumaMat(s, m), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]))
}

/** Ángulo (°) de la rotación que lleva `a` a `b` (0 = misma orientación). */
export function distanciaAngular(a: Mat3, b: Mat3): number {
  const m = mult(transpuesta(a), b)
  const c = (m[0][0] + m[1][1] + m[2][2] - 1) / 2
  return Math.acos(Math.min(1, Math.max(-1, c))) * GRAD
}

// ── Marco de la mano y ángulos ─────────────────────────────────────────────────────────────────────

/** Marco de la mano desde las 21 worldLandmarks (null si es degenerada). `lado` = mano del sujeto. */
export function marcoMano(world: readonly P3[], lado: LadoMano): Mat3 | null {
  if (world.length < 21) return null
  const y = unit(resta(world[9], world[0]))
  const a = resta(world[5], world[17])
  if (!y) return null
  const k = dot(a, y)
  const x = unit([a[0] - k * y[0], a[1] - k * y[1], a[2] - k * y[2]])
  if (!x) return null
  const z = cruz(x, y)
  return desdeColumnas(x, y, lado === 'derecha' ? z : neg(z))
}

export interface AngulosMuneca {
  /** Flexión (+) / extensión (−), °. */
  flexExt: number
  /** Desviación radial (+) / cubital (−), °. */
  desviacion: number
  /** Giro sobre el eje largo de la mano, °. */
  giro: number
  /** Dirección de los dedos (eje largo) en los ejes de la mano neutra: vector unitario [x radial, y largo, z palma]. */
  dir: V3
  /** Ángulo (°) entre la dirección de los dedos y la neutra (cono). */
  cono: number
}

/** Rotación de `R` respecto de la mano neutra `R0`, en los ejes de la mano neutra (angulos() del prototipo). */
export function angulos(R0: Mat3, R: Mat3): AngulosMuneca {
  const rel = mult(transpuesta(R0), R)
  const yAct = columna(rel, 1)
  const [yx, yy, yz] = yAct
  const flexExt = Math.atan2(yz, Math.hypot(yx, yy)) * GRAD
  const desviacion = Math.atan2(yx, yy) * GRAD
  // Giro sobre el eje largo: se quita la rotación mínima que lleva y_neutro a y_actual y se mide cuánto rotó el eje radial.
  const eje: V3 = [yAct[2], 0, -yAct[0]] // [0,1,0] × yAct
  const s = norma(eje)
  let rmin = IDENTIDAD
  if (s > 1e-6) {
    const e: V3 = [eje[0] / s, eje[1] / s, eje[2] / s]
    const ang = Math.atan2(s, yy)
    const K: Mat3 = [[0, -e[2], e[1]], [e[2], 0, -e[0]], [-e[1], e[0], 0]]
    const K2 = mult(K, K)
    const sn = Math.sin(ang)
    const cs = 1 - Math.cos(ang)
    rmin = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + sn * K[i][j] + cs * K2[i][j])) as Mat3
  }
  const xr = columna(mult(transpuesta(rmin), rel), 0)
  const giro = Math.atan2(-xr[2], xr[0]) * GRAD
  const cono = Math.acos(Math.min(1, Math.max(-1, yy))) * GRAD
  return { flexExt, desviacion, giro, dir: yAct, cono }
}

/** Mediana de los últimos 5 cuadros (como el prototipo): quita picos de un solo cuadro. */
export class SuavizadorAngulos {
  private hist: AngulosMuneca[] = []
  filtrar(a: AngulosMuneca): AngulosMuneca {
    this.hist.push(a)
    if (this.hist.length > 5) this.hist.shift()
    const med = (f: (x: AngulosMuneca) => number) => {
      const v = this.hist.map(f).sort((p, q) => p - q)
      return v[Math.floor(v.length / 2)]
    }
    const d: V3 = [med((x) => x.dir[0]), med((x) => x.dir[1]), med((x) => x.dir[2])]
    const du = unit(d) ?? a.dir
    return { flexExt: med((x) => x.flexExt), desviacion: med((x) => x.desviacion), giro: med((x) => x.giro), dir: du, cono: Math.acos(Math.min(1, Math.max(-1, du[1]))) * GRAD }
  }
  reiniciar() {
    this.hist = []
  }
}

// ── Neutro: promedio de una ventana quieta ─────────────────────────────────────────────────────────

/** ms quieta que hacen falta para tomar el neutro. */
export const NEUTRO_QUIETA_MS = 2000
/** Cuánto puede alejarse (°) un cuadro del promedio de la ventana para seguir "quieta". */
export const NEUTRO_QUIETA_DEG = 8
/** Cuadros fuera de rango seguidos que reinician la ventana (uno suelto, p. ej. un salto del seguimiento, se ignora). */
const FUERA_SEGUIDOS = 3
/** Un hueco mayor entre cuadros (pausa, mano perdida) reinicia la ventana. */
const HUECO_MS = 400

export interface PasoNeutro {
  /** 0..1: cuánto de los 2 s quieta lleva. */
  progreso: number
  /** Orientación neutra (promedio de la ventana) cuando se completa; null mientras tanto. */
  neutro: Mat3 | null
}

export class CapturaNeutro {
  private marcos: Mat3[] = []
  private suma: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  private t0 = 0
  private tUltimo = 0
  private fuera = 0

  readonly quietaMs: number
  readonly toleranciaDeg: number

  constructor(quietaMs = NEUTRO_QUIETA_MS, toleranciaDeg = NEUTRO_QUIETA_DEG) {
    this.quietaMs = quietaMs
    this.toleranciaDeg = toleranciaDeg
  }

  reiniciar() {
    this.marcos = []
    this.suma = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    this.fuera = 0
  }

  /** Un cuadro nuevo de la mano (R = null si no se ve). `tMs` = reloj de juego en ms. */
  paso(R: Mat3 | null, tMs: number): PasoNeutro {
    if (!R || (this.marcos.length && tMs - this.tUltimo > HUECO_MS)) {
      this.reiniciar()
      if (!R) return { progreso: 0, neutro: null }
    }
    if (this.marcos.length) {
      const media = ortogonalMasCercana(this.suma)
      if (distanciaAngular(media, R) > this.toleranciaDeg) {
        this.fuera++
        if (this.fuera >= FUERA_SEGUIDOS) this.reiniciar()
        else {
          this.tUltimo = tMs
          return { progreso: this.progreso(), neutro: null }
        }
      } else this.fuera = 0
    }
    if (!this.marcos.length) this.t0 = tMs
    this.marcos.push(R)
    this.suma = sumaMat(this.suma, R)
    this.tUltimo = tMs
    const progreso = this.progreso()
    return { progreso, neutro: progreso >= 1 ? ortogonalMasCercana(this.suma) : null }
  }

  private progreso(): number {
    return this.marcos.length ? Math.min(1, (this.tUltimo - this.t0) / this.quietaMs) : 0
  }
}

// ── Niveles y fases guiadas ────────────────────────────────────────────────────────────────────────

export type FaseMuneca = 'flexion' | 'extension' | 'radial' | 'cubital'
export const ORDEN_FASES: readonly FaseMuneca[] = ['flexion', 'extension', 'radial', 'cubital']

export const NOMBRE_FASE: Record<FaseMuneca, string> = {
  flexion: 'Flexión',
  extension: 'Extensión',
  radial: 'Desviación radial',
  cubital: 'Desviación cubital',
}

export interface NivelMuneca {
  nombre: string
  detalle: string
  /** Objetivo (°) de cada fase. */
  flexion: number
  extension: number
  radial: number
  cubital: number
  /** Tiempo que hay que sostener el objetivo (ms). */
  sostenerMs: number
  /** Tiempo para alcanzarlo antes de dar la fase por no alcanzada (ms). */
  maxEsperaMs: number
  [clave: string]: string | number | boolean
}

function nivel(nombre: string, flexion: number, extension: number, radial: number, cubital: number, sostenerMs: number): NivelMuneca {
  return {
    nombre,
    detalle: `Flexión ${flexion}°, extensión ${extension}°, radial ${radial}° y cubital ${cubital}° (aprox.); sostener ${sostenerMs / 1000} s`,
    flexion,
    extension,
    radial,
    cubital,
    sostenerMs,
    maxEsperaMs: 12_000,
  }
}

export const NIVELES_MUNECA: Record<1 | 2 | 3 | 4 | 5, NivelMuneca> = {
  1: nivel('Rango suave', 30, 25, 10, 15, 1000),
  2: nivel('Rango medio', 40, 33, 13, 20, 1250),
  3: nivel('Rango amplio', 50, 42, 15, 25, 1500),
  4: nivel('Rango mayor', 60, 50, 18, 30, 1750),
  5: nivel('Rango completo', 70, 60, 20, 35, 2000),
}

export function nivelMuneca(n: number): NivelMuneca {
  return NIVELES_MUNECA[Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5]
}

export const objetivoDe = (fase: FaseMuneca, n: Pick<NivelMuneca, FaseMuneca>) => n[fase]

/** Ángulo de la fase con signo a favor del movimiento pedido (positivo = hacia el objetivo). */
export function valorFase(fase: FaseMuneca, a: Pick<AngulosMuneca, 'flexExt' | 'desviacion'>): number {
  switch (fase) {
    case 'flexion':
      return a.flexExt
    case 'extension':
      return -a.flexExt
    case 'radial':
      return a.desviacion
    case 'cubital':
      return -a.desviacion
  }
}

/** Dirección (en los ejes neutros [x radial, y largo, z palma]) hacia donde va la fase. */
export const DIRECCION_FASE: Record<FaseMuneca, V3> = {
  flexion: [0, 0, 1],
  extension: [0, 0, -1],
  radial: [1, 0, 0],
  cubital: [-1, 0, 0],
}

/** Margen (°) bajo el objetivo con el que se sigue "sosteniendo" (temblor de la mano y del seguimiento). */
export const HISTERESIS_DEG = 4
/** Volver al neutro: flexión y desviación bajo este ángulo (°) durante RETORNO_MS. */
export const RETORNO_DEG = 10
export const RETORNO_MS = 400

export const AVISO_ANTEBRAZO = 'Puede ser el antebrazo: mantenlo quieto'
export const LIM_GIRO_DEG = 45
export const LIM_DESVIACION_DEG = 35

/**
 * ¿Parece que se movió el antebrazo (no la muñeca)? Un giro grande sobre el eje largo, o una desviación grande mientras
 * se pide flexión/extensión. En ese caso se avisa en vez de contarlo como movimiento de la muñeca.
 */
export function avisoAntebrazo(fase: FaseMuneca | null, a: Pick<AngulosMuneca, 'desviacion' | 'giro'>): boolean {
  if (Math.abs(a.giro) > LIM_GIRO_DEG) return true
  return (fase === 'flexion' || fase === 'extension') && Math.abs(a.desviacion) > LIM_DESVIACION_DEG
}

export interface EstadoMuneca {
  /** Posición en ORDEN_FASES (se repite). */
  indice: number
  etapa: 'ir' | 'volver'
  /** Se anunció el objetivo de esta fase (objetivo_mostrado). */
  anunciado: boolean
  /** ms seguidos sobre el objetivo. */
  sostenidoMs: number
  /** ms desde que se mostró el objetivo. */
  esperaMs: number
  /** Mayor valor de la fase en esta ronda (°). */
  maxFase: number
  /** ms seguidos cerca del neutro (etapa 'volver'). */
  retornoMs: number
}

export type EventoMuneca =
  | { tipo: 'objetivo_mostrado'; fase: FaseMuneca; objetivoGrados: number }
  | { tipo: 'acierto'; fase: FaseMuneca; grados: number }
  | { tipo: 'no_alcanzado'; fase: FaseMuneca; maxGrados: number }

export const estadoMunecaInicial = (indice = 0): EstadoMuneca => ({ indice, etapa: 'ir', anunciado: false, sostenidoMs: 0, esperaMs: 0, maxFase: 0, retornoMs: 0 })
export const faseActual = (e: EstadoMuneca): FaseMuneca => ORDEN_FASES[e.indice % ORDEN_FASES.length]

const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * Un cuadro de las fases guiadas. `a` = ángulos suavizados (null = no se ve la mano: no avanza nada) y `antebrazo` = hay
 * aviso de que se movió el antebrazo (no suma sostén ni cuenta como alcanzado).
 */
export function pasoMuneca(e: EstadoMuneca, a: Pick<AngulosMuneca, 'flexExt' | 'desviacion'> | null, antebrazo: boolean, dtMs: number, n: NivelMuneca): { estado: EstadoMuneca; eventos: EventoMuneca[] } {
  const eventos: EventoMuneca[] = []
  let s = { ...e }
  const fase = faseActual(s)
  const objetivo = objetivoDe(fase, n)
  if (s.etapa === 'ir' && !s.anunciado) {
    s.anunciado = true
    eventos.push({ tipo: 'objetivo_mostrado', fase, objetivoGrados: objetivo })
  }
  if (!a) return { estado: s, eventos }
  if (s.etapa === 'ir') {
    const v = valorFase(fase, a)
    if (!antebrazo) s.maxFase = Math.max(s.maxFase, v)
    s.esperaMs += dtMs
    const sobre = !antebrazo && v >= objetivo
    const cerca = !antebrazo && v >= objetivo - HISTERESIS_DEG
    if (sobre || (cerca && s.sostenidoMs > 0)) s.sostenidoMs += dtMs
    else s.sostenidoMs = 0
    if (s.sostenidoMs >= n.sostenerMs) {
      eventos.push({ tipo: 'acierto', fase, grados: r1(s.maxFase) })
      s = { ...s, etapa: 'volver', retornoMs: 0, sostenidoMs: 0 }
    } else if (s.esperaMs >= n.maxEsperaMs) {
      eventos.push({ tipo: 'no_alcanzado', fase, maxGrados: r1(s.maxFase) })
      s = { ...s, etapa: 'volver', retornoMs: 0, sostenidoMs: 0 }
    }
  } else {
    if (Math.abs(a.flexExt) < RETORNO_DEG && Math.abs(a.desviacion) < RETORNO_DEG) s.retornoMs += dtMs
    else s.retornoMs = 0
    if (s.retornoMs >= RETORNO_MS) s = estadoMunecaInicial((s.indice + 1) % ORDEN_FASES.length)
  }
  return { estado: s, eventos }
}

// ── Máximos robustos y resumen ─────────────────────────────────────────────────────────────────────

/** Percentil p (0..100) por rango inferior: con pocos datos el pico más alto se descarta. */
export function percentil(valores: readonly number[], p: number): number | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  return v[Math.floor((p / 100) * (v.length - 1))]
}

/** Desde qué ángulo (°) un valor cuenta como "movimiento" y no como temblor del neutro. */
export const ACTIVO_MIN_DEG = 5
export const PERCENTIL_MAX = 98

/**
 * Máximo robusto de una serie (°): percentil 98 de las muestras en movimiento (≥ 5°; si no hay, de las positivas).
 * null sin muestras; 0 si ninguna fue positiva.
 */
export function maximoRobusto(valores: readonly number[]): number | null {
  if (!valores.length) return null
  const activas = valores.filter((v) => v >= ACTIVO_MIN_DEG)
  const base = activas.length ? activas : valores.filter((v) => v > 0)
  return base.length ? percentil(base, PERCENTIL_MAX) : 0
}

const redondear = (x: number | null, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

/** Matriz R0 como nueve números (`r0_00 … r0_22`, por filas, 4 decimales) para metricas.juego. */
export function r0Plano(R0: Mat3): Record<string, number> {
  const o: Record<string, number> = {}
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[`r0_${i}${j}`] = Math.round(R0[i][j] * 10000) / 10000
  return o
}

/** Vuelve a armar R0 desde `metricas.juego` (null si faltan claves). */
export function r0Desde(juego: Record<string, number | null | undefined>): Mat3 | null {
  const m: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const v = juego[`r0_${i}${j}`]
      if (typeof v !== 'number' || !Number.isFinite(v)) return null
      m[i][j] = v
    }
  }
  return m
}

/** Muestras mínimas entre dos guardadas (ms): ~20 Hz bastan para el percentil y acotan la memoria. */
const PERIODO_MUESTRA_MS = 50
const MAX_MUESTRAS = 30_000

/** Acumula la sesión: series de ángulos suavizados y los máximos robustos. */
export class AgregadoMuneca {
  private flex: number[] = []
  private desv: number[] = []
  private giro: number[] = []
  private cono: number[] = []
  /** Muestras con aviso de antebrazo: no cuentan para flexión/desviación/cono (sí para el giro). */
  private valida: boolean[] = []
  private ultima = -Infinity
  movimientos = 0
  noAlcanzados = 0

  /** Nueva medición de una mano con neutro tomado. Devuelve true si se guardó. */
  muestra(a: AngulosMuneca, antebrazo: boolean, tMs: number): boolean {
    if (tMs - this.ultima < PERIODO_MUESTRA_MS || this.flex.length >= MAX_MUESTRAS) return false
    this.ultima = tMs
    this.flex.push(a.flexExt)
    this.desv.push(a.desviacion)
    this.giro.push(a.giro)
    this.cono.push(a.cono)
    this.valida.push(!antebrazo)
    return true
  }

  /** Descarta las series (al repetir el neutro: los ángulos anteriores eran respecto de otro neutro). */
  reiniciarSeries() {
    this.flex = []
    this.desv = []
    this.giro = []
    this.cono = []
    this.valida = []
  }

  get muestras(): number {
    return this.flex.length
  }

  resumen(R0: Mat3 | null): Record<string, number | null> {
    const ok = <T>(serie: T[]) => serie.filter((_, i) => this.valida[i])
    const f = ok(this.flex)
    const d = ok(this.desv)
    const hay = this.flex.length > 0
    return {
      flexionMax: redondear(maximoRobusto(f)),
      extensionMax: redondear(maximoRobusto(f.map((v) => -v))),
      radialMax: redondear(maximoRobusto(d)),
      cubitalMax: redondear(maximoRobusto(d.map((v) => -v))),
      giroPosMax: redondear(hay ? maximoRobusto(this.giro) : null),
      giroNegMax: redondear(hay ? maximoRobusto(this.giro.map((v) => -v)) : null),
      conoMax: redondear(maximoRobusto(ok(this.cono))),
      movimientos: this.movimientos,
      ...(R0 ? r0Plano(R0) : {}),
    }
  }
}
