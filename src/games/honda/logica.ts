// Honda (F39): lógica pura, sin three.js ni DOM. Cada tiro es una repetición con la banda tomada entre las dos manos:
// estirar hasta la carga del nivel (la ventana verde), sostenerla el tiempo del nivel y volver. Lo que mide la banda
// (largo → estiramiento → kg con la curva no lineal del látex, reposo que se corrige solo, huecos de seguimiento) es
// el mismo SeguidorBanda del laboratorio (src/banda/seguidor.ts), probado con video y con la banda real.
//
// Por qué así (fundamento clínico, docs del laboratorio): el ejercicio con banda se dosifica por carga objetivo y
// tiempo bajo tensión; lo que el terapeuta no ve en casa es si el paciente llega a la carga y la sostiene, o si tira de
// golpe. Por eso un tiro acierta solo si la carga entra en la ventana y se SOSTIENE: pasarse de la ventana (tirón)
// también falla.
import { CORENGTH_5KG, cargaEn, conTiras, curvaPropia, type CurvaBanda } from '../../banda/curva'
import { TOLERANCIA_META, totales, type Repeticion } from '../../banda/medicion'
import { SeguidorBanda, type PasoSeguidor } from '../../banda/seguidor'
import { aCalibracion, type PesosTexto } from '../../screens/laboratorio/pesos'

export interface NivelHonda {
  nombre: string
  detalle: string
  /** Carga objetivo de cada tiro (kg aprox.). */
  metaKg: number
  /** Cuánto hay que sostenerla dentro de la ventana (s). */
  sostenerS: number
  [k: string]: string | number | boolean
}

/** Sobre esta fracción de la meta el tiro se pasa (tirón): la ventana va de TOLERANCIA_META × meta a esto × meta. */
export const TOPE_VENTANA = 1.35

export const NIVELES_HONDA: Record<1 | 2 | 3 | 4 | 5, NivelHonda> = {
  1: { nombre: 'Suave', detalle: 'Carga de 1 kg aprox., sostener medio segundo', metaKg: 1, sostenerS: 0.5 },
  2: { nombre: 'Liviano', detalle: 'Carga de 1,5 kg aprox., sostener 1 segundo', metaKg: 1.5, sostenerS: 1 },
  3: { nombre: 'Medio', detalle: 'Carga de 2 kg aprox., sostener 1 segundo', metaKg: 2, sostenerS: 1 },
  4: { nombre: 'Firme', detalle: 'Carga de 2,5 kg aprox., sostener 1,5 segundos', metaKg: 2.5, sostenerS: 1.5 },
  5: { nombre: 'Fuerte', detalle: 'Carga de 3 kg aprox., sostener 2 segundos', metaKg: 3, sostenerS: 2 },
}

export function nivelHonda(n: number): NivelHonda {
  return NIVELES_HONDA[(Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5)]
}

// ── La banda que se usa ─────────────────────────────────────────────────────────────────────────────────────────

/** Lo que el laboratorio (/laboratorio) deja guardado en este navegador sobre la banda. */
export interface ConfigBanda {
  curva: CurvaBanda
  /** De dónde salió, para mostrarlo: "Corength 5 kg × 2 tiras" o "Tu banda (calibrada con pesos)". */
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
  /** Pico / meta: 1 = justo en la meta. Es lo que decide hasta dónde vuela la piedra. */
  relacion: number
  /** Lo más largo que estuvo seguido dentro de la ventana (s). */
  sostenidoS: number
  tensionS: number
  trabajoJ: number
  /** ms desde el pico hasta volver al reposo (vuelta controlada o de golpe). */
  vueltaMs: number
}

export type EventoHonda =
  | { tipo: 'reposo' }
  | { tipo: 'en-ventana'; kg: number }
  | { tipo: 'sostenido'; kg: number }
  | { tipo: 'tiro'; tiro: Tiro }

export type FaseHonda = 'sin-manos' | 'reposo' | 'listo' | 'tensando' | 'en-ventana' | 'sostenido' | 'pasado'

export function resultadoDe(picoKg: number, metaKg: number, sostenidoS: number, sostenerS: number, pasadoSostenido: boolean): ResultadoTiro {
  if (picoKg < TOLERANCIA_META * metaKg) return 'corto'
  // Pasarse un instante al final del recorrido no anula un tiro ya sostenido; pasarse antes de sostener, sí.
  if (picoKg > TOPE_VENTANA * metaKg && !pasadoSostenido) return 'largo'
  return sostenidoS >= sostenerS ? 'acierto' : 'sin-sostener'
}

/** Textos para el paciente según el resultado. */
export const TEXTO_RESULTADO: Record<ResultadoTiro, string> = {
  acierto: '¡En el blanco!',
  corto: 'Quedó corto: estira un poco más',
  largo: 'Te pasaste: estira con más calma',
  'sin-sostener': 'Llegaste: ahora sostenlo un poco más',
}

/**
 * Sesión de honda: le pasa cada cuadro al SeguidorBanda y arma los tiros. Pura: `paso(t, largoCm | null)` con el
 * reloj de la fuente (ms) y el largo medido entre las palmas (o null si no se ven las dos manos).
 */
export class SesionHonda {
  readonly seguidor = new SeguidorBanda()
  readonly tiros: Tiro[] = []
  ultimo: PasoSeguidor | null = null
  private enVentanaDesde: number | null = null
  private sostenidoMs = 0
  private mejorSostenidoMs = 0
  private avisoVentana = false
  private avisoSostenido = false
  private pasadoSostenido = false
  private picoKg = 0
  private picoT = 0
  private nReps = 0

  readonly curva: CurvaBanda
  readonly metaKg: number
  readonly sostenerS: number

  constructor(curva: CurvaBanda, metaKg: number, sostenerS: number) {
    this.curva = curva
    this.metaKg = metaKg
    this.sostenerS = sostenerS
  }

  get fase(): FaseHonda {
    const u = this.ultimo
    if (!u || u.estado === 'perdida' || (u.largoCm == null && u.estado !== 'hueco')) return 'sin-manos'
    if (u.reposoCm == null) return 'reposo'
    if (!this.seguidor.contador.estirando) return 'listo'
    if ((u.kg ?? 0) > TOPE_VENTANA * this.metaKg && !this.pasadoSostenido) return 'pasado'
    if (this.avisoSostenido) return 'sostenido'
    if (this.enVentanaDesde != null) return 'en-ventana'
    return 'tensando'
  }

  /** Carga del cuadro (kg aprox.; null sin medida). */
  get kg(): number | null {
    return this.ultimo?.kg ?? null
  }

  /** 0..1: cuánto del tiempo de sostener lleva el tiro en curso. */
  get progresoSostener(): number {
    return Math.min(1, this.sostenidoMs / (this.sostenerS * 1000))
  }

  get aciertos(): number {
    return this.tiros.filter((t) => t.resultado === 'acierto').length
  }

  /** Carga máxima de la curva (kg), para escalar el medidor. */
  get topeKg(): number {
    return cargaEn(this.curva, 2).kg
  }

  paso(t: number, largoCm: number | null): EventoHonda[] {
    const eventos: EventoHonda[] = []
    const antes = this.seguidor.reposoCm
    const p = this.seguidor.paso(t, largoCm, this.curva)
    this.ultimo = p
    if (antes == null && p.reposoCm != null) eventos.push({ tipo: 'reposo' })
    const contador = this.seguidor.contador

    if (contador.estirando && p.kg != null) {
      if (p.kg > this.picoKg) {
        this.picoKg = p.kg
        this.picoT = t
      }
      const dentro = p.kg >= TOLERANCIA_META * this.metaKg && p.kg <= TOPE_VENTANA * this.metaKg
      if (dentro) {
        if (this.enVentanaDesde == null) this.enVentanaDesde = t
        this.sostenidoMs = t - this.enVentanaDesde
        this.mejorSostenidoMs = Math.max(this.mejorSostenidoMs, this.sostenidoMs)
        if (!this.avisoVentana) {
          this.avisoVentana = true
          eventos.push({ tipo: 'en-ventana', kg: p.kg })
        }
        if (!this.avisoSostenido && this.sostenidoMs >= this.sostenerS * 1000) {
          this.avisoSostenido = true
          eventos.push({ tipo: 'sostenido', kg: p.kg })
        }
      } else if (p.kg < TOLERANCIA_META * this.metaKg || !this.avisoSostenido) {
        // Bajo la ventana, o sobre ella antes de sostener: el sostén se corta. Sobre ella ya sostenido, el tiro vale.
        this.enVentanaDesde = null
        this.sostenidoMs = 0
      }
      if (p.kg > TOPE_VENTANA * this.metaKg && this.avisoSostenido) this.pasadoSostenido = true
    }

    // El seguidor cierra la repetición al volver cerca del reposo: ese es el disparo.
    const reps = contador.repeticiones
    if (reps.length > this.nReps) {
      for (const r of reps.slice(this.nReps)) eventos.push({ tipo: 'tiro', tiro: this.cerrarTiro(r, t) })
      this.nReps = reps.length
    } else if (!contador.estirando && this.picoKg > 0) {
      // Se cortó sin cerrar repetición (estiramiento muy corto o se perdió la mano): no hubo tiro.
      this.reiniciarTiro()
    }
    return eventos
  }

  private cerrarTiro(r: Repeticion, t: number): Tiro {
    const sostenidoS = this.mejorSostenidoMs / 1000
    const tiro: Tiro = {
      n: this.tiros.length + 1,
      resultado: resultadoDe(r.picoKg, this.metaKg, sostenidoS, this.sostenerS, this.pasadoSostenido),
      picoKg: r.picoKg,
      relacion: this.metaKg > 0 ? r.picoKg / this.metaKg : 0,
      sostenidoS,
      tensionS: r.tensionS,
      trabajoJ: r.trabajoJ,
      vueltaMs: this.picoT > 0 ? Math.max(0, t - this.picoT) : 0,
    }
    this.tiros.push(tiro)
    this.reiniciarTiro()
    return tiro
  }

  private reiniciarTiro() {
    this.enVentanaDesde = null
    this.sostenidoMs = 0
    this.mejorSostenidoMs = 0
    this.avisoVentana = false
    this.avisoSostenido = false
    this.pasadoSostenido = false
    this.picoKg = 0
    this.picoT = 0
  }

  /** Métricas de resumen (metricas.juego), en la unidad que se muestra. */
  resumen(): Record<string, number | null> {
    const reps = this.seguidor.contador.repeticiones
    const tot = totales(reps, this.metaKg)
    const n = this.tiros.length
    const r1 = (x: number) => Math.round(x * 10) / 10
    const r2 = (x: number) => Math.round(x * 100) / 100
    const vueltas = this.tiros.map((t) => t.vueltaMs).filter((v) => v > 0)
    return {
      aciertos: this.aciertos,
      tiros: n,
      precisionPct: n ? Math.round((this.aciertos / n) * 100) : null,
      cargaMetaKg: this.metaKg,
      cargaMaxKg: n ? r2(tot.mejorKg ?? 0) : null,
      cargaPromedioKg: n ? r2(tot.promedioKg ?? 0) : null,
      constanciaPct: n >= 2 && tot.constancia != null ? Math.round(tot.constancia * 100) : null,
      tiempoBajoTensionS: r1(tot.tensionS),
      trabajoJ: n ? r1(tot.trabajoJ) : null,
      sostenidoPromedioS: n ? r1(this.tiros.reduce((s, t) => s + t.sostenidoS, 0) / n) : null,
      vueltaPromedioS: vueltas.length ? r1(vueltas.reduce((s, v) => s + v, 0) / vueltas.length / 1000) : null,
      reposoCm: this.seguidor.reposoCm == null ? null : r1(this.seguidor.reposoCm),
      estiramientoMaxPct: n ? Math.round(Math.max(...reps.map((r) => r.picoEstiramiento)) * 100) : null,
      estiramientoMaxCm: n && this.seguidor.reposoCm != null ? r1(Math.max(...reps.map((r) => r.picoEstiramiento)) * this.seguidor.reposoCm) : null,
      cortos: this.tiros.filter((t) => t.resultado === 'corto').length,
      largos: this.tiros.filter((t) => t.resultado === 'largo').length,
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

/** Hasta dónde vuela la piedra, como fracción de la distancia al blanco (1 = blanco). Acotado para que no salga de la mesa. */
export function alcanceDe(relacion: number): number {
  return Math.min(1.45, Math.max(0.25, relacion))
}

/** Pista del panel según la fase. */
export function pistaHonda(fase: FaseHonda): string {
  switch (fase) {
    case 'sin-manos':
      return 'Toma la banda con las dos manos frente a la cámara'
    case 'reposo':
      return 'Banda recién tensa y manos quietas: marco el cero'
    case 'listo':
      return 'Estira la banda hasta la zona verde'
    case 'tensando':
      return 'Sigue estirando hasta la zona verde'
    case 'en-ventana':
      return 'Sostén en la zona verde'
    case 'sostenido':
      return '¡Listo! Vuelve despacio para lanzar'
    case 'pasado':
      return 'Te pasaste de la zona verde: afloja un poco'
  }
}
