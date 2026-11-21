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

/** Con qué parte de la mano se sostiene la banda. */
export type Agarre = 'pinza' | 'nudillo' | 'palma'
export const AGARRES: { v: Agarre; n: string }[] = [
  { v: 'pinza', n: 'Pinza' },
  { v: 'nudillo', n: 'Nudillo' },
  { v: 'palma', n: 'Palma' },
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
}

/** Mide la banda en un cuadro. null si no hay dos manos o no se puede sacar la escala. */
export function medirBanda(cuadro: CuadroManos, agarre: Agarre): MedidaBanda | null {
  if (cuadro.manos.length < 2) return null
  const [a, b] = cuadro.manos
  const sa = escalaPerspectivaDebil(a.landmarks, a.worldLandmarks, cuadro.ancho, cuadro.alto)
  const sb = escalaPerspectivaDebil(b.landmarks, b.worldLandmarks, cuadro.ancho, cuadro.alto)
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
  }
}

/** Fracción de estiramiento respecto del reposo; 0 si la banda está suelta. */
export function estiramiento(largoCm: number, reposoCm: number): number {
  return reposoCm > 0 ? Math.max(0, largoCm / reposoCm - 1) : 0
}

// ── Marcar el reposo ────────────────────────────────────────────────────────────────────────────────────────────

/** Cuánto hay que sostener la banda quieta para marcar el reposo (ms) y cuánto puede variar el largo (fracción). */
export const MS_REPOSO = 1000
export const VARIACION_REPOSO = 0.06

/**
 * Junta largos durante MS_REPOSO y devuelve su promedio. Si en la ventana el largo varía más de VARIACION_REPOSO
 * (la persona se movió), la ventana se reinicia desde esa muestra.
 */
export class CapturaReposo {
  private muestras: { t: number; cm: number }[] = []

  /** Agrega una muestra; devuelve el reposo en cm cuando la ventana se completa, si no null. */
  agregar(t: number, cm: number): number | null {
    this.muestras.push({ t, cm })
    const valores = this.muestras.map((m) => m.cm)
    const min = Math.min(...valores)
    const max = Math.max(...valores)
    if (min > 0 && (max - min) / min > VARIACION_REPOSO) {
      this.muestras = [{ t, cm }]
      return null
    }
    if (t - this.muestras[0].t < MS_REPOSO) return null
    return valores.reduce((s, v) => s + v, 0) / valores.length
  }

  /** Avance de la ventana, 0..1. */
  progreso(t: number): number {
    return this.muestras.length ? Math.min(1, (t - this.muestras[0].t) / MS_REPOSO) : 0
  }

  /** Se perdió una mano: se parte de nuevo. */
  cortar() {
    this.muestras = []
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

export interface Totales {
  n: number
  mejorKg: number | null
  promedioKg: number | null
  tensionS: number
  trabajoJ: number
}

export function totales(reps: Repeticion[]): Totales {
  if (reps.length === 0) return { n: 0, mejorKg: null, promedioKg: null, tensionS: 0, trabajoJ: 0 }
  return {
    n: reps.length,
    mejorKg: Math.max(...reps.map((r) => r.picoKg)),
    promedioKg: reps.reduce((s, r) => s + r.picoKg, 0) / reps.length,
    tensionS: reps.reduce((s, r) => s + r.tensionS, 0),
    trabajoJ: reps.reduce((s, r) => s + r.trabajoJ, 0),
  }
}
