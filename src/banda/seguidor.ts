// Seguidor de la banda cuadro a cuadro: suavizado, huecos breves, reposo (automático, pedido o corregido) y
// repeticiones. Puro y sin DOM: la pantalla le pasa el largo de cada cuadro, y las pruebas (o una grabación real) pasan
// por exactamente la misma lógica.
import { cargaEn, type CurvaBanda } from './curva'
import {
  CapturaReposo,
  ContadorReps,
  MS_REPOSO,
  MS_REPOSO_AUTO,
  MS_SOSPECHA_REPOSO,
  ToleranciaPerdida,
  estiramiento,
  reposoMalMarcado,
} from './medicion'
import { FiltroOneEuro } from '../tracking/oneEuro'

/**
 * Tras una repetición, si la banda cae al menos esta fracción del recorrido desde el pico y queda quieta, ese largo es el
 * nuevo reposo aunque sea más largo que el anterior. Prueba real (21-nov-2026): el reposo entre repeticiones crecía de
 * 20 a 23,5 cm (la banda resbala en el puño o las manos no vuelven del todo) y, con el cero fijo, se leían hasta 2 kg sin
 * fuerza. Un estiramiento sostenido a propósito no cae desde el pico, así que no se confunde con reposo.
 */
export const CAIDA_REPOSO = 0.5
/** Hasta este estiramiento (respecto del reposo anterior) un largo quieto puede pasar a ser el nuevo reposo. */
export const SEGUIR_REPOSO_MAX = 0.35
/**
 * Quietud que basta tras caer desde el pico para tomarlo como reposo (ms). Es más corta que la del cero automático
 * porque la caída ya descarta un estiramiento sostenido; con 2,5 s, en la grabación real se veía ~1 kg varios segundos
 * después de volver.
 */
export const MS_SEGUIR_REPOSO = 1000

/**
 * Si se pierde la mano a mitad de una repetición, la repetición espera hasta este tiempo a que vuelva antes de cerrarse.
 * Con ruido de imagen MediaPipe a veces pierde una mano más de medio segundo; cerrarla ahí partía una repetición en dos
 * (prueba con video: picos de 0,9 y 2,4 kg donde había uno de 3,0).
 */
export const MS_CORTE_REPETICION = 2000

export type EventoReposo = 'marcado' | 'pedido' | 'bajado' | 'seguido'

export interface PasoSeguidor {
  /** 'hueco': una mano no se vio unos cuadros y se ignoró el cuadro; 'perdida': se cortó todo. */
  estado: 'medida' | 'hueco' | 'perdida'
  /** Largo suavizado, cm (null sin medida). */
  largoCm: number | null
  /** Estiramiento (null sin reposo o mientras se marca). */
  e: number | null
  kg: number | null
  progresoReposo: number
  reposoCm: number | null
  /** Qué pasó con el reposo en este cuadro, si algo. */
  evento: EventoReposo | null
  /** La banda lleva rato «estirada» y quieta sin haber caído: quizá el cero quedó mal. */
  sospecha: boolean
}

export interface OpcionesSeguidor {
  /**
   * ¿Bajar el reposo solo si la banda queda quieta más corta? (por defecto sí, como en el laboratorio). En un juego se
   * apaga: entre repeticiones la persona junta las manos con la banda suelta, y ese largo tomado como reposo infla
   * todo lo que sigue (prueba real de la Honda, 22-nov-2026: se leyeron 14 kg). Ahí el reposo solo baja con el botón.
   */
  bajarSolo?: boolean
  /**
   * Hasta qué estiramiento un largo quieto puede pasar a ser el reposo (por defecto SEGUIR_REPOSO_MAX). Un juego que
   * pide SOSTENER un estiramiento lo pone bajo ese estiramiento, para que el sostén no se tome por reposo nuevo.
   */
  seguirMax?: number
  /**
   * Quietud que marca el primer reposo: tiempo (por defecto MS_REPOSO_AUTO) y variación tolerada (por defecto
   * VARIACION_REPOSO). Con la banda real en las manos el largo «quieto» oscila cerca de ±5 % (grabación del
   * 21-nov-2026: con 6 % de tolerancia el cero tardó 7 s con las manos ya quietas).
   */
  msCero?: number
  variacionCero?: number
  /**
   * Fracción del recorrido desde el pico que debe caer la banda para que un largo quieto sea reposo nuevo (por defecto
   * CAIDA_REPOSO). Un juego que ya protege su zona de sostén con `seguirMax` puede pedir menos: si el cero quedó con la
   * banda colgando, volver al reposo real es una caída parcial.
   */
  caida?: number
}

export class SeguidorBanda {
  readonly contador = new ContadorReps()
  reposoCm: number | null = null
  private readonly bajarSolo: boolean
  /** El último reposo marcado a propósito (el primero o «Poner en cero»): con `bajarSolo` apagado, es el piso. */
  private piso: number | null = null
  private readonly seguirMax: number
  private readonly caida: number
  private pedido = false
  private readonly filtro = new FiltroOneEuro(1.2, 0.05)
  private readonly perdida = new ToleranciaPerdida()
  private readonly captura: CapturaReposo
  private readonly capturaPedida = new CapturaReposo(MS_REPOSO)
  private readonly vigia = new CapturaReposo(MS_REPOSO_AUTO)
  private readonly vigiaCaida = new CapturaReposo(MS_SEGUIR_REPOSO)
  private readonly quietaEstirada = new CapturaReposo(MS_SOSPECHA_REPOSO)
  private picoLargo: number | null = null
  private sospecha = false
  private ultimaMedida: number | null = null

  constructor(o: OpcionesSeguidor = {}) {
    this.bajarSolo = o.bajarSolo ?? true
    this.seguirMax = o.seguirMax ?? SEGUIR_REPOSO_MAX
    this.caida = o.caida ?? CAIDA_REPOSO
    this.captura = new CapturaReposo(o.msCero ?? MS_REPOSO_AUTO, o.variacionCero)
  }

  /** «Poner en cero»: el próximo tramo quieto (0,4 s) pasa a ser el reposo. */
  pedirCero() {
    this.pedido = true
    this.capturaPedida.cortar()
  }

  cancelarCero() {
    this.pedido = false
    this.capturaPedida.cortar()
  }

  /**
   * Hubo un corte en los cuadros (el juego estuvo en pausa): las ventanas de quietud y el suavizado parten de nuevo,
   * para que dos muestras a ambos lados de la pausa no cuenten como «quieta todo ese tiempo».
   */
  interrumpir() {
    this.filtro.reiniciar()
    this.captura.cortar()
    this.capturaPedida.cortar()
    this.vigia.cortar()
    this.vigiaCaida.cortar()
    this.quietaEstirada.cortar()
  }

  get capturando(): boolean {
    return this.pedido
  }

  private fijar(cm: number) {
    this.reposoCm = cm
    this.pedido = false
    this.captura.cortar()
    this.capturaPedida.cortar()
    this.vigia.cortar()
    this.vigiaCaida.cortar()
    this.quietaEstirada.cortar()
    this.sospecha = false
    this.picoLargo = null
  }

  paso(t: number, largoCrudo: number | null, curva: Pick<CurvaBanda, 'puntos'>): PasoSeguidor {
    const estado = this.perdida.cuadro(t, largoCrudo != null)
    const base = { estado, largoCm: null, e: null, kg: null, progresoReposo: 0, reposoCm: this.reposoCm, evento: null, sospecha: this.sospecha } as PasoSeguidor
    if (estado === 'hueco') return base
    if (largoCrudo == null) {
      this.filtro.reiniciar()
      this.captura.cortar()
      this.capturaPedida.cortar()
      this.vigia.cortar()
      this.vigiaCaida.cortar()
      this.quietaEstirada.cortar()
      // La repetición en curso espera a que vuelva la mano; solo se cierra si la pérdida dura más.
      if (this.ultimaMedida == null || t - this.ultimaMedida > MS_CORTE_REPETICION) {
        this.contador.cortar()
        this.picoLargo = null
      }
      return base
    }
    this.ultimaMedida = t
    const largo = this.filtro.filtrar(largoCrudo, t)
    const salida: PasoSeguidor = { ...base, largoCm: largo }

    // Marcar el reposo: la primera vez, solo, con la banda quieta; o al pedirlo con el botón.
    if (this.pedido || this.reposoCm == null) {
      const c = this.pedido ? this.capturaPedida : this.captura
      const reposo = c.agregar(t, largo)
      salida.progresoReposo = c.progreso(t)
      if (reposo != null) {
        const primero = this.reposoCm == null
        // Las repeticiones se cuentan desde el primer reposo; «Poner en cero» a mitad de serie no las borra.
        if (primero) this.contador.reiniciar()
        this.fijar(reposo)
        this.piso = reposo
        salida.evento = primero ? 'marcado' : 'pedido'
        salida.reposoCm = reposo
      }
      return salida
    }

    const reposo = this.reposoCm
    const estable = this.vigia.agregar(t, largo)
    const estableCorto = this.vigiaCaida.agregar(t, largo)
    const dentro = (cm: number) => cm > reposo && cm <= reposo * (1 + this.seguirMax)
    const cayo = (cm: number) => this.picoLargo != null && this.picoLargo - cm >= this.caida * (this.picoLargo - reposo)
    const masCorta = estable != null && !this.contador.estirando && reposoMalMarcado(reposo, estable)
    if (masCorta && this.bajarSolo) {
      // Quieta y más corta que el reposo: se había marcado estirada.
      this.fijar(estable!)
      this.piso = Math.min(this.piso ?? estable!, estable!)
      salida.evento = 'bajado'
    } else if (masCorta && this.piso != null && reposo > this.piso * 1.001) {
      // Sin `bajarSolo`: el reposo que subió siguiendo a la banda puede volver a bajar, pero nunca bajo el último cero
      // marcado a propósito (juntar las manos con la banda suelta no lo baja más que eso).
      this.fijar(Math.max(estable!, this.piso))
      salida.evento = 'bajado'
    } else if (estableCorto != null && this.contador.estirando && dentro(estableCorto) && cayo(estableCorto)) {
      // Tras una repetición volvió y quedó quieta un poco más larga que antes (la banda resbaló en el puño o las manos no
      // volvieron del todo): ese es el reposo ahora.
      this.contador.cortar()
      this.fijar(estableCorto)
      salida.evento = 'seguido'
    } else if (estable != null && !this.contador.estirando && dentro(estable) && estiramiento(estable, reposo) > 0) {
      // Quieta, sin repetición en curso y apenas sobre la zona muerta: el reposo se corrió un poco.
      this.fijar(estable)
      salida.evento = 'seguido'
    }
    if (salida.evento) {
      salida.reposoCm = this.reposoCm
      salida.e = 0
      salida.kg = 0
      return salida
    }

    this.contador.agregar(t, largo, reposo, curva)
    this.picoLargo = this.contador.estirando ? Math.max(this.picoLargo ?? largo, largo) : null
    const e = estiramiento(largo, reposo)
    salida.e = e
    salida.kg = cargaEn(curva, e).kg
    if (e > 0) this.sospecha = this.quietaEstirada.agregar(t, largo) != null
    else {
      this.quietaEstirada.cortar()
      this.sospecha = false
    }
    salida.sospecha = this.sospecha
    return salida
  }
}
