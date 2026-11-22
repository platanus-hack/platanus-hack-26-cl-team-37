// Banda elástica (F36): reglas puras, con pruebas en banda.test.ts.
//
// El paciente sostiene una banda en lazo con las DOS manos frente a la cámara. Se mide la distancia entre los
// nudillos de ambas manos (promedio de los landmarks 5, 9, 13 y 17 de cada mano) y de ahí:
//   - reposo: la distancia con la banda recién tensa, sin tirar. Se marca sola cuando ambas manos se ven y la
//     distancia se mantiene estable (±2 %) durante 2 s, o con el botón. Al marcarlo se CONGELA la escala px → cm
//     (el puño girado hace saltar la escala cuadro a cuadro: 9 a 18 px/cm en la prueba de laboratorio);
//   - estiramiento % = distancia / reposo − 1 (no depende de la escala); en cm = % × reposo en cm (aprox.);
//   - carga aprox. = kgBanda × estiramiento (modelo lineal: la banda marca sus kg "al doble de largo", o sea al 100 %).
//     Es una estimación, no una medición.
//   - repeticiones: tramos seguidos sobre max(15 % del pico de la sesión, 10 %), tolerando huecos de 0,35 s y
//     descartando fragmentos menores al 35 % del pico; solo cuentan los que pasan del 25 % de estiramiento.
// Port de la prueba de laboratorio (prueba-banda/nudillos.py y comparar_banda.py).
import type { P3 } from '../../metrics/geometria'
import { BANDAS } from '../assets/naturales'

export type NumeroNivelBanda = 1 | 2 | 3 | 4 | 5

export interface NivelBanda {
  nombre: string
  detalle: string
  /** kg nominales de la banda "al doble de largo" (a 100 % de estiramiento). */
  kgBanda: number
  /** Color de la banda (CSS), solo para mostrarlo en el nivel. */
  color: string
  [clave: string]: string | number | boolean
}

/** Banda por nivel: color y carga nominal (los kg de la cinta al doble de su largo). */
export const NIVELES_BANDA: Record<NumeroNivelBanda, NivelBanda> = {
  1: { nombre: 'Banda amarilla', detalle: 'Banda de 2 kg nominales al doble de largo', kgBanda: 2, color: BANDAS.amarilla },
  2: { nombre: 'Banda roja', detalle: 'Banda de 4 kg nominales al doble de largo', kgBanda: 4, color: BANDAS.roja },
  3: { nombre: 'Banda verde', detalle: 'Banda de 6 kg nominales al doble de largo', kgBanda: 6, color: BANDAS.verde },
  4: { nombre: 'Banda azul', detalle: 'Banda de 8 kg nominales al doble de largo', kgBanda: 8, color: BANDAS.azul },
  5: { nombre: 'Banda negra', detalle: 'Banda de 10 kg nominales al doble de largo', kgBanda: 10, color: BANDAS.negra },
}

export function nivelBanda(n: number): NivelBanda {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as NumeroNivelBanda
  return NIVELES_BANDA[k]
}

// ── Constantes ────────────────────────────────────────────────────────────────────────────────────

/** Landmarks de los nudillos (base de índice, medio, anular y meñique). */
export const NUDILLOS = [5, 9, 13, 17] as const
/** Tiempo estable para marcar el reposo solo (ms). */
export const REPOSO_MS = 2000
/** Tolerancia de la distancia estable: ±2 % (el ancho total del rango es el doble). */
export const REPOSO_TOL = 0.02
/** Cuadros para la mediana de la distancia (alisa el seguimiento). */
export const MEDIANA_CUADROS = 5
/** Cuadros de escala que se promedian (mediana) al congelarla. */
export const ESCALA_CUADROS = 30
/** Hueco máximo (ms) bajo el umbral que no parte una repetición. */
export const HUECO_MS = 350
/** Una repetición debe llegar a esta fracción del pico de la sesión; si no, es un fragmento (p. ej. la cola de un tirón). */
export const FRAGMENTO_FRAC = 0.35
/** El umbral de una repetición sube con el pico: esta fracción de él... */
export const UMBRAL_PICO_FRAC = 0.15
/** ...pero nunca baja de este estiramiento (%), que ya es más que el ruido del seguimiento. */
export const UMBRAL_MIN_PCT = 10
/** Estiramiento (%) que hay que alcanzar para que una repetición cuente; las que no llegan quedan como incompletas. */
export const REP_MIN_PCT = 25
/** Un tramo debe durar al menos esto (ms) y tener al menos esos cuadros para ser una repetición (o incompleta). */
export const REP_MIN_MS = 300
export const REP_MIN_CUADROS = 3
/** "Bajo tensión": carga sobre esta fracción del pico de la sesión. */
export const TENSION_FRAC = 0.5
/** Un cuadro no suma más que esto al tiempo (pausas, saltos de reloj). */
export const DT_MAX_MS = 100
/** Tope de cuadros guardados para el tiempo bajo tensión (≈ 1 h a 30 fps). */
const MAX_SERIE = 120_000

export const cargaDe = (kgBanda: number, estiramientoPct: number): number => (kgBanda * estiramientoPct) / 100

// ── Geometría ─────────────────────────────────────────────────────────────────────────────────────

/** Centro de los nudillos de una mano en píxeles de la imagen. */
export function centroNudillosPx(landmarks: readonly P3[], ancho: number, alto: number): { x: number; y: number } {
  let x = 0
  let y = 0
  for (const i of NUDILLOS) {
    x += landmarks[i].x * ancho
    y += landmarks[i].y * alto
  }
  return { x: x / NUDILLOS.length, y: y / NUDILLOS.length }
}

/**
 * Escala de perspectiva débil de una mano: píxeles por unidad de worldLandmarks (mínimos cuadrados en x, y de los
 * 21 puntos de la imagen contra los 21 del mundo). Sirve aunque la mano esté girada o en puño. null si no hay datos.
 */
export function escalaPxPorUnidad(landmarks: readonly P3[], world: readonly P3[], ancho: number, alto: number): number | null {
  const n = Math.min(landmarks.length, world.length)
  if (n < 3) return null
  let mpx = 0, mpy = 0, mwx = 0, mwy = 0
  for (let i = 0; i < n; i++) {
    mpx += landmarks[i].x * ancho
    mpy += landmarks[i].y * alto
    mwx += world[i].x
    mwy += world[i].y
  }
  mpx /= n; mpy /= n; mwx /= n; mwy /= n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const wx = world[i].x - mwx
    const wy = world[i].y - mwy
    num += (landmarks[i].x * ancho - mpx) * wx + (landmarks[i].y * alto - mpy) * wy
    den += wx * wx + wy * wy
  }
  return den > 1e-12 && num > 0 ? num / den : null
}

export interface ManoBanda {
  landmarks: readonly P3[]
  worldLandmarks: readonly P3[]
}

export interface MedidaCuadro {
  /** Distancia entre los centros de nudillos de ambas manos, píxeles de la imagen. */
  distPx: number
  /** Escala px por cm (promedio de las dos manos; `escalaCm` = cm por unidad de worldLandmarks de la calibración). */
  pxPorCm: number
}

/** Medida de un cuadro con las dos manos; null con menos de dos manos (no se mide con una sola) o sin escala. */
export function medirCuadro(manos: readonly ManoBanda[], ancho: number, alto: number, escalaCm = 100): MedidaCuadro | null {
  if (manos.length < 2 || !(ancho > 0) || !(alto > 0)) return null
  const [a, b] = manos
  const ca = centroNudillosPx(a.landmarks, ancho, alto)
  const cb = centroNudillosPx(b.landmarks, ancho, alto)
  const ea = escalaPxPorUnidad(a.landmarks, a.worldLandmarks, ancho, alto)
  const eb = escalaPxPorUnidad(b.landmarks, b.worldLandmarks, ancho, alto)
  if (ea == null || eb == null || !(escalaCm > 0)) return null
  return { distPx: Math.hypot(ca.x - cb.x, ca.y - cb.y), pxPorCm: (ea + eb) / 2 / escalaCm }
}

export function mediana(v: readonly number[]): number {
  if (!v.length) return NaN
  const s = [...v].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Tono (0..1, como el matiz de HSL) de la banda según su estiramiento: azul frío (0,58) → rojo cálido (0) al 100 %. */
export function tonoDeEstiramiento(pct: number): number {
  const f = Math.min(1, Math.max(0, pct / 100))
  return 0.58 * (1 - f)
}

/** Grosor relativo de la banda: 1 en reposo, 0,5 al 100 % de estiramiento (se adelgaza al estirarla). */
export function grosorDeEstiramiento(pct: number): number {
  return 1 - 0.5 * Math.min(1, Math.max(0, pct / 100))
}

// ── Repeticiones ──────────────────────────────────────────────────────────────────────────────────

export interface TramoBanda {
  picoPct: number
  picoCm: number
  /** ms de juego (acumulados de los dt) en que se alcanzó el pico. */
  tPicoMs: number
  duracionMs: number
}

export type EventoBanda =
  | { tipo: 'reposo'; reposoCm: number; reposoPx: number; pxPorCm: number; automatico: boolean }
  | ({ tipo: 'repeticion'; n: number; cargaKg: number } & TramoBanda)
  | ({ tipo: 'incompleta'; cargaKg: number; umbralPct: number } & TramoBanda)

interface Abierto {
  picoPct: number
  picoCm: number
  tPicoMs: number
  inicioMs: number
  cuadros: number
  huecoMs: number
}

/** Cuadro a cuadro: ¿está dentro de una repetición? Mismo criterio de comparar_banda.py, pero en línea. */
export class DetectorRepeticiones {
  picoSesionPct = 0
  private abierto: Abierto | null = null
  private reloj = 0

  /** Umbral (%) con el que empieza/sigue un tramo: el mayor entre 15 % del pico de la sesión y el mínimo fijo. */
  get umbralPct(): number {
    return Math.max(UMBRAL_MIN_PCT, UMBRAL_PICO_FRAC * this.picoSesionPct)
  }

  get abiertoAhora(): boolean {
    return this.abierto != null
  }

  /** Sigue una repetición abierta y cuánto lleva; null si no hay ninguna. */
  get picoAbierto(): number | null {
    return this.abierto?.picoPct ?? null
  }

  /**
   * Un cuadro de `dtMs`. `pct`/`cm` = estiramiento actual; null = sin dato (manos perdidas), que cuenta como hueco.
   * Devuelve el tramo que se cerró con este cuadro (si lo hay) con su clasificación.
   */
  paso(dtMs: number, pct: number | null, cm: number | null): { cierre: TramoBanda & { clase: 'repeticion' | 'incompleta' | 'fragmento' } } | null {
    this.reloj += dtMs
    if (pct != null && pct > this.picoSesionPct) this.picoSesionPct = pct
    if (pct != null && pct >= this.umbralPct) {
      const a = (this.abierto ??= { picoPct: 0, picoCm: 0, tPicoMs: this.reloj, inicioMs: this.reloj, cuadros: 0, huecoMs: 0 })
      a.huecoMs = 0
      a.cuadros++
      if (pct >= a.picoPct) {
        a.picoPct = pct
        a.picoCm = cm ?? 0
        a.tPicoMs = this.reloj
      }
      return null
    }
    const a = this.abierto
    if (!a) return null
    a.huecoMs += dtMs
    if (a.huecoMs <= HUECO_MS) return null
    return { cierre: this.cerrar(a) }
  }

  /** Cierra y clasifica un tramo; también lo usa el cierre forzado del final. */
  private cerrar(a: Abierto) {
    this.abierto = null
    const duracionMs = Math.max(0, this.reloj - a.huecoMs - a.inicioMs)
    const tramo: TramoBanda = { picoPct: a.picoPct, picoCm: a.picoCm, tPicoMs: a.tPicoMs, duracionMs }
    const corto = a.cuadros < REP_MIN_CUADROS || duracionMs < REP_MIN_MS
    const fragmento = corto || a.picoPct < FRAGMENTO_FRAC * this.picoSesionPct
    return { ...tramo, clase: fragmento ? ('fragmento' as const) : a.picoPct >= REP_MIN_PCT ? ('repeticion' as const) : ('incompleta' as const) }
  }

  /** Descarta el tramo abierto sin contarlo (al volver a marcar el reposo). */
  descartar() {
    this.abierto = null
  }

}

/**
 * Repeticiones de una serie completa (la misma regla en línea y fuera de línea): cada cuadro es [dtMs, pct].
 * Pensada para pruebas y para recalcular una sesión guardada.
 */
export function repeticionesDeSerie(serie: readonly (readonly [number, number | null])[]): { validas: TramoBanda[]; incompletas: TramoBanda[]; fragmentos: TramoBanda[] } {
  const d = new DetectorRepeticiones()
  const out = { validas: [] as TramoBanda[], incompletas: [] as TramoBanda[], fragmentos: [] as TramoBanda[] }
  const poner = (r: { cierre: TramoBanda & { clase: string } } | null) => {
    if (!r) return
    const { clase, ...t } = r.cierre
    ;(clase === 'repeticion' ? out.validas : clase === 'incompleta' ? out.incompletas : out.fragmentos).push(t)
  }
  for (const [dt, pct] of serie) poner(d.paso(dt, pct, pct))
  return out
}

// ── Sesión ────────────────────────────────────────────────────────────────────────────────────────

export type FaseBanda = 'sin-manos' | 'una-mano' | 'buscando-reposo' | 'listo'

export interface ResumenBanda {
  estiramientoMaxCm: number | null
  estiramientoMaxPct: number | null
  repeticiones: number
  cargaMaxKg: number | null
  tiempoBajoTensionS: number | null
  cambioPicoPct: number | null
  reposoCm: number | null
  kgBanda: number
  [clave: string]: number | null
}

const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * Todo lo que mide el juego, sin DOM. El módulo le pasa cada cuadro nuevo: `paso(dtMs, medida, nManos)`.
 * Sin reposo marcado no hay estiramiento. Con una sola mano no se mide nada.
 */
export class SesionBanda {
  readonly kgBanda: number
  reposoPx: number | null = null
  reposoCm: number | null = null
  /** px por cm congelado al marcar el reposo. */
  pxPorCm: number | null = null
  /** Última medida (null si en el último cuadro no había dos manos o falta el reposo). */
  estiramientoPct: number | null = null
  estiramientoCm: number | null = null
  cargaKg: number | null = null
  /** Distancia actual entre nudillos en cm (con la escala en curso o la congelada). */
  distanciaCm: number | null = null
  nManos = 0
  maxPct = 0
  maxCm = 0
  readonly picos: TramoBanda[] = []
  incompletas = 0
  fragmentos = 0
  readonly detector = new DetectorRepeticiones()
  private historial: number[] = []
  private escalas: number[] = []
  private corrida = { min: Infinity, max: -Infinity, suma: 0, n: 0, ms: 0 }
  private cargas: number[] = []
  private dts: number[] = []

  constructor(kgBanda: number) {
    this.kgBanda = kgBanda
  }

  get fase(): FaseBanda {
    if (this.nManos === 0) return 'sin-manos'
    if (this.nManos === 1) return 'una-mano'
    return this.reposoPx != null ? 'listo' : 'buscando-reposo'
  }

  get conReposo(): boolean {
    return this.reposoPx != null
  }

  /** 0..1: cuánto falta para marcar el reposo solo. */
  get progresoReposo(): number {
    return this.reposoPx != null ? 1 : Math.min(1, this.corrida.ms / REPOSO_MS)
  }

  get repeticiones(): number {
    return this.picos.length
  }

  private reiniciarCorrida() {
    this.corrida = { min: Infinity, max: -Infinity, suma: 0, n: 0, ms: 0 }
  }

  /** Un cuadro nuevo (dt en ms; se acota a DT_MAX_MS). `medida` = dos manos (o null). */
  paso(dtMs: number, medida: MedidaCuadro | null, nManos: number): EventoBanda[] {
    const dt = Math.min(DT_MAX_MS, Math.max(0, dtMs))
    const eventos: EventoBanda[] = []
    this.nManos = medida ? 2 : Math.min(1, nManos)
    if (!medida) {
      // Sin las dos manos no se mide. Un hueco corta la corrida del reposo y cuenta para cerrar la repetición abierta.
      this.historial = []
      this.reiniciarCorrida()
      this.estiramientoPct = this.estiramientoCm = this.cargaKg = this.distanciaCm = null
      if (this.reposoPx != null) this.revisar(this.detector.paso(dt, null, null), eventos)
      return eventos
    }

    this.historial = [...this.historial, medida.distPx].slice(-MEDIANA_CUADROS)
    this.escalas = [...this.escalas, medida.pxPorCm].slice(-ESCALA_CUADROS)
    const px = mediana(this.historial)
    this.distanciaCm = px / (this.pxPorCm ?? mediana(this.escalas))

    if (this.reposoPx == null) {
      this.corridaReposo(px, dt, eventos)
      this.estiramientoPct = this.estiramientoCm = this.cargaKg = null
      return eventos
    }

    const e = Math.max(0, px / this.reposoPx - 1)
    const pct = e * 100
    const cm = e * (this.reposoCm ?? 0)
    const carga = cargaDe(this.kgBanda, pct)
    this.estiramientoPct = pct
    this.estiramientoCm = cm
    this.cargaKg = carga
    if (pct > this.maxPct) this.maxPct = pct
    if (cm > this.maxCm) this.maxCm = cm
    if (this.cargas.length < MAX_SERIE) {
      this.cargas.push(carga)
      this.dts.push(dt)
    }
    this.revisar(this.detector.paso(dt, pct, cm), eventos)
    return eventos
  }

  private revisar(r: ReturnType<DetectorRepeticiones['paso']>, eventos: EventoBanda[]) {
    if (!r) return
    const { clase, ...t } = r.cierre
    const cargaKg = cargaDe(this.kgBanda, t.picoPct)
    if (clase === 'repeticion') {
      this.picos.push(t)
      eventos.push({ tipo: 'repeticion', n: this.picos.length, cargaKg, ...t })
    } else if (clase === 'incompleta') {
      this.incompletas++
      eventos.push({ tipo: 'incompleta', cargaKg, umbralPct: REP_MIN_PCT, ...t })
    } else this.fragmentos++
  }

  /** Reposo automático: la distancia se queda dentro de ±2 % durante REPOSO_MS con las dos manos a la vista. */
  private corridaReposo(px: number, dt: number, eventos: EventoBanda[]) {
    let c = this.corrida
    const min = Math.min(c.min, px)
    const max = Math.max(c.max, px)
    const n = c.n + 1
    const suma = c.suma + px
    if (c.n > 0 && (max - min) / (suma / n) > 2 * REPOSO_TOL) {
      // Se movió: la corrida estable empieza de nuevo con este cuadro.
      c = { min: px, max: px, suma: px, n: 1, ms: 0 }
    } else c = { min, max, suma, n, ms: c.ms + dt }
    this.corrida = c
    if (c.ms >= REPOSO_MS) {
      const e = this.marcarReposo(true)
      if (e) eventos.push(e)
    }
  }

  /** Marca el reposo con la distancia actual (botón o automático). null si no se ven las dos manos. */
  marcarReposo(automatico = false): EventoBanda | null {
    if (!this.historial.length || !this.escalas.length) return null
    const px = this.corrida.n > 0 && automatico ? this.corrida.suma / this.corrida.n : mediana(this.historial)
    const escala = mediana(this.escalas)
    if (!(px > 1) || !(escala > 0)) return null
    this.reposoPx = px
    this.pxPorCm = escala
    this.reposoCm = px / escala
    this.reiniciarCorrida()
    this.detector.descartar()
    this.estiramientoPct = 0
    this.estiramientoCm = 0
    this.cargaKg = 0
    return { tipo: 'reposo', reposoCm: this.reposoCm, reposoPx: px, pxPorCm: escala, automatico }
  }

  /** Borra el reposo (se vuelve a esperar uno nuevo). Las repeticiones ya contadas se conservan. */
  borrarReposo() {
    this.reposoPx = this.reposoCm = this.pxPorCm = null
    this.estiramientoPct = this.estiramientoCm = this.cargaKg = null
    this.reiniciarCorrida()
    this.detector.descartar()
  }

  /** Segundos con carga sobre TENSION_FRAC del pico de la sesión (cada cuadro suma a lo más DT_MAX_MS). */
  tiempoBajoTensionS(): number {
    const pico = this.cargas.reduce((m, c) => Math.max(m, c), 0)
    if (!(pico > 0)) return 0
    let ms = 0
    for (let i = 0; i < this.cargas.length; i++) if (this.cargas[i] >= TENSION_FRAC * pico) ms += this.dts[i]
    return ms / 1000
  }

  /** (pico de la última repetición − pico de la primera) / pico de la primera × 100; null con menos de 2. */
  cambioPicoPct(): number | null {
    if (this.picos.length < 2) return null
    const a = this.picos[0].picoPct
    const b = this.picos[this.picos.length - 1].picoPct
    return a > 0 ? ((b - a) / a) * 100 : null
  }

  resumen(): ResumenBanda {
    const medido = this.reposoCm != null || this.maxPct > 0
    const cambio = this.cambioPicoPct()
    return {
      estiramientoMaxCm: medido ? r1(this.maxCm) : null,
      estiramientoMaxPct: medido ? r1(this.maxPct) : null,
      repeticiones: this.picos.length,
      cargaMaxKg: medido ? r1(cargaDe(this.kgBanda, this.maxPct)) : null,
      tiempoBajoTensionS: medido ? r1(this.tiempoBajoTensionS()) : null,
      cambioPicoPct: cambio == null ? null : r1(cambio),
      reposoCm: this.reposoCm == null ? null : r1(this.reposoCm),
      kgBanda: this.kgBanda,
    }
  }
}

// ── Textos ────────────────────────────────────────────────────────────────────────────────────────

export const PISTA_REPOSO = 'Toma la banda con las dos manos, recién tensa, y quédate quieto'
export const PISTA_UNA_MANO = 'Veo solo una mano: muestra las dos manos con la banda'
export const PISTA_SIN_MANOS = 'Muestra las dos manos frente a la cámara, con la banda'
export const PISTA_LISTO = 'Estira la banda despacio y vuelve a la posición de reposo'

/** Pista de la fase actual (la base la muestra en el panel izquierdo). */
export function pistaBanda(fase: FaseBanda, ultimaIncompleta = false): string {
  switch (fase) {
    case 'sin-manos':
      return PISTA_SIN_MANOS
    case 'una-mano':
      return PISTA_UNA_MANO
    case 'buscando-reposo':
      return PISTA_REPOSO
    case 'listo':
      return ultimaIncompleta ? `Estira un poco más: cuenta desde el ${REP_MIN_PCT} %` : PISTA_LISTO
  }
}
