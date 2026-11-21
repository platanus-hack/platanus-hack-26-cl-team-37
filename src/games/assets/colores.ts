// Colores de las escenas 3D de los juegos. Todo sale de la paleta del brandbook (src/ui/paleta.ts), salvo los objetos
// naturales (madera, fruta, jugo, vidrio), que el brandbook permite con su color propio (brandbook/README.md §3).
// Es el único archivo de src/games con colores escritos a mano: lo comprueba colores.test.ts.
import * as THREE from 'three'
import { KUWU, kuwuNum } from '../../ui/paleta'

export type NombreKuwu = Parameters<typeof kuwuNum>[0]

/** Color de la paleta oscurecido (factor 0–1), para el brillo propio (emissive) de un material: tono('amarillo', 0.35). */
export function tono(nombre: NombreKuwu, factor: number): number {
  return new THREE.Color(kuwuNum(nombre)).multiplyScalar(factor).getHex()
}

/** Relleno de juguetes, cubos y figuras: los cuatro pastel del brandbook, en un orden que no repite vecinos. */
export const PASTELES: readonly number[] = [kuwuNum('rojo'), kuwuNum('amarillo'), kuwuNum('azul'), kuwuNum('menta')]
export const PASTELES_CSS: readonly string[] = [KUWU.rojo, KUWU.amarillo, KUWU.azul, KUWU.menta]

/** Blanco de la paleta: tinte neutro de sprites y texturas (no cambia su color). */
export const NEUTRO = kuwuNum('blanco')

/** Mano virtual: huesos crema, articulaciones amarillas y puntas azules, como en el dibujo de la mano de la app. */
export const MANO = {
  hueso: kuwuNum('crema'),
  articulacion: kuwuNum('amarillo'),
  punta: kuwuNum('azul'),
  antebrazo: kuwuNum('linea'),
  palma: kuwuNum('blanco'),
} as const

/** Luces de la escena: cielo y sol crema, rebote desde el suelo en noche (tema de cámara y juego). */
export const LUZ = { cielo: kuwuNum('crema'), suelo: kuwuNum('noche'), sol: kuwuNum('crema') } as const

// Objetos con su color real (madera, fruta, jugo, vidrio, bandas elásticas): assets/naturales.ts, sin three.js para
// que la lógica pura de los juegos también los pueda leer.
export { BANDAS, NATURAL, VETAS } from './naturales'
