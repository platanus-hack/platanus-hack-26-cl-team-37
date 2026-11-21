// Memoria de cartas (F26, J5): lógica pura, sin three.js ni DOM, con pruebas en memoria.test.ts.
//
// Giro del antebrazo (prono-supinación) desde worldLandmarks:
//  - Normal de la palma = producto cruz de muñeca→base del índice (0→5) y muñeca→base del meñique (0→17); el signo se
//    ajusta por lado para que apunte siempre "hacia afuera de la palma" (la mano izquierda es el espejo de la derecha).
//  - Eje del antebrazo/mano = muñeca→base del medio (0→9). El giro es el ángulo, alrededor de ese eje, entre la normal
//    y la posición "palma abajo" (palma de cara a la cámara: en la escena la palma queda hacia la mesa).
//  - Signo: positivo = supinación (la normal de la palma se inclina hacia el lado del pulgar, la palma mira hacia
//    arriba); negativo = pronación (hacia el lado del meñique). Igual para mano derecha e izquierda.
//  - Es la medida más ruidosa de la app: se suaviza (One Euro), exige mantener el giro 0,3 s y el umbral es configurable.
//  - Todos los grados son estimaciones y están SIN VALIDAR (el protocolo de validación no se ha corrido).
import type { LadoMano } from '../../domain/types'
import { FiltroOneEuro } from '../../tracking/oneEuro'
import type { P3 } from '../../metrics/geometria'

// ── Niveles ───────────────────────────────────────────────────────────────────────────────────────

export interface NivelCartas {
  nombre: string
  detalle: string
  filas: number
  columnas: number
  /** Giro (°) que hay que alcanzar y sostener para voltear una carta. */
  umbralDeg: number
  /** Pares del tablero (filas × columnas / 2). */
  pares: number
}

function nivel(n: string, filas: number, columnas: number, umbralDeg: number): NivelCartas {
  return {
    nombre: n,
    detalle: `${filas}×${columnas} cartas · girar la palma unos ${umbralDeg}° (aprox.)`,
    filas,
    columnas,
    umbralDeg,
    pares: (filas * columnas) / 2,
  }
}

export const NIVELES_CARTAS: Record<1 | 2 | 3 | 4 | 5, NivelCartas> = {
  1: nivel('4 cartas', 2, 2, 45),
  2: nivel('6 cartas', 2, 3, 52),
  3: nivel('8 cartas', 2, 4, 60),
  4: nivel('10 cartas', 2, 5, 70),
  5: nivel('12 cartas', 3, 4, 80),
}

export function nivelCartas(n: number): NivelCartas {
  return NIVELES_CARTAS[Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5]
}

/** Pares del tablero de un nivel (es la meta de la sesión). */
export const paresDeNivel = (n: number) => nivelCartas(n).pares

// ── Giro del antebrazo ────────────────────────────────────────────────────────────────────────────

type V = [number, number, number]
const resta = (a: P3, b: P3): V => [a.x - b.x, a.y - b.y, a.z - b.z]
const cruz = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const punto = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norma = (a: V) => Math.hypot(a[0], a[1], a[2])
const unitario = (a: V): V | null => {
  const l = norma(a)
  return l < 1e-9 ? null : [a[0] / l, a[1] / l, a[2] / l]
}
const RAD = 180 / Math.PI

/** Palma de cara a la cámara en worldLandmarks de MediaPipe (z + = lejos de la cámara). */
const HACIA_CAMARA: V = [0, 0, -1]

/** Normal de la palma (unitaria, saliendo de la palma). null si la mano es degenerada. */
export function normalPalma(world: P3[], lado: LadoMano): V | null {
  if (world.length < 21) return null
  const n = unitario(cruz(resta(world[5], world[0]), resta(world[17], world[0])))
  if (!n) return null
  const s = lado === 'derecha' ? 1 : -1
  return [n[0] * s, n[1] * s, n[2] * s]
}

/**
 * Giro del antebrazo en grados respecto de "palma abajo": positivo = supinación, negativo = pronación.
 * null si no se puede medir (mano degenerada o con los dedos apuntando casi a la cámara: el eje no se distingue).
 */
export function anguloGiro(world: P3[], lado: LadoMano): number | null {
  const n = normalPalma(world, lado)
  const eje = world.length >= 10 ? unitario(resta(world[9], world[0])) : null
  if (!n || !eje) return null
  // Referencia: "hacia la cámara" sin la parte paralela al eje.
  const k = punto(HACIA_CAMARA, eje)
  const e1 = unitario([HACIA_CAMARA[0] - k * eje[0], HACIA_CAMARA[1] - k * eje[1], HACIA_CAMARA[2] - k * eje[2]])
  if (!e1 || Math.abs(k) > 0.94) return null
  const s = lado === 'derecha' ? 1 : -1
  const c = cruz(eje, e1)
  const e2: V = [c[0] * s, c[1] * s, c[2] * s]
  return Math.atan2(punto(n, e2), punto(n, e1)) * RAD
}

/** Suavizado del giro (One Euro, en grados). Con `reiniciar()` al perder la mano. */
export class SuavizadorGiro {
  private f = new FiltroOneEuro(1.0, 0.004, 1.0)
  filtrar(grados: number, tMs: number): number {
    return this.f.filtrar(grados, tMs)
  }
  reiniciar() {
    this.f.reiniciar()
  }
}

// ── Detección por mano: sobre la carta, giro sostenido, retorno a palma abajo ────────────────────────

export interface ConfigGiro {
  /** Giro que hay que alcanzar (°). */
  umbralDeg: number
  /** Tiempo que hay que sostenerlo antes de voltear (ms). */
  sostenidoMs: number
  /** Por debajo de este giro se considera "palma abajo" (°). */
  retornoDeg: number
  /** Si baja más de esto bajo el umbral, se pierde lo sostenido (°). */
  histeresisDeg: number
  /** Tiempo que la mano debe estar sobre una carta para darla por elegida (ms). */
  estableMs: number
}

export const SOSTENIDO_MS = 300
export const RETORNO_DEG = 20
export const HISTERESIS_DEG = 5
export const ESTABLE_MS = 120

export const configGiro = (umbralDeg: number, parcial: Partial<ConfigGiro> = {}): ConfigGiro => ({
  umbralDeg,
  sostenidoMs: SOSTENIDO_MS,
  retornoDeg: RETORNO_DEG,
  histeresisDeg: HISTERESIS_DEG,
  estableMs: ESTABLE_MS,
  ...parcial,
})

export interface EstadoMano {
  /** true cuando se vio la palma abajo y no hay un volteo pendiente de retorno. */
  armada: boolean
  /** Se volteó una carta y falta volver a palma abajo. */
  esperaRetorno: boolean
  /** Carta elegida (la mano lleva ≥ estableMs sobre ella). */
  sobre: number | null
  candidata: number | null
  candidataMs: number
  /** ms seguidos con el giro sobre el umbral. */
  mantenidoMs: number
  /** Giro máximo (°) alcanzado en lo sostenido. */
  pico: number
}

export const estadoManoInicial = (): EstadoMano => ({ armada: false, esperaRetorno: false, sobre: null, candidata: null, candidataMs: 0, mantenidoMs: 0, pico: 0 })

export interface EntradaMano {
  /** Giro suavizado (°) o null si no se pudo medir. */
  angulo: number | null
  /** Carta tapada bajo la mano (null si no hay). */
  carta: number | null
  dtMs: number
  /** El tablero está resolviendo un no_par: no se voltea nada. */
  bloqueado: boolean
}

export type EventoMano =
  | { tipo: 'sobre_carta'; carta: number }
  | { tipo: 'volteo'; carta: number; grados: number }
  | { tipo: 'retorno_palma_abajo' }

export function pasoMano(e: EstadoMano, x: EntradaMano, cfg: ConfigGiro): { estado: EstadoMano; eventos: EventoMano[] } {
  const eventos: EventoMano[] = []
  const s: EstadoMano = { ...e }

  // Carta elegida: estable un instante (evita saltos entre cartas por el temblor).
  if (x.carta === s.sobre) {
    s.candidata = null
    s.candidataMs = 0
  } else if (x.carta == null) {
    s.sobre = null
    s.candidata = null
    s.candidataMs = 0
    s.mantenidoMs = 0
    s.pico = 0
  } else {
    if (x.carta === s.candidata) s.candidataMs += x.dtMs
    else {
      s.candidata = x.carta
      s.candidataMs = x.dtMs
    }
    if (s.candidataMs >= cfg.estableMs) {
      s.sobre = x.carta
      s.candidata = null
      s.candidataMs = 0
      s.mantenidoMs = 0
      s.pico = 0
      eventos.push({ tipo: 'sobre_carta', carta: x.carta })
    }
  }

  const a = x.angulo
  if (a == null) {
    s.mantenidoMs = 0
    s.pico = 0
    return { estado: s, eventos }
  }

  if (!s.armada) {
    if (a <= cfg.retornoDeg) {
      s.armada = true
      if (s.esperaRetorno) {
        s.esperaRetorno = false
        eventos.push({ tipo: 'retorno_palma_abajo' })
      }
    }
    s.mantenidoMs = 0
    s.pico = 0
    return { estado: s, eventos }
  }

  if (s.sobre == null || x.carta !== s.sobre || x.bloqueado) {
    s.mantenidoMs = 0
    s.pico = 0
    return { estado: s, eventos }
  }

  if (a >= cfg.umbralDeg) {
    s.mantenidoMs += x.dtMs
    s.pico = Math.max(s.pico, a)
    if (s.mantenidoMs >= cfg.sostenidoMs) {
      eventos.push({ tipo: 'volteo', carta: s.sobre, grados: Math.round(s.pico) })
      s.armada = false
      s.esperaRetorno = true
      s.mantenidoMs = 0
      s.pico = 0
    }
  } else if (a < cfg.umbralDeg - cfg.histeresisDeg) {
    s.mantenidoMs = 0
    s.pico = 0
  }
  return { estado: s, eventos }
}

/** 0..1: cuánto de la inclinación completa de la carta (la carta se inclina con el giro pero no se voltea bajo el umbral). */
export function progresoGiro(e: EstadoMano, angulo: number | null, umbralDeg: number, bloqueado = false): number {
  if (angulo == null || !e.armada || e.sobre == null || bloqueado) return 0
  return Math.min(1, Math.max(0, angulo / umbralDeg))
}

// ── Tablero ───────────────────────────────────────────────────────────────────────────────────────

export type EstadoCarta = 'tapada' | 'visible' | 'par'

export interface Tablero {
  /** Figura de cada carta (0..pares-1); cada figura aparece dos veces. */
  figuras: number[]
  estados: EstadoCarta[]
  /** Cartas volteadas aún sin resolver (0, 1 o 2). */
  abiertas: number[]
}

export const NUM_FIGURAS = 6
export const NOMBRES_FIGURA = ['círculo', 'triángulo', 'cuadrado', 'estrella', 'rombo', 'hexágono']

/** Baraja con Fisher–Yates; rng devuelve [0,1). */
export function mezclar<T>(lista: T[], rng: () => number): T[] {
  const a = [...lista]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function crearTablero(filas: number, columnas: number, rng: () => number = Math.random): Tablero {
  const n = filas * columnas
  const pares = Math.floor(n / 2)
  const figuras = mezclar(Array.from({ length: pares }, (_, i) => i % NUM_FIGURAS).flatMap((f) => [f, f]), rng)
  return { figuras, estados: figuras.map(() => 'tapada' as EstadoCarta), abiertas: [] }
}

export type ResultadoVolteo = 'par' | 'no_par' | null

/** Voltea la carta i. Con la segunda carta se resuelve: par (quedan arriba) o no_par (siguen arriba hasta `tapar`). */
export function voltear(t: Tablero, i: number): { tablero: Tablero; resultado: ResultadoVolteo } {
  if (t.estados[i] !== 'tapada' || t.abiertas.length >= 2) return { tablero: t, resultado: null }
  const estados = [...t.estados]
  estados[i] = 'visible'
  const abiertas = [...t.abiertas, i]
  if (abiertas.length < 2) return { tablero: { ...t, estados, abiertas }, resultado: null }
  const [a, b] = abiertas
  if (t.figuras[a] === t.figuras[b]) {
    estados[a] = 'par'
    estados[b] = 'par'
    return { tablero: { ...t, estados, abiertas: [] }, resultado: 'par' }
  }
  return { tablero: { ...t, estados, abiertas }, resultado: 'no_par' }
}

/** Vuelve a tapar las dos cartas de un no_par. */
export function tapar(t: Tablero): Tablero {
  const estados = [...t.estados]
  for (const i of t.abiertas) estados[i] = 'tapada'
  return { ...t, estados, abiertas: [] }
}

export const paresEncontrados = (t: Tablero) => t.estados.filter((e) => e === 'par').length / 2
export const tableroCompleto = (t: Tablero) => t.estados.every((e) => e === 'par')

/** Celda (fila, columna) bajo un punto de la escena; null si cae fuera del tablero. */
export function cartaBajo(x: number, z: number, filas: number, columnas: number, pasoX: number, pasoZ: number, centroX: number, centroZ: number): number | null {
  const col = Math.floor((x - centroX) / pasoX + columnas / 2)
  const fila = Math.floor((z - centroZ) / pasoZ + filas / 2)
  if (col < 0 || col >= columnas || fila < 0 || fila >= filas) return null
  return fila * columnas + col
}

// ── Métricas ─────────────────────────────────────────────────────────────────────────────────────

const r0 = (x: number) => Math.round(x)

/** Acumula lo que mide el juego: giro por volteo, supinación y pronación máximas, pares e intentos. */
export class AgregadoCartas {
  supinacionMax = 0
  pronacionMax = 0
  volteos: number[] = []
  pares = 0
  noPares = 0
  /** Intentos = parejas de cartas volteadas (par + no_par). */
  get intentos() {
    return this.pares + this.noPares
  }

  /** Un giro suavizado de una mano visible. */
  giro(grados: number) {
    if (!Number.isFinite(grados)) return
    if (grados > this.supinacionMax) this.supinacionMax = grados
    if (-grados > this.pronacionMax) this.pronacionMax = -grados
  }
  volteo(grados: number) {
    this.volteos.push(grados)
  }
  resultado(r: 'par' | 'no_par') {
    if (r === 'par') this.pares++
    else this.noPares++
  }

  resumen(duracionS: number): Record<string, number | null> {
    const v = this.volteos
    return {
      giroMedioVolteo: v.length ? r0(v.reduce((s, x) => s + x, 0) / v.length) : null,
      giroMinVolteo: v.length ? r0(Math.min(...v)) : null,
      giroMaxVolteo: v.length ? r0(Math.max(...v)) : null,
      supinacionMax: r0(this.supinacionMax),
      pronacionMax: r0(this.pronacionMax),
      pares: this.pares,
      intentos: this.intentos,
      volteos: v.length,
      aciertos: this.intentos ? Math.round((this.pares / this.intentos) * 100) : null,
      tiempoTotal: Math.round(duracionS),
    }
  }
}
