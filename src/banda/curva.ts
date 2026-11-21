// Curva de una banda elástica: cuánta carga (kg, aprox.) opone según cuánto se estira. Puro, con pruebas.
//
// Estiramiento = (largo − largo en reposo) ÷ largo en reposo, como fracción (0,5 = 50 %; 1 = el doble de largo).
// La curva de una banda de látex NO es una recta: sube rápido al principio y después se aplana. Por eso no se usa
// una constante de resorte, sino puntos medidos unidos por tramos rectos desde (0, 0).
//
// De dónde salen los puntos, de más a menos confiable:
//  1. 'medida': la banda propia, colgándole pesos conocidos y midiendo el largo (curvaDesdePesos).
//  2. 'publicada': Thera-Band medidas en laboratorio (Uchida et al. 2016, J Phys Ther Sci 28(4):1266-71,
//     doi 10.1589/jpts.28.1266, tabla 1). Solo valen para esa marca.
//  3. 'etiqueta': un solo punto (lo que dice el envase) con la forma típica del látex. Es una referencia, no una medida.

export interface PuntoCurva {
  /** Fracción de estiramiento (> 0). */
  estiramiento: number
  /** Carga en kg-fuerza. */
  kg: number
}

export type OrigenCurva = 'medida' | 'publicada' | 'etiqueta'

export interface CurvaBanda {
  id: string
  nombre: string
  origen: OrigenCurva
  /** De dónde salen los puntos, para mostrarlo junto al número. */
  fuente: string
  /** Ordenados por estiramiento, sin el origen (0, 0). */
  puntos: PuntoCurva[]
}

export interface Carga {
  kg: number
  /** El estiramiento pasó el último punto de la curva: el valor se prolonga con el último tramo. */
  fueraDeRango: boolean
}

/** Carga a un estiramiento dado: tramos rectos entre puntos, partiendo de (0, 0). Bajo cero (banda suelta) da 0. */
export function cargaEn(curva: Pick<CurvaBanda, 'puntos'>, estiramiento: number): Carga {
  const p = curva.puntos
  if (p.length === 0 || !(estiramiento > 0)) return { kg: 0, fueraDeRango: false }
  let antes: PuntoCurva = { estiramiento: 0, kg: 0 }
  for (const punto of p) {
    if (estiramiento <= punto.estiramiento) return { kg: entre(antes, punto, estiramiento), fueraDeRango: false }
    antes = punto
  }
  const ultimo = p[p.length - 1]
  const previo = p.length > 1 ? p[p.length - 2] : { estiramiento: 0, kg: 0 }
  return { kg: Math.max(ultimo.kg, entre(previo, ultimo, estiramiento)), fueraDeRango: true }
}

/**
 * Área bajo la curva desde 0 hasta `estiramiento` (kg × fracción). Multiplicada por el largo en reposo y por g da el
 * trabajo de estirar la banda hasta ahí: no depende de cuántos cuadros alcanzó a ver la cámara.
 */
export function areaHasta(curva: Pick<CurvaBanda, 'puntos'>, estiramiento: number): number {
  if (!(estiramiento > 0)) return 0
  const cortes = [0, ...curva.puntos.map((p) => p.estiramiento).filter((e) => e < estiramiento), estiramiento]
  let area = 0
  for (let i = 1; i < cortes.length; i++) area += ((cargaEn(curva, cortes[i - 1]).kg + cargaEn(curva, cortes[i]).kg) / 2) * (cortes[i] - cortes[i - 1])
  return area
}

function entre(a: PuntoCurva, b: PuntoCurva, e: number): number {
  const ancho = b.estiramiento - a.estiramiento
  return ancho > 0 ? a.kg + ((b.kg - a.kg) * (e - a.estiramiento)) / ancho : b.kg
}

// ── Thera-Band medidas (Uchida 2016, tabla 1): kgf al 25, 50, …, 250 % de estiramiento ──────────────────────────

const PASOS_UCHIDA = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5]
const UCHIDA: [id: string, nombre: string, kg: number[]][] = [
  ['thera-beige', 'Thera-Band beige', [0.44, 0.75, 0.91, 1.08, 1.21, 1.36, 1.48, 1.58, 1.7, 1.84]],
  ['thera-amarilla', 'Thera-Band amarilla', [0.48, 0.83, 1.04, 1.17, 1.26, 1.41, 1.55, 1.69, 1.83, 1.98]],
  ['thera-roja', 'Thera-Band roja', [0.65, 1.1, 1.32, 1.6, 1.72, 1.85, 2.08, 2.26, 2.44, 2.61]],
  ['thera-verde', 'Thera-Band verde', [0.78, 1.24, 1.56, 1.82, 2.15, 2.35, 2.64, 2.91, 3.23, 3.65]],
  ['thera-azul', 'Thera-Band azul', [1.15, 1.7, 2.14, 2.51, 2.85, 3.09, 3.32, 3.52, 3.85, 3.98]],
  ['thera-negra', 'Thera-Band negra', [1.27, 2.18, 2.76, 3.28, 3.8, 4.32, 4.74, 5.23, 5.73, 6.33]],
  ['thera-plateada', 'Thera-Band plateada', [1.54, 2.58, 3.22, 3.89, 4.41, 4.87, 5.37, 5.91, 6.45, 7.4]],
  ['thera-dorada', 'Thera-Band dorada', [2.58, 3.87, 4.69, 5.66, 6.25, 6.81, 7.45, 7.55, 8.18, 8.93]],
]

export const FUENTE_UCHIDA = 'Medida en laboratorio: Uchida et al. 2016, doi 10.1589/jpts.28.1266'

export const CURVAS_PUBLICADAS: CurvaBanda[] = UCHIDA.map(([id, nombre, kg]) => ({
  id,
  nombre,
  origen: 'publicada',
  fuente: FUENTE_UCHIDA,
  puntos: kg.map((v, i) => ({ estiramiento: PASOS_UCHIDA[i], kg: v })),
}))

/**
 * Forma típica de una banda de látex: la carga a cada estiramiento como fracción de la carga al 100 %, promediando
 * las ocho Thera-Band medidas. Vale 1 en estiramiento = 1.
 */
export const FORMA_LATEX: PuntoCurva[] = PASOS_UCHIDA.map((estiramiento, i) => ({
  estiramiento,
  kg: UCHIDA.reduce((s, [, , kg]) => s + kg[i] / kg[3], 0) / UCHIDA.length,
}))

/** Curva con la forma típica del látex que pasa por un solo punto conocido (el del envase, o un solo peso colgado). */
export function curvaDesdeUnPunto(punto: PuntoCurva): PuntoCurva[] {
  const base = cargaEn({ puntos: FORMA_LATEX }, punto.estiramiento).kg
  if (!(base > 0) || !(punto.kg > 0)) return []
  const k = punto.kg / base
  return FORMA_LATEX.map((p) => ({ estiramiento: p.estiramiento, kg: p.kg * k }))
}

/** La banda del equipo según su envase: 5 kg al doble de su largo (ficha de Decathlon, ítem 2721020). Sin medir. */
export const CORENGTH_5KG: CurvaBanda = {
  id: 'corength-5kg',
  nombre: 'Corength 5 kg',
  origen: 'etiqueta',
  fuente: 'Envase: 5 kg al doble del largo, con la forma típica del látex.',
  puntos: curvaDesdeUnPunto({ estiramiento: 1, kg: 5 }),
}

// ── Calibración propia con pesos ────────────────────────────────────────────────────────────────────────────────

export interface FilaPeso {
  /** Peso colgado, kg. */
  kg: number
  /** Largo de la banda con ese peso, cm. */
  largoCm: number
}

export interface CalibracionPesos {
  /** Largo de la banda tensa sin peso, cm. */
  reposoCm: number
  filas: FilaPeso[]
}

export interface ResultadoCalibracion {
  puntos: PuntoCurva[]
  /** Filas que no se pudieron usar y por qué (para avisar en pantalla). */
  avisos: string[]
}

/**
 * Pesos colgados → puntos de la curva. Descarta filas incompletas o más cortas que el reposo, y avisa si al estirar
 * más la carga baja (una medida mal tomada). Con un solo punto válido usa la forma típica del látex.
 */
export function curvaDesdePesos(c: CalibracionPesos): ResultadoCalibracion {
  const avisos: string[] = []
  if (!(c.reposoCm > 0)) return { puntos: [], avisos: ['Falta el largo en reposo.'] }
  const validos: PuntoCurva[] = []
  c.filas.forEach((f, i) => {
    if (!(f.kg > 0) || !(f.largoCm > 0)) return
    if (f.largoCm <= c.reposoCm) {
      avisos.push(`La medida ${i + 1} es más corta que el reposo.`)
      return
    }
    validos.push({ estiramiento: f.largoCm / c.reposoCm - 1, kg: f.kg })
  })
  validos.sort((a, b) => a.estiramiento - b.estiramiento)
  for (let i = 1; i < validos.length; i++) {
    if (validos[i].kg < validos[i - 1].kg) {
      avisos.push('Con más estiramiento la carga debería subir: revisa las medidas.')
      break
    }
  }
  if (validos.length === 0) return { puntos: [], avisos }
  if (validos.length === 1) return { puntos: curvaDesdeUnPunto(validos[0]), avisos: [...avisos, 'Con una sola medida se usa la forma típica del látex. Agrega más pesos.'] }
  return { puntos: validos, avisos }
}

/** Curva propia a partir de la calibración guardada; null si todavía no alcanza para calcular. */
export function curvaPropia(c: CalibracionPesos): CurvaBanda | null {
  const { puntos } = curvaDesdePesos(c)
  if (puntos.length === 0) return null
  const medidas = c.filas.filter((f) => f.kg > 0 && f.largoCm > c.reposoCm).length
  return {
    id: 'propia',
    nombre: 'Mi banda',
    origen: 'medida',
    fuente: `Calibrada con ${medidas} ${medidas === 1 ? 'peso' : 'pesos'} colgados.`,
    puntos,
  }
}
