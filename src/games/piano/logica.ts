// Piano de dedos (F27, J6): reglas puras, con pruebas en piano.test.ts.
//
// - Reposo: 3 s con la mano quieta fijan la flexión MCP de cada dedo (CalibradorReposo). Mientras la mano está en
//   reposo, ese valor deriva muy despacio hacia la lectura actual (la mano se relaja o se corre un poco).
// - Dedo abajo (DetectorMano): flexión MCP − reposo del dedo > UMBRAL_BAJA_GRADOS; vuelve a "arriba" bajo
//   UMBRAL_SUBE_GRADOS (histéresis) o cuando recupera RECUPERA_FRACCION del recorrido que hizo (extensión limitada). Una pulsación se cierra EPISODIO_MS después de que el primer dedo baja: ahí se sabe
//   qué dedos bajaron "a la vez" y cuánto se movió cada uno (pico − mínimo de los HISTORIA_MS previos).
// - Independencia de una pulsación = 1 − (movimiento medio de los otros 4 dedos / movimiento del dedo pedido), en % (0..100).
// - Juez: reparte las notas del nivel (caen CAIDA ms y llegan a la línea en `tMs`), recibe pulsaciones y decide:
//   · solo el dedo pedido, dentro de la ventana → `acierto` (desfase = inicio de la pulsación − tMs).
//   · el dedo pedido con otro dedo a la vez → NO es acierto limpio: `dedo_equivocado` por cada dedo de más, la
//     independencia queda anotada (baja) y la nota sigue abierta hasta el fin de su ventana (se puede repetir limpio).
//   · otro dedo distinto del pedido → `dedo_equivocado`; la nota sigue abierta.
//   · fin de la ventana sin acierto → `nota_perdida`.
// - Errores por dedo: una nota cuenta UN error para su dedo pedido si fue perdida o tuvo algún dedo equivocado.
// - AgregadoPiano: aciertos, perdidas, equivocados, independencia (global y por dedo), desfase medio (|ms|), errores por dedo.
import type { LadoMano } from '../../domain/types'
import { ARTICULACIONES, flexionArticulacion, type Dedo, type P3 } from '../../metrics/geometria'
import { kuwuNum } from '../../ui/paleta'

export type { Dedo }
/** Teclas de izquierda a derecha para la mano derecha vista en espejo (el pulgar queda hacia el centro). */
export const DEDOS_PIANO: Dedo[] = ['pulgar', 'indice', 'medio', 'anular', 'menique']
/** Orden en que los niveles van sumando dedos (el pulgar entra solo con cinco dedos). */
export const ORDEN_NOTAS: Dedo[] = ['indice', 'medio', 'anular', 'menique', 'pulgar']
export const NOMBRE_DEDO: Record<Dedo, string> = { pulgar: 'pulgar', indice: 'índice', medio: 'medio', anular: 'anular', menique: 'meñique' }
export const capital = (d: Dedo) => d.charAt(0).toUpperCase() + d.slice(1)
/** Color de cada tecla y de su nota: el mismo de cada dedo en el dibujo de la mano (src/ui/dibujoMano.ts). */
export const COLOR_DEDO: Record<Dedo, number> = {
  pulgar: kuwuNum('crema'),
  indice: kuwuNum('rojo'),
  medio: kuwuNum('amarillo'),
  anular: kuwuNum('azul'),
  menique: kuwuNum('menta'),
}

// ── Umbrales ───────────────────────────────────────────────────────────────────────────────────

/** Un dedo está abajo cuando su flexión MCP supera la de reposo en tantos grados. */
export const UMBRAL_BAJA_GRADOS = 22
/** Y vuelve a estar arriba bajo esto (histéresis). */
export const UMBRAL_SUBE_GRADOS = 11
/**
 * Un dedo que bajó se da por subido también cuando recupera esta fracción del recorrido que hizo (aunque no llegue a
 * UMBRAL_SUBE_GRADOS): un paciente con extensión limitada puede no volver nunca a menos de 11° de su reposo.
 */
export const RECUPERA_FRACCION = 0.6
/** Tiempo para decidir qué dedos bajaron "a la vez" tras el primero (ms). */
export const EPISODIO_MS = 300
/** Historia previa a la pulsación usada para medir cuánto se movió cada dedo (ms). */
export const HISTORIA_MS = 400
/** Reposo: tiempo con la mano quieta y cuánto se puede mover cada dedo (grados, máx − mín) sin reiniciar la cuenta. */
export const REPOSO_MS = 3000
export const REPOSO_TOLERANCIA_GRADOS = 12
/** Constante de tiempo de la deriva lenta del reposo (ms). */
export const DERIVA_REPOSO_MS = 8000

export type Flexiones = Record<Dedo, number>

const ceros = (): Flexiones => ({ pulgar: 0, indice: 0, medio: 0, anular: 0, menique: 0 })
const copia = (f: Flexiones): Flexiones => ({ ...f })

/** Flexión MCP de cada dedo (grados, 0 = recto) desde worldLandmarks. En el pulgar es la articulación 1-2-3. */
export function flexionMcp(world: P3[]): Flexiones {
  const out = ceros()
  for (const d of DEDOS_PIANO) {
    const [a, b, c] = ARTICULACIONES[d].mcp
    out[d] = flexionArticulacion(world[a], world[b], world[c])
  }
  return out
}

// ── Niveles ────────────────────────────────────────────────────────────────────────────────────

export interface NivelPiano {
  nombre: string
  detalle: string
  /** Cuántos dedos reciben notas (los primeros de ORDEN_NOTAS: 2 = índice y medio). */
  dedos: number
  /** 1 = la mano de la sesión; 2 = ambas. */
  manos: number
  /** Tiempo entre una nota y la siguiente (ms). */
  intervaloMs: number
  /** Una nota vale como acierto si la pulsación empieza a ± ventanaMs de la línea. */
  ventanaMs: number
  /** Lo que tarda una nota en caer hasta la línea (ms). */
  caidaMs: number
  [k: string]: string | number | boolean
}

export const NIVELES_PIANO: Record<1 | 2 | 3 | 4 | 5, NivelPiano> = {
  1: { nombre: 'Dos dedos, lento', detalle: 'Una mano · índice y medio · ritmo lento, ventana amplia', dedos: 2, manos: 1, intervaloMs: 3600, ventanaMs: 1100, caidaMs: 3200 },
  2: { nombre: 'Tres dedos', detalle: 'Una mano · índice, medio y anular · ritmo lento', dedos: 3, manos: 1, intervaloMs: 3000, ventanaMs: 900, caidaMs: 2800 },
  3: { nombre: 'Cinco dedos', detalle: 'Una mano · cinco dedos · ritmo medio', dedos: 5, manos: 1, intervaloMs: 2500, ventanaMs: 700, caidaMs: 2500 },
  4: { nombre: 'Cinco dedos, más rápido', detalle: 'Una mano · cinco dedos · ritmo medio-rápido', dedos: 5, manos: 1, intervaloMs: 1900, ventanaMs: 550, caidaMs: 2200 },
  5: { nombre: 'Dos manos', detalle: 'Dos manos · cinco dedos · ritmo rápido, ventana estrecha', dedos: 5, manos: 2, intervaloMs: 1500, ventanaMs: 400, caidaMs: 2000 },
}

export function nivelPiano(n: number): NivelPiano {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5
  return NIVELES_PIANO[k]
}

/** Manos que juegan: nivel 5 = ambas; los demás, la mano de la sesión ('ambas' se toma como derecha). */
export function ladosDelNivel(nivel: Pick<NivelPiano, 'manos'>, mano: string): LadoMano[] {
  if (nivel.manos >= 2) return ['derecha', 'izquierda']
  return [mano === 'izquierda' ? 'izquierda' : 'derecha']
}

// ── Reposo ─────────────────────────────────────────────────────────────────────────────────────

/** Fija la posición de reposo de cada dedo: el promedio de REPOSO_MS con la mano quieta (si algo se mueve, empieza de nuevo). */
export class CalibradorReposo {
  private ms = 0
  private n = 0
  private suma = ceros()
  private min = ceros()
  private max = ceros()

  /** Avanza `dtMs` con la flexión actual (null = sin mano: reinicia). Devuelve el progreso 0..1. */
  paso(flex: Flexiones | null, dtMs: number): number {
    if (!flex) {
      this.reiniciar()
      return 0
    }
    if (this.n > 0) {
      for (const d of DEDOS_PIANO) {
        if (Math.max(this.max[d], flex[d]) - Math.min(this.min[d], flex[d]) > REPOSO_TOLERANCIA_GRADOS) {
          this.reiniciar()
          break
        }
      }
    }
    if (this.n === 0) {
      this.min = copia(flex)
      this.max = copia(flex)
    }
    for (const d of DEDOS_PIANO) {
      this.suma[d] += flex[d]
      this.min[d] = Math.min(this.min[d], flex[d])
      this.max[d] = Math.max(this.max[d], flex[d])
    }
    this.n++
    this.ms += Math.max(0, dtMs)
    return this.progreso()
  }

  progreso(): number {
    return Math.min(1, this.ms / REPOSO_MS)
  }

  /** Reposo fijado (promedio por dedo) cuando se cumplió el tiempo; null antes. */
  reposo(): Flexiones | null {
    if (this.ms < REPOSO_MS || this.n === 0) return null
    const r = ceros()
    for (const d of DEDOS_PIANO) r[d] = this.suma[d] / this.n
    return r
  }

  reiniciar() {
    this.ms = 0
    this.n = 0
    this.suma = ceros()
    this.min = ceros()
    this.max = ceros()
  }
}

// ── Detección de pulsaciones ───────────────────────────────────────────────────────────────────

/** Una pulsación ya cerrada: qué dedos bajaron (a la vez, dentro de EPISODIO_MS) y cuánto se movió cada uno. */
export interface Pulsacion {
  /** Instante (ms de juego) en que bajó el primer dedo. */
  t: number
  abajo: Dedo[]
  /** Grados que se movió cada dedo (pico − mínimo de la historia previa). */
  movimiento: Flexiones
}

export type FaseDetector = 'reposo' | 'episodio' | 'sostenido'

export class DetectorMano {
  reposo: Flexiones | null = null
  fase: FaseDetector = 'reposo'
  /** Dedos que están abajo ahora (con histéresis). */
  abajo: Record<Dedo, boolean> = { pulgar: false, indice: false, medio: false, anular: false, menique: false }
  private hist: { t: number; f: Flexiones }[] = []
  private tAnterior: number | null = null
  private tInicio = 0
  private conjunto = new Set<Dedo>()
  private base = ceros()
  private pico = ceros()
  /** Mayor separación del reposo (grados) alcanzada por cada dedo mientras está abajo. */
  private recorrido = ceros()

  fijarReposo(r: Flexiones) {
    this.reposo = copia(r)
    this.reiniciarEstado()
  }

  /** Mano perdida: se olvida lo que estaba en curso (el reposo se conserva). */
  perder() {
    this.reiniciarEstado()
  }

  private reiniciarEstado() {
    this.fase = 'reposo'
    this.hist = []
    this.tAnterior = null
    this.conjunto.clear()
    for (const d of DEDOS_PIANO) {
      this.abajo[d] = false
      this.recorrido[d] = 0
    }
  }

  /** Separación del reposo bajo la cual un dedo que bajó se da por subido (grados). Nunca llega al umbral de bajada. */
  private limiteSube(d: Dedo): number {
    return Math.min(UMBRAL_BAJA_GRADOS - 4, Math.max(UMBRAL_SUBE_GRADOS, this.recorrido[d] * (1 - RECUPERA_FRACCION)))
  }

  /** Cuánto se separa cada dedo de su reposo (grados). */
  delta(flex: Flexiones): Flexiones {
    const r = this.reposo
    const out = ceros()
    for (const d of DEDOS_PIANO) out[d] = r ? flex[d] - r[d] : 0
    return out
  }

  hayAbajo(): boolean {
    return DEDOS_PIANO.some((d) => this.abajo[d])
  }

  /** Un cuadro. Devuelve la pulsación cuando se cierra (EPISODIO_MS después del primer dedo abajo). */
  paso(flex: Flexiones, t: number): Pulsacion | null {
    if (!this.reposo) return null
    const dt = this.tAnterior == null ? 0 : Math.max(0, t - this.tAnterior)
    this.tAnterior = t
    this.hist.push({ t, f: copia(flex) })
    while (this.hist.length > 1 && t - this.hist[0].t > HISTORIA_MS + EPISODIO_MS) this.hist.shift()

    const dl = this.delta(flex)
    const nuevos: Dedo[] = []
    for (const d of DEDOS_PIANO) {
      if (!this.abajo[d] && dl[d] > UMBRAL_BAJA_GRADOS) {
        this.abajo[d] = true
        this.recorrido[d] = dl[d]
        nuevos.push(d)
      } else if (this.abajo[d]) {
        this.recorrido[d] = Math.max(this.recorrido[d], dl[d])
        if (dl[d] < this.limiteSube(d)) this.abajo[d] = false
      }
    }

    if (this.fase === 'reposo') {
      if (nuevos.length > 0) {
        this.fase = 'episodio'
        this.tInicio = t
        this.conjunto = new Set(nuevos)
        for (const d of DEDOS_PIANO) {
          const previas = this.hist.filter((h) => h.t >= t - HISTORIA_MS)
          this.base[d] = Math.min(...previas.map((h) => h.f[d]))
          this.pico[d] = flex[d]
        }
      } else if (DEDOS_PIANO.every((d) => dl[d] < UMBRAL_SUBE_GRADOS) && this.reposo) {
        // Deriva lenta del reposo hacia la lectura actual (solo con todos los dedos arriba).
        const k = Math.min(1, dt / DERIVA_REPOSO_MS)
        for (const d of DEDOS_PIANO) this.reposo[d] += (flex[d] - this.reposo[d]) * k
      }
      return null
    }

    if (this.fase === 'episodio') {
      for (const d of nuevos) this.conjunto.add(d)
      for (const d of DEDOS_PIANO) this.pico[d] = Math.max(this.pico[d], flex[d])
      if (t - this.tInicio >= EPISODIO_MS) {
        const movimiento = ceros()
        for (const d of DEDOS_PIANO) movimiento[d] = Math.max(0, this.pico[d] - this.base[d])
        this.fase = 'sostenido'
        return { t: this.tInicio, abajo: DEDOS_PIANO.filter((d) => this.conjunto.has(d)), movimiento }
      }
      return null
    }

    // sostenido: hasta que todos los dedos vuelvan arriba no se cuenta otra pulsación.
    if (!this.hayAbajo()) this.fase = 'reposo'
    return null
  }
}

// ── Independencia ──────────────────────────────────────────────────────────────────────────────

/**
 * 1 − (movimiento medio de los otros 4 dedos / movimiento del dedo pedido), en % recortado a 0..100.
 * Sin movimiento del dedo pedido no hay nada que medir: 0.
 */
export function independenciaPct(movimiento: Flexiones, pedido: Dedo): number {
  const m = movimiento[pedido]
  if (!(m > 1e-6)) return 0
  const otros = DEDOS_PIANO.filter((d) => d !== pedido)
  const medio = otros.reduce((s, d) => s + movimiento[d], 0) / otros.length
  return Math.min(100, Math.max(0, (1 - medio / m) * 100))
}

// ── Notas y juez ───────────────────────────────────────────────────────────────────────────────

export interface Nota {
  /** Posición en la partitura (0 = primera). */
  i: number
  lado: LadoMano
  dedo: Dedo
  /** Instante (ms de juego) en que llega a la línea. */
  tMs: number
  /** Instante en que aparece arriba. */
  apareceMs: number
  estado: 'pendiente' | 'acierto' | 'perdida'
  /** Hubo un dedo equivocado (o doble) en esta nota. */
  error: boolean
}

export type EventoPiano =
  | { tipo: 'nota_mostrada'; nota: Nota }
  | { tipo: 'acierto'; nota: Nota; desfaseMs: number; independencia: number }
  | { tipo: 'dedo_equivocado'; nota: Nota; dedo: Dedo; simultaneo: boolean; primerError: boolean }
  | { tipo: 'independencia'; dedo: Dedo; valor: number }
  | { tipo: 'nota_perdida'; nota: Nota; yaTuvoError: boolean }

/**
 * Instante en que empezó la pausa para fijar el reposo. Si ya había una en curso (se apretó "Fijar reposo" otra vez
 * durante la calibración) se conserva la primera: el atraso de la partitura se mide desde que dejó de correr.
 */
export const inicioPausa = (actual: number | null, ahora: number): number => actual ?? ahora

/** Cuánto más se espera tras el fin de la ventana a que se cierre una pulsación en curso (ms). */
const GRACIA_MS = EPISODIO_MS + 100

export class Juez {
  readonly notas: Nota[] = []
  private ultimo: { lado: LadoMano; dedo: Dedo } | null = null
  private t0: number
  readonly nivel: Pick<NivelPiano, 'dedos' | 'intervaloMs' | 'ventanaMs' | 'caidaMs'>
  readonly lados: LadoMano[]
  private readonly rng: () => number
  readonly total: number

  /**
   * @param total notas de la sesión (0 = sin tope)
   * @param t0 instante (ms de juego) en que empieza a correr la partitura
   */
  constructor(nivel: Pick<NivelPiano, 'dedos' | 'intervaloMs' | 'ventanaMs' | 'caidaMs'>, lados: LadoMano[], rng: () => number, total: number, t0: number) {
    this.nivel = nivel
    this.lados = lados
    this.rng = rng
    this.total = total
    this.t0 = t0
  }

  private siguienteNota(): Nota {
    const i = this.notas.length
    const dedos = ORDEN_NOTAS.slice(0, this.nivel.dedos)
    const combos: { lado: LadoMano; dedo: Dedo }[] = []
    for (const lado of this.lados) for (const dedo of dedos) combos.push({ lado, dedo })
    const previo = this.ultimo
    const candidatos = combos.length > 1 && previo ? combos.filter((c) => !(c.lado === previo.lado && c.dedo === previo.dedo)) : combos
    const e = candidatos[Math.min(candidatos.length - 1, Math.floor(this.rng() * candidatos.length))]
    this.ultimo = e
    const tMs = this.t0 + this.nivel.caidaMs + i * this.nivel.intervaloMs
    return { i, lado: e.lado, dedo: e.dedo, tMs, apareceMs: tMs - this.nivel.caidaMs, estado: 'pendiente', error: false }
  }

  /** Notas ya resueltas (acertadas o perdidas). */
  get resueltas(): number {
    return this.notas.filter((n) => n.estado !== 'pendiente').length
  }

  /** Notas que aún no se resuelven. */
  pendientes(): Nota[] {
    return this.notas.filter((n) => n.estado === 'pendiente')
  }

  /** La nota abierta de esa mano cuya ventana contiene `t` (la más cercana a la línea). */
  activa(lado: LadoMano, t: number): Nota | null {
    let mejor: Nota | null = null
    for (const n of this.notas) {
      if (n.estado !== 'pendiente' || n.lado !== lado) continue
      const d = Math.abs(t - n.tMs)
      if (d <= this.nivel.ventanaMs && (!mejor || d < Math.abs(t - mejor.tMs))) mejor = n
    }
    return mejor
  }

  /** La próxima nota de esa mano que aún no se resuelve (para la pista de la tecla). */
  proxima(lado: LadoMano): Nota | null {
    return this.notas.find((n) => n.estado === 'pendiente' && n.lado === lado) ?? null
  }

  /** Corre la partitura `ms` (tras volver a fijar el reposo): las notas abiertas y las que faltan se atrasan. */
  atrasar(ms: number) {
    this.t0 += ms
    for (const n of this.notas) if (n.estado === 'pendiente') {
      n.tMs += ms
      n.apareceMs += ms
    }
  }

  /** Muestra las notas que ya aparecen y pierde las que vencieron. `ocupada(lado)` = hay una pulsación en curso en esa mano. */
  avanzar(t: number, ocupada: (lado: LadoMano) => boolean = () => false): EventoPiano[] {
    const out: EventoPiano[] = []
    for (;;) {
      if (this.total > 0 && this.notas.length >= this.total) break
      const apareceMs = this.t0 + this.notas.length * this.nivel.intervaloMs
      if (apareceMs > t) break
      const n = this.siguienteNota()
      this.notas.push(n)
      out.push({ tipo: 'nota_mostrada', nota: n })
    }
    for (const n of this.notas) {
      if (n.estado !== 'pendiente') continue
      const fin = n.tMs + this.nivel.ventanaMs
      if (t > fin && (!ocupada(n.lado) || t > fin + GRACIA_MS)) {
        n.estado = 'perdida'
        out.push({ tipo: 'nota_perdida', nota: n, yaTuvoError: n.error })
      }
    }
    return out
  }

  /** Decide qué fue una pulsación cerrada de esa mano. */
  pulsacion(lado: LadoMano, p: Pulsacion): EventoPiano[] {
    const nota = this.activa(lado, p.t)
    if (!nota || p.abajo.length === 0) return []
    const out: EventoPiano[] = []
    const incluye = p.abajo.includes(nota.dedo)
    const extras = p.abajo.filter((d) => d !== nota.dedo)
    const marcarError = () => {
      const primer = !nota.error
      nota.error = true
      return primer
    }
    if (incluye) {
      const independencia = independenciaPct(p.movimiento, nota.dedo)
      if (extras.length === 0) {
        nota.estado = 'acierto'
        out.push({ tipo: 'acierto', nota, desfaseMs: p.t - nota.tMs, independencia })
      } else {
        // Dos dedos a la vez: no es acierto limpio; la independencia de este dedo queda baja.
        out.push({ tipo: 'independencia', dedo: nota.dedo, valor: independencia })
        let primer = marcarError()
        for (const d of extras) {
          out.push({ tipo: 'dedo_equivocado', nota, dedo: d, simultaneo: true, primerError: primer })
          primer = false
        }
      }
    } else {
      let primer = marcarError()
      for (const d of p.abajo) {
        out.push({ tipo: 'dedo_equivocado', nota, dedo: d, simultaneo: false, primerError: primer })
        primer = false
      }
    }
    return out
  }
}

// ── Agregados ──────────────────────────────────────────────────────────────────────────────────

const redondea = (v: number, dec = 0) => Math.round(v * 10 ** dec) / 10 ** dec

export class AgregadoPiano {
  aciertos = 0
  perdidas = 0
  equivocados = 0
  private indep: Record<Dedo, number[]> = { pulgar: [], indice: [], medio: [], anular: [], menique: [] }
  private recientes: number[] = []
  private desfases: number[] = []
  errores: Record<Dedo, number> = { pulgar: 0, indice: 0, medio: 0, anular: 0, menique: 0 }

  private muestra(dedo: Dedo, v: number) {
    this.indep[dedo].push(v)
    this.recientes.push(v)
    if (this.recientes.length > 8) this.recientes.shift()
  }

  evento(ev: EventoPiano) {
    if (ev.tipo === 'acierto') {
      this.aciertos++
      this.desfases.push(Math.abs(ev.desfaseMs))
      this.muestra(ev.nota.dedo, ev.independencia)
    } else if (ev.tipo === 'independencia') this.muestra(ev.dedo, ev.valor)
    else if (ev.tipo === 'dedo_equivocado') {
      this.equivocados++
      if (ev.primerError) this.errores[ev.nota.dedo]++
    } else if (ev.tipo === 'nota_perdida') {
      this.perdidas++
      if (!ev.yaTuvoError) this.errores[ev.nota.dedo]++
    }
  }

  independencia(): number | null {
    const todas = DEDOS_PIANO.flatMap((d) => this.indep[d])
    return todas.length ? todas.reduce((s, v) => s + v, 0) / todas.length : null
  }

  /** Promedio de las últimas pulsaciones (para el minigráfico en vivo). */
  independenciaReciente(): number | null {
    return this.recientes.length ? this.recientes.reduce((s, v) => s + v, 0) / this.recientes.length : null
  }

  independenciaDedo(d: Dedo): number | null {
    const v = this.indep[d]
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }

  /** Desfase medio respecto del ritmo (ms, valor absoluto). */
  desfaseMedio(): number | null {
    return this.desfases.length ? this.desfases.reduce((s, v) => s + v, 0) / this.desfases.length : null
  }

  resumen(): Record<string, number | null> {
    const ind = this.independencia()
    const des = this.desfaseMedio()
    const out: Record<string, number | null> = {
      independencia: ind == null ? null : redondea(ind),
      desfaseMedio: des == null ? null : redondea(des),
      aciertos: this.aciertos,
      notasPerdidas: this.perdidas,
      dedosEquivocados: this.equivocados,
    }
    for (const d of DEDOS_PIANO) {
      const v = this.independenciaDedo(d)
      out[`independencia${capital(d)}`] = v == null ? null : redondea(v)
      out[`errores${capital(d)}`] = this.errores[d]
    }
    return out
  }
}

// ── Teclas ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Posición x de cada tecla a partir de la de las puntas de los dedos en reposo: se mantiene el orden que tienen los dedos
 * y se separan al menos `separacion` (unidades de escena) para que cada tecla quede bajo su dedo y no se pisen.
 */
export function separarTeclas(xs: Record<Dedo, number>, separacion: number, huecoMax = Infinity): Record<Dedo, number> {
  const orden = [...DEDOS_PIANO].sort((a, b) => xs[a] - xs[b])
  const out = { ...xs }
  for (let i = 1; i < orden.length; i++) {
    const previa = out[orden[i - 1]]
    out[orden[i]] = Math.min(previa + huecoMax, Math.max(out[orden[i]], previa + separacion))
  }
  const antes = DEDOS_PIANO.reduce((s, d) => s + xs[d], 0) / DEDOS_PIANO.length
  const despues = DEDOS_PIANO.reduce((s, d) => s + out[d], 0) / DEDOS_PIANO.length
  for (const d of DEDOS_PIANO) out[d] += antes - despues
  return out
}

/** Frecuencia (Hz) de la nota de cada dedo: pentatónica de Do; la mano izquierda una octava abajo. */
export const FRECUENCIA_DEDO: Record<Dedo, number> = { pulgar: 261.63, indice: 293.66, medio: 329.63, anular: 392, menique: 440 }
export const frecuenciaNota = (dedo: Dedo, lado: LadoMano) => FRECUENCIA_DEDO[dedo] * (lado === 'izquierda' ? 1 : 2)
