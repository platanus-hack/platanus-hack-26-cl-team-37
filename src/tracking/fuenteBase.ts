// Base común de las fuentes de manos (sin DOM): suscriptores, estado, fps y último cuadro.

import type { CuadroManos, EstadoSeguimiento, FuenteManos, TipoFuente } from './tipos'

/** ms sin manos antes de pasar de 'detectada' a 'perdida' (evita parpadeos de un cuadro). */
export const MS_PERDIDA = 300

/** Estado siguiente según si el cuadro trae manos. Pura. */
export function siguienteEstado(
  actual: EstadoSeguimiento,
  hayManos: boolean,
  tMs: number,
  ultimaDeteccion: number | null,
): EstadoSeguimiento {
  if (hayManos) return 'detectada'
  if (ultimaDeteccion == null) return 'buscando'
  if (actual === 'detectada' && tMs - ultimaDeteccion < MS_PERDIDA) return 'detectada'
  return 'perdida'
}

/** fps por media móvil exponencial de los intervalos entre cuadros. */
export class MedidorFps {
  private tPrev: number | null = null
  private intervalo: number | null = null
  private alfa: number
  constructor(alfa = 0.1) {
    this.alfa = alfa
  }
  marcar(tMs: number): number {
    if (this.tPrev != null) {
      const dt = tMs - this.tPrev
      if (dt > 0) this.intervalo = this.intervalo == null ? dt : this.intervalo + this.alfa * (dt - this.intervalo)
    }
    this.tPrev = tMs
    return this.fps
  }
  get fps(): number {
    return this.intervalo ? 1000 / this.intervalo : 0
  }
  reiniciar() {
    this.tPrev = null
    this.intervalo = null
  }
}

export abstract class FuenteBase implements FuenteManos {
  abstract readonly tipo: TipoFuente
  estado: EstadoSeguimiento = 'iniciando'
  ultimo: CuadroManos | null = null
  ultimaDeteccion: number | null = null
  luminancia: number | null = null
  video: HTMLVideoElement | null = null
  detalleError: string | null = null
  private medidor = new MedidorFps()
  private oyentesCuadro = new Set<(c: CuadroManos) => void>()
  private oyentesEstado = new Set<(e: EstadoSeguimiento) => void>()

  abstract iniciar(): Promise<void>
  abstract detener(): void

  get fps() {
    return this.medidor.fps
  }

  alCuadro(fn: (c: CuadroManos) => void) {
    this.oyentesCuadro.add(fn)
    return () => {
      this.oyentesCuadro.delete(fn)
    }
  }

  alEstado(fn: (e: EstadoSeguimiento) => void) {
    this.oyentesEstado.add(fn)
    return () => {
      this.oyentesEstado.delete(fn)
    }
  }

  protected fijarEstado(e: EstadoSeguimiento, detalle: string | null = null) {
    if (detalle) this.detalleError = detalle
    if (e === this.estado) return
    this.estado = e
    this.oyentesEstado.forEach((fn) => fn(e))
  }

  /** Publica un cuadro: actualiza fps, estado y avisa a los suscriptores. */
  protected publicar(c: CuadroManos) {
    this.medidor.marcar(c.t)
    const hay = c.manos.length > 0
    this.fijarEstado(siguienteEstado(this.estado, hay, c.t, this.ultimaDeteccion))
    if (hay) this.ultimaDeteccion = c.t
    this.ultimo = c
    this.oyentesCuadro.forEach((fn) => fn(c))
  }

  protected reiniciarFps() {
    this.medidor.reiniciar()
  }

  protected reiniciarBase() {
    this.medidor.reiniciar()
    this.ultimo = null
    this.ultimaDeteccion = null
  }
}
