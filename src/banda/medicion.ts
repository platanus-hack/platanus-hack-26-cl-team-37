// Medición de una banda tomada entre las dos manos, a partir de los puntos de MediaPipe. Puro, con pruebas.
//
// La idea: el largo de la banda es la distancia entre los dos puntos de agarre. Se mide en la imagen y se pasa a cm
// con la escala de cada mano (px por metro de `escalaPerspectivaDebil`), así la referencia de tamaño está en el mismo
// plano que la banda y el resultado no depende del lente ni de lo lejos que esté el teléfono. El estiramiento es la
// razón entre ese largo y el largo en reposo, que la persona marca con la banda tensa sin estirar.
//
// Límite conocido: las dos manos deben estar a una distancia parecida de la cámara. Si no, se avisa (`desnivel`).

import type { P3 } from '../metrics/geometria'
import { PUNTOS_PALMA, escalaPerspectivaDebil } from '../tracking/distancia'
import type { CuadroManos, ManoSeguida } from '../tracking/tipos'
import { areaHasta, cargaEn, type CurvaBanda } from './curva'

/**
 * Con qué punto de la mano se mide el largo de la banda. Por defecto 'palma' (centro de la palma, bajo el nombre
 * «Puño»): queda casi en el eje de giro de la mano, así que girar el puño no cambia el largo. Con manos simuladas
 * quietas, girarlas 60° cambia la distancia entre centros de palma 0,5 % (218 → 217 px), entre nudillos del índice 26 %
 * (156 → 197 px) y entre pinzas 98 %. Ese giro natural al sostener la banda era lo que daba kilos sin fuerza en la prueba
 * real del 21-nov-2026. (Sin giro, con fotos reales, el nudillo fue algo más estable entre distancias; el giro pesa más.)
 */
export type Agarre = 'pinza' | 'nudillo' | 'palma'
export const AGARRE_POR_DEFECTO: Agarre = 'palma'
export const AGARRES: { v: Agarre; n: string }[] = [
  { v: 'palma', n: 'Puño' },
  { v: 'nudillo', n: 'Nudillo' },
  { v: 'pinza', n: 'Pinza' },
]

/** Sobre esta diferencia de escala entre las manos (fracción) se avisa que no están a la misma distancia. */
export const DESNIVEL_MAX = 0.2

/** Punto de agarre en px de la imagen cruda. */
export function puntoAgarre(mano: Pick<ManoSeguida, 'landmarks'>, agarre: Agarre, ancho: number, alto: number): { x: number; y: number } {
  const px = (p: P3) => ({ x: p.x * ancho, y: p.y * alto })
  const medio = (indices: number[]) => {
    const s = indices.reduce((t, i) => ({ x: t.x + mano.landmarks[i].x, y: t.y + mano.landmarks[i].y }), { x: 0, y: 0 })
    return px({ x: s.x / indices.length, y: s.y / indices.length, z: 0 })
  }
  if (agarre === 'pinza') return medio([4, 8])
  if (agarre === 'nudillo') return px(mano.landmarks[5])
  return medio(PUNTOS_PALMA)
}

export interface MedidaBanda {
  /** Largo entre los puntos de agarre, cm aprox. */
  largoCm: number
  /** Puntos de agarre en coordenadas normalizadas de la imagen (para dibujar). */
  extremos: [{ x: number; y: number }, { x: number; y: number }]
  /** Diferencia de escala entre las manos, 0..1 (0 = a la misma distancia de la cámara). */
  desnivel: number
  /** Algún punto de las manos está pegado al borde de la imagen: al estirar más, se va a salir. */
  alBorde: boolean
  /** Largo de la palma (muñeca → nudillo del medio) de la mano más chica, como fracción del lado corto de la imagen. */
  palma: number
  /** Escala media de las dos manos, px de la imagen por metro: sirve para pasar a cm otras distancias del mismo plano. */
  escalaPxPorM: number
}

/**
 * Bajo este tamaño de palma se pide acercarse. Medido con MediaPipe sobre fotos de manos (21-nov-2026): con la palma
 * bajo ~6 % del lado corto de la imagen deja de detectar las dos manos de forma fiable, y con manos chicas el
 * estiramiento medido varía más (hasta 5 puntos entre distancias).
 */
export const PALMA_MIN = 0.07

/** Largo de la palma de una mano en la imagen, como fracción del lado corto. */
export function tamanoPalma(mano: Pick<ManoSeguida, 'landmarks'>, ancho: number, alto: number): number {
  const [a, b] = [mano.landmarks[0], mano.landmarks[9]]
  return Math.hypot((b.x - a.x) * ancho, (b.y - a.y) * alto) / Math.min(ancho, alto)
}

/** Margen (fracción de la imagen) bajo el que un punto se considera pegado al borde. */
export const MARGEN_BORDE = 0.025

export function manosAlBorde(manos: readonly Pick<ManoSeguida, 'landmarks'>[]): boolean {
  const m = MARGEN_BORDE
  return manos.some((mano) => mano.landmarks.some((p) => p.x < m || p.x > 1 - m || p.y < m || p.y > 1 - m))
}

/**
 * Escala de una mano (px de la imagen por metro) que no cambia al girarla. Se ajusta una proyección ortográfica escalada
 * en 3D: la matriz A (2×3) que mejor lleva los puntos del mundo (centrados) a los de la imagen (centrados) es s veces dos
 * filas de una rotación, así que ‖A‖² = 2·s² sin importar hacia dónde mire la mano.
 *
 * La escala anterior (`escalaPerspectivaDebil`, solo x e y del mundo) baja cuando el puño gira hacia la cámara, porque
 * la mano se ve más angosta: con las manos quietas, girarlas 40° daba 16 % de estiramiento aparente y 60°, 28 % (unos
 * 2 kg con la Corength). Era la causa de los kilos sin fuerza de la prueba real del 21-nov-2026.
 */
export function escalaOrtografica(landmarks: readonly P3[], world: readonly P3[], ancho: number, alto: number): number | null {
  const n = Math.min(landmarks.length, world.length)
  if (n < 6) return null
  let mu = 0, mv = 0, mX = 0, mY = 0, mZ = 0
  for (let i = 0; i < n; i++) {
    mu += landmarks[i].x * ancho
    mv += landmarks[i].y * alto
    mX += world[i].x
    mY += world[i].y
    mZ += world[i].z
  }
  mu /= n; mv /= n; mX /= n; mY /= n; mZ /= n
  // M = Xᵀ X (3×3) y B = Uᵀ X (2×3), con U y X centrados.
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const B = [[0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < n; i++) {
    const x = [world[i].x - mX, world[i].y - mY, world[i].z - mZ]
    const u = [landmarks[i].x * ancho - mu, landmarks[i].y * alto - mv]
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) M[a][b] += x[a] * x[b]
      B[0][a] += u[0] * x[a]
      B[1][a] += u[1] * x[a]
    }
  }
  const inv = inversa3(M)
  if (!inv) return null
  // A = B · M⁻¹; ‖A‖² = 2 s².
  let f2 = 0
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const v = B[r][0] * inv[0][c] + B[r][1] * inv[1][c] + B[r][2] * inv[2][c]
      f2 += v * v
    }
  }
  const sOrto = Math.sqrt(f2 / 2)
  return sOrto > 0 && Number.isFinite(sOrto) ? sOrto : null
}

function inversa3(m: number[][]): number[][] | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  // La mano casi plana (z del mundo sin variación) deja la matriz casi singular: ahí no sirve el ajuste en 3D.
  if (!(Math.abs(det) > 1e-14)) return null
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ]
}

/** Escala de la mano: la ortográfica en 3D; si no se puede (mano plana), la de perspectiva débil. */
function escalaMano(m: Pick<ManoSeguida, 'landmarks' | 'worldLandmarks'>, ancho: number, alto: number): number | null {
  return escalaOrtografica(m.landmarks, m.worldLandmarks, ancho, alto) ?? escalaPerspectivaDebil(m.landmarks, m.worldLandmarks, ancho, alto)
}

/** Mide la banda en un cuadro. null si no hay dos manos o no se puede sacar la escala. */
export function medirBanda(cuadro: CuadroManos, agarre: Agarre): MedidaBanda | null {
  if (cuadro.manos.length < 2) return null
  const [a, b] = cuadro.manos
  const sa = escalaMano(a, cuadro.ancho, cuadro.alto)
  const sb = escalaMano(b, cuadro.ancho, cuadro.alto)
  if (sa == null || sb == null) return null
  const pa = puntoAgarre(a, agarre, cuadro.ancho, cuadro.alto)
  const pb = puntoAgarre(b, agarre, cuadro.ancho, cuadro.alto)
  const escala = (sa + sb) / 2
  return {
    largoCm: (Math.hypot(pa.x - pb.x, pa.y - pb.y) / escala) * 100,
    extremos: [
      { x: pa.x / cuadro.ancho, y: pa.y / cuadro.alto },
      { x: pb.x / cuadro.ancho, y: pb.y / cuadro.alto },
    ],
    desnivel: Math.abs(sa - sb) / escala,
    alBorde: manosAlBorde([a, b]),
    palma: Math.min(tamanoPalma(a, cuadro.ancho, cuadro.alto), tamanoPalma(b, cuadro.ancho, cuadro.alto)),
    escalaPxPorM: escala,
  }
}

/**
 * Bajo este largo de reposo (cm aprox.) el error relativo del reposo pesa: el ruido por cuadro es cerca de 0,5 cm
 * (medido con MediaPipe sobre fotos con ruido de sensor) y un reposo de 12 cm ya da unos 4 puntos de estiramiento.
 */
export const REPOSO_CORTO_CM = 12

/** Fracción de estiramiento respecto del reposo; 0 si la banda está suelta. */
/**
 * Bajo este estiramiento se informa 0: es temblor de la medida y de la mano, no carga. Sin esta zona, con la banda en
 * reposo se leían kilos (prueba real, 21-nov-2026: «aunque lo dejaba sin ejercer fuerza igual marcaba 2 kg»), porque la
 * curva del látex es empinada al principio: con la Corength, 5 % de estiramiento ya es cerca de 0,4 kg.
 */
export const ZONA_MUERTA = 0.05

/** Fracción de estiramiento respecto del reposo; 0 si la banda está suelta o dentro de la zona muerta. */
export function estiramiento(largoCm: number, reposoCm: number): number {
  const e = reposoCm > 0 ? largoCm / reposoCm - 1 : 0
  return e < ZONA_MUERTA ? 0 : e
}

/**
 * Tras este tiempo con la banda «estirada» y quieta (sin subir ni bajar) se pregunta si en realidad está en reposo: es
 * lo que pasa cuando el reposo quedó marcado con las manos más juntas. No se corrige solo porque también puede ser un
 * estiramiento sostenido a propósito.
 */
export const MS_SOSPECHA_REPOSO = 6000

// ── Marcar el reposo ────────────────────────────────────────────────────────────────────────────────────────────

/** «Poner en cero»: promedio de este tiempo de medida (ms), casi al instante, como la tara de una balanza. */
export const MS_REPOSO = 400
/**
 * Sin reposo todavía, se marca solo tras este tiempo quieto (con las dos manos en la banda no se puede tocar un botón).
 * Se pide bastante quietud para no marcarlo mientras las manos todavía se acomodan; si igual queda mal, «Poner en cero».
 */
export const MS_REPOSO_AUTO = 2500
export const VARIACION_REPOSO = 0.06
/**
 * Si con el reposo ya marcado aparece un largo estable al menos esta fracción más corto, el reposo se había marcado
 * con la banda estirada (pasa cuando se sostiene el estiramiento, como se indica en terapia) y se corrige.
 * Prueba con video de manos reales, 21-nov-2026: con 1 s de estiramiento sostenido el reposo quedó en 73 cm en vez
 * de 52 cm y no contó ninguna repetición.
 */
export const AJUSTE_REPOSO = 0.08

/**
 * Junta largos durante `ms` y devuelve su promedio. Si en la ventana el largo varía más de `variacion` (por defecto
 * VARIACION_REPOSO: la persona se movió), la ventana se reinicia desde esa muestra. Tras completarse sigue devolviendo el promedio
 * de la ventana mientras la banda siga quieta.
 */
export class CapturaReposo {
  private muestras: { t: number; cm: number }[] = []
  private readonly ms: number
  private readonly variacion: number
  constructor(ms = MS_REPOSO, variacion = VARIACION_REPOSO) {
    this.ms = ms
    this.variacion = variacion
  }

  /** Agrega una muestra; devuelve el largo estable en cm cuando la ventana se completa, si no null. */
  agregar(t: number, cm: number): number | null {
    this.muestras.push({ t, cm })
    const valores = this.muestras.map((m) => m.cm)
    const min = Math.min(...valores)
    const max = Math.max(...valores)
    if (min > 0 && (max - min) / min > this.variacion) {
      this.muestras = [{ t, cm }]
      return null
    }
    // Solo se guarda la ventana necesaria (más un margen), para no crecer sin límite con la banda quieta.
    while (this.muestras.length > 2 && t - this.muestras[1].t >= this.ms) this.muestras.shift()
    if (t - this.muestras[0].t < this.ms) return null
    return this.muestras.reduce((s, m) => s + m.cm, 0) / this.muestras.length
  }

  /** Avance de la ventana, 0..1. */
  progreso(t: number): number {
    return this.muestras.length ? Math.min(1, (t - this.muestras[0].t) / this.ms) : 0
  }

  /** Se perdió una mano o ya se usó el valor: se parte de nuevo. */
  cortar() {
    this.muestras = []
  }
}

/** ¿Un largo estable dice que el reposo marcado era con la banda estirada? */
export function reposoMalMarcado(reposoCm: number, estableCm: number): boolean {
  return estableCm < reposoCm * (1 - AJUSTE_REPOSO)
}

// ── Pérdidas breves de la mano ─────────────────────────────────────────────────────────────────────────────────

/**
 * Hasta este tiempo sin medida (una mano no detectada) se sigue como si nada: MediaPipe pierde manos con frecuencia en
 * cuadros sueltos (Evaluation of Pose Estimation Systems for Sign Language Translation, arXiv 2604.24609) y cortar
 * ahí partía una repetición en dos. Pasado este tiempo sí se corta (la persona soltó la banda o salió del cuadro).
 */
export const MS_TOLERANCIA_PERDIDA = 500

/** Decide si una falta de medida es un hueco breve (se ignora) o una pérdida real (se corta). */
export class ToleranciaPerdida {
  private ultimaMedida: number | null = null
  private readonly ms: number
  constructor(ms = MS_TOLERANCIA_PERDIDA) {
    this.ms = ms
  }

  /** Registra un cuadro con o sin medida. Devuelve 'medida', 'hueco' (ignorar el cuadro) o 'perdida' (cortar). */
  cuadro(t: number, hayMedida: boolean): 'medida' | 'hueco' | 'perdida' {
    if (hayMedida) {
      this.ultimaMedida = t
      return 'medida'
    }
    return this.ultimaMedida != null && t - this.ultimaMedida <= this.ms ? 'hueco' : 'perdida'
  }
}

// ── Repeticiones ────────────────────────────────────────────────────────────────────────────────────────────────

/** Una repetición empieza al pasar INICIO_REP de estiramiento y termina al volver bajo FIN_REP. */
export const INICIO_REP = 0.1
export const FIN_REP = 0.04
const G = 9.80665

export interface Repeticion {
  /** Carga máxima de la repetición, kg aprox. */
  picoKg: number
  /** Estiramiento máximo, fracción. */
  picoEstiramiento: number
  /** Tiempo con la banda estirada, s. */
  tensionS: number
  /** Trabajo de estirar la banda desde el reposo hasta el pico (área bajo la curva), joules aprox. */
  trabajoJ: number
  /** Algún tramo quedó sobre el último punto de la curva. */
  fueraDeRango: boolean
}

export interface ResumenReps {
  repeticiones: Repeticion[]
  /** Hay una repetición en curso. */
  estirando: boolean
}

/**
 * Cuenta repeticiones a partir de (tiempo, largo). Mantiene la repetición en curso y las cerradas.
 * El reposo y la curva pueden cambiar entre muestras: cada muestra se evalúa con los que rigen en ese momento.
 */
export class ContadorReps {
  readonly repeticiones: Repeticion[] = []
  private actual: Repeticion | null = null
  private inicio = 0

  agregar(t: number, largoCm: number, reposoCm: number, curva: Pick<CurvaBanda, 'puntos'>) {
    const e = estiramiento(largoCm, reposoCm)
    const { kg, fueraDeRango } = cargaEn(curva, e)
    if (!this.actual && e >= INICIO_REP) {
      this.actual = { picoKg: 0, picoEstiramiento: 0, tensionS: 0, trabajoJ: 0, fueraDeRango: false }
      this.inicio = t
    }
    const r = this.actual
    if (r) {
      r.picoKg = Math.max(r.picoKg, kg)
      r.picoEstiramiento = Math.max(r.picoEstiramiento, e)
      r.tensionS = (t - this.inicio) / 1000
      r.fueraDeRango ||= fueraDeRango
      r.trabajoJ = areaHasta(curva, r.picoEstiramiento) * (reposoCm / 100) * G
      if (e <= FIN_REP) this.cerrar()
    }
  }

  /** Se perdió una mano: la repetición en curso se cierra con lo que alcanzó a medir. */
  cortar() {
    this.cerrar()
  }

  reiniciar() {
    this.repeticiones.length = 0
    this.actual = null
  }

  get estirando(): boolean {
    return this.actual != null
  }

  private cerrar() {
    if (!this.actual) return
    this.repeticiones.push(this.actual)
    this.actual = null
  }
}

/**
 * Una repetición con menos tiempo que esto en tensión se marca como rápida: la cámara mide peor los movimientos
 * rápidos (el error de MediaPipe crece con la velocidad: Sensors 2025, doi 10.3390/s25185716) y en terapia se
 * pide un ritmo controlado.
 */
export const MIN_S_REP = 1

/** Fracción de la meta desde la que una repetición cuenta como lograda (tolera el ruido de la medición). */
export const TOLERANCIA_META = 0.95

export function alcanzaMeta(r: Pick<Repeticion, 'picoKg'>, metaKg: number | null): boolean {
  return metaKg != null && metaKg > 0 && r.picoKg >= metaKg * TOLERANCIA_META
}

export interface Totales {
  n: number
  mejorKg: number | null
  promedioKg: number | null
  tensionS: number
  trabajoJ: number
  /** 1 − coeficiente de variación de los picos (1 = todas iguales). null con menos de 2 repeticiones. */
  constancia: number | null
  /** Repeticiones que llegaron a la meta (0 sin meta). */
  enMeta: number
  rapidas: number
}

export function totales(reps: Repeticion[], metaKg: number | null = null): Totales {
  if (reps.length === 0) return { n: 0, mejorKg: null, promedioKg: null, tensionS: 0, trabajoJ: 0, constancia: null, enMeta: 0, rapidas: 0 }
  const picos = reps.map((r) => r.picoKg)
  const media = picos.reduce((s, v) => s + v, 0) / picos.length
  const desv = Math.sqrt(picos.reduce((s, v) => s + (v - media) ** 2, 0) / picos.length)
  return {
    n: reps.length,
    mejorKg: Math.max(...picos),
    promedioKg: media,
    tensionS: reps.reduce((s, r) => s + r.tensionS, 0),
    trabajoJ: reps.reduce((s, r) => s + r.trabajoJ, 0),
    constancia: reps.length >= 2 && media > 0 ? Math.max(0, 1 - desv / media) : null,
    enMeta: reps.filter((r) => alcanzaMeta(r, metaKg)).length,
    rapidas: reps.filter((r) => r.tensionS < MIN_S_REP).length,
  }
}

const n1 = (v: number) => v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Resumen de la serie en texto, para pegarlo en el chat del equipo o en una nota. */
export function textoResumen(reps: Repeticion[], o: { banda: string; tiras: number; metaKg: number | null; reposoCm: number | null }): string {
  const t = totales(reps, o.metaKg)
  const lineas = [
    `Banda: ${o.banda}, ${o.tiras === 1 ? '1 tira' : `${o.tiras} tiras`}${o.reposoCm ? `, reposo ${Math.round(o.reposoCm)} cm` : ''}`,
    `Repeticiones: ${t.n}${o.metaKg ? ` (${t.enMeta} ${t.enMeta === 1 ? 'llegó' : 'llegaron'} a la meta de ${n1(o.metaKg)} kg)` : ''}`,
  ]
  if (t.n > 0) {
    lineas.push(`Mejor pico: ${n1(t.mejorKg ?? 0)} kg aprox. · promedio ${n1(t.promedioKg ?? 0)} kg`)
    if (t.constancia != null) lineas.push(`Constancia entre repeticiones: ${Math.round(t.constancia * 100)} %`)
    lineas.push(`Tiempo con la banda estirada: ${Math.round(t.tensionS)} s · trabajo ${n1(t.trabajoJ)} J`)
    lineas.push(`Picos: ${reps.map((r) => `${n1(r.picoKg)} kg (${Math.round(r.picoEstiramiento * 100)} %)`).join(', ')}`)
  }
  lineas.push('Estimación de la carga de la banda a partir de su estiramiento (cámara), no medición de fuerza de la persona.')
  return lineas.join('\n')
}
