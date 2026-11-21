// Quedarse solo con las manos más cercanas a la cámara (las más grandes en la imagen). Pura, con pruebas.
// Motivo (2026-11-21): con gente al fondo, MediaPipe elegía a veces la mano de otra persona porque las ordena por
// confianza, no por cercanía. La cámara ahora detecta hasta 4 manos y aquí se eligen las `n` más grandes:
// 2 en los juegos y 1 en la calibración.
import type { ManoSeguida } from './tipos'

/** Tamaño aparente de la mano en px: muñeca→nudillo del medio más el ancho de la palma (índice→meñique). */
export function tamanoEnImagen(m: Pick<ManoSeguida, 'landmarks'>, ancho: number, alto: number): number {
  const p = m.landmarks
  if (!p || p.length < 21) return 0
  const d = (a: number, b: number) => Math.hypot((p[a].x - p[b].x) * ancho, (p[a].y - p[b].y) * alto)
  return d(0, 9) + d(5, 17)
}

/**
 * Las `n` manos más grandes en la imagen, una por lado (si MediaPipe etiqueta dos con el mismo lado, queda la más
 * grande). Mantiene el orden de mayor a menor.
 */
export function masCercanas(manos: ManoSeguida[], n: number, ancho: number, alto: number): ManoSeguida[] {
  const ordenadas = manos
    .map((m) => ({ m, t: tamanoEnImagen(m, ancho, alto) }))
    .sort((a, b) => b.t - a.t)
  const elegidas: ManoSeguida[] = []
  for (const { m } of ordenadas) {
    if (elegidas.length >= Math.max(0, n)) break
    if (elegidas.some((e) => e.lado === m.lado)) continue
    elegidas.push(m)
  }
  return elegidas
}
