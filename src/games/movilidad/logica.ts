// Movilidad guiada (F11): reglas puras, con pruebas en movilidad.test.ts.
//
// - Guía: una mano fantasma que abre y cierra a ritmo fijo (abierta → cierra → cerrada → abre), según el nivel.
//   `guiaEn(tMs, nivel)` da la apertura objetivo (0..1) y la fase (para la pista del panel).
// - Ciclos: apertura de la mano normalizada con el rango abrir/cerrar de la calibración (`aperturaCalibrada`),
//   con histéresis: cerrar (< cierre) y volver a abrir (> apertura) = 1 ciclo. Contar NO depende de seguir la
//   guía (la guía marca el ritmo; el paciente puede ir más lento o más rápido).
// - Ritmo: ciclos por minuto con los últimos ciclos, que baja solo si el paciente se detiene.

export type FaseGuia = 'abierta' | 'cerrando' | 'cerrada' | 'abriendo'

export interface NivelMovilidad {
  nombre: string
  detalle: string
  /** Umbrales de apertura calibrada (0..1): cerrar por debajo de `cierre`, abrir por encima de `apertura`. */
  cierre: number
  apertura: number
  /** Duración de cada tramo de la guía (ms): mantener abierta, cerrar, mantener cerrada, abrir. */
  abiertaMs: number
  cerrarMs: number
  cerradaMs: number
  abrirMs: number
  /** Apertura objetivo de la guía con la mano cerrada (la abierta es 1). */
  guiaCerrada: number
}

const tramo = (seg: number) => Math.round(seg * 1000)

/** Niveles = cuánto hay que cerrar/abrir y el ritmo de la guía (nombres del registro). */
export const NIVELES_MOVILIDAD: Record<1 | 2 | 3 | 4 | 5, NivelMovilidad> = {
  1: { nombre: 'Rango cómodo', detalle: 'Cerrar a medias · guía de 5 s por ciclo', cierre: 0.55, apertura: 0.7, abiertaMs: tramo(1), cerrarMs: tramo(1.5), cerradaMs: tramo(1), abrirMs: tramo(1.5), guiaCerrada: 0.42 },
  2: { nombre: 'Rango medio', detalle: 'Cerrar un poco más · guía de 5 s por ciclo', cierre: 0.45, apertura: 0.75, abiertaMs: tramo(1), cerrarMs: tramo(1.5), cerradaMs: tramo(1), abrirMs: tramo(1.5), guiaCerrada: 0.3 },
  3: { nombre: 'Rango amplio', detalle: 'Cerrar y abrir del todo · guía de 4 s por ciclo', cierre: 0.3, apertura: 0.8, abiertaMs: tramo(0.8), cerrarMs: tramo(1.2), cerradaMs: tramo(0.8), abrirMs: tramo(1.2), guiaCerrada: 0.14 },
  4: { nombre: 'Rango amplio y lento', detalle: 'Cerrar y abrir del todo, lento · guía de 7 s por ciclo', cierre: 0.3, apertura: 0.8, abiertaMs: tramo(1.3), cerrarMs: tramo(2.2), cerradaMs: tramo(1.3), abrirMs: tramo(2.2), guiaCerrada: 0.14 },
  5: { nombre: 'Rango completo', detalle: 'Puño completo y dedos estirados · guía de 4 s por ciclo', cierre: 0.2, apertura: 0.85, abiertaMs: tramo(0.8), cerrarMs: tramo(1.2), cerradaMs: tramo(0.8), abrirMs: tramo(1.2), guiaCerrada: 0.04 },
}

export function nivelMovilidad(n: number): NivelMovilidad {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5
  return NIVELES_MOVILIDAD[k]
}

export const periodoGuia = (n: NivelMovilidad) => n.abiertaMs + n.cerrarMs + n.cerradaMs + n.abrirMs

/** Curva suave (sin tirones) entre 0 y 1. */
const suave = (u: number) => {
  const x = Math.min(1, Math.max(0, u))
  return x * x * (3 - 2 * x)
}

/** Apertura objetivo de la guía (0..1), fase y avance dentro de la fase, a los `tMs` de juego activo. */
export function guiaEn(tMs: number, n: NivelMovilidad): { objetivo: number; fase: FaseGuia; avance: number } {
  const p = periodoGuia(n)
  let t = ((tMs % p) + p) % p
  const abierta = 1
  const cerrada = n.guiaCerrada
  if (t < n.abiertaMs) return { objetivo: abierta, fase: 'abierta', avance: t / n.abiertaMs }
  t -= n.abiertaMs
  if (t < n.cerrarMs) {
    const u = t / n.cerrarMs
    return { objetivo: abierta + (cerrada - abierta) * suave(u), fase: 'cerrando', avance: u }
  }
  t -= n.cerrarMs
  if (t < n.cerradaMs) return { objetivo: cerrada, fase: 'cerrada', avance: t / n.cerradaMs }
  t -= n.cerradaMs
  const u = t / n.abrirMs
  return { objetivo: cerrada + (abierta - cerrada) * suave(u), fase: 'abriendo', avance: u }
}

export const PISTAS: Record<FaseGuia, string> = {
  abierta: 'Mantén los dedos estirados',
  cerrando: 'Cierra la mano despacio',
  cerrada: 'Mantén la mano cerrada',
  abriendo: 'Abre la mano y estira los dedos',
}

// ── Ciclos ───────────────────────────────────────────────────────────────────────────────────────────

export interface EstadoCiclo {
  cerrada: boolean
  /** ms de juego en que se cerró (inicio del ciclo). */
  cierreT: number | null
  /** Apertura mínima y máxima vistas en el ciclo en curso (para el rango usado). */
  min: number
  max: number
}

export const cicloInicial = (): EstadoCiclo => ({ cerrada: false, cierreT: null, min: 1, max: 0 })

export type CambioCiclo = { tipo: 'cierre' } | { tipo: 'ciclo'; duracionMs: number; rango: number } | null

/**
 * Un cuadro con apertura `a` (0..1) a los `t` ms. Cerrar bajo `cierre` inicia el ciclo; volver a abrir sobre
 * `apertura` lo completa. `rango` = máximo − mínimo de la apertura entre el máximo previo al cierre y la reapertura.
 */
export function pasoCiclo(s: EstadoCiclo, a: number, t: number, n: Pick<NivelMovilidad, 'cierre' | 'apertura'>): { estado: EstadoCiclo; cambio: CambioCiclo } {
  const e: EstadoCiclo = { ...s, min: Math.min(s.min, a), max: Math.max(s.max, a) }
  if (!s.cerrada && a < n.cierre) {
    return { estado: { ...e, cerrada: true, cierreT: t }, cambio: { tipo: 'cierre' } }
  }
  if (s.cerrada && a > n.apertura) {
    const rango = Math.max(0, e.max - e.min)
    return { estado: { cerrada: false, cierreT: null, min: a, max: a }, cambio: { tipo: 'ciclo', duracionMs: Math.max(0, t - (s.cierreT ?? t)), rango } }
  }
  return { estado: e, cambio: null }
}

// ── Ritmo ────────────────────────────────────────────────────────────────────────────────────────────

/** Ciclos usados para el ritmo en vivo. */
export const VENTANA_RITMO = 5

/**
 * Ritmo en ciclos/min con los últimos ciclos (`tiempos` = ms de juego en que se completó cada ciclo). Si el
 * paciente se detiene, el intervalo efectivo crece con el tiempo desde el último ciclo y el ritmo baja.
 * null con menos de 2 ciclos.
 */
export function ritmoCpm(tiempos: number[], ahora: number): number | null {
  const u = tiempos.slice(-VENTANA_RITMO)
  if (u.length < 2) return null
  const intervalo = (u[u.length - 1] - u[0]) / (u.length - 1)
  const efectivo = Math.max(intervalo, ahora - u[u.length - 1])
  return efectivo > 0 ? 60000 / efectivo : null
}

/** Ritmo medio de la sesión (ciclos/min entre el primer y el último ciclo). null con menos de 2. */
export function ritmoMedio(tiempos: number[]): number | null {
  if (tiempos.length < 2) return null
  const d = tiempos[tiempos.length - 1] - tiempos[0]
  return d > 0 ? (60000 * (tiempos.length - 1)) / d : null
}
