// Fuentes simuladas, manejadas por el tiempo: `sintetica` (guion de poses) y `grabacion` (JSON de landmarks).
// Sin DOM: el reloj es inyectable, así las pruebas avanzan el tiempo a mano con `paso(t)`.

import { FuenteBase } from './fuenteBase'
import { cuadroEnGrabacion, type Grabacion } from './grabacion'
import { CAMARA_BASE, POSE_BASE, guionPreset, manosEnGuion, type GuionSintetico, type PoseMano } from './sintetica'
import type { CuadroManos, LadoMano, TipoFuente } from './tipos'

export interface Reloj {
  ahora(): number
  /** Llama a fn periódicamente (~30 Hz). Devuelve cómo cancelar. */
  cadaCuadro(fn: () => void): () => void
}

export const relojNavegador = (hz = 30): Reloj => ({
  ahora: () => performance.now(),
  cadaCuadro: (fn) => {
    const id = setInterval(fn, 1000 / hz)
    return () => clearInterval(id)
  },
})

/** Reloj manual para pruebas: no programa nada; se avanza llamando a `paso(t)` en la fuente. */
export const relojManual = (): Reloj & { t: number } => {
  const r = { t: 0, ahora: () => r.t, cadaCuadro: () => () => {} }
  return r
}

abstract class FuenteSimulada extends FuenteBase {
  protected reloj: Reloj
  protected t0 = 0
  /** ms (de `tiempo`) en que empezó el guion/grabación actual. */
  protected inicioGuion = 0
  private cancelar: (() => void) | null = null
  constructor(reloj: Reloj) {
    super()
    this.reloj = reloj
  }

  /** ms desde iniciar() (monótono: es el t de los cuadros publicados). */
  get tiempo() {
    return this.reloj.ahora() - this.t0
  }

  async iniciar() {
    this.detener()
    this.reiniciarBase()
    this.t0 = this.reloj.ahora()
    this.inicioGuion = 0
    this.fijarEstado('buscando')
    this.paso()
    this.cancelar = this.reloj.cadaCuadro(() => this.paso())
  }

  detener() {
    this.cancelar?.()
    this.cancelar = null
  }

  /** Vuelve el guion/grabación al inicio (el t de los cuadros sigue avanzando). */
  reiniciarReloj() {
    this.inicioGuion = this.tiempo
  }

  /** Genera y publica el cuadro del instante `t` (ms desde iniciar()). Por defecto, el del reloj. */
  paso(t = this.tiempo): CuadroManos | null {
    const c = this.cuadroEn(t - this.inicioGuion)
    if (!c) return null
    const publicado = { ...c, t }
    this.publicar(publicado)
    return publicado
  }

  /** Cuadro en `t` ms desde el inicio del guion/grabación. */
  protected abstract cuadroEn(t: number): CuadroManos | null
}

/**
 * Fuente `sintetica`. Control en vivo (e2e: window.__manoviva.fuente):
 *  - cargarGuion(guion)  reemplaza el guion y reinicia su reloj
 *  - fijarPose(pose, lado?) deja una mano quieta en esa pose (hereda de POSE_BASE)
 *  - ocultar()           sin manos (para probar 'perdida' y la pausa automática)
 *  - fijarLuz(lum)       luminancia simulada 0..255
 */
export class FuenteSintetica extends FuenteSimulada {
  readonly tipo: TipoFuente = 'sintetica'
  guion: GuionSintetico
  constructor(guion: GuionSintetico = guionPreset('calibracion'), reloj: Reloj = relojNavegador()) {
    super(reloj)
    this.guion = guion
  }

  cargarGuion(guion: GuionSintetico) {
    this.guion = guion
    this.reiniciarReloj()
    this.paso()
  }

  fijarPose(pose: Partial<PoseMano>, lado: LadoMano = 'derecha') {
    this.cargarGuion({ ...this.guion, manos: [{ lado, poses: [{ t: 0, ...POSE_BASE, x: lado === 'derecha' ? 0.42 : 0.58, ...pose }] }] })
  }

  ocultar() {
    this.cargarGuion({ ...this.guion, manos: [] })
  }

  fijarLuz(luz: number) {
    this.guion = { ...this.guion, luz }
  }

  protected cuadroEn(t: number): CuadroManos {
    const { manos, luz } = manosEnGuion(this.guion, t)
    this.luminancia = luz
    const cam = { ...CAMARA_BASE, ...this.guion.camara }
    return { t, manos, ancho: cam.ancho, alto: cam.alto }
  }
}

/** Fuente `grabacion`: reproduce un JSON de landmarks según el tiempo (con bucle). */
export class FuenteGrabacion extends FuenteSimulada {
  readonly tipo: TipoFuente = 'grabacion'
  grabacion: Grabacion
  bucle: boolean
  constructor(grabacion: Grabacion, reloj: Reloj = relojNavegador(), bucle = true) {
    super(reloj)
    this.grabacion = grabacion
    this.bucle = bucle
    this.luminancia = 140
  }

  protected cuadroEn(t: number): CuadroManos | null {
    // paso() publica con el t del reloj (monótono aunque la grabación dé la vuelta).
    return cuadroEnGrabacion(this.grabacion, t, this.bucle)
  }
}
