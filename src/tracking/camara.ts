// Fuente `camara`: cámara frontal + MediaPipe HandLandmarker (VIDEO, 2 manos, GPU con respaldo CPU).
// MediaPipe se importa de forma diferida (no entra al bundle principal). Modelo y wasm se sirven desde
// public/mediapipe/ (sin CDN). Se procesa solo el cuadro más reciente del video.
//
// Privacidad: el video vive solo en memoria del navegador para detectar y mostrarse en pantalla. Nunca se
// guarda ni se envía: lo único que sale de aquí son landmarks. La luminancia se calcula sobre un lienzo de
// 32×24 que se descarta en cada muestra.

import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { luminanciaMedia } from '../metrics/geometria'
import { masCercanas } from './cercanas'
import { FuenteBase } from './fuenteBase'
import { FiltroMano } from './oneEuro'
import type { CuadroManos, LadoMano, ManoSeguida, TipoFuente } from './tipos'

const BASE = import.meta.env.BASE_URL ?? '/'
export const RUTA_MODELO = `${BASE}mediapipe/hand_landmarker.task`
export const RUTA_WASM = `${BASE}mediapipe/wasm`
/** Con GPU, si tras MS_PRUEBA_GPU (y ≥ 3 cuadros) va bajo FPS_MIN_GPU, se cambia a CPU. */
const MS_PRUEBA_GPU = 2500
const FPS_MIN_GPU = 8
/** Cada cuánto se muestrea la luz (ms). */
const MS_LUZ = 500

/**
 * MediaPipe Tasks envía telemetría de uso (POST https://odml.pa.googleapis.com/v1/log) cada minuto y al cerrar.
 * No lleva imágenes, pero la app promete no enviar nada fuera de Supabase: se corta en el navegador
 * respondiendo 204 sin salir a la red. Se instala una sola vez, antes de cargar MediaPipe.
 */
export function esTelemetriaMediapipe(url: string): boolean {
  try {
    const u = new URL(url, 'http://localhost')
    return u.hostname === 'odml.pa.googleapis.com' || (u.hostname.endsWith('.googleapis.com') && u.pathname.endsWith('/log'))
  } catch {
    return false
  }
}

let telemetriaBloqueada = false
export function bloquearTelemetriaMediapipe() {
  if (telemetriaBloqueada || typeof window === 'undefined') return
  telemetriaBloqueada = true
  const original = window.fetch.bind(window)
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    if (esTelemetriaMediapipe(url)) return Promise.resolve(new Response(null, { status: 204 }))
    return original(entrada, init)
  }
}

export interface OpcionesCamara {
  /** Fuerza el delegado de MediaPipe (por defecto GPU con respaldo CPU). */
  delegado?: 'GPU' | 'CPU' | null
  /** Invierte izquierda/derecha de MediaPipe (pendiente de verificar en teléfono real). */
  invertirLateralidad?: boolean
  /** Suavizado One Euro de los puntos (por defecto sí). */
  suavizar?: boolean
  /**
   * Cuántas manos entregar: las más cercanas (más grandes en la imagen). 2 en los juegos (por defecto), 1 en la
   * calibración. MediaPipe detecta hasta MANOS_DETECTADAS para no perder la propia por una mano del fondo.
   */
  maxManos?: number
}

/** Manos que busca MediaPipe en cada cuadro antes de elegir las más cercanas. */
export const MANOS_DETECTADAS = 4

/** Etiqueta de MediaPipe ('Left'/'Right', mano del sujeto) → lado. */
export function ladoDesdeEtiqueta(etiqueta: string | undefined, invertir = false): LadoMano {
  const derecha = (etiqueta ?? '').toLowerCase().startsWith('r')
  return derecha !== invertir ? 'derecha' : 'izquierda'
}

/** Todas las manos del resultado de MediaPipe, sin elegir (pueden venir dos del mismo lado). */
export function todasDesdeResultado(r: HandLandmarkerResult, invertir = false): ManoSeguida[] {
  const etiquetas = r.handedness ?? r.handednesses ?? []
  return r.landmarks.map((lm, i) => {
    const cat = etiquetas[i]?.[0]
    return {
      lado: ladoDesdeEtiqueta(cat?.categoryName, invertir),
      confianza: cat?.score ?? 0,
      landmarks: lm.map(({ x, y, z }) => ({ x, y, z })),
      worldLandmarks: (r.worldLandmarks[i] ?? []).map(({ x, y, z }) => ({ x, y, z })),
    }
  })
}

/** Una mano por lado, la de mayor confianza (sin mirar la cercanía; la cámara usa masCercanas). */
export function manosDesdeResultado(r: HandLandmarkerResult, invertir = false): ManoSeguida[] {
  const porLado = new Map<LadoMano, ManoSeguida>()
  for (const mano of todasDesdeResultado(r, invertir)) {
    const previa = porLado.get(mano.lado)
    if (!previa || previa.confianza < mano.confianza) porLado.set(mano.lado, mano)
  }
  return [...porLado.values()]
}

function estadoDesdeError(e: unknown): 'sin permiso' | 'sin camara' | 'error' {
  const nombre = (e as { name?: string })?.name ?? ''
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError' || nombre === 'PermissionDeniedError') return 'sin permiso'
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError' || nombre === 'OverconstrainedError') return 'sin camara'
  return 'error'
}

export class FuenteCamara extends FuenteBase {
  readonly tipo: TipoFuente = 'camara'
  /** 'GPU' o 'CPU' según lo que se pudo crear. */
  delegado: 'GPU' | 'CPU' | null = null
  private opciones: Required<OpcionesCamara>
  private detector: HandLandmarker | null = null
  private flujo: MediaStream | null = null
  private activo = false
  private ultimoTiempoVideo = -1
  private ultimoTs = 0
  private ultimaLuz = 0
  private lienzo: HTMLCanvasElement | null = null
  private filtros = new Map<LadoMano, { image: FiltroMano; world: FiltroMano }>()
  private cancelarBucle: (() => void) | null = null
  private cuadrosGpu = 0
  private inicioGpu = 0
  private cambiandoDelegado = false

  constructor(opciones: OpcionesCamara = {}) {
    super()
    this.opciones = { invertirLateralidad: false, suavizar: true, delegado: null, maxManos: 2, ...opciones }
  }

  async iniciar() {
    this.detener()
    this.reiniciarBase()
    this.activo = true
    this.cuadrosGpu = 0
    this.cambiandoDelegado = false
    this.fijarEstado('iniciando')
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fijarEstado('sin camara', window.isSecureContext ? 'el navegador no permite usar la cámara' : 'la cámara necesita https')
      return
    }
    const video = document.createElement('video')
    video.playsInline = true
    video.muted = true
    video.autoplay = true
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')
    this.video = video
    try {
      const [flujo, detector] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        }),
        this.crearDetector(),
      ])
      if (!this.activo) {
        flujo.getTracks().forEach((t) => t.stop())
        detector.close()
        return
      }
      this.flujo = flujo
      this.detector = detector
      video.srcObject = flujo
      await video.play().catch(() => undefined)
      this.fijarEstado('buscando')
      this.bucle()
    } catch (e) {
      const estado = estadoDesdeError(e)
      this.detener()
      this.fijarEstado(estado, (e as Error)?.message ?? String(e))
    }
  }

  detener() {
    this.activo = false
    this.cancelarBucle?.()
    this.cancelarBucle = null
    this.flujo?.getTracks().forEach((t) => t.stop())
    this.flujo = null
    if (this.video) this.video.srcObject = null
    this.detector?.close()
    this.detector = null
    this.filtros.clear()
  }

  private async crearDetector(forzar: 'GPU' | 'CPU' | null = this.opciones.delegado): Promise<HandLandmarker> {
    bloquearTelemetriaMediapipe()
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const archivos = await FilesetResolver.forVisionTasks(RUTA_WASM)
    const crear = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: RUTA_MODELO, delegate },
        runningMode: 'VIDEO',
        numHands: MANOS_DETECTADAS,
      })
    if (forzar === 'CPU') {
      this.delegado = 'CPU'
      return crear('CPU')
    }
    try {
      const d = await crear('GPU')
      this.delegado = 'GPU'
      return d
    } catch {
      const d = await crear('CPU')
      this.delegado = 'CPU'
      return d
    }
  }

  private bucle() {
    const video = this.video
    if (!video) return
    const conRvfc = typeof video.requestVideoFrameCallback === 'function'
    let id = 0
    const tick = () => {
      if (!this.activo) return
      this.procesar()
      id = conRvfc ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
    }
    id = conRvfc ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
    this.cancelarBucle = () => (conRvfc ? video.cancelVideoFrameCallback(id) : cancelAnimationFrame(id))
  }

  /** Detecta sobre el cuadro más reciente; si el video no avanzó, no hace nada. */
  private procesar() {
    const video = this.video
    const detector = this.detector
    if (!video || !detector || video.readyState < 2 || video.videoWidth === 0) return
    if (video.currentTime === this.ultimoTiempoVideo) return
    this.ultimoTiempoVideo = video.currentTime
    const ahora = performance.now()
    const ts = Math.max(ahora, this.ultimoTs + 1)
    this.ultimoTs = ts
    let r: HandLandmarkerResult
    try {
      r = detector.detectForVideo(video, ts)
    } catch (e) {
      this.fijarEstado('error', (e as Error)?.message ?? String(e))
      return
    }
    // las más cercanas (más grandes en la imagen): una mano del fondo no le quita el lugar a la propia
    let manos = masCercanas(todasDesdeResultado(r, this.opciones.invertirLateralidad), this.opciones.maxManos, video.videoWidth, video.videoHeight, this.ultimo?.manos)
    if (this.opciones.suavizar) manos = this.suavizar(manos, ts)
    if (ahora - this.ultimaLuz > MS_LUZ) {
      this.ultimaLuz = ahora
      this.luminancia = this.medirLuz(video)
    }
    const c: CuadroManos = { t: ts, manos, ancho: video.videoWidth, alto: video.videoHeight }
    this.publicar(c)
    this.revisarDelegado()
  }

  /**
   * Si con GPU va muy lento (p. ej. GPU por software, como Chromium sin GPU), se pasa una vez a CPU.
   * Se mide en los primeros MS_PRUEBA_GPU ms; el cambio no interrumpe el video.
   */
  private revisarDelegado() {
    if (this.delegado !== 'GPU' || this.opciones.delegado || this.cambiandoDelegado) return
    if (++this.cuadrosGpu === 1) this.inicioGpu = performance.now()
    if (this.cuadrosGpu < 3 || performance.now() - this.inicioGpu < MS_PRUEBA_GPU) return
    if (this.fps >= FPS_MIN_GPU) {
      this.cambiandoDelegado = true // va bien: no se vuelve a revisar
      return
    }
    this.cambiandoDelegado = true
    void this.crearDetector('CPU')
      .then((d) => {
        if (!this.activo) return d.close()
        this.detector?.close()
        this.detector = d
        this.reiniciarFps()
      })
      .catch(() => undefined)
  }

  private suavizar(manos: ManoSeguida[], t: number): ManoSeguida[] {
    for (const lado of [...this.filtros.keys()]) if (!manos.some((m) => m.lado === lado)) this.filtros.delete(lado)
    return manos.map((m) => {
      let f = this.filtros.get(m.lado)
      if (!f) {
        f = { image: new FiltroMano(1.0, 10), world: new FiltroMano(1.0, 15) }
        this.filtros.set(m.lado, f)
      }
      return { ...m, landmarks: f.image.filtrar(m.landmarks, t), worldLandmarks: f.world.filtrar(m.worldLandmarks, t) }
    })
  }

  private medirLuz(video: HTMLVideoElement): number | null {
    try {
      this.lienzo ??= Object.assign(document.createElement('canvas'), { width: 32, height: 24 })
      const ctx = this.lienzo.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, 32, 24)
      const lum = luminanciaMedia(ctx.getImageData(0, 0, 32, 24).data, 1)
      ctx.clearRect(0, 0, 32, 24)
      return lum
    } catch {
      return null
    }
  }
}
