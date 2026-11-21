// Grabación de landmarks a JSON (nunca video) y su reproducción determinista. Puro, sin DOM.
//
// Formato en disco (compacto): { formato: 'manoviva-landmarks', version: 1, creada, ancho, alto, origen,
//   cuadros: [{ t, m: [{ l: 'd'|'i', c, p: [63 números image], w: [63 números world] }] }] }
// t = ms desde el primer cuadro. Solo números: no hay lugar para imágenes.
//
// Reproducción: cuadroEnGrabacion(g, tMs) devuelve el último cuadro con t ≤ tMs (muestreo y retención, sin
// interpolar), así dos reproducciones con los mismos tiempos dan exactamente lo mismo.

import type { CuadroManos, LadoMano, ManoSeguida, P3, TipoFuente } from './tipos'

export const FORMATO_GRABACION = 'manoviva-landmarks'
const DECIMALES = 5

export interface Grabacion {
  formato: typeof FORMATO_GRABACION
  version: 1
  creada: string
  ancho: number
  alto: number
  origen: TipoFuente
  cuadros: CuadroManos[]
}

interface ManoCompacta {
  l: 'd' | 'i'
  c: number
  p: number[]
  w: number[]
}
interface GrabacionCompacta extends Omit<Grabacion, 'cuadros'> {
  cuadros: { t: number; m: ManoCompacta[] }[]
}

const red = (v: number) => {
  const k = 10 ** DECIMALES
  return Math.round(v * k) / k
}
const aplanar = (pts: P3[]) => pts.flatMap((p) => [red(p.x), red(p.y), red(p.z)])
function desplegar(v: number[]): P3[] {
  if (!Array.isArray(v) || v.length !== 63 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error('grabación inválida: cada mano debe tener 21 puntos × 3 números')
  }
  const out: P3[] = []
  for (let i = 0; i < 63; i += 3) out.push({ x: v[i], y: v[i + 1], z: v[i + 2] })
  return out
}

/** Graba cuadros (solo landmarks). t se guarda relativo al primer cuadro. */
export class GrabadorLandmarks {
  private cuadros: CuadroManos[] = []
  private t0: number | null = null
  private ancho = 640
  private alto = 480
  private origen: TipoFuente
  /** Máximo de cuadros (≈ 10 min a 30 fps) para no llenar la memoria. */
  private maximo: number
  constructor(origen: TipoFuente = 'camara', maximo = 18_000) {
    this.origen = origen
    this.maximo = maximo
  }

  agregar(c: CuadroManos) {
    if (this.cuadros.length >= this.maximo) return
    if (this.t0 == null) this.t0 = c.t
    this.ancho = c.ancho
    this.alto = c.alto
    this.cuadros.push({
      t: Math.round(c.t - this.t0),
      ancho: c.ancho,
      alto: c.alto,
      // Se copian solo los campos de la mano: nada más entra a la grabación.
      manos: c.manos.map((m) => ({
        lado: m.lado,
        confianza: m.confianza,
        landmarks: m.landmarks.map(({ x, y, z }) => ({ x, y, z })),
        worldLandmarks: m.worldLandmarks.map(({ x, y, z }) => ({ x, y, z })),
      })),
    })
  }

  get cantidad() {
    return this.cuadros.length
  }

  grabacion(creada = new Date().toISOString()): Grabacion {
    return { formato: FORMATO_GRABACION, version: 1, creada, ancho: this.ancho, alto: this.alto, origen: this.origen, cuadros: [...this.cuadros] }
  }

  json(creada?: string): string {
    return serializarGrabacion(this.grabacion(creada))
  }

  reiniciar() {
    this.cuadros = []
    this.t0 = null
  }
}

export function serializarGrabacion(g: Grabacion): string {
  const compacta: GrabacionCompacta = {
    ...g,
    cuadros: g.cuadros.map((c) => ({
      t: c.t,
      m: c.manos.map((m) => ({ l: m.lado === 'derecha' ? 'd' : 'i', c: red(m.confianza), p: aplanar(m.landmarks), w: aplanar(m.worldLandmarks) })),
    })),
  }
  return JSON.stringify(compacta)
}

export function leerGrabacion(texto: string | unknown): Grabacion {
  const d = (typeof texto === 'string' ? JSON.parse(texto) : texto) as GrabacionCompacta
  if (!d || d.formato !== FORMATO_GRABACION || d.version !== 1 || !Array.isArray(d.cuadros)) {
    throw new Error('grabación inválida: formato desconocido')
  }
  const ancho = Number(d.ancho) || 640
  const alto = Number(d.alto) || 480
  let tPrev = -Infinity
  const cuadros: CuadroManos[] = d.cuadros.map((c) => {
    const t = Number(c.t)
    if (!Number.isFinite(t) || t < tPrev) throw new Error('grabación inválida: tiempos desordenados')
    tPrev = t
    const manos: ManoSeguida[] = (c.m ?? []).map((m) => ({
      lado: (m.l === 'i' ? 'izquierda' : 'derecha') as LadoMano,
      confianza: Number(m.c) || 0,
      landmarks: desplegar(m.p),
      worldLandmarks: desplegar(m.w),
    }))
    return { t, manos, ancho, alto }
  })
  return { formato: FORMATO_GRABACION, version: 1, creada: String(d.creada ?? ''), ancho, alto, origen: d.origen ?? 'camara', cuadros }
}

export function duracionGrabacion(g: Grabacion): number {
  return g.cuadros.length ? g.cuadros[g.cuadros.length - 1].t : 0
}

/** Índice del último cuadro con t ≤ tMs (−1 si tMs es anterior al primero). Búsqueda binaria. */
export function indiceEn(g: Grabacion, tMs: number): number {
  let lo = 0
  let hi = g.cuadros.length - 1
  let r = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (g.cuadros[mid].t <= tMs) {
      r = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return r
}

/** Cuadro vigente en tMs (ms desde el inicio de la reproducción). Con bucle, se repite al terminar. */
export function cuadroEnGrabacion(g: Grabacion, tMs: number, bucle = true): CuadroManos | null {
  if (g.cuadros.length === 0) return null
  const dur = duracionGrabacion(g)
  // Con bucle, la vuelta dura un intervalo medio extra para que el último cuadro también se vea.
  const periodo = dur + (g.cuadros.length > 1 ? dur / (g.cuadros.length - 1) : 1)
  const t = bucle ? ((tMs % periodo) + periodo) % periodo : tMs
  const i = indiceEn(g, t)
  return i < 0 ? null : g.cuadros[i]
}
