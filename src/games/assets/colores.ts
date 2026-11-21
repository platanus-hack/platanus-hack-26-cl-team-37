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

/** Objetos naturales (excepción del brandbook): madera, fruta, jugo y vidrio con su color propio. */
export const NATURAL = {
  madera: 0xc69463,
  maderaClara: 0xece2cf,
  maderaSombra: 0xd8c9ad,
  maderaBase: 0xe6d9bd,
  naranja: 0xf08a24,
  naranjaMitad: 0xe27a1c,
  naranjaExprimida: 0xc2570f,
  naranjaBrillo: 0x3a1500,
  hoja: 0x4fa05a,
  jugo: 0xf2a02a,
  jugoBrillo: 0x5a2a00,
  pulpa: 0xffd37a,
  pulpaBrillo: 0x7a4a00,
  vidrio: 0xcfe6f2,
} as const

/** Vetas del lienzo de la mesa (madera natural). */
export const VETAS = { fondo: '#c69463', oscura: 'rgba(120, 72, 36, 0.06)', clara: 'rgba(255, 230, 190, 0.07)' } as const
