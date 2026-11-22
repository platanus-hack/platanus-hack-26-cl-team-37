// Medidas comunes a todos los juegos (puras, con pruebas en shell.test.ts):
// - medirMano: apertura de pinza en cm (worldLandmarks × escala de la calibración), apertura normalizada,
//   apertura con el rango abrir/cerrar de la calibración, flexión por dedo y muñeca en la imagen.
// - AcumuladorBase: lo que la base junta durante la sesión para los agregados (calidad del registro, apertura y
//   flexión máximas sostenidas (MaximoSostenido), suavidad de la muñeca por ventanas, fps medio de seguimiento).
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

/** Un máximo de sesión solo sube con un valor que se mantuvo al menos este tiempo (ms de juego). */
export const SOSTENIDO_MS = 120

/**
 * Máximo «sostenido»: el mayor valor que la medida mantuvo durante SOSTENIDO_MS seguidos (el mínimo de cada tramo de esa
 * duración). Un salto del seguimiento que dura uno o dos cuadros ya no fija el récord de la sesión, que es lo que después
 * se compara entre sesiones como «mejor». Un máximo real, que la mano mantiene, se registra casi igual que antes.
 */
export class MaximoSostenido {
  valor = 0
  private cola: { t: number; v: number }[] = []

  agregar(t: number, v: number) {
    if (!Number.isFinite(v)) return
    const ultimo = this.cola[this.cola.length - 1]
    if (ultimo && t < ultimo.t) this.cola = []
    this.cola.push({ t, v })
    // Se conserva lo justo para cubrir SOSTENIDO_MS hacia atrás desde este cuadro.
    while (this.cola.length > 1 && t - this.cola[1].t >= SOSTENIDO_MS) this.cola.shift()
    if (t - this.cola[0].t < SOSTENIDO_MS) return
    let minimo = Infinity
    for (const c of this.cola) if (c.v < minimo) minimo = c.v
    if (minimo > this.valor) this.valor = minimo
  }

  /** La mano se perdió o el juego se pausó: el tramo siguiente empieza de cero. */
  cortar() {
    this.cola = []
  }
}

const DEDOS = ['pulgar', 'indice', 'medio', 'anular', 'menique'] as const

export class AcumuladorBase {
  cuadros = 0
  cuadrosConMano = 0
  private maxApertura = new MaximoSostenido()
  private maxFlexion = { pulgar: new MaximoSostenido(), indice: new MaximoSostenido(), medio: new MaximoSostenido(), anular: new MaximoSostenido(), menique: new MaximoSostenido() }
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
    this.maxApertura.agregar(t, m.aperturaPinzaCm)
    for (const k of DEDOS) this.maxFlexion[k].agregar(t, m.flexion[k])
    const ultimo = this.ventana[this.ventana.length - 1]
    if (ultimo && t <= ultimo.t) return
    this.ventana.push({ t, x: m.muneca.x, y: m.muneca.y })
    if (this.ventana.length > 1 && t - this.ventana[0].t >= VENTANA_SUAVIDAD_MS) this.cerrarVentana()
  }

  /** Pausa o pérdida de la mano: cierra la ventana de trayectoria y corta los máximos sostenidos. */
  cortar() {
    this.cerrarVentana()
    this.maxApertura.cortar()
    for (const k of DEDOS) this.maxFlexion[k].cortar()
  }

  /** Cierra la ventana de trayectoria actual (cada VENTANA_SUAVIDAD_MS, en cada corte y al final). */
  private cerrarVentana() {
    if (this.ventana.length > 1) {
      let recorrido = 0
      for (let i = 1; i < this.ventana.length; i++) recorrido += Math.hypot(this.ventana[i].x - this.ventana[i - 1].x, this.ventana[i].y - this.ventana[i - 1].y)
      if (recorrido >= RECORRIDO_MIN) this.segmentos.push(this.ventana)
    }
    this.ventana = []
  }

  /** Apertura máxima de pinza sostenida (cm, estimación de cámara). */
  get aperturaMaxCm(): number {
    return this.maxApertura.valor
  }

  /** Flexión máxima sostenida por dedo (grados, estimación de cámara). */
  get flexionMax(): FlexionDedos {
    const f = flexCero()
    for (const k of DEDOS) f[k] = this.maxFlexion[k].valor
    return f
  }

  get fpsMedio(): number {
    return this.nFps ? this.sumaFps / this.nFps : 0
  }

  suavidad(): number | null {
    this.cerrarVentana()
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
