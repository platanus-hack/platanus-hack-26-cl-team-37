// Caja de juguetes (F10): reglas puras del juego, sin three.js ni Rapier (con pruebas en caja.test.ts).
//
// Escena en unidades de ~10 cm (mesa 5,4 × 3,3 con la cara de arriba en y = 0, centro en z = −0,25).
// - Caja abierta al centro, algo hacia el fondo (como 06a). Los juguetes se reparten a los dos lados de la caja:
//   x = ±(medio ancho de la caja + distanciaCaja × 0,75), en filas a lo largo de z. Más nivel = más lejos.
// - Cerca para tomar: el punto de pinza (punto medio pulgar–índice en la escena) a ≤ radio + 0,3 del centro del
//   juguete en el plano de la mesa, y a no más de 0,7 sobre su cara de arriba. La altura es tolerante porque con
//   una sola cámara la profundidad y la altura son lo más difícil de controlar.
// - Dentro de la caja: el juguete quieto con su centro dentro del interior (x, z), hasta 0,5 sobre el borde (apilado).
import { kuwuNum } from '../../ui/paleta'
import type { FormaPieza } from '../assets/piezas'

export type Forma = FormaPieza

export interface V3 {
  x: number
  y: number
  z: number
}

export interface Caja {
  x: number
  z: number
  /** Medidas exteriores. */
  ancho: number
  fondo: number
  alto: number
  grosor: number
  /** Grosor del piso de la caja. */
  piso: number
}

export const CAJA: Caja = { x: 0, z: -0.35, ancho: 1.3, fondo: 0.95, alto: 0.34, grosor: 0.06, piso: 0.04 }

/** Tamaño base de un juguete (lado del cubo) para tamano = 1. */
export const TAM_BASE = 0.3

/** Zona de juego alcanzable por la pinza (x de la mesa y z del frente al fondo). */
export const ZONA_JUGUETES = { xMax: 2.05, zMin: -0.85, zMax: 0.65 }

/** Por debajo de esta altura un juguete se cayó de la mesa y vuelve a su lugar. */
export const Y_CAIDA = -1

export const FORMAS: Forma[] = ['cubo', 'esfera', 'cilindro', 'capsula', 'cubo', 'esfera', 'cono', 'capsula', 'cilindro', 'esfera']
/** Colores de los juguetes: los pastel del brandbook. */
export const COLORES = (['rojo', 'amarillo', 'azul', 'menta'] as const).map(kuwuNum)

/** Posiciones de inicio (x, z) de `cantidad` juguetes alrededor de la caja, alternando izquierda y derecha. */
export function posicionesJuguetes(cantidad: number, distanciaCaja: number, caja: Caja = CAJA): { x: number; z: number }[] {
  const n = Math.max(0, Math.round(cantidad))
  const porLado = [Math.ceil(n / 2), Math.floor(n / 2)]
  const dx = Math.min(ZONA_JUGUETES.xMax - Math.abs(caja.x), caja.ancho / 2 + distanciaCaja * 0.75)
  const filas = (k: number) => {
    if (k <= 1) return [caja.z + 0.35]
    return Array.from({ length: k }, (_, i) => ZONA_JUGUETES.zMin + ((ZONA_JUGUETES.zMax - ZONA_JUGUETES.zMin) * i) / (k - 1))
  }
  const lados = [filas(porLado[0]), filas(porLado[1])]
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const lado = i % 2 // 0 = izquierda de la pantalla, 1 = derecha
    const fila = Math.floor(i / 2)
    const z = lados[lado][fila]
    // Filas alternas un poco más cerca de la caja, para que no queden en una línea recta.
    const x = caja.x + (lado === 0 ? -1 : 1) * (dx - (fila % 2) * 0.18)
    out.push({ x: +x.toFixed(3), z: +z.toFixed(3) })
  }
  return out
}

/** Medio alto del juguete apoyado (para no hundirlo en la mesa al sostenerlo). */
export function medioAlto(forma: Forma, tam: number): number {
  if (forma === 'capsula') return tam * 0.22 // acostada
  return tam / 2
}

/** Radio aproximado en el plano de la mesa. */
export function radioPlano(forma: Forma, tam: number): number {
  if (forma === 'capsula') return tam * 0.57
  if (forma === 'cubo') return tam * 0.6
  return tam / 2
}

export const CERCA_XZ = 0.3
export const CERCA_ALTO = 0.7

/** ¿El punto de pinza está lo bastante cerca del juguete para tomarlo? Devuelve la distancia (o null si no). */
export function distanciaToma(pinza: V3, centro: V3, forma: Forma, tam: number): number | null {
  const dxz = Math.hypot(pinza.x - centro.x, pinza.z - centro.z)
  const arriba = centro.y + medioAlto(forma, tam)
  const sobre = pinza.y - arriba
  if (dxz > radioPlano(forma, tam) + CERCA_XZ) return null
  if (sobre > CERCA_ALTO) return null
  if (pinza.y < centro.y - medioAlto(forma, tam) - 0.3) return null
  return Math.hypot(dxz, Math.max(0, sobre) * 0.5)
}

/** Interior de la caja (mitad de ancho y fondo). */
export function interiorCaja(caja: Caja = CAJA) {
  return { mx: caja.ancho / 2 - caja.grosor, mz: caja.fondo / 2 - caja.grosor }
}

/** Altura sobre el borde de la caja hasta la que un juguete apilado dentro cuenta como guardado. */
export const APILADO = 0.5

export function dentroDeCaja(p: V3, caja: Caja = CAJA, alturaMesa = 0): boolean {
  const { mx, mz } = interiorCaja(caja)
  // Se evalúa con el juguete ya quieto: si quedó apoyado sobre otros juguetes dentro de la caja (apilado), también
  // cuenta; por eso se admite hasta APILADO sobre el borde.
  return Math.abs(p.x - caja.x) < mx && Math.abs(p.z - caja.z) < mz && p.y < alturaMesa + caja.alto + APILADO && p.y > alturaMesa - 0.05
}

export function cayoDeLaMesa(p: V3): boolean {
  return p.y < Y_CAIDA
}

/** Quieto: rapidez lineal y angular bajo el umbral. */
export const QUIETO_LIN = 0.06
export const QUIETO_ANG = 0.5
/** Tiempo quieto para dar por terminado el traslado (ms) y máximo de espera tras soltar. */
export const MS_QUIETO = 250
export const MS_MAX_ASENTAR = 4000

export function estaQuieto(linvel: V3, angvel: V3): boolean {
  return Math.hypot(linvel.x, linvel.y, linvel.z) < QUIETO_LIN && Math.hypot(angvel.x, angvel.y, angvel.z) < QUIETO_ANG
}
