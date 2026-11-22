// Mesa de madera común a todos los juegos: tablero con canto, la cara de arriba en y = 0.
import * as THREE from 'three'
import { NATURAL, NEUTRO } from './colores'
import { texturaMadera } from './texturas'

export const MEDIDAS_MESA = { ancho: 5.4, fondo: 3.3, grosor: 0.16, z: -0.25 } as const

/** Tablero de la mesa ya ubicado (centro en z = −0,25). Lo libera EscenaBase.liberar() al recorrer la escena. */
export function crearMesa(): THREE.Mesh {
  const { ancho, fondo, grosor, z } = MEDIDAS_MESA
  const madera = texturaMadera()
  if (madera) {
    madera.wrapS = madera.wrapT = THREE.RepeatWrapping
    madera.repeat.set(2.4, 1.6)
  }
  const tablero = new THREE.Mesh(
    new THREE.BoxGeometry(ancho, grosor, fondo),
    new THREE.MeshStandardMaterial({ color: madera ? NEUTRO : NATURAL.madera, map: madera, roughness: 0.82, metalness: 0 }),
  )
  tablero.position.set(0, -grosor / 2, z)
  tablero.receiveShadow = true
  return tablero
}
