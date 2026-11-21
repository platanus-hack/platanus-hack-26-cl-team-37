// Piezas sueltas con física (juguetes de Caja, cubos de Torre): malla three.js + cuerpo dinámico de Rapier con el
// colisionador de la misma forma. El juego decide dónde nacen, cómo se giran y cuánto frenan o rebotan.
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { estandar, geometria, type Recursos } from './recursos'

export type FormaPieza = 'cubo' | 'esfera' | 'cilindro' | 'capsula' | 'cono'

/** Geometría y colisionador de una pieza de tamaño `tam` (lado del cubo o alto de la pieza). */
export function formaPieza(RAPIER: typeof RAPIER_NS, forma: FormaPieza, tam: number): { geo: THREE.BufferGeometry; col: RAPIER_NS.ColliderDesc } {
  switch (forma) {
    case 'cubo':
      return { geo: new THREE.BoxGeometry(tam, tam, tam), col: RAPIER.ColliderDesc.cuboid(tam / 2, tam / 2, tam / 2) }
    case 'esfera':
      return { geo: new THREE.SphereGeometry(tam / 2, 24, 16), col: RAPIER.ColliderDesc.ball(tam / 2) }
    case 'cilindro':
      return { geo: new THREE.CylinderGeometry(tam * 0.38, tam * 0.38, tam, 24), col: RAPIER.ColliderDesc.cylinder(tam / 2, tam * 0.38) }
    case 'capsula':
      return { geo: new THREE.CapsuleGeometry(tam * 0.22, tam * 0.7, 6, 16), col: RAPIER.ColliderDesc.capsule(tam * 0.35, tam * 0.22) }
    case 'cono':
      return { geo: new THREE.ConeGeometry(tam * 0.42, tam, 24), col: RAPIER.ColliderDesc.cone(tam / 2, tam * 0.42) }
  }
}

export interface OpcionesPieza {
  forma: FormaPieza
  tam: number
  color: number
  /** Aspecto del material. */
  rugosidad: number
  inicio: { x: number; y: number; z: number }
  rotacion: { x: number; y: number; z: number; w: number }
  /** Frenado lineal y angular del cuerpo. */
  amortiguacion: [lineal: number, angular: number]
  roce: number
  rebote: number
}

/** Crea la malla (con sombras) y el cuerpo dinámico con CCD. No la agrega a la escena ni la sincroniza. */
export function crearPiezaFisica(
  r: Recursos,
  fisica: { RAPIER: typeof RAPIER_NS; mundo: RAPIER_NS.World },
  o: OpcionesPieza,
): { malla: THREE.Mesh; cuerpo: RAPIER_NS.RigidBody } {
  const { RAPIER, mundo } = fisica
  const { geo, col } = formaPieza(RAPIER, o.forma, o.tam)
  const malla = new THREE.Mesh(geometria(r, geo), estandar(r, o.color, { roughness: o.rugosidad, metalness: 0.02 }))
  malla.castShadow = true
  malla.receiveShadow = true
  const cuerpo = mundo.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(o.inicio.x, o.inicio.y, o.inicio.z)
      .setRotation(o.rotacion)
      .setLinearDamping(o.amortiguacion[0])
      .setAngularDamping(o.amortiguacion[1])
      .setCcdEnabled(true),
  )
  mundo.createCollider(col.setFriction(o.roce).setRestitution(o.rebote).setDensity(1), cuerpo)
  return { malla, cuerpo }
}
