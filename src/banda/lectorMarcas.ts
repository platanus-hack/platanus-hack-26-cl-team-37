// Lee las marcas pintadas en el cuadro actual del video (con DOM). La lógica está en marcas.ts, con pruebas.
// El cuadro se dibuja reducido en un lienzo que no se muestra ni se envía; se descarta en el cuadro siguiente.
import { colorEn, elegirPar, manchas, type Hsv } from './marcas'

/** Ancho de la imagen reducida donde se buscan las marcas (px). */
const ANCHO = 320
/** Una marca no puede saltar más que esta fracción del ancho entre dos cuadros (si no, es otra mancha). */
const SALTO_MAX = 0.2

export interface LecturaMarcas {
  /** Centros de las dos marcas en coordenadas normalizadas de la imagen cruda (sin espejo). */
  a: { x: number; y: number }
  b: { x: number; y: number }
  /** Distancia entre las marcas en píxeles del video a resolución completa. */
  distanciaPx: number
}

export class LectorMarcas {
  private lienzo = document.createElement('canvas')
  private previas: [{ x: number; y: number }, { x: number; y: number }] | null = null

  private cuadro(video: HTMLVideoElement): { datos: Uint8ClampedArray; ancho: number; alto: number } | null {
    if (!video.videoWidth || !video.videoHeight) return null
    const ancho = ANCHO
    const alto = Math.round((ANCHO * video.videoHeight) / video.videoWidth)
    if (this.lienzo.width !== ancho || this.lienzo.height !== alto) {
      this.lienzo.width = ancho
      this.lienzo.height = alto
    }
    const g = this.lienzo.getContext('2d', { willReadFrequently: true })
    if (!g) return null
    g.drawImage(video, 0, 0, ancho, alto)
    return { datos: g.getImageData(0, 0, ancho, alto).data, ancho, alto }
  }

  leer(video: HTMLVideoElement, color: Hsv): LecturaMarcas | null {
    const c = this.cuadro(video)
    if (!c) return null
    const par = elegirPar(manchas(c.datos, c.ancho, c.alto, color), this.previas, SALTO_MAX * c.ancho)
    if (!par) {
      this.previas = null
      return null
    }
    this.previas = [par[0], par[1]]
    const k = video.videoWidth / c.ancho
    return {
      a: { x: par[0].x / c.ancho, y: par[0].y / c.alto },
      b: { x: par[1].x / c.ancho, y: par[1].y / c.alto },
      distanciaPx: Math.hypot(par[0].x - par[1].x, par[0].y - par[1].y) * k,
    }
  }

  /** Color alrededor de un punto en coordenadas normalizadas de la imagen cruda. */
  colorEn(video: HTMLVideoElement, x: number, y: number): Hsv | null {
    const c = this.cuadro(video)
    return c ? colorEn(c.datos, c.ancho, c.alto, x * c.ancho, y * c.alto, 2) : null
  }

  reiniciar() {
    this.previas = null
  }
}
