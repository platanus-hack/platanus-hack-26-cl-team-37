// Honda (F39): lógica pura, sin three.js ni DOM. Cada tiro es una repetición con la banda tomada entre las dos manos:
// estirar hasta la zona verde del nivel, sostenerla el tiempo del nivel y soltar. Lo que mide la banda (largo →
// estiramiento → kg con la curva no lineal del látex, reposo que se corrige, huecos de seguimiento) es el
// SeguidorBanda del laboratorio (src/banda/seguidor.ts), probado con video y con la banda real.
//
// Cómo se dosifica: como las tablas de las bandas de terapia (carga según el % de elongación), el nivel pide un
// ESTIRAMIENTO y la carga sale de la banda configurada (su curva y sus tiras): con una banda más dura o más tiras, el
// mismo nivel carga más. Tiempo bajo tensión: el sostén del nivel.
//
// Ajustes tras la primera prueba real con la banda (22-nov-2026, sesión S-20261122-04 y grabaciones del laboratorio):
// - La zona se pedía en 1–3 kg (12–42 % de estiramiento); con la banda real se estira 60–140 % con naturalidad y todo
//   salía «largo». Ahora la zona es ancha (35 puntos de estiramiento) y parte en 30–110 % según el nivel.
// - El tiro salía recién al volver del todo al reposo (hasta 4,5 s después de soltar). Ahora sale al soltar: cuando la
//   carga cae a la mitad del pico.
// - Pasarse y volver a la zona para sostener cuenta como acierto (se anota que se pasó).
// - Tirones de 0,1 s por saltos del seguimiento contaban como tiros: ahora un tiro dura al menos 0,4 s y un salto de
//   largo imposible entre dos cuadros se ignora.
// - Juntar las manos entre tiros (banda suelta) bajaba el reposo y la carga siguiente se leía varias veces mayor: en el
//   juego el reposo solo baja con «Poner en cero».
import { CORENGTH_5KG, areaHasta, cargaEn, conTiras, curvaPropia, type CurvaBanda } from '../../banda/curva'
import { SeguidorBanda, type PasoSeguidor } from '../../banda/seguidor'
import { aCalibracion, type PesosTexto } from '../../screens/laboratorio/pesos'

export interface NivelHonda {
  nombre: string
  detalle: string
  /** Estiramiento objetivo (fracción del largo en reposo): borde inferior de la zona verde. */
  estirar: number
  /** Cuánto hay que sostener dentro de la zona (s). */
  sostenerS: number
  [k: string]: string | number | boolean
}

/** Ancho de la zona verde, en puntos de estiramiento: de `estirar` a `estirar + ANCHO_ZONA`. */
export const ANCHO_ZONA = 0.35

export const NIVELES_HONDA: Record<1 | 2 | 3 | 4 | 5, NivelHonda> = {
  1: { nombre: 'Suave', detalle: 'Estirar la banda un 30 % y sostener medio segundo', estirar: 0.3, sostenerS: 0.5 },
  2: { nombre: 'Liviano', detalle: 'Estirar la banda un 50 % y sostener 1 segundo', estirar: 0.5, sostenerS: 1 },
  3: { nombre: 'Medio', detalle: 'Estirar la banda un 70 % y sostener 1 segundo', estirar: 0.7, sostenerS: 1 },
  4: { nombre: 'Firme', detalle: 'Estirar la banda un 90 % y sostener 1,5 segundos', estirar: 0.9, sostenerS: 1.5 },
  5: { nombre: 'Intenso', detalle: 'Estirar la banda un 110 % y sostener 2 segundos', estirar: 1.1, sostenerS: 2 },
}

export function nivelHonda(n: number): NivelHonda {
  return NIVELES_HONDA[(Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5)]
}

/** Zona verde de un nivel con una banda: carga mínima y máxima (kg aprox.) según su curva. */
export interface ZonaCarga {
  minKg: number
  maxKg: number
}
export function zonaDe(nivel: Pick<NivelHonda, 'estirar'>, curva: Pick<CurvaBanda, 'puntos'>): ZonaCarga {
  return { minKg: cargaEn(curva, nivel.estirar).kg, maxKg: cargaEn(curva, nivel.estirar + ANCHO_ZONA).kg }
}

// ── La banda que se usa ─────────────────────────────────────────────────────────────────────────────────────────

/** Lo que el laboratorio (/laboratorio) deja guardado en este navegador sobre la banda. */
export interface ConfigBanda {
  curva: CurvaBanda
  /** De dónde salió, para mostrarlo: "Corength 5 kg × 2 tiras" o "Tu banda calibrada × 2 tiras". */
  origen: string
}

const PREFIJO_LAB = 'manoviva.laboratorio.'

/**
 * La banda configurada en el laboratorio (curva elegida, calibración con pesos y tiras), o la Corength de 5 kg en
 * lazo (2 tiras) si no hay nada guardado. `leer` es inyectable para las pruebas; por defecto lee localStorage.
 */
export function bandaConfigurada(leer: (clave: string) => string | null = leerLocal): ConfigBanda {
  const json = <T,>(clave: string): T | null => {
    try {
      const t = leer(PREFIJO_LAB + clave)
      return t == null ? null : (JSON.parse(t) as T)
    } catch {
      return null
    }
  }
  const tiras = Math.min(4, Math.max(1, Math.round(json<number>('tiras') ?? 2)))
  const id = json<string>('curva')
  const pesos = json<PesosTexto>('pesos')
  const propia = pesos ? curvaPropia(aCalibracion(pesos)) : null
  if (propia && (id == null || id === propia.id)) return { curva: conTiras(propia, tiras), origen: `Tu banda calibrada × ${tiras} ${tiras === 1 ? 'tira' : 'tiras'}` }
  return { curva: conTiras(CORENGTH_5KG, tiras), origen: `${CORENGTH_5KG.nombre} × ${tiras} ${tiras === 1 ? 'tira' : 'tiras'}` }
}

function leerLocal(clave: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(clave)
  } catch {
    return null
  }
}

// ── Tiros ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type ResultadoTiro = 'acierto' | 'corto' | 'largo' | 'sin-sostener'

export interface Tiro {
  n: number
  resultado: ResultadoTiro
  picoKg: number
  /** Estiramiento máximo del tiro (fracción). */
  picoEstiramiento: number
  /** Pico / carga mínima de la zona: 1 = justo al entrar. */
  relacion: number
  /** Lo más largo que estuvo seguido dentro de la zona (s). */
  sostenidoS: number
  /** Tiempo con la banda estirada hasta soltar (s). */
  tensionS: number
  /** Trabajo de estirar hasta el pico (área bajo la curva × largo de reposo × g), joules aprox. */
  trabajoJ: number
  /** ms desde el pico hasta soltar (bajada controlada o de golpe). */
  vueltaMs: number
  /** Pasó de la zona verde en algún momento (aunque después haya vuelto a sostener). */
  sePaso: boolean
}

export type EventoHonda =
  | { tipo: 'reposo' }
  | { tipo: 'en-ventana'; kg: number }
  | { tipo: 'sostenido'; kg: number }
  | { tipo: 'tiro'; tiro: Tiro }

export type FaseHonda = 'sin-manos' | 'reposo' | 'listo' | 'tensando' | 'en-ventana' | 'sostenido' | 'pasado'

/** El tiro sale cuando la carga cae a esta fracción de su pico (o del tope de la zona, si se pasó): eso es soltar. */
export const SUELTA = 0.5
/** Un tiro dura al menos esto en tensión; menos es un salto del seguimiento, no un movimiento de la persona. */
export const MS_MIN_TIRO = 400
/** Tras soltar, estirar de nuevo esta fracción de la carga mínima de la zona sobre lo más bajo arma otro tiro. */
const REARME = 0.25
/** Cambio de largo entre dos cuadros seguidos que una mano no hace (otra mano se coló o una se perdió). */
export const SALTO_MAX = 0.35
/** Ventana en la que dos cuadros cuentan como seguidos para SALTO_MAX (ms). */
const MS_SALTO = 120
/** Un salto que dura más que esto se acepta: el largo cambió de verdad (ms). */
const MS_SALTO_TOPE = 250
/** Quietud que marca el cero al empezar: tiempo y variación tolerada. */
export const MS_CERO = 1500
export const VARIACION_CERO = 0.1
/** Salir de la zona verde menos que esto no corta el sostén: es temblor en el borde, no soltar (ms). */
export const MS_GRACIA_ZONA = 200
/** La medida imposible debe durar esto para avisar que el cero quedó mal (ms): un cuadro suelto no basta. */
const MS_DUDOSO = 300
/** Sobre este estiramiento la medida no es creíble: casi siempre el cero quedó con la banda suelta. */
export const ESTIRAMIENTO_CREIBLE = 2.2
const G = 9.80665

export function resultadoDe(picoKg: number, zona: ZonaCarga, sostuvo: boolean): ResultadoTiro {
  // Sostener manda: quien llega a la zona y la sostiene acierta, aunque antes o después se haya pasado.
  if (sostuvo) return 'acierto'
  if (picoKg < zona.minKg) return 'corto'
  if (picoKg > zona.maxKg) return 'largo'
  return 'sin-sostener'
}

/** Textos para el paciente según el resultado. */
export const TEXTO_RESULTADO: Record<ResultadoTiro, string> = {
  acierto: '¡En el blanco!',
  corto: 'Quedó corto: estira un poco más',
  largo: 'Te pasaste: estira hasta la zona verde y sostén',
  'sin-sostener': 'Llegaste: ahora sostén un poco más',
}

interface TiroEnCurso {
  t0: number
  picoKg: number
  picoE: number
  picoT: number
  enZonaDesde: number | null
  /** Desde cuándo está fuera de la zona durante un sostén (para la gracia). */
  fueraDesde: number | null
  sostenidoMs: number
  mejorSostenidoMs: number
  avisoZona: boolean
  sostuvo: boolean
  sePaso: boolean
}

/**
 * Sesión de honda: le pasa cada cuadro al SeguidorBanda y arma los tiros. Pura: `paso(t, largoCm | null)` con el
 * reloj de la fuente (ms) y el largo medido entre las palmas (o null si no se ven las dos manos).
 */
export class SesionHonda {
  readonly seguidor: SeguidorBanda
  readonly tiros: Tiro[] = []
  readonly curva: CurvaBanda
  readonly zona: ZonaCarga
  readonly sostenerS: number
  ultimo: PasoSeguidor | null = null
  private tiro: TiroEnCurso | null = null
  /** Ya se soltó: espera a que la banda vuelva (o se estire de nuevo) para armar otro tiro. */
  private suelto = false
  private minTrasSoltar = 0
  private largoPrevio: { cm: number; t: number } | null = null
  private saltoDesde: number | null = null
  private dudoso = false
  /** Aciertos seguidos ahora y el mejor de la sesión. */
  racha = 0
  rachaMax = 0
  private dudosoDesde: number | null = null

  constructor(curva: CurvaBanda, nivel: Pick<NivelHonda, 'estirar' | 'sostenerS'>) {
    this.curva = curva
    this.zona = zonaDe(nivel, curva)
    this.sostenerS = nivel.sostenerS
    // El reposo solo baja con el botón, y un largo quieto dentro de la zona (un sostén) nunca se toma por reposo.
    // El primer cero pide 1,5 s dentro de 10 %: sostener una banda oscila ±5 % y con el criterio del laboratorio tardaba.
    this.seguidor = new SeguidorBanda({ bajarSolo: false, seguirMax: 0.6 * nivel.estirar, msCero: MS_CERO, variacionCero: VARIACION_CERO })
  }

  /** Carga que pide el nivel con esta banda (borde inferior de la zona), kg aprox. */
  get metaKg(): number {
    return this.zona.minKg
  }

  get fase(): FaseHonda {
    const u = this.ultimo
    if (!u || u.estado === 'perdida' || (u.largoCm == null && u.estado !== 'hueco')) return 'sin-manos'
    if (u.reposoCm == null) return 'reposo'
    const t = this.tiro
    if (!t) return 'listo'
    if ((u.kg ?? 0) > this.zona.maxKg) return 'pasado'
    if (t.sostuvo) return 'sostenido'
    if (t.enZonaDesde != null) return 'en-ventana'
    return 'tensando'
  }

  /** Carga del cuadro (kg aprox.; null sin medida). */
  get kg(): number | null {
    return this.ultimo?.kg ?? null
  }

  /** 0..1: cuánto del tiempo de sostener lleva el tiro en curso (1 si ya lo cumplió). */
  get progresoSostener(): number {
    const t = this.tiro
    if (!t) return 0
    return t.sostuvo ? 1 : Math.min(1, t.sostenidoMs / (this.sostenerS * 1000))
  }

  get aciertos(): number {
    return this.tiros.filter((t) => t.resultado === 'acierto').length
  }

  /** Hay un tiro en curso (la banda está estirada y aún no se suelta). */
  get enTiro(): boolean {
    return this.tiro != null
  }

  /** La medida pasó de lo creíble: casi siempre el cero quedó con la banda suelta. Se apaga al poner en cero. */
  get ceroDudoso(): boolean {
    return this.dudoso
  }

  /** «Poner en cero»: el próximo tramo quieto pasa a ser el reposo. */
  pedirCero() {
    this.seguidor.pedirCero()
    this.dudoso = false
    this.dudosoDesde = null
    this.tiro = null
    this.suelto = false
  }

  /** Quita los saltos de largo que una mano no hace (se coló otra mano o se perdió una): ese cuadro no se mide. */
  private sinSaltos(t: number, largoCm: number | null): number | null {
    if (largoCm == null) return null
    const p = this.largoPrevio
    if (p && t - p.t <= MS_SALTO && Math.abs(largoCm - p.cm) / p.cm > SALTO_MAX) {
      this.saltoDesde ??= t
      if (t - this.saltoDesde <= MS_SALTO_TOPE) {
        // El cuadro anterior sigue siendo la referencia, con la hora de ahora: el salto se compara contra él.
        this.largoPrevio = { cm: p.cm, t }
        return null
      }
    }
    this.saltoDesde = null
    this.largoPrevio = { cm: largoCm, t }
    return largoCm
  }

  paso(t: number, largoCrudo: number | null): EventoHonda[] {
    const eventos: EventoHonda[] = []
    const antes = this.seguidor.reposoCm
    const p = this.seguidor.paso(t, this.sinSaltos(t, largoCrudo), this.curva)
    this.ultimo = p
    if (antes == null && p.reposoCm != null) eventos.push({ tipo: 'reposo' })
    if (p.estado === 'hueco') return eventos
    if (p.kg == null || p.e == null) {
      // Sin medida (manos perdidas o marcando el cero): el tiro en curso no se puede juzgar.
      if (p.estado === 'perdida' && !this.seguidor.contador.estirando) this.tiro = null
      return eventos
    }
    if (p.evento) {
      // El reposo cambió: lo que se venía midiendo era con otro cero.
      this.tiro = null
      this.suelto = false
      return eventos
    }
    if (p.e > ESTIRAMIENTO_CREIBLE) {
      this.dudosoDesde ??= t
      if (t - this.dudosoDesde >= MS_DUDOSO) this.dudoso = true
    } else this.dudosoDesde = null
    const { minKg, maxKg } = this.zona
    const estirando = this.seguidor.contador.estirando

    if (this.suelto) {
      this.minTrasSoltar = Math.min(this.minTrasSoltar, p.kg)
      if (!estirando || p.kg >= this.minTrasSoltar + REARME * minKg) this.suelto = false
    }
    if (!this.tiro && !this.suelto && estirando) {
      this.tiro = { t0: t, picoKg: 0, picoE: 0, picoT: t, enZonaDesde: null, fueraDesde: null, sostenidoMs: 0, mejorSostenidoMs: 0, avisoZona: false, sostuvo: false, sePaso: false }
    }
    const tr = this.tiro
    if (!tr) return eventos

    if (p.kg > tr.picoKg) {
      tr.picoKg = p.kg
      tr.picoE = p.e
      tr.picoT = t
    }
    if (p.kg > maxKg) tr.sePaso = true
    if (p.kg >= minKg && p.kg <= maxKg) {
      tr.enZonaDesde ??= t
      tr.fueraDesde = null
      tr.sostenidoMs = t - tr.enZonaDesde
      tr.mejorSostenidoMs = Math.max(tr.mejorSostenidoMs, tr.sostenidoMs)
      if (!tr.avisoZona) {
        tr.avisoZona = true
        eventos.push({ tipo: 'en-ventana', kg: p.kg })
      }
      if (!tr.sostuvo && tr.sostenidoMs >= this.sostenerS * 1000) {
        tr.sostuvo = true
        eventos.push({ tipo: 'sostenido', kg: p.kg })
      }
    } else if (tr.enZonaDesde != null) {
      // Un instante fuera de la zona (temblor en el borde) no corta el sostén; más que eso, sí.
      tr.fueraDesde ??= t
      if (t - tr.fueraDesde > MS_GRACIA_ZONA) {
        tr.enZonaDesde = null
        tr.fueraDesde = null
        tr.sostenidoMs = 0
      }
    }

    // Soltar: la carga cayó a la mitad del pico (o la banda ya volvió al reposo). Ahí sale el tiro.
    // Si se pasó, el umbral se mide contra el tope de la zona: así puede volver a la zona y sostener sin que se dispare.
    if (p.kg <= SUELTA * Math.min(tr.picoKg, maxKg) || !estirando) {
      this.tiro = null
      this.suelto = estirando
      this.minTrasSoltar = p.kg
      if (t - tr.t0 >= MS_MIN_TIRO && tr.picoE <= ESTIRAMIENTO_CREIBLE) eventos.push({ tipo: 'tiro', tiro: this.cerrar(tr, t, p.reposoCm ?? 0) })
    }
    return eventos
  }

  private cerrar(tr: TiroEnCurso, t: number, reposoCm: number): Tiro {
    const tiro: Tiro = {
      n: this.tiros.length + 1,
      resultado: resultadoDe(tr.picoKg, this.zona, tr.sostuvo),
      picoKg: tr.picoKg,
      picoEstiramiento: tr.picoE,
      relacion: this.zona.minKg > 0 ? tr.picoKg / this.zona.minKg : 0,
      sostenidoS: tr.mejorSostenidoMs / 1000,
      tensionS: (t - tr.t0) / 1000,
      trabajoJ: areaHasta(this.curva, tr.picoE) * (reposoCm / 100) * G,
      vueltaMs: Math.max(0, t - tr.picoT),
      sePaso: tr.sePaso,
    }
    this.tiros.push(tiro)
    this.racha = tiro.resultado === 'acierto' ? this.racha + 1 : 0
    this.rachaMax = Math.max(this.rachaMax, this.racha)
    return tiro
  }

  /** Métricas de resumen (metricas.juego), en la unidad que se muestra. */
  resumen(): Record<string, number | null> {
    const ts = this.tiros
    const n = ts.length
    const r1 = (x: number) => Math.round(x * 10) / 10
    const r2 = (x: number) => Math.round(x * 100) / 100
    const picos = ts.map((t) => t.picoKg)
    const media = n ? picos.reduce((s, v) => s + v, 0) / n : 0
    const desv = n ? Math.sqrt(picos.reduce((s, v) => s + (v - media) ** 2, 0) / n) : 0
    const maxE = n ? Math.max(...ts.map((t) => t.picoEstiramiento)) : 0
    const reposo = this.seguidor.reposoCm
    return {
      aciertos: this.aciertos,
      tiros: n,
      precisionPct: n ? Math.round((this.aciertos / n) * 100) : null,
      cargaMetaKg: r2(this.zona.minKg),
      cargaMaxKg: n ? r2(Math.max(...picos)) : null,
      cargaPromedioKg: n ? r2(media) : null,
      constanciaPct: n >= 2 && media > 0 ? Math.round(Math.max(0, 1 - desv / media) * 100) : null,
      tiempoBajoTensionS: r1(ts.reduce((s, t) => s + t.tensionS, 0)),
      trabajoJ: n ? r1(ts.reduce((s, t) => s + t.trabajoJ, 0)) : null,
      sostenidoPromedioS: n ? r1(ts.reduce((s, t) => s + t.sostenidoS, 0) / n) : null,
      vueltaPromedioS: n ? r1(ts.reduce((s, t) => s + t.vueltaMs, 0) / n / 1000) : null,
      reposoCm: reposo == null ? null : r1(reposo),
      estiramientoMaxPct: n ? Math.round(maxE * 100) : null,
      estiramientoMaxCm: n && reposo != null ? r1(maxE * reposo) : null,
      rachaMax: n ? this.rachaMax : null,
      cortos: ts.filter((t) => t.resultado === 'corto').length,
      largos: ts.filter((t) => t.sePaso).length,
    }
  }
}

/** Estiramiento (fracción) que da esa carga con la curva, por bisección (la curva crece con el estiramiento). */
export function estiramientoPara(curva: Pick<CurvaBanda, 'puntos'>, kg: number): number {
  let lo = 0
  let hi = 3
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (cargaEn(curva, m).kg < kg) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/**
 * Hasta dónde vuela la piedra de un tiro corto, como fracción de la distancia al blanco (1 = blanco): más cerca cuanto
 * menos se estiró. Los demás resultados caen junto al blanco (la escena decide a qué lado).
 */
export function alcanceCorto(picoKg: number, zona: ZonaCarga): number {
  return Math.min(0.78, Math.max(0.3, 0.78 * (picoKg / zona.minKg)))
}

/** Pista del panel según la fase. */
export function pistaHonda(fase: FaseHonda): string {
  switch (fase) {
    case 'sin-manos':
      return 'Toma la banda con las dos manos frente a la cámara'
    case 'reposo':
      return 'Deja la banda recta, sin estirar, y quédate quieto: marco el cero'
    case 'listo':
      return 'Estira la banda hasta la zona verde'
    case 'tensando':
      return 'Sigue estirando hasta la zona verde'
    case 'en-ventana':
      return 'Sostén en la zona verde'
    case 'sostenido':
      return '¡Listo! Suelta para lanzar'
    case 'pasado':
      return 'Te pasaste de la zona verde: afloja un poco'
  }
}

/** Pista cuando la medida dejó de ser creíble. */
export const PISTA_CERO_DUDOSO = 'La medida se disparó: deja la banda recta, sin estirar, y toca «Poner en cero»'
/** Pista cuando una mano toca el borde de la imagen o se pierde a mitad de un tiro. */
export const PISTA_BORDE = 'Tus manos salen de la imagen: súbelas o aléjate un poco de la cámara'
