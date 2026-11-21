// Exprime la naranja: naranja con hoja, vaso de vidrio con jugo, fuente con naranjas, mitades exprimidas y gotas.
// Fruta, jugo y vidrio con su color natural (excepción del brandbook); la fuente, en crema de la paleta.
import * as THREE from 'three'
import { kuwuNum } from '../../../ui/paleta'
import { NATURAL, NEUTRO } from '../colores'
import { estandar, geometria, type Recursos } from '../recursos'

/** Naranja de radio `radio` con una hoja. `userData.cuerpo` = la esfera (para achicarla y oscurecerla). */
export function crearNaranja3d(r: Recursos, radio: number): THREE.Group {
  const g = new THREE.Group()
  const cuerpo = new THREE.Mesh(
    geometria(r, new THREE.SphereGeometry(radio, 28, 20)),
    estandar(r, NATURAL.naranja, { roughness: 0.5, emissive: NATURAL.naranjaBrillo, emissiveIntensity: 0.35 }),
  )
  cuerpo.castShadow = true
  const hoja = new THREE.Mesh(geometria(r, new THREE.SphereGeometry(radio * 0.3, 12, 8)), estandar(r, NATURAL.hoja, { roughness: 0.6 }))
  hoja.scale.set(1.5, 0.35, 0.9)
  hoja.position.set(radio * 0.18, radio * 0.97, 0)
  hoja.rotation.z = -0.35
  g.add(cuerpo, hoja)
  g.userData.cuerpo = cuerpo
  return g
}

export interface MedidasVaso {
  x: number
  z: number
  alto: number
  /** Alto del fondo de vidrio (donde empieza el jugo). */
  base: number
}

/**
 * Vaso ya ubicado sobre la mesa: jugo (cilindro de alto 1 con la base en el origen, el juego lo escala), superficie
 * del jugo (el juego la sube), vidrio, fondo y borde.
 */
export function crearVaso(r: Recursos, v: MedidasVaso, alturaMesa: number) {
  const jugo = new THREE.Mesh(
    geometria(r, new THREE.CylinderGeometry(0.375, 0.345, 1, 32).translate(0, 0.5, 0)),
    estandar(r, NATURAL.jugo, { roughness: 0.35, transparent: true, opacity: 0.94, emissive: NATURAL.jugoBrillo, emissiveIntensity: 0.25 }),
  )
  jugo.position.set(v.x, alturaMesa + v.base, v.z)
  jugo.renderOrder = 2
  const superficie = new THREE.Mesh(
    geometria(r, new THREE.CircleGeometry(0.372, 32).rotateX(-Math.PI / 2)),
    estandar(r, NATURAL.pulpa, { roughness: 0.3, emissive: NATURAL.pulpaBrillo, emissiveIntensity: 0.3 }),
  )
  superficie.renderOrder = 2
  const vidrio = new THREE.Mesh(
    geometria(r, new THREE.CylinderGeometry(0.44, 0.4, v.alto, 36, 1, true)),
    estandar(r, NATURAL.vidrio, { roughness: 0.08, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  )
  vidrio.position.set(v.x, alturaMesa + v.alto / 2, v.z)
  vidrio.renderOrder = 3
  vidrio.castShadow = true
  const fondo = new THREE.Mesh(
    geometria(r, new THREE.CylinderGeometry(0.4, 0.4, v.base, 36)),
    estandar(r, NATURAL.vidrio, { roughness: 0.1, transparent: true, opacity: 0.45 }),
  )
  fondo.position.set(v.x, alturaMesa + v.base / 2, v.z)
  fondo.castShadow = true
  const borde = new THREE.Mesh(
    geometria(r, new THREE.TorusGeometry(0.44, 0.016, 8, 48).rotateX(Math.PI / 2)),
    estandar(r, NEUTRO, { transparent: true, opacity: 0.55, roughness: 0.2 }),
  )
  borde.position.set(v.x, alturaMesa + v.alto, v.z)
  borde.renderOrder = 3
  return { jugo, superficie, vidrio, fondo, borde }
}

/** Fuente con cuatro naranjas, centrada en (x, z) sobre la mesa. */
export function crearFuente(r: Recursos, x: number, z: number, alturaMesa: number): THREE.Group {
  const g = new THREE.Group()
  const fuente = new THREE.Mesh(geometria(r, new THREE.CylinderGeometry(0.72, 0.58, 0.3, 40)), estandar(r, kuwuNum('crema'), { roughness: 0.7 }))
  fuente.position.set(x, alturaMesa + 0.15, z)
  fuente.castShadow = fuente.receiveShadow = true
  g.add(fuente)
  for (const [dx, dy, dz] of [[-0.22, 0.5, 0.12], [0.24, 0.5, 0.08], [0.0, 0.5, -0.26], [0.02, 0.78, -0.02]] as const) {
    const n = crearNaranja3d(r, 0.3)
    n.position.set(x + dx, alturaMesa + dy, z + dz)
    g.add(n)
  }
  return g
}

/** `cantidad` mitades exprimidas (semiesferas) que comparten geometría y material, sin ubicar. */
export function crearMitades(r: Recursos, cantidad: number): THREE.Mesh[] {
  const geo = geometria(r, new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2))
  const mat = estandar(r, NATURAL.naranjaMitad, { roughness: 0.5 })
  return Array.from({ length: cantidad }, () => {
    const h = new THREE.Mesh(geo, mat)
    h.castShadow = true
    return h
  })
}

/** `cantidad` gotas de jugo alargadas que comparten geometría y material, ocultas. */
export function crearGotas(r: Recursos, cantidad: number): THREE.Mesh[] {
  const geo = geometria(r, new THREE.SphereGeometry(0.075, 12, 10))
  const mat = estandar(r, NATURAL.naranja, { roughness: 0.3, emissive: NATURAL.jugoBrillo, emissiveIntensity: 0.5 })
  return Array.from({ length: cantidad }, () => {
    const m = new THREE.Mesh(geo, mat)
    m.visible = false
    m.scale.set(0.8, 1.15, 0.8)
    return m
  })
}
