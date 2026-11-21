// Registro de una sesión de juego: eventos (EventoSesion) y muestras a 10 Hz. Sin DOM, con pruebas.
// - evento(): asigna seq correlativo (desde seqInicial, por si la sesión ya tenía eventos) y lo deja en cola.
// - vaciar(): manda la cola con repos.sesiones.agregarEventos (upsert idempotente; sin red, la capa de datos lo
//   guarda en la cola local). Si falla, los eventos quedan en la cola y se reintenta en el próximo vaciado.
// - muestra(): guarda una muestra si pasaron ≥ 1/hz s desde la anterior (10 Hz). Nunca cuadros de video.
import type { EventoSesion, LadoMano, Muestras, PoseClave, TipoEvento } from '../../domain/types'
import type { SesionesRepo } from '../../data/repos'
import type { OpcionesEvento } from './contrato'

export const HZ_MUESTRAS = 10
/** Poses clave por sesión (F35): ~1,3 KB cada una, así que 24 suman ~30 KB. */
export const MAX_POSES = 24

const r2 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10)
const r3 = (x: number) => Math.round(x * 1000) / 1000
const mm = (m: number) => Math.round(m * 10000) / 10   // metros → mm con 1 decimal

export class RegistroSesion {
  readonly eventos: EventoSesion[] = []
  private cola: EventoSesion[] = []
  private seq: number
  private enviando: Promise<void> | null = null
  private readonly datos: Muestras
  private ultimaMuestra = -Infinity
  private readonly sesionId: string
  private readonly repo: Pick<SesionesRepo, 'agregarEventos'>
  private readonly hz: number

  constructor(sesionId: string, repo: Pick<SesionesRepo, 'agregarEventos'>, opciones: { seqInicial?: number; hz?: number } = {}) {
    this.sesionId = sesionId
    this.repo = repo
    this.seq = opciones.seqInicial ?? 1
    this.hz = opciones.hz ?? HZ_MUESTRAS
    this.datos = { hz: this.hz, t: [], apertura: [], flexIndice: [] }
  }

  /** Anota un evento en el instante t (ms desde el inicio de la sesión). */
  evento(t: number, tipo: TipoEvento, o: OpcionesEvento = {}): EventoSesion {
    const e: EventoSesion = {
      sesionId: this.sesionId,
      seq: this.seq++,
      t: Math.round(t),
      tipo,
      mano: (o.mano ?? null) as LadoMano | null,
      objeto: o.objeto ?? null,
      datos: o.datos ?? null,
    }
    this.eventos.push(e)
    this.cola.push(e)
    return e
  }

  get pendientes(): number {
    return this.cola.length
  }

  /** Envía lo pendiente. Las llamadas concurrentes esperan a la anterior (el orden de seq se mantiene). */
  async vaciar(): Promise<void> {
    while (this.enviando) await this.enviando
    if (!this.cola.length) return
    const lote = this.cola
    this.cola = []
    this.enviando = this.repo
      .agregarEventos(lote)
      .catch((e: unknown) => {
        this.cola = [...lote, ...this.cola]
        throw e
      })
      .finally(() => {
        this.enviando = null
      })
    await this.enviando
  }

  /**
   * Guarda una muestra si toca (10 Hz). `t` en ms de juego activo. Devuelve true si se guardó.
   * apertura = apertura de pinza en cm; flexIndice en grados; canales = señales propias del juego.
   */
  muestra(t: number, apertura: number | null, flexIndice: number | null, canales?: Record<string, number | null>): boolean {
    const periodo = 1000 / this.hz
    if (t - this.ultimaMuestra < periodo * 0.95) return false
    this.ultimaMuestra = t
    const i = this.datos.t.length
    this.datos.t.push(Math.round(t))
    this.datos.apertura.push(r2(apertura))
    this.datos.flexIndice.push(r1(flexIndice))
    if (canales) {
      this.datos.canales ??= {}
      for (const [k, v] of Object.entries(canales)) {
        const c = (this.datos.canales[k] ??= new Array<number | null>(i).fill(null))
        c.push(r2(v))
      }
    }
    // canales que no vinieron en esta muestra: null para mantener la alineación con t
    if (this.datos.canales) for (const c of Object.values(this.datos.canales)) while (c.length < i + 1) c.push(null)
    return true
  }

  /**
   * F35 · Guarda una pose clave (21 puntos en metros → mm con 1 decimal). Una por etiqueta: la nueva reemplaza a la
   * anterior si trae `valor` mayor (o si ninguna trae valor). Máximo MAX_POSES etiquetas por sesión. Devuelve true si
   * quedó guardada. Solo puntos: nunca imagen.
   */
  pose(t: number, etiqueta: string, lado: LadoMano, puntosM: readonly { x: number; y: number; z: number }[], valor: number | null = null, centro?: [number, number]): boolean {
    if (puntosM.length !== 21 || puntosM.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) return false
    const poses = (this.datos.poses ??= [])
    const i = poses.findIndex((p) => p.etiqueta === etiqueta && p.lado === lado)
    if (i >= 0) {
      const vieja = poses[i]
      if (valor != null && vieja.valor != null && valor <= vieja.valor) return false
    } else if (poses.length >= MAX_POSES) return false
    const nueva: PoseClave = {
      etiqueta,
      t: Math.round(t),
      lado,
      valor: r1(valor),
      puntos: puntosM.map((p) => [mm(p.x), mm(p.y), mm(p.z)] as [number, number, number]),
      ...(centro ? { centro: [r3(centro[0]), r3(centro[1])] as [number, number] } : {}),
    }
    if (i >= 0) poses[i] = nueva
    else poses.push(nueva)
    return true
  }

  muestras(): Muestras {
    return this.datos
  }
}
