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

const opuesto = (l: ManoSeguida['lado']): ManoSeguida['lado'] => (l === 'derecha' ? 'izquierda' : 'derecha')

/**
 * Una mano sobrante puede ocupar el lado libre solo si es al menos esta fracción de la más grande elegida: así una mano
 * chica del fondo no se cuela cuando la otra propia no se ve.
 */
export const TAMANO_MIN_RELLENO = 0.5

/**
 * Las `n` manos más grandes en la imagen, una por lado. Mantiene el orden de mayor a menor.
 *
 * MediaPipe a veces etiqueta las dos manos propias con el mismo lado (decide la lateralidad en cada cuadro). Si falta un
 * lado, la mano sobrante más grande lo ocupa (con tamaño parecido, ver TAMANO_MIN_RELLENO), y con el cuadro anterior
 * (`previas`) el reparto se hace por cercanía de la muñeca, para que cada lado siga siendo la misma mano y los filtros
 * no salten de una a otra. Lo que necesita las dos manos (la banda, los juegos a dos manos) ya no pierde una.
 */
export function masCercanas(manos: ManoSeguida[], n: number, ancho: number, alto: number, previas: readonly ManoSeguida[] = []): ManoSeguida[] {
  const ordenadas = manos
    .map((m) => ({ m, t: tamanoEnImagen(m, ancho, alto) }))
    .sort((a, b) => b.t - a.t)
  const max = Math.max(0, n)
  const elegidas: { m: ManoSeguida; t: number }[] = []
  for (const o of ordenadas) {
    if (elegidas.length >= max) break
    if (elegidas.some((e) => e.m.lado === o.m.lado)) continue
    elegidas.push(o)
  }
  if (elegidas.length === 1 && max >= 2) {
    const [primera] = elegidas
    const sobrante = ordenadas.find((o) => o !== primera && o.t >= TAMANO_MIN_RELLENO * primera.t)
    if (sobrante) {
      const libre = opuesto(primera.m.lado)
      let a = primera.m
      let b: ManoSeguida = { ...sobrante.m, lado: libre }
      const pA = previas.find((m) => m.lado === a.lado)?.landmarks[0]
      const pB = previas.find((m) => m.lado === libre)?.landmarks[0]
      if (pA && pB) {
        const d = (u: { x: number; y: number }, v: { x: number; y: number }) => Math.hypot(u.x - v.x, u.y - v.y)
        const directo = d(a.landmarks[0], pA) + d(b.landmarks[0], pB)
        const cruzado = d(a.landmarks[0], pB) + d(b.landmarks[0], pA)
        if (cruzado < directo) {
          b = { ...primera.m, lado: libre }
          a = { ...sobrante.m, lado: primera.m.lado }
          return [b, a]
        }
      }
      return [a, b]
    }
  }
  return elegidas.map((e) => e.m)
}
