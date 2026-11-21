// Caja de juguetes: caja de madera abierta (piso + 4 paredes), fija, con un colisionador por tabla.
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { NATURAL } from '../colores'
import { estandar, geometria, type Recursos } from '../recursos'

export interface MedidasCaja {
  x: number
  z: number
  ancho: number
  fondo: number
  alto: number
  grosor: number
  piso: number
}

/** Crea las 5 tablas sobre la mesa (cara de arriba en `alturaMesa`) y sus colisionadores fijos. Devuelve las mallas. */
export function crearCajaMadera(
  r: Recursos,
  fisica: { RAPIER: typeof RAPIER_NS; mundo: RAPIER_NS.World },
  k: MedidasCaja,
  alturaMesa: number,
): THREE.Mesh[] {
  const { RAPIER, mundo } = fisica
  const madera = estandar(r, NATURAL.maderaClara, { roughness: 0.75 })
  const fondo = estandar(r, NATURAL.maderaSombra, { roughness: 0.85 })
  const tablas: { w: number; h: number; d: number; x: number; y: number; z: number; mat: THREE.Material }[] = [
    { w: k.ancho, h: k.piso, d: k.fondo, x: 0, y: k.piso / 2, z: 0, mat: fondo },
    { w: k.ancho, h: k.alto, d: k.grosor, x: 0, y: k.alto / 2, z: k.fondo / 2 - k.grosor / 2, mat: madera },
    { w: k.ancho, h: k.alto, d: k.grosor, x: 0, y: k.alto / 2, z: -k.fondo / 2 + k.grosor / 2, mat: madera },
    { w: k.grosor, h: k.alto, d: k.fondo - 2 * k.grosor, x: k.ancho / 2 - k.grosor / 2, y: k.alto / 2, z: 0, mat: madera },
    { w: k.grosor, h: k.alto, d: k.fondo - 2 * k.grosor, x: -k.ancho / 2 + k.grosor / 2, y: k.alto / 2, z: 0, mat: madera },
  ]
  return tablas.map((p) => {
    const m = new THREE.Mesh(geometria(r, new THREE.BoxGeometry(p.w, p.h, p.d)), p.mat)
    m.position.set(k.x + p.x, alturaMesa + p.y, k.z + p.z)
    m.castShadow = true
    m.receiveShadow = true
    mundo.createCollider(
      RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2, p.d / 2)
        .setTranslation(k.x + p.x, alturaMesa + p.y, k.z + p.z)
        .setFriction(0.9),
    )
    return m
  })
}
