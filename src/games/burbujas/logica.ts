// Atrapa burbujas (F24, J3): reglas puras, con pruebas en burbujas.test.ts.
//
// - Extensión de dedos: promedio de la flexión MCP+PIP de los cuatro dedos largos, normalizado entre el puño y la mano
//   abierta (0 % = puño, 100 % = mano bien abierta). La calibración guarda el rango de `aperturaMano` (no ángulos):
//   los ángulos de referencia se derivan de ese rango (`referenciasFlexion`).
// - Toque: la palma dentro del radio de la burbuja (la profundidad pesa la mitad: con una cámara es lo más impreciso).
//   La burbuja se revienta si además la extensión es ≥ umbral (80 % por defecto) durante HOLD_MS. Con la mano a medio
//   abrir o cerrada dentro de la burbuja, tras CERRADO_MS se anota `intento_cerrado` (una vez por contacto).
// - Zona de aparición: caja alrededor de la posición de reposo de la mano que crece con los aciertos, con tope por nivel
//   y limitada por el plan (`zona`: derecha | izquierda | altura-media | altura-baja | altura-alta).
// - Mapa de zonas: cuadrícula COLUMNAS × FILAS (x × altura) por mano; se guarda como máscara de bits (número).
// - Alcance: desplazamiento de la muñeca desde el reposo en cm (modelo pinhole con la distancia estimada; aprox.).
import type { FlexionDedos, LadoMano } from '../../domain/types'

export interface V3 {
  x: number
  y: number
  z: number
}

export interface NivelBurbujas {
  nombre: string
  detalle: string
  /** Radio de la burbuja objetivo (unidades de escena ≈ 10 cm). */
  radio: number
  /** Velocidad de la burbuja objetivo (unidades/s). 0 = quieta. */
  velocidad: number
  /** Vida del objetivo (ms). 0 = sin límite. */
  vidaMs: number
  /** Hasta qué fracción de la zona completa puede crecer la zona de aparición. */
  zonaMax: number
  [k: string]: string | number | boolean
}

export const NIVELES_BURBUJAS: Record<1 | 2 | 3 | 4 | 5, NivelBurbujas> = {
  1: { nombre: 'Burbujas grandes y quietas', detalle: 'Burbujas grandes, quietas y cerca · sin límite de tiempo', radio: 0.55, velocidad: 0, vidaMs: 0, zonaMax: 0.5 },
  2: { nombre: 'Grandes, con tiempo', detalle: 'Burbujas grandes y quietas · 10 s de vida · zona más amplia', radio: 0.46, velocidad: 0, vidaMs: 10_000, zonaMax: 0.7 },
  3: { nombre: 'Medianas en movimiento', detalle: 'Burbujas medianas que se mueven lento · 6 s de vida', radio: 0.38, velocidad: 0.18, vidaMs: 6000, zonaMax: 0.85 },
  4: { nombre: 'Medianas, más rápidas', detalle: 'Burbujas medianas que se mueven · 4,5 s de vida · zona completa', radio: 0.32, velocidad: 0.3, vidaMs: 4500, zonaMax: 1 },
  5: { nombre: 'Chicas en movimiento', detalle: 'Burbujas chicas que se mueven · 3 s de vida · zona completa', radio: 0.27, velocidad: 0.45, vidaMs: 3000, zonaMax: 1 },
}

export function nivelBurbujas(n: number): NivelBurbujas {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5
  return NIVELES_BURBUJAS[k]
}

// ── Extensión de dedos ───────────────────────────────────────────────────────────────────────────

export const UMBRAL_EXTENSION_DEFECTO = 80
/** Flexión MCP+PIP de un dedo con el puño cerrado (°), aprox. */
export const FLEXION_PUNO_DEG = 170
/** Flexión MCP+PIP mínima que se espera con la mano abierta (°): el ruido de MediaPipe no baja de esto. */
export const FLEXION_ABIERTA_DEG = 15

export interface ReferenciasFlexion {
  /** Flexión de la mano a puño (°). */
  puno: number
  /** Flexión de la mano abierta (°). */
  abierta: number
}

/**
 * Referencias de flexión (°) para este paciente. La calibración mide `aperturaMano` entre su puño (min) y su mano
 * abierta (max); la flexión crece más o menos lineal con el cierre, así que un paciente que no llega a abrir del todo
 * tiene un "abierta" con algo de flexión (y el 100 % es SU mano abierta). Sin calibración: valores típicos.
 */
export function referenciasFlexion(rango?: { min: number; max: number } | null): ReferenciasFlexion {
  if (!rango || !(rango.max - rango.min > 0.05)) return { puno: FLEXION_PUNO_DEG * 0.95, abierta: FLEXION_ABIERTA_DEG }
  const puno = Math.max(FLEXION_PUNO_DEG * (1 - Math.max(0, rango.min)), FLEXION_ABIERTA_DEG + 40)
  const abierta = Math.min(Math.max(FLEXION_PUNO_DEG * (1 - rango.max), FLEXION_ABIERTA_DEG), puno - 40)
  return { puno, abierta }
}

const recorte = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/** Extensión de los cuatro dedos largos en % (0 = puño, 100 = mano abierta). `flexion` en grados (MCP+PIP). */
export function extensionPct(flexion: Pick<FlexionDedos, 'indice' | 'medio' | 'anular' | 'menique'>, ref: ReferenciasFlexion = referenciasFlexion()): number {
  const media = (flexion.indice + flexion.medio + flexion.anular + flexion.menique) / 4
  return 100 * recorte((ref.puno - media) / (ref.puno - ref.abierta))
}

// ── Toque ──────────────────────────────────────────────────────────────────────────────────────

/** Peso de la profundidad (z) en la distancia de toque. */
export const PESO_Z = 0.5
/** Holgura sobre el radio al tocar (unidades): la palma es ancha y la cámara es una sola. */
export const HOLGURA_TOQUE = 0.12
/** Cuánto hay que mantener el toque con la mano bien abierta para reventar (ms). */
export const HOLD_MS = 120
/** Cuánto hay que estar dentro de la burbuja con la mano sin abrir para anotar un intento cerrado (ms). */
export const CERRADO_MS = 350
/** Tras un intento cerrado, la pista recuerda abrir la mano durante (ms). */
export const AVISO_MS = 2800

export function distanciaToque(palma: V3, centro: V3): number {
  return Math.hypot(palma.x - centro.x, palma.y - centro.y, PESO_Z * (palma.z - centro.z))
}

export function tocaBurbuja(palma: V3, centro: V3, radio: number): boolean {
  return distanciaToque(palma, centro) <= radio + HOLGURA_TOQUE
}

export interface EstadoToque {
  /** ms que lleva dentro de la burbuja con la mano bien abierta. */
  abiertaMs: number
  /** ms que lleva dentro de la burbuja con la mano sin abrir. */
  cerradaMs: number
  /** Ya se anotó el intento cerrado de este contacto. */
  anotado: boolean
  /** Extensión máxima vista dentro de la burbuja en este contacto. */
  extMax: number
}

export const toqueInicial = (): EstadoToque => ({ abiertaMs: 0, cerradaMs: 0, anotado: false, extMax: 0 })

export type ResultadoToque = { estado: EstadoToque; evento: 'revienta' | 'intento_cerrado' | null }

/** Un cuadro: `dentro` = palma en la burbuja; `ext` = extensión actual (%); `dtMs` = lo que duró el cuadro. */
export function pasoToque(e: EstadoToque, dentro: boolean, ext: number, umbral: number, dtMs: number): ResultadoToque {
  if (!dentro) return { estado: toqueInicial(), evento: null }
  const s = { ...e, extMax: Math.max(e.extMax, ext) }
  if (ext >= umbral) {
    s.abiertaMs += dtMs
    s.cerradaMs = 0
    if (s.abiertaMs >= HOLD_MS) return { estado: s, evento: 'revienta' }
    return { estado: s, evento: null }
  }
  s.abiertaMs = 0
  s.cerradaMs += dtMs
  if (!s.anotado && s.cerradaMs >= CERRADO_MS) {
    s.anotado = true
    return { estado: s, evento: 'intento_cerrado' }
  }
  return { estado: s, evento: null }
}

// ── Zona de aparición ─────────────────────────────────────────────────────────────────────────────

export interface Caja3 {
  x: [number, number]
  y: [number, number]
  z: [number, number]
}

/** Zona completa donde puede haber burbujas objetivo (escena). Cabe en lo que alcanza la mano virtual. */
export const ZONA_COMPLETA: Caja3 = { x: [-1.7, 1.7], y: [0.5, 1.5], z: [-0.7, 0.7] }
/** Posición de reposo por defecto (sin mano vista): centro de la zona. */
export const REPOSO_DEFECTO: V3 = { x: 0, y: 0.95, z: 0 }

export const FACTOR_INICIAL = 0.25
export const CRECE_POR_ACIERTO = 0.08

/** Fracción de la zona completa donde aparecen las burbujas tras `aciertos` reventadas. */
export function factorZona(aciertos: number, zonaMax: number): number {
  return Math.min(recorte(zonaMax, FACTOR_INICIAL, 1), FACTOR_INICIAL + CRECE_POR_ACIERTO * Math.max(0, aciertos))
}

export type NombreZona = 'derecha' | 'izquierda' | 'altura-media' | 'altura-baja' | 'altura-alta'

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replaceAll(' ', '-')
}

/** Límite que pone el terapeuta (campo `zona` del plan). Sin valor o desconocido: sin límite (null). */
export function limiteDeZona(zona?: string | null, completa: Caja3 = ZONA_COMPLETA): Caja3 | null {
  if (!zona) return null
  const z = norm(zona)
  const [y0, y1] = completa.y
  const tercio = (y1 - y0) / 3
  switch (z) {
    case 'derecha':
      return { ...completa, x: [0, completa.x[1]] }
    case 'izquierda':
      return { ...completa, x: [completa.x[0], 0] }
    case 'altura-media':
      return { ...completa, y: [y0 + tercio, y0 + 2 * tercio] }
    case 'altura-baja':
      return { ...completa, y: [y0, y0 + tercio] }
    case 'altura-alta':
      return { ...completa, y: [y0 + 2 * tercio, y1] }
    default:
      return null
  }
}

function eje(c: number, mitad: number, completo: [number, number], limite?: [number, number]): [number, number] {
  let a = Math.max(completo[0], c - mitad)
  let b = Math.min(completo[1], c + mitad)
  if (b < a) [a, b] = completo
  if (!limite) return [a, b]
  const lo = Math.max(a, limite[0])
  const hi = Math.min(b, limite[1])
  // Sin cruce entre la zona alrededor del reposo y el límite del terapeuta: manda el límite.
  return hi > lo ? [lo, hi] : limite
}

/** Caja donde pueden aparecer burbujas: alrededor del reposo, `factor` de la zona completa, dentro del límite del plan. */
export function zonaDeAparicion(reposo: V3 | null, factor: number, limite: Caja3 | null = null, completa: Caja3 = ZONA_COMPLETA): Caja3 {
  const c = reposo ?? REPOSO_DEFECTO
  const f = recorte(factor, 0.05, 1)
  const mitad = (r: [number, number]) => ((r[1] - r[0]) / 2) * f
  return {
    x: eje(c.x, mitad(completa.x), completa.x, limite?.x),
    y: eje(c.y, mitad(completa.y), completa.y, limite?.y),
    z: eje(c.z, mitad(completa.z), completa.z, limite?.z),
  }
}

const aleatorioEn = (r: [number, number], rng: () => number) => r[0] + (r[1] - r[0]) * rng()

/**
 * Posición de la próxima burbuja: al azar en la caja, lo más lejos posible (≥ `minDist`) de los puntos a evitar
 * (el objetivo anterior y las palmas, para que no aparezca ya reventada).
 */
export function sortearPosicion(caja: Caja3, rng: () => number, evitar: V3[] = [], minDist = 0, intentos = 14): V3 {
  let mejor: V3 | null = null
  let mejorD = -1
  for (let i = 0; i < intentos; i++) {
    const p = { x: aleatorioEn(caja.x, rng), y: aleatorioEn(caja.y, rng), z: aleatorioEn(caja.z, rng) }
    const d = evitar.length ? Math.min(...evitar.map((q) => distanciaToque(p, q))) : Infinity
    if (d >= minDist) return p
    if (d > mejorD) {
      mejorD = d
      mejor = p
    }
  }
  return mejor!
}

export const dentroDeCaja = (p: V3, c: Caja3) => p.x >= c.x[0] && p.x <= c.x[1] && p.y >= c.y[0] && p.y <= c.y[1] && p.z >= c.z[0] && p.z <= c.z[1]

/** Mueve la burbuja `dt` s con velocidad `v` rebotando en las paredes de la caja. Devuelve posición y velocidad nuevas. */
export function moverEnCaja(p: V3, v: V3, dt: number, caja: Caja3): { p: V3; v: V3 } {
  const q = { ...p }
  const w = { ...v }
  for (const k of ['x', 'y', 'z'] as const) {
    q[k] += w[k] * dt
    const [a, b] = caja[k]
    if (q[k] < a) {
      q[k] = a + (a - q[k])
      w[k] = Math.abs(w[k])
    } else if (q[k] > b) {
      q[k] = b - (q[k] - b)
      w[k] = -Math.abs(w[k])
    }
    q[k] = recorte(q[k], a, b)
  }
  return { p: q, v: w }
}

/** Velocidad aleatoria de módulo `rapidez` (más en el plano de la mesa que en altura). */
export function velocidadAleatoria(rapidez: number, rng: () => number): V3 {
  if (rapidez <= 0) return { x: 0, y: 0, z: 0 }
  const a = rng() * Math.PI * 2
  return { x: Math.cos(a) * rapidez, y: Math.sin(a) * rapidez * 0.5, z: Math.sin(a + 1.3) * rapidez * 0.4 }
}

// ── Mapa de zonas ─────────────────────────────────────────────────────────────────────────────────

export const COLUMNAS = 5
export const FILAS = 3
export const CELDAS = COLUMNAS * FILAS

/** Celda (0..14) de una posición: fila 0 = abajo, columna 0 = izquierda de la pantalla. */
export function celdaDe(p: V3, completa: Caja3 = ZONA_COMPLETA): number {
  const u = recorte((p.x - completa.x[0]) / (completa.x[1] - completa.x[0]), 0, 0.9999)
  const v = recorte((p.y - completa.y[0]) / (completa.y[1] - completa.y[0]), 0, 0.9999)
  return Math.floor(v * FILAS) * COLUMNAS + Math.floor(u * COLUMNAS)
}

/** Máscara de bits con las celdas alcanzadas (compacta: cabe en un número del resumen). */
export function mascaraDe(celdas: Iterable<number>): number {
  let m = 0
  for (const c of celdas) if (c >= 0 && c < CELDAS) m |= 1 << c
  return m
}

export function celdasDeMascara(m: number): number[] {
  const out: number[] = []
  for (let i = 0; i < CELDAS; i++) if (m & (1 << i)) out.push(i)
  return out
}

/** Cuadrícula FILAS × COLUMNAS (de arriba a abajo, como se dibuja) con true en las zonas alcanzadas. */
export function cuadriculaDeMascara(m: number): boolean[][] {
  const out: boolean[][] = []
  for (let f = FILAS - 1; f >= 0; f--) out.push(Array.from({ length: COLUMNAS }, (_, c) => !!(m & (1 << (f * COLUMNAS + c)))))
  return out
}

// ── Alcance ───────────────────────────────────────────────────────────────────────────────────────

export interface MunecaImagen {
  /** Imagen cruda 0..1. */
  x: number
  y: number
  /** Distancia cámara–palma (cm aprox.); null si no se pudo estimar. */
  distanciaCm: number | null
}

export const FACTOR_FOCAL = 0.8
export const DISTANCIA_DEFECTO_CM = 50

/**
 * Desplazamiento de la muñeca desde el reposo, en cm aprox.: lateral y vertical con el modelo pinhole a la distancia
 * estimada (ancho visible = distancia / 0,8; el estimador de distancia usa la longitud de la mano de la calibración) y
 * el cambio de distancia a la cámara. `aspecto` = alto / ancho de la imagen.
 */
export function alcanceCm(reposo: MunecaImagen, actual: MunecaImagen, aspecto = 0.75): number {
  const d0 = reposo.distanciaCm ?? DISTANCIA_DEFECTO_CM
  const d1 = actual.distanciaCm ?? d0
  const d = (d0 + d1) / 2
  const anchoCm = d / FACTOR_FOCAL
  const dx = (actual.x - reposo.x) * anchoCm
  const dy = (actual.y - reposo.y) * anchoCm * aspecto
  const dz = d1 - d0
  return Math.hypot(dx, dy, dz)
}

// ── Agregados ─────────────────────────────────────────────────────────────────────────────────────

export interface Reventada {
  mano: LadoMano
  extension: number
  tiempoMs: number
  alcanceCm: number
  celda: number
}

const redondear = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d
const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)

export class AgregadoBurbujas {
  readonly reventadas: Reventada[] = []
  intentosCerrados = 0
  expiradas = 0
  private alcance: Record<LadoMano, number> = { derecha: 0, izquierda: 0 }
  private vistas: Record<LadoMano, boolean> = { derecha: false, izquierda: false }
  private celdas: Record<LadoMano, Set<number>> = { derecha: new Set(), izquierda: new Set() }

  /** Desplazamiento de la muñeca en un cuadro (cm). */
  alcanzar(mano: LadoMano, cm: number) {
    this.vistas[mano] = true
    this.alcance[mano] = Math.max(this.alcance[mano], cm)
  }

  /** Zona que esa mano alcanzó (reventó o llegó con la mano sin abrir). */
  zona(mano: LadoMano, celda: number) {
    this.celdas[mano].add(celda)
  }

  reventada(r: Reventada) {
    this.reventadas.push(r)
    this.zona(r.mano, r.celda)
  }

  get alcanceMax(): number {
    return Math.max(this.alcance.derecha, this.alcance.izquierda)
  }

  mascara(mano: LadoMano): number {
    return mascaraDe(this.celdas[mano])
  }

  resumen(): Record<string, number | null> {
    const n = this.reventadas.length
    const ext = this.reventadas.map((r) => r.extension)
    const tiempos = this.reventadas.map((r) => r.tiempoMs / 1000)
    const intentos = n + this.intentosCerrados + this.expiradas
    const alcanceDe = (m: LadoMano) => (this.vistas[m] ? redondear(this.alcance[m]) : null)
    const pctZonas = (m: LadoMano) => (this.vistas[m] ? redondear((100 * celdasDeMascara(this.mascara(m)).length) / CELDAS, 0) : null)
    const m = media(ext)
    const t = media(tiempos)
    return {
      burbujas: n,
      extensionMedia: m == null ? null : redondear(m, 0),
      extensionMin: n ? redondear(Math.min(...ext), 0) : null,
      alcanceMax: this.vistas.derecha || this.vistas.izquierda ? redondear(this.alcanceMax) : null,
      alcanceMaxDerecha: alcanceDe('derecha'),
      alcanceMaxIzquierda: alcanceDe('izquierda'),
      tiempoReaccion: t == null ? null : redondear(t, 2),
      intentosCerrados: this.intentosCerrados,
      expiradas: this.expiradas,
      precision: intentos ? redondear((100 * n) / intentos, 0) : null,
      zonasDerecha: this.mascara('derecha'),
      zonasIzquierda: this.mascara('izquierda'),
      zonasDerechaPct: pctZonas('derecha'),
      zonasIzquierdaPct: pctZonas('izquierda'),
    }
  }
}
