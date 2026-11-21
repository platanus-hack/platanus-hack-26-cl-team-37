// Sprites (planos que siempre miran a la cámara) con una textura teñida: halos, anillos, brillos y "+1".
import * as THREE from 'three'
import { material, type Recursos } from './recursos'

export interface OpcionesSprite {
  color: number
  /** Suma luz (halos que brillan) en vez de tapar. */
  aditivo?: boolean
  opacidad?: number
  /** Se dibuja encima de todo (sin prueba de profundidad), como los anillos de la pinza. */
  sobreTodo?: boolean
}

export function crearSprite(r: Recursos, tex: THREE.Texture, o: OpcionesSprite): { s: THREE.Sprite; m: THREE.SpriteMaterial } {
  const m = material(
    r,
    new THREE.SpriteMaterial({
      map: tex,
      color: o.color,
      transparent: true,
      opacity: o.opacidad ?? 1,
      depthWrite: false,
      ...(o.sobreTodo ? { depthTest: false } : {}),
      blending: o.aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  )
  return { s: new THREE.Sprite(m), m }
}
