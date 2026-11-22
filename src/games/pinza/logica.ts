// Pinza fina (F23, J2): reglas puras, con pruebas en pinza.test.ts.
//
// - Toque: distancia entre la punta del pulgar (landmark 4) y la punta del dedo (8, 12, 16 o 20) en cm
//   (worldLandmarks × escala de la calibración). Entra bajo `toqueCm` y solo se suelta sobre `sueltaCm` (histéresis);
//   ambos umbrales son proporcionales al largo de mano calibrado. Hay que mantenerlo HOLD_MS (0,3 s) y separar.
// - Dedo equivocado = `error` (una vez por contacto, sin bloquear nada). Sin tiempo → nada se queda esperando:
//   al vencer el límite del nivel se registra `no_alcanzado` con la distancia mínima y el juego pasa al dedo siguiente.
// - Secuencias: fija (índice, medio, anular, meñique) o al azar; el nivel 5 se muestra primero y hay que repetirla.
// - Agregados: tiempo por toque y distancia mínima pulgar–dedo por dedo (la métrica clave cuando aún no alcanza).
import type { P3 } from '../../metrics/geometria'

export type DedoPinza = 'indice' | 'medio' | 'anular' | 'menique'
export const DEDOS_PINZA: DedoPinza[] = ['indice', 'medio', 'anular', 'menique']
/** Landmark de la punta de cada dedo. El pulgar es el 4. */
export const PUNTA_DEDO: Record<DedoPinza, number> = { indice: 8, medio: 12, anular: 16, menique: 20 }
export const PUNTA_PULGAR = 4
export const NOMBRE_DEDO: Record<DedoPinza, string> = { indice: 'índice', medio: 'medio', anular: 'anular', menique: 'meñique' }

/** Cuánto hay que mantener el toque (ms). */
export const HOLD_MS = 300
/** Un contacto con un dedo que no es el pedido se anota como error si dura al menos esto (ms): ignora roces al pasar. */
export const ERROR_MS = 200
/** Toques por secuencia (una luz por toque). */
export const LARGO_SECUENCIA = 4

export interface NivelPinza {
  nombre: string
  detalle: string
  /** Tiempo para cada toque (ms). 0 = sin límite. */
  limiteMs: number
  aleatoria: boolean
  /** Se muestra la secuencia y después hay que repetirla de memoria. */
  memoria: boolean
  [k: string]: string | number | boolean
}

export const NIVELES_PINZA: Record<1 | 2 | 3 | 4 | 5, NivelPinza> = {
  1: { nombre: 'Secuencia fija', detalle: 'Índice, medio, anular y meñique en orden · sin límite de tiempo', limiteMs: 0, aleatoria: false, memoria: false },
  2: { nombre: 'Secuencia fija con tiempo', detalle: 'Índice, medio, anular y meñique en orden · 6 s por toque', limiteMs: 6000, aleatoria: false, memoria: false },
  3: { nombre: 'Secuencia al azar', detalle: 'Los dedos se iluminan en orden al azar · 4 s por toque', limiteMs: 4000, aleatoria: true, memoria: false },
  4: { nombre: 'Al azar, más rápido', detalle: 'Orden al azar · 3 s por toque', limiteMs: 3000, aleatoria: true, memoria: false },
  5: { nombre: 'Recordar y repetir', detalle: 'Mira la secuencia y repítela de memoria · 2 s por toque', limiteMs: 2000, aleatoria: true, memoria: true },
}

export function nivelPinza(n: number): NivelPinza {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5
  return NIVELES_PINZA[k]
}

// ── Umbrales y distancias ──────────────────────────────────────────────────────────────────────

export interface Umbrales {
  /** Entra en contacto bajo esta distancia (cm). */
  toqueCm: number
  /** Se considera separado sobre esta distancia (cm). */
  sueltaCm: number
}

export const FRACCION_TOQUE = 0.1
export const FRACCION_SUELTA = 0.17
export const LARGO_MANO_POR_DEFECTO_CM = 18

/**
 * Margen por dedo sobre los umbrales de toque y suelta. Medio y anular llevan 1,5× (≈ 2,7 cm para entrar y 4,6 cm
 * para soltar con una mano de 18 cm): con la mano de frente el pulgar tapa sus puntas y la cámara estima esa distancia
 * más larga de lo que es, así que el toque no se reconocía.
 */
export const TOLERANCIA_DEDO: Record<DedoPinza, number> = { indice: 1, medio: 1.5, anular: 1.5, menique: 1 }

/** Secuencias completas por mano tras las que termina la sesión, si el plan no fija otra cantidad (metaAgarres). */
export const SECUENCIAS_POR_MANO = 3

/**
 * Meta de la sesión en secuencias completas (cada una cuenta al terminar, con o sin todos los toques logrados):
 * `metaPlan` (o SECUENCIAS_POR_MANO si es 0) por cada mano que juega.
 */
export function metaSecuencias(metaPlan: number, mano: string | undefined): number {
  const porMano = metaPlan > 0 ? Math.round(metaPlan) : SECUENCIAS_POR_MANO
  return porMano * (mano === 'ambas' ? 2 : 1)
}

/** Distancias divididas por el margen de cada dedo: comparables directo con los umbrales comunes. */
export function distanciasEfectivas(d: Distancias): Distancias {
  return {
    indice: d.indice / TOLERANCIA_DEDO.indice,
    medio: d.medio / TOLERANCIA_DEDO.medio,
    anular: d.anular / TOLERANCIA_DEDO.anular,
    menique: d.menique / TOLERANCIA_DEDO.menique,
  }
}

/** Umbrales proporcionales al largo de mano calibrado (≈ 1,8 y 3,1 cm para una mano de 18 cm). */
export function umbralesToque(largoManoCm: number | null | undefined): Umbrales {
  const L = largoManoCm && largoManoCm > 5 ? largoManoCm : LARGO_MANO_POR_DEFECTO_CM
  return { toqueCm: Math.max(1, L * FRACCION_TOQUE), sueltaCm: Math.max(1.8, L * FRACCION_SUELTA) }
}

export type Distancias = Record<DedoPinza, number>

const d3 = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** Distancia (cm) de la punta del pulgar a cada punta de dedo. `escalaCm` = cm por unidad de worldLandmarks. */
export function distanciasPulgar(world: P3[], escalaCm: number): Distancias {
  const pulgar = world[PUNTA_PULGAR]
  return {
    indice: d3(pulgar, world[PUNTA_DEDO.indice]) * escalaCm,
    medio: d3(pulgar, world[PUNTA_DEDO.medio]) * escalaCm,
    anular: d3(pulgar, world[PUNTA_DEDO.anular]) * escalaCm,
    menique: d3(pulgar, world[PUNTA_DEDO.menique]) * escalaCm,
  }
}

export function masCercano(d: Distancias): { dedo: DedoPinza; cm: number } {
  let dedo: DedoPinza = 'indice'
  for (const f of DEDOS_PINZA) if (d[f] < d[dedo]) dedo = f
  return { dedo, cm: d[dedo] }
}

// ── Secuencias ─────────────────────────────────────────────────────────────────────────────────

const mismo = (a: DedoPinza[], b: DedoPinza[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Secuencia de LARGO_SECUENCIA dedos distintos. Niveles 1–2: siempre el orden fijo. Niveles 3–5: al azar (`rng` → [0,1)),
 * distinta del orden fijo y de la secuencia anterior.
 */
export function generarSecuencia(nivel: Pick<NivelPinza, 'aleatoria'>, rng: () => number, previa?: DedoPinza[]): DedoPinza[] {
  if (!nivel.aleatoria) return [...DEDOS_PINZA]
  let s: DedoPinza[] = [...DEDOS_PINZA]
  for (let intento = 0; intento < 12; intento++) {
    s = [...DEDOS_PINZA]
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)))
      ;[s[i], s[j]] = [s[j], s[i]]
    }
    if (!mismo(s, DEDOS_PINZA) && !(previa && mismo(s, previa))) return s
  }
  return s
}

// ── Detección de toques ────────────────────────────────────────────────────────────────────────

export interface EstadoPinza {
  /** Dedo pedido ahora (null = ninguno: demostración o entre secuencias). */
  objetivo: DedoPinza | null
  /** ms de juego en que se mostró el objetivo. */
  tObjetivoMs: number
  /** Distancia mínima pulgar–objetivo desde que se mostró (cm; Infinity si aún no hay dato). */
  distMinCm: number
  /** Dedo en contacto con el pulgar (con histéresis). */
  contacto: DedoPinza | null
  contactoDesdeMs: number
  /** El contacto actual ya se anotó como error. */
  errorContado: boolean
  /** Tras un toque hay que separar antes de contar otro. */
  bloqueado: boolean
}

export type EventoPinza =
  | { tipo: 'toque'; dedo: DedoPinza; tiempoMs: number; distMinCm: number }
  | { tipo: 'error'; dedo: DedoPinza }
  | { tipo: 'no_alcanzado'; dedo: DedoPinza; distMinCm: number; tiempoMs: number }

export function estadoPinzaInicial(): EstadoPinza {
  return { objetivo: null, tObjetivoMs: 0, distMinCm: Infinity, contacto: null, contactoDesdeMs: 0, errorContado: false, bloqueado: false }
}

/** Pide un dedo nuevo (o ninguno). Conserva el contacto y el bloqueo: si el pulgar sigue pegado, hay que separar primero. */
export function fijarObjetivo(e: EstadoPinza, dedo: DedoPinza | null, tMs: number): EstadoPinza {
  return { ...e, objetivo: dedo, tObjetivoMs: tMs, distMinCm: Infinity }
}

export interface ConfigPinza extends Umbrales {
  /** Límite por toque en ms (0 = sin límite). */
  limiteMs: number
}

/**
 * Un cuadro. `dist` = distancias del pulgar a cada dedo (null = sin mano: no avanza nada, el tiempo se congela
 * porque la base pausa el juego). Devuelve el estado nuevo y los eventos de este cuadro (a lo más uno).
 */
export function pasoPinza(e: EstadoPinza, distReal: Distancias | null, tMs: number, cfg: ConfigPinza): { estado: EstadoPinza; eventos: EventoPinza[] } {
  if (!distReal) return { estado: e.contacto ? { ...e, contacto: null, errorContado: false } : e, eventos: [] }
  const s = { ...e }
  // Contacto con las distancias divididas por el margen de cada dedo (TOLERANCIA_DEDO); las métricas, con las reales.
  const dist = distanciasEfectivas(distReal)
  const cercano = masCercano(dist)

  // Contacto con histéresis: entra bajo toqueCm, sale sobre sueltaCm; si otro dedo queda claramente más cerca, cambia.
  if (s.contacto && dist[s.contacto] > cfg.sueltaCm) s.contacto = null
  if (s.contacto && cercano.dedo !== s.contacto && cercano.cm < cfg.toqueCm && cercano.cm < dist[s.contacto]) {
    s.contacto = cercano.dedo
    s.contactoDesdeMs = tMs
    s.errorContado = false
  }
  if (!s.contacto && cercano.cm < cfg.toqueCm) {
    s.contacto = cercano.dedo
    s.contactoDesdeMs = tMs
    s.errorContado = false
  }
  if (!s.contacto) s.errorContado = false
  if (s.bloqueado && cercano.cm > cfg.sueltaCm) s.bloqueado = false
  if (s.objetivo) s.distMinCm = Math.min(s.distMinCm, distReal[s.objetivo])

  const eventos: EventoPinza[] = []
  if (s.objetivo && !s.bloqueado) {
    const tocando = s.contacto === s.objetivo
    if (tocando && tMs - s.contactoDesdeMs >= HOLD_MS) {
      eventos.push({ tipo: 'toque', dedo: s.objetivo, tiempoMs: tMs - s.tObjetivoMs, distMinCm: s.distMinCm })
      s.bloqueado = true
    } else if (s.contacto && !tocando && !s.errorContado && tMs - s.contactoDesdeMs >= ERROR_MS) {
      eventos.push({ tipo: 'error', dedo: s.contacto })
      s.errorContado = true
    } else if (cfg.limiteMs > 0 && tMs - s.tObjetivoMs >= cfg.limiteMs && !tocando) {
      // Nunca se bloquea: al vencer el tiempo se anota lo que faltó y se sigue. Si ya estaba tocando, se le da el hold.
      eventos.push({ tipo: 'no_alcanzado', dedo: s.objetivo, distMinCm: s.distMinCm, tiempoMs: tMs - s.tObjetivoMs })
    }
  }
  return { estado: s, eventos }
}

// ── Agregados ──────────────────────────────────────────────────────────────────────────────────

const r1 = (x: number) => Math.round(x * 10) / 10
/** 'indice' → 'Indice' (sufijo de los ids de métricas por dedo). */
export const capital = (d: string) => d[0].toUpperCase() + d.slice(1)

export class AgregadoPinza {
  toques = 0
  errores = 0
  noAlcanzados = 0
  readonly tiemposMs: number[] = []
  readonly distMin: Record<DedoPinza, number> = { indice: Infinity, medio: Infinity, anular: Infinity, menique: Infinity }
  readonly toquesPorDedo: Record<DedoPinza, number> = { indice: 0, medio: 0, anular: 0, menique: 0 }
  readonly noAlcanzadoPorDedo: Record<DedoPinza, number> = { indice: 0, medio: 0, anular: 0, menique: 0 }

  private minimo(dedo: DedoPinza, cm: number) {
    if (Number.isFinite(cm)) this.distMin[dedo] = Math.min(this.distMin[dedo], cm)
  }

  evento(ev: EventoPinza) {
    if (ev.tipo === 'toque') {
      this.toques++
      this.toquesPorDedo[ev.dedo]++
      this.tiemposMs.push(ev.tiempoMs)
      this.minimo(ev.dedo, ev.distMinCm)
    } else if (ev.tipo === 'error') {
      this.errores++
    } else {
      this.noAlcanzados++
      this.noAlcanzadoPorDedo[ev.dedo]++
      this.minimo(ev.dedo, ev.distMinCm)
    }
  }

  tiempoMedioS(): number | null {
    return this.tiemposMs.length ? this.tiemposMs.reduce((s, x) => s + x, 0) / this.tiemposMs.length / 1000 : null
  }

  /** Dedos con algún `no_alcanzado`. */
  dedosNoAlcanzados(): DedoPinza[] {
    return DEDOS_PINZA.filter((d) => this.noAlcanzadoPorDedo[d] > 0)
  }

  /** Valores para `metricas.juego` (ids de metricasResumen). */
  resumen(): Record<string, number | null> {
    const intentos = this.toques + this.errores + this.noAlcanzados
    const t = this.tiempoMedioS()
    const out: Record<string, number | null> = {
      toques: this.toques,
      errores: this.errores,
      noAlcanzados: this.noAlcanzados,
      dedosNoAlcanzados: this.dedosNoAlcanzados().length,
      precision: intentos ? Math.round((this.toques / intentos) * 100) : null,
      tiempoMedioToque: t == null ? null : r1(t),
    }
    for (const d of DEDOS_PINZA) {
      out[`distMin${capital(d)}`] = Number.isFinite(this.distMin[d]) ? r1(this.distMin[d]) : null
      out[`noAlcanza${capital(d)}`] = this.noAlcanzadoPorDedo[d]
    }
    return out
  }
}
