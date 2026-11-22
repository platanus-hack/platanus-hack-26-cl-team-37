// Exprime la naranja (F25, J4): reglas puras, con pruebas en naranja.test.ts.
//
// Cada repetición tiene cuatro pasos guiados:
//   1. Mano abierta sobre la fuente → se toma una naranja (aparece en la mano).
//   2. Cerrar el puño hasta pasar el umbral del nivel.
//   3. Sostener el puño N segundos (una barra muestra el avance y caen gotas).
//   4. Abrir la mano por completo → sube el nivel del vaso.
// Los pasos 2 a 4 solo avanzan con la mano sobre el vaso (en otro lado quedan en pausa: se lleva la naranja).
// La sesión termina al llenar el vaso: REPETICIONES_VASO repeticiones válidas (o las del plan).
// La repetición solo cuenta si se cumplen los cuatro pasos. Si se suelta antes, queda anotada como incompleta con el
// paso en que falló (repeticion_incompleta { paso }). Ningún paso espera para siempre: si tras empezar a cerrar no se
// llega al umbral (paso 2), o tras sostener no se logra abrir por completo (paso 4), a los ESPERA_PASO_MS la repetición
// se cierra como incompleta en ese paso y empieza la siguiente.
//
// Cierre de puño en % (0..100): 0 % = mano abierta de la calibración, 100 % = su puño (1 − apertura calibrada, donde la
// apertura es la distancia de las yemas al centro de la palma normalizada por el largo de la mano). La cámara no mide
// ninguna otra cosa: solo cuánto se cierra la mano.

export type PasoNaranja = 1 | 2 | 3 | 4

export const NOMBRE_PASO: Record<PasoNaranja, string> = {
  1: 'tomar una naranja de la fuente',
  2: 'cerrar el puño',
  3: 'sostener el puño',
  4: 'abrir por completo',
}

export interface NivelNaranja {
  nombre: string
  detalle: string
  /** Cierre de puño (%) que hay que pasar. */
  umbral: number
  /** Tiempo que hay que sostenerlo (ms). */
  sostenerMs: number
  /** Cierre máximo (%) con el que la mano cuenta como "abierta por completo" (pasos 1 y 4). */
  abiertaPct: number
  [clave: string]: string | number | boolean
}

const seg = (s: number) => Math.round(s * 1000)

/** Niveles 1, 3 y 5 vienen del prompt J4; el 2 y el 4 quedan a medio camino. */
export const NIVELES_NARANJA: Record<1 | 2 | 3 | 4 | 5, NivelNaranja> = {
  1: { nombre: 'Cierre suave', detalle: 'Cerrar hasta el 60 % y sostener 1 s', umbral: 60, sostenerMs: seg(1), abiertaPct: 25 },
  2: { nombre: 'Cierre medio', detalle: 'Cerrar hasta el 68 % y sostener 2 s', umbral: 68, sostenerMs: seg(2), abiertaPct: 20 },
  3: { nombre: 'Cierre amplio', detalle: 'Cerrar hasta el 75 % y sostener 3 s', umbral: 75, sostenerMs: seg(3), abiertaPct: 15 },
  4: { nombre: 'Cierre casi completo', detalle: 'Cerrar hasta el 83 % y sostener 4 s', umbral: 83, sostenerMs: seg(4), abiertaPct: 12 },
  5: { nombre: 'Puño completo', detalle: 'Cerrar hasta el 90 % y sostener 5 s', umbral: 90, sostenerMs: seg(5), abiertaPct: 10 },
}

export function nivelNaranja(n: number): NivelNaranja {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5
  return NIVELES_NARANJA[k]
}

/** Repeticiones válidas que llenan el vaso (y terminan la sesión) si el plan no fija otra cantidad (metaAgarres). */
export const REPETICIONES_VASO = 4

/** Meta de la sesión: repeticiones para llenar el vaso (las del plan, o REPETICIONES_VASO). */
export const metaVaso = (metaPlan: number) => (metaPlan > 0 ? Math.round(metaPlan) : REPETICIONES_VASO)

/** Dónde está la palma: sobre la fuente de naranjas, sobre el vaso o en otro lado. */
export type DondeMano = 'fuente' | 'vaso' | 'otro'

/** Tiempo con la mano abierta para que aparezca la naranja (evita parpadeos). */
export const NARANJA_MS = 350
/** Cierre (%) a partir del cual se considera que empezó a cerrar el puño (evento cierre_inicio). */
export const INICIO_CIERRE_PCT = 30
/** Margen bajo el umbral con el que se sigue "sosteniendo" (temblor de la mano y del seguimiento). */
export const HISTERESIS_PCT = 10

/**
 * Tiempo máximo (ms, con la mano a la vista) en el paso 2 desde que empezó a cerrar, y en el paso 4 desde que completó
 * el sostén. Holgado para una mano con poca movilidad; quien completa el movimiento nunca lo alcanza.
 */
export const ESPERA_PASO_MS = 15_000

export const soltarPct = (n: Pick<NivelNaranja, 'umbral'>) => n.umbral - HISTERESIS_PCT

/** Cierre de puño en % (0..100) desde la apertura calibrada 0..1 (1 = mano abierta). */
export const cierreDeApertura = (apertura: number): number => Math.min(100, Math.max(0, (1 - apertura) * 100))

export interface EstadoNaranja {
  paso: PasoNaranja
  /** Paso 1: ms seguidos con la mano abierta. */
  abiertaMs: number
  /** ¿Se anotó cierre_inicio en esta repetición? */
  iniciada: boolean
  /** Cierre máximo (%) de la repetición en curso. */
  cierreMax: number
  /** Ms con el puño sobre umbral − 10 en el paso 3 (queda fijo, en el tiempo pedido, al pasar al paso 4). */
  sostenidoMs: number
  /** Paso 4: ya empezó a abrir. */
  abriendo: boolean
  /** Paso 4: mejor apertura (%) vista al abrir. */
  aperturaMax: number
  /** Ms (con la mano a la vista) esperando en el paso 2 desde cierre_inicio, o en el paso 4 (ver ESPERA_PASO_MS). */
  esperaMs: number
}

export const estadoNaranjaInicial = (): EstadoNaranja => ({ paso: 1, abiertaMs: 0, iniciada: false, cierreMax: 0, sostenidoMs: 0, abriendo: false, aperturaMax: 0, esperaMs: 0 })

export type EventoNaranja =
  | { tipo: 'naranja' }
  | { tipo: 'cierre_inicio'; cierrePct: number }
  | { tipo: 'umbral_alcanzado'; cierrePct: number; umbralPct: number }
  | { tipo: 'sostenido_completo'; sostenidoMs: number; cierreMaxPct: number }
  | { tipo: 'apertura_completa'; aperturaPct: number; cierreMaxPct: number; sostenidoMs: number }
  | { tipo: 'repeticion_incompleta'; paso: 2 | 3 | 4; cierreMaxPct: number; sostenidoMs: number }

const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * Un cuadro. `cierre` = cierre de puño en % (null = no se ve la mano: el paso queda como está) y `dtMs` = ms de
 * juego desde el cuadro anterior. `donde`: el paso 1 solo avanza sobre la fuente y los pasos 2 a 4 solo sobre el vaso
 * (en otro lado quedan en pausa); sin `donde` no se mira la posición. Devuelve el estado nuevo y los eventos de este
 * cuadro (a lo más unos pocos).
 */
export function pasoNaranja(s: EstadoNaranja, cierre: number | null, dtMs: number, n: Pick<NivelNaranja, 'umbral' | 'sostenerMs' | 'abiertaPct'>, donde?: DondeMano): { estado: EstadoNaranja; eventos: EventoNaranja[] } {
  if (cierre == null) return { estado: s, eventos: [] }
  if (donde && s.paso === 1 && donde !== 'fuente') return { estado: s.abiertaMs ? { ...s, abiertaMs: 0 } : s, eventos: [] }
  if (donde && s.paso > 1 && donde !== 'vaso') return { estado: s, eventos: [] }
  const e: EstadoNaranja = { ...s }
  const eventos: EventoNaranja[] = []
  const suelta = soltarPct(n)
  const fallo = (paso: 2 | 3 | 4) => {
    eventos.push({ tipo: 'repeticion_incompleta', paso, cierreMaxPct: r1(e.cierreMax), sostenidoMs: Math.round(e.sostenidoMs) })
    return { ...estadoNaranjaInicial() }
  }

  if (e.paso === 1) {
    e.abiertaMs = cierre <= n.abiertaPct ? e.abiertaMs + dtMs : 0
    if (e.abiertaMs >= NARANJA_MS) {
      eventos.push({ tipo: 'naranja' })
      return { estado: { ...estadoNaranjaInicial(), paso: 2 }, eventos }
    }
    return { estado: e, eventos }
  }

  if (e.paso === 2) {
    e.cierreMax = Math.max(e.cierreMax, cierre)
    if (!e.iniciada && cierre >= INICIO_CIERRE_PCT) {
      e.iniciada = true
      eventos.push({ tipo: 'cierre_inicio', cierrePct: r1(cierre) })
    }
    if (cierre >= n.umbral) {
      eventos.push({ tipo: 'umbral_alcanzado', cierrePct: r1(cierre), umbralPct: n.umbral })
      e.paso = 3
      e.sostenidoMs = 0
      e.esperaMs = 0
      return { estado: e, eventos }
    }
    // Empezó a cerrar y volvió a abrir sin pasar el umbral: falla el paso 2.
    if (e.iniciada && cierre <= n.abiertaPct) return { estado: fallo(2), eventos }
    // Empezó a cerrar y no llega al umbral ni logra volver a abrir: no se queda esperando para siempre.
    if (e.iniciada) {
      e.esperaMs += dtMs
      if (e.esperaMs >= ESPERA_PASO_MS) return { estado: fallo(2), eventos }
    }
    return { estado: e, eventos }
  }

  if (e.paso === 3) {
    e.cierreMax = Math.max(e.cierreMax, cierre)
    if (cierre < suelta) return { estado: fallo(3), eventos }
    e.sostenidoMs += dtMs
    if (e.sostenidoMs >= n.sostenerMs) {
      // Se guarda el tiempo pedido (no el exceso del último cuadro): el panel dice 3,0/3 y la métrica también.
      e.sostenidoMs = n.sostenerMs
      eventos.push({ tipo: 'sostenido_completo', sostenidoMs: Math.round(e.sostenidoMs), cierreMaxPct: r1(e.cierreMax) })
      e.paso = 4
      e.abriendo = false
      e.aperturaMax = 0
      e.esperaMs = 0
    }
    return { estado: e, eventos }
  }

  // Paso 4: abrir por completo.
  e.cierreMax = Math.max(e.cierreMax, cierre)
  e.esperaMs += dtMs
  if (cierre >= suelta) {
    // Sigue con el puño: el tiempo sostenido ya no suma (quedó fijo al completar el paso 3). Si ya había empezado a
    // abrir y vuelve a cerrar, falla.
    if (e.abriendo && cierre >= n.umbral) return { estado: fallo(4), eventos }
  } else {
    e.abriendo = true
    e.aperturaMax = Math.max(e.aperturaMax, 100 - cierre)
    if (cierre <= n.abiertaPct) {
      eventos.push({ tipo: 'apertura_completa', aperturaPct: r1(e.aperturaMax), cierreMaxPct: r1(e.cierreMax), sostenidoMs: Math.round(e.sostenidoMs) })
      return { estado: { ...estadoNaranjaInicial() }, eventos }
    }
  }
  // No logra abrir por completo: la repetición se cierra como incompleta en el paso 4 y empieza la siguiente.
  if (e.esperaMs >= ESPERA_PASO_MS) return { estado: fallo(4), eventos }
  return { estado: e, eventos }
}

/**
 * "Reiniciar" a mitad de una repetición, o el fin de la sesión: la deja anotada como incompleta con el paso en que
 * estaba, para que no queden cierre_inicio / umbral_alcanzado sin cerrar ni se pierda lo que alcanzó (cierre máximo,
 * tiempo sostenido). En el paso 1 (o en el 2 sin haber empezado a cerrar) no hay nada abierto.
 */
export function cortarRepeticion(s: EstadoNaranja): EventoNaranja[] {
  if (s.paso === 1 || (s.paso === 2 && !s.iniciada)) return []
  return [{ tipo: 'repeticion_incompleta', paso: s.paso as 2 | 3 | 4, cierreMaxPct: r1(s.cierreMax), sostenidoMs: Math.round(s.sostenidoMs) }]
}

/** Progreso (0..1) de la barra de cada paso, para el dibujo. */
export function progresoSostener(s: EstadoNaranja, n: Pick<NivelNaranja, 'sostenerMs'>): number {
  if (s.paso < 3) return 0
  if (s.paso > 3) return 1
  return Math.min(1, s.sostenidoMs / n.sostenerMs)
}

export const PISTAS_PASO: Record<PasoNaranja, string> = {
  1: 'Lleva la mano abierta a la fuente para tomar una naranja',
  2: 'Cierra el puño hasta pasar la marca',
  3: 'Sostén el puño',
  4: 'Abre la mano por completo',
}

export const pistaFallo = (paso: 2 | 3 | 4, n: Pick<NivelNaranja, 'umbral'>): string =>
  paso === 2 ? `No llegaste al ${n.umbral} %. Abre la mano y vuelve a intentarlo` : paso === 3 ? 'Soltaste antes de tiempo. Abre la mano y repite' : 'Abre la mano por completo antes de volver a cerrar'

// ── Agregados ────────────────────────────────────────────────────────────────────────────────────────

/** Ritmo medio (repeticiones/min entre la primera y la última válida). null con menos de 2. */
export function ritmoRepeticiones(tiempos: number[]): number | null {
  if (tiempos.length < 2) return null
  const d = tiempos[tiempos.length - 1] - tiempos[0]
  return d > 0 ? (60000 * (tiempos.length - 1)) / d : null
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const redondear = (x: number | null, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

/** Junta las repeticiones de la sesión y arma las métricas de resumen. */
export class AgregadoNaranja {
  validas = 0
  incompletas = 0
  falloPaso: Record<2 | 3 | 4, number> = { 2: 0, 3: 0, 4: 0 }
  private cierresMax: number[] = []
  private sostenidos: number[] = []
  private aperturas: number[] = []
  private tiemposValidas: number[] = []

  /** `tMs` = ms de juego en que ocurrió el evento. */
  evento(ev: EventoNaranja, tMs: number) {
    if (ev.tipo === 'apertura_completa') {
      this.validas++
      this.cierresMax.push(ev.cierreMaxPct)
      this.sostenidos.push(ev.sostenidoMs)
      this.aperturas.push(ev.aperturaPct)
      this.tiemposValidas.push(tMs)
    } else if (ev.tipo === 'repeticion_incompleta') {
      this.incompletas++
      this.falloPaso[ev.paso]++
      this.cierresMax.push(ev.cierreMaxPct)
      if (ev.paso >= 3) this.sostenidos.push(ev.sostenidoMs)
    }
  }

  resumen(): Record<string, number | null> {
    const sost = media(this.sostenidos)
    const total = this.validas + this.incompletas
    return {
      repeticiones: this.validas,
      incompletas: this.incompletas,
      cierreMax: redondear(media(this.cierresMax)),
      cierreMaxPico: this.cierresMax.length ? Math.round(Math.max(...this.cierresMax)) : null,
      tiempoSostenido: redondear(sost == null ? null : sost / 1000, 1),
      aperturaCompleta: redondear(media(this.aperturas)),
      ritmo: redondear(ritmoRepeticiones(this.tiemposValidas), 1),
      completadas: total ? Math.round((this.validas / total) * 100) : null,
      falloPaso2: this.falloPaso[2],
      falloPaso3: this.falloPaso[3],
      falloPaso4: this.falloPaso[4],
    }
  }
}
