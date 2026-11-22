// Marcas pintadas en la banda: dos puntos de un color llamativo que se siguen en el video por color. Puro, con pruebas.
//
// Es el método de los extensómetros de video de los ensayos de materiales: se mide la distancia entre dos marcas sobre
// la misma probeta, así el estiramiento es de la banda y no depende de cómo se toma, de si resbala en la mano ni del
// giro del puño (lo que dio kilos en reposo en la primera prueba real, 21-nov-2026).
//
// Paso a paso: el cuadro se reduce (p. ej. 320 px de ancho), cada píxel se pasa a tono/saturación/brillo, se marcan los
// que se parecen al color elegido, se juntan en manchas conectadas y se eligen las dos que siguen a las del cuadro
// anterior (o las dos más grandes al empezar). Los píxeles no salen del navegador.

export interface Hsv {
  /** Tono, 0..360. */
  h: number
  /** Saturación, 0..1. */
  s: number
  /** Brillo, 0..1. */
  v: number
}

export function rgbAHsv(r: number, g: number, b: number): Hsv {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === R) h = 60 * (((G - B) / d) % 6)
    else if (max === G) h = 60 * ((B - R) / d + 2)
    else h = 60 * ((R - G) / d + 4)
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}

/** Cuánto puede alejarse el tono del color elegido (grados). */
export const TOLERANCIA_TONO = 20
/** Mínimos de saturación y brillo: el gris, el blanco y la sombra no son marca aunque el tono calce. */
export const SATURACION_MIN = 0.3
export const BRILLO_MIN = 0.18

const distanciaTono = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

export function coincide(p: Hsv, color: Hsv): boolean {
  return distanciaTono(p.h, color.h) <= TOLERANCIA_TONO && p.s >= Math.max(SATURACION_MIN, color.s * 0.45) && p.v >= Math.max(BRILLO_MIN, color.v * 0.4)
}

/** Color promedio alrededor de (x, y) en píxeles de la imagen RGBA (tono con promedio circular). */
export function colorEn(rgba: ArrayLike<number>, ancho: number, alto: number, x: number, y: number, radio = 3): Hsv {
  let sx = 0
  let sy = 0
  let ss = 0
  let sv = 0
  let n = 0
  for (let j = Math.max(0, Math.round(y) - radio); j <= Math.min(alto - 1, Math.round(y) + radio); j++) {
    for (let i = Math.max(0, Math.round(x) - radio); i <= Math.min(ancho - 1, Math.round(x) + radio); i++) {
      const k = (j * ancho + i) * 4
      const c = rgbAHsv(rgba[k], rgba[k + 1], rgba[k + 2])
      sx += Math.cos((c.h * Math.PI) / 180) * c.s
      sy += Math.sin((c.h * Math.PI) / 180) * c.s
      ss += c.s
      sv += c.v
      n++
    }
  }
  if (n === 0) return { h: 0, s: 0, v: 0 }
  return { h: ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360, s: ss / n, v: sv / n }
}

/** ¿El color sirve como marca? Muy poco saturado (blanco, gris, piel pálida) no se distingue del fondo. */
export function colorUtil(c: Hsv): boolean {
  return c.s >= SATURACION_MIN + 0.05 && c.v >= BRILLO_MIN + 0.07
}

export interface Mancha {
  /** Centro en píxeles de la imagen reducida. */
  x: number
  y: number
  /** Píxeles de la mancha. */
  area: number
}

/** Manchas conectadas (vecindad de 4) de píxeles del color, de al menos `areaMin` píxeles, de mayor a menor. */
export function manchas(rgba: ArrayLike<number>, ancho: number, alto: number, color: Hsv, areaMin = 6): Mancha[] {
  const n = ancho * alto
  const marca = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const k = i * 4
    if (coincide(rgbAHsv(rgba[k], rgba[k + 1], rgba[k + 2]), color)) marca[i] = 1
  }
  const visto = new Uint8Array(n)
  const pila: number[] = []
  const salida: Mancha[] = []
  for (let i = 0; i < n; i++) {
    if (!marca[i] || visto[i]) continue
    let sx = 0
    let sy = 0
    let area = 0
    pila.push(i)
    visto[i] = 1
    while (pila.length) {
      const p = pila.pop()!
      const x = p % ancho
      const y = (p - x) / ancho
      sx += x
      sy += y
      area++
      const vecinos = [x > 0 ? p - 1 : -1, x < ancho - 1 ? p + 1 : -1, y > 0 ? p - ancho : -1, y < alto - 1 ? p + ancho : -1]
      for (const q of vecinos) {
        if (q >= 0 && marca[q] && !visto[q]) {
          visto[q] = 1
          pila.push(q)
        }
      }
    }
    if (area >= areaMin) salida.push({ x: sx / area, y: sy / area, area })
  }
  return salida.sort((a, b) => b.area - a.area)
}

type Punto = { x: number; y: number }

/**
 * Elige las dos marcas. Con las del cuadro anterior, las dos manchas más cercanas a cada una (así una mancha suelta
 * del fondo no reemplaza a una marca); sin anteriores, las dos más grandes. null si hay menos de dos.
 */
export function elegirPar(ms: readonly Mancha[], previas: readonly [Punto, Punto] | null, saltoMax = Infinity): [Mancha, Mancha] | null {
  if (ms.length < 2) return null
  if (!previas) {
    const [a, b] = ms
    return a.x <= b.x ? [a, b] : [b, a]
  }
  const d = (p: Punto, q: Punto) => Math.hypot(p.x - q.x, p.y - q.y)
  let mejor: [Mancha, Mancha] | null = null
  let costo = Infinity
  for (let i = 0; i < Math.min(ms.length, 6); i++) {
    for (let j = 0; j < Math.min(ms.length, 6); j++) {
      if (i === j) continue
      const c = d(ms[i], previas[0]) + d(ms[j], previas[1])
      if (c < costo && d(ms[i], previas[0]) <= saltoMax && d(ms[j], previas[1]) <= saltoMax) {
        costo = c
        mejor = [ms[i], ms[j]]
      }
    }
  }
  return mejor
}

/** Cómo se mide el largo de la banda: entre los puntos de agarre de las manos, o entre dos marcas pintadas en ella. */
export type ModoMedida = 'manos' | 'marcas'
export const MODOS: { v: ModoMedida; n: string }[] = [
  { v: 'manos', n: 'Manos' },
  { v: 'marcas', n: 'Marcas en la banda' },
]
