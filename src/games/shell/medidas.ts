// Medidas comunes a todos los juegos (puras, con pruebas en shell.test.ts):
// - medirMano: apertura de pinza en cm (worldLandmarks × escala de la calibración), apertura normalizada,
//   apertura con el rango abrir/cerrar de la calibración, flexión por dedo y muñeca en la imagen.
// - AcumuladorBase: lo que la base junta durante la sesión para los agregados (calidad del registro, apertura y
//   flexión máximas, suavidad de la muñeca por ventanas, fps medio de seguimiento).
import type { Calibracion, EventoSesion, FlexionDedos } from '../../domain/types'
import { aperturaMano, aperturaPinza, flexionTodos } from '../../metrics/geometria'
import type { EntradaAgregados } from '../../metrics/sesion'
import { suavidadSesion, type PuntoTrayectoria } from '../../metrics/suavidad'
import type { ManoSeguida } from '../../tracking/tipos'
import type { MedidasMano } from './contrato'

export function escalaDeCalibracion(c: Calibracion | null | undefined): number {
  return c?.escalaCmPorUnidad && c.escalaCmPorUnidad > 0 ? c.escalaCmPorUnidad : 100
}

/** Apertura normalizada con el rango abrir/cerrar medido en la calibración (0 = su puño, 1 = su mano abierta). */
export function aperturaCalibrada(apertura: number, c: Calibracion | null | undefined): number | null {
  const r = c?.rangoAbrirCerrar
  if (!r || !(r.max - r.min > 0.05)) return null
  return Math.min(1, Math.max(0, (apertura - r.min) / (r.max - r.min)))
}

export function medirMano(m: ManoSeguida, calibracion: Calibracion | null | undefined, distanciaCm: number | null = null): MedidasMano {
  const escala = escalaDeCalibracion(calibracion)
  const apertura = aperturaMano(m.worldLandmarks)
  const f = flexionTodos(m.worldLandmarks)
  return {
    lado: m.lado,
    aperturaPinzaCm: aperturaPinza(m.worldLandmarks) * escala,
    apertura,
    aperturaCalibrada: aperturaCalibrada(apertura, calibracion),
    flexion: { pulgar: f.pulgar, indice: f.indice, medio: f.medio, anular: f.anular, menique: f.menique },
    muneca: { x: m.landmarks[0].x, y: m.landmarks[0].y },
    distanciaCm,
  }
}

/** Ventana de suavidad: la trayectoria de la muñeca se corta cada VENTANA_MS (y en cada pausa). */
export const VENTANA_SUAVIDAD_MS = 3000
/** Una ventana cuenta para la suavidad solo si la muñeca recorrió al menos esto (fracción de la imagen). */
export const RECORRIDO_MIN = 0.03

const flexCero = (): FlexionDedos => ({ pulgar: 0, indice: 0, medio: 0, anular: 0, menique: 0 })

export class AcumuladorBase {
  cuadros = 0
  cuadrosConMano = 0
  aperturaMaxCm = 0
  flexionMax: FlexionDedos = flexCero()
  private sumaFps = 0
  private nFps = 0
  private ventana: PuntoTrayectoria[] = []
  readonly segmentos: PuntoTrayectoria[][] = []

  /** Un cuadro de juego activo. `t` en ms de juego; `m` = medidas de la mano de la sesión (null sin mano). */
  agregar(t: number, m: MedidasMano | null, fpsSeguimiento: number) {
    this.cuadros++
    if (fpsSeguimiento > 0) {
      this.sumaFps += fpsSeguimiento
      this.nFps++
    }
    if (!m) {
      this.cortar()
      return
    }
    this.cuadrosConMano++
    this.aperturaMaxCm = Math.max(this.aperturaMaxCm, m.aperturaPinzaCm)
    for (const k of Object.keys(this.flexionMax) as (keyof FlexionDedos)[]) this.flexionMax[k] = Math.max(this.flexionMax[k], m.flexion[k])
    const ultimo = this.ventana[this.ventana.length - 1]
    if (ultimo && t <= ultimo.t) return
    this.ventana.push({ t, x: m.muneca.x, y: m.muneca.y })
    if (this.ventana.length > 1 && t - this.ventana[0].t >= VENTANA_SUAVIDAD_MS) this.cortar()
  }

  /** Cierra la ventana de trayectoria actual (pausa, pérdida de la mano o fin). */
  cortar() {
    if (this.ventana.length > 1) {
      let recorrido = 0
      for (let i = 1; i < this.ventana.length; i++) recorrido += Math.hypot(this.ventana[i].x - this.ventana[i - 1].x, this.ventana[i].y - this.ventana[i - 1].y)
      if (recorrido >= RECORRIDO_MIN) this.segmentos.push(this.ventana)
    }
    this.ventana = []
  }

  get fpsMedio(): number {
    return this.nFps ? this.sumaFps / this.nFps : 0
  }

  suavidad(): number | null {
    this.cortar()
    return suavidadSesion(this.segmentos)
  }

  /** Entrada para metrics/sesion.ts::agregarSesion y para ModuloJuego.resumen. */
  entrada(eventos: EventoSesion[], duracionS: number, meta: number): EntradaAgregados {
    return {
      eventos,
      aperturaMaxCm: this.aperturaMaxCm,
      flexionMax: { ...this.flexionMax },
      suavidad: this.suavidad(),
      cuadrosConMano: this.cuadrosConMano,
      cuadrosTotales: this.cuadros,
      duracionS,
      fpsMedio: this.fpsMedio,
      metaAgarres: meta,
    }
  }
}
