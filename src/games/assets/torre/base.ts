// Torre de cubos: base redonda de madera (con su colisionador fijo) y silueta amarilla del cubo siguiente.
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { kuwuNum } from '../../../ui/paleta'
import { NATURAL } from '../colores'
import { estandar, geometria, material, type Recursos } from '../recursos'

/** Base cilíndrica sobre la mesa (cara de abajo en `alturaMesa`), ya ubicada, con su colisionador. */
export function crearBaseTorre(
  r: Recursos,
  fisica: { RAPIER: typeof RAPIER_NS; mundo: RAPIER_NS.World },
  base: { x: number; z: number; radio: number; grosor: number },
  alturaMesa: number,
): THREE.Mesh {
  const { RAPIER, mundo } = fisica
  const malla = new THREE.Mesh(
    geometria(r, new THREE.CylinderGeometry(base.radio, base.radio, base.grosor, 48)),
    estandar(r, NATURAL.maderaBase, { roughness: 0.8, metalness: 0.02 }),
  )
  malla.position.set(base.x, alturaMesa + base.grosor / 2, base.z)
  malla.castShadow = true
  malla.receiveShadow = true
  mundo.createCollider(
    RAPIER.ColliderDesc.cylinder(base.grosor / 2, base.radio)
      .setTranslation(base.x, alturaMesa + base.grosor / 2, base.z)
      .setFriction(0.95),
  )
  return malla
}

/** Cubo fantasma de lado `lado`: relleno amarillo translúcido y aristas amarillas. */
export function crearSilueta(r: Recursos, lado: number): THREE.Group {
  const caja = geometria(r, new THREE.BoxGeometry(lado, lado, lado))
  const bordes = geometria(r, new THREE.EdgesGeometry(caja))
  const relleno = material(r, new THREE.MeshBasicMaterial({ color: kuwuNum('amarillo'), transparent: true, opacity: 0.22, depthWrite: false }))
  const linea = material(r, new THREE.LineBasicMaterial({ color: kuwuNum('amarillo') }))
  const g = new THREE.Group()
  g.add(new THREE.Mesh(caja, relleno), new THREE.LineSegments(bordes, linea))
  return g
}
