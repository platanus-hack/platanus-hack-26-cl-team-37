// Calibración (F08): pasos guiados como máquina de estados pura, línea base y checklist.
// La pantalla (src/screens/sesion/Calibrar.tsx) mide cada cuadro y llama a `avanzarCalibracion`; al llegar a
// 'lista' arma la línea base con `resultadoCalibracion` y la guarda en la Sesion.
//
// Pasos: 1) mano abierta 2 s seguidos · 2) abrir y cerrar 3 veces (cerrada < 0,3 → abierta > 0,8 = 1 vez) ·
// 3) pinza: puntas del pulgar y el índice "suficientemente cerca" (≤ 0,35 × palma o ≤ 3 cm) durante 0,4 s, tolerando
//    cuadros sueltos con ruido (≤ 250 ms). Los puntos 4 y 8 de MediaPipe son el extremo de cada dedo, no la yema que
//    toca: con los dedos juntos quedan a 1,5–3 cm, así que exigir 2 cm fallaba en teléfonos reales (prueba 2026-11-21).
// Solo cuentan los cuadros con la mano entera dentro del marco.

import type { Calibracion, Mano } from '../domain/types'
import type { ManoSeguida } from '../tracking/tipos'
import { escalaPerspectivaDebil } from '../tracking/distancia'
import { aperturaMano, aperturaPinza, clasificarLuz, distancia, escalaCm, largoMano, type NivelLuz } from './geometria'

export type PasoCalibracion = 'abierta' | 'abrir-cerrar' | 'pinza' | 'lista'
export const PASOS: Exclude<PasoCalibracion, 'lista'>[] = ['abierta', 'abrir-cerrar', 'pinza']

export const UMBRALES = {
  /** aperturaMano ≥ esto = mano abierta. */
  abierta: 0.8,
  /** aperturaMano ≤ esto = mano cerrada. */
  cerrada: 0.3,
  msAbierta: 2000,
  repeticiones: 3,
  /** Distancia pulgar–índice (cm) para contar la pinza (puntas, no yemas: juntas quedan a 1,5–3 cm). */
  pinzaCm: 3,
  /** Igual, relativa al largo de la palma (muñeca→nudillo del medio, ~9 cm): no depende de la escala. */
  pinzaRel: 0.35,
  /** Hasta este múltiplo del umbral se muestra "casi". */
  pinzaCasi: 1.8,
  msPinza: 400,
  /** Un cuadro suelto fuera del umbral (ruido) no reinicia la cuenta si dura menos que esto. */
  msToleranciaPinza: 250,
  /** Rango de distancia cámara–mano aceptable (cm, aprox.). */
  distanciaMinCm: 30,
  distanciaMaxCm: 70,
  confianzaMin: 0.7,
} as const

/** Lo que la pantalla mide en un cuadro. */
export interface MuestraCalibracion {
  /** ms (reloj de la fuente). */
  t: number
  /** Hay una mano seguida en el cuadro. */
  mano: boolean
  /** Los 21 puntos están dentro del marco guía. */
  dentro: boolean
  /** aperturaMano 0..~1,2. */
  apertura: number
  /** Distancia pulgar–índice en cm (3D, con la escala del mundo o de la regla). */
  pinzaCm: number
  /** Distancia pulgar–índice / largo de la palma. Opcional: si falta, solo se usa pinzaCm. */
  pinzaRel?: number
  /**
   * Distancia pulgar–índice en el plano de la imagen, en cm (aprox.). Con la palma hacia la cámara el pulgar tapa
   * al índice y MediaPipe estima mal la profundidad: la 3D queda en varios cm aunque los dedos se toquen. La pinza
   * se reconoce si cualquiera de las dos baja del umbral. null si no se pudo calcular.
   */
  pinzaVistaCm?: number | null
  /** Largo muñeca→punta del medio estimado con worldLandmarks (cm, escala MediaPipe). */
  largoCm: number
  confianza: number
  fps: number
}

export interface EstadoCalibracion {
  paso: PasoCalibracion
  /** t desde que la mano está abierta y dentro (paso 1). */
  desdeAbierta: number | null
  repeticiones: number
  cerrada: boolean
  /** t desde que la pinza está cerrada (paso 3). */
  desdePinza: number | null
  /** Último t con la pinza cerrada (para tolerar cuadros con ruido). */
  ultimaPinza: number | null
  /** Avance total 0..1 (para la barra). */
  progreso: number
  // Acumulados para la línea base (solo cuadros con mano dentro del marco).
  n: number
  sumaLargo: number
  sumaConfianza: number
  sumaFps: number
  pinzaMaxCm: number
  aperturaMin: number
  aperturaMax: number
}

export function calibracionInicial(): EstadoCalibracion {
  return {
    paso: 'abierta',
    desdeAbierta: null,
    repeticiones: 0,
    cerrada: false,
    desdePinza: null,
    ultimaPinza: null,
    progreso: 0,
    n: 0,
    sumaLargo: 0,
    sumaConfianza: 0,
    sumaFps: 0,
    pinzaMaxCm: 0,
    aperturaMin: Infinity,
    aperturaMax: -Infinity,
  }
}

const tercio = (i: number, f: number) => (i + Math.min(1, Math.max(0, f))) / PASOS.length

/** Aplica un cuadro. Pura: devuelve un estado nuevo. */
export function avanzarCalibracion(e: EstadoCalibracion, m: MuestraCalibracion): EstadoCalibracion {
  if (e.paso === 'lista') return e
  const s: EstadoCalibracion = { ...e }
  const valida = m.mano && m.dentro
  if (valida) {
    s.n++
    s.sumaLargo += m.largoCm
    s.sumaConfianza += m.confianza
    s.sumaFps += m.fps
    s.pinzaMaxCm = Math.max(s.pinzaMaxCm, m.pinzaCm)
    s.aperturaMin = Math.min(s.aperturaMin, m.apertura)
    s.aperturaMax = Math.max(s.aperturaMax, m.apertura)
  }

  if (s.paso === 'abierta') {
    if (valida && m.apertura >= UMBRALES.abierta) {
      s.desdeAbierta ??= m.t
      const f = (m.t - s.desdeAbierta) / UMBRALES.msAbierta
      if (f >= 1) {
        s.paso = 'abrir-cerrar'
        s.progreso = tercio(1, 0)
      } else s.progreso = tercio(0, f)
    } else {
      s.desdeAbierta = null
      s.progreso = 0
    }
  } else if (s.paso === 'abrir-cerrar') {
    if (valida) {
      if (!s.cerrada && m.apertura <= UMBRALES.cerrada) s.cerrada = true
      else if (s.cerrada && m.apertura >= UMBRALES.abierta) {
        s.cerrada = false
        s.repeticiones++
      }
    }
    if (s.repeticiones >= UMBRALES.repeticiones) {
      s.paso = 'pinza'
      s.progreso = tercio(2, 0)
    } else s.progreso = tercio(1, (s.repeticiones + (s.cerrada ? 0.5 : 0)) / UMBRALES.repeticiones)
  } else if (s.paso === 'pinza') {
    const junta = valida && estadoPinza(m) === 'junta'
    if (junta) {
      s.desdePinza ??= m.t
      s.ultimaPinza = m.t
    } else if (s.ultimaPinza == null || m.t - s.ultimaPinza > UMBRALES.msToleranciaPinza) {
      s.desdePinza = null
      s.ultimaPinza = null
    }
    if (s.desdePinza != null) {
      const f = (m.t - s.desdePinza) / UMBRALES.msPinza
      if (junta && f >= 1) {
        s.paso = 'lista'
        s.progreso = 1
      } else s.progreso = tercio(2, Math.min(f, 0.99))
    } else s.progreso = tercio(2, 0)
  }
  return s
}

/**
 * Modo depuración (?debug=1): qué condición espera el paso actual para avanzar, con su umbral.
 * Sirve para ver en el teléfono si falla el cierre, la apertura, la pinza o el marco.
 */
export function esperaCalibracion(e: Pick<EstadoCalibracion, 'paso' | 'cerrada'>): string {
  const d2 = (n: number) => n.toFixed(2).replace('.', ',')
  if (e.paso === 'abierta') return `apertura ≥ ${d2(UMBRALES.abierta)} por ${UMBRALES.msAbierta / 1000} s`
  if (e.paso === 'abrir-cerrar') return e.cerrada ? `abrir: apertura ≥ ${d2(UMBRALES.abierta)}` : `cerrar: apertura ≤ ${d2(UMBRALES.cerrada)}`
  if (e.paso === 'pinza') return `pinza ≤ ${UMBRALES.pinzaCm} cm o ≤ ${d2(UMBRALES.pinzaRel)} palma por ${String(UMBRALES.msPinza / 1000).replace('.', ',')} s`
  return 'nada (lista)'
}

/** Distancia que se usa para reconocer el gesto de pinza: la menor entre la 3D y la de la imagen. */
export function pinzaGesto(m: Pick<MuestraCalibracion, 'pinzaCm' | 'pinzaVistaCm'>): number {
  return Math.min(m.pinzaCm, m.pinzaVistaCm ?? Infinity)
}

/** Qué tan cerca están las puntas del pulgar y el índice: 'junta' cuenta para el paso 3; 'casi' sirve para guiar. */
export function estadoPinza(m: Pick<MuestraCalibracion, 'pinzaCm' | 'pinzaRel' | 'pinzaVistaCm'>): 'junta' | 'casi' | 'lejos' {
  const rel = m.pinzaRel
  const cm = pinzaGesto(m)
  if (cm <= UMBRALES.pinzaCm || (rel != null && rel <= UMBRALES.pinzaRel)) return 'junta'
  if (cm <= UMBRALES.pinzaCm * UMBRALES.pinzaCasi || (rel != null && rel <= UMBRALES.pinzaRel * UMBRALES.pinzaCasi)) return 'casi'
  return 'lejos'
}

/** Número del paso (1..3) para mostrar "Paso 1 de 3"; 3 cuando está lista. */
export function numeroPaso(p: PasoCalibracion): number {
  return p === 'lista' ? PASOS.length : PASOS.indexOf(p) + 1
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Línea base que se guarda en la Sesion. Con largo medido con regla, la regla manda (y da la escala del mundo);
 * el estimado queda para comparar.
 */
export function resultadoCalibracion(e: EstadoCalibracion, largoReglaCm: number | null): Calibracion {
  const n = Math.max(1, e.n)
  const estimado = e.sumaLargo / n
  const regla = largoReglaCm && largoReglaCm > 0 ? largoReglaCm : null
  return {
    largoManoCm: r1(regla ?? estimado),
    largoManoFuente: regla ? 'regla' : 'estimado',
    largoManoEstimadoCm: r1(estimado),
    aperturaPinzaMaxCm: r1(e.pinzaMaxCm),
    rangoAbrirCerrar: { min: r3(Number.isFinite(e.aperturaMin) ? e.aperturaMin : 0), max: r3(Number.isFinite(e.aperturaMax) ? e.aperturaMax : 0) },
    fps: r1(e.sumaFps / n),
    confianzaMedia: r3(e.sumaConfianza / n),
    escalaCmPorUnidad: r2(regla && estimado > 0 ? (regla / estimado) * 100 : 100),
  }
}

/**
 * Medidas de una mano para la calibración. apertura, pinzaCm y largoCm usan worldLandmarks (no dependen de la
 * distancia). pinzaVistaCm usa los puntos de la imagen y, para pasar a cm, la escala px/m de perspectiva débil
 * (tracking/distancia): necesita el tamaño de la imagen; sin él queda null.
 */
export function medidasMano(
  m: Pick<ManoSeguida, 'worldLandmarks'> & Partial<Pick<ManoSeguida, 'landmarks'>>,
  largoReglaCm: number | null,
  imagen?: { ancho: number; alto: number },
) {
  const largoM = largoMano(m.worldLandmarks)
  const escala = escalaCm(largoM, largoReglaCm)
  let pinzaVistaCm: number | null = null
  if (imagen && m.landmarks && m.landmarks.length >= 21) {
    const pxPorM = escalaPerspectivaDebil(m.landmarks, m.worldLandmarks, imagen.ancho, imagen.alto)
    const a = m.landmarks[4]
    const b = m.landmarks[8]
    if (pxPorM) pinzaVistaCm = (Math.hypot((a.x - b.x) * imagen.ancho, (a.y - b.y) * imagen.alto) / pxPorM) * escala
  }
  const palma = distancia(m.worldLandmarks[0], m.worldLandmarks[9])
  const pinza = aperturaPinza(m.worldLandmarks)
  return {
    apertura: aperturaMano(m.worldLandmarks),
    pinzaCm: pinza * escala,
    pinzaRel: palma > 0 ? pinza / palma : undefined,
    pinzaVistaCm,
    largoCm: largoM * 100,
  }
}

/** Mano a calibrar: la del lado indicado en la sesión si está; si no (o 'ambas'), la de mayor confianza. */
export function elegirMano(manos: ManoSeguida[], mano: Mano): ManoSeguida | null {
  if (manos.length === 0) return null
  const mismoLado = mano === 'ambas' ? [] : manos.filter((m) => m.lado === mano)
  const candidatas = mismoLado.length ? mismoLado : manos
  return candidatas.reduce((a, b) => (b.confianza > a.confianza ? b : a))
}

// ── Checklist en vivo ──────────────────────────────────────────────────────────────────────────────

export type NivelChequeo = 'ok' | 'mal' | 'nada'

export function chequeoLuz(lum: number | null): { nivel: NivelChequeo; luz: NivelLuz | null; texto: string } {
  if (lum == null) return { nivel: 'nada', luz: null, texto: '—' }
  const luz = clasificarLuz(lum)
  return { nivel: luz === 'buena' ? 'ok' : 'mal', luz, texto: luz === 'buena' ? 'Buena' : luz === 'poca' ? 'Poca' : 'Excesiva' }
}

export function chequeoDistancia(cm: number | null): { nivel: NivelChequeo; consejo: string | null } {
  if (cm == null) return { nivel: 'nada', consejo: null }
  if (cm < UMBRALES.distanciaMinCm) return { nivel: 'mal', consejo: 'Aleja un poco la mano' }
  if (cm > UMBRALES.distanciaMaxCm) return { nivel: 'mal', consejo: 'Acerca un poco la mano' }
  return { nivel: 'ok', consejo: null }
}

export function chequeoConfianza(c: number | null): NivelChequeo {
  if (c == null) return 'nada'
  return c >= UMBRALES.confianzaMin ? 'ok' : 'mal'
}

// ── Geometría de la vista ──────────────────────────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  ancho: number
  alto: number
}

/**
 * Pasa un punto normalizado de la imagen cruda a px de la vista, con la imagen en espejo y ajustada como
 * `object-fit: cover` (igual que el <video> de fondo).
 */
export function aVista(p: { x: number; y: number }, img: { ancho: number; alto: number }, vista: { ancho: number; alto: number }) {
  const s = Math.max(vista.ancho / img.ancho, vista.alto / img.alto)
  const ox = (vista.ancho - img.ancho * s) / 2
  const oy = (vista.alto - img.alto * s) / 2
  return { x: ox + (1 - p.x) * img.ancho * s, y: oy + p.y * img.alto * s }
}

export function puntosDentro(puntos: { x: number; y: number }[], r: Rect): number {
  return puntos.filter((p) => p.x >= r.x && p.x <= r.x + r.ancho && p.y >= r.y && p.y <= r.y + r.alto).length
}
