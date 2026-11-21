// Formas planas sobre la mesa: anillos (zonas, aros de tolerancia, ondas) y discos con textura (halos en el piso).
import * as THREE from 'three'
import { geometria, material, type Recursos } from './recursos'

export interface OpcionesAnillo {
  interno: number
  externo?: number
  color: number
  opacidad: number
  segmentos?: number
  /** Visible desde abajo también. */
  dobleCara?: boolean
  orden?: number
}

/** Anillo acostado sobre la mesa (plano XZ), sin escribir profundidad. Con `externo` = 1 se escala con `scale`. */
export function crearAnilloPlano(r: Recursos, o: OpcionesAnillo): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const geo = geometria(r, new THREE.RingGeometry(o.interno, o.externo ?? 1, o.segmentos ?? 96))
  geo.rotateX(-Math.PI / 2)
  const mat = material(
    r,
    new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.opacidad, depthWrite: false, ...(o.dobleCara ? { side: THREE.DoubleSide } : {}) }),
  )
  const m = new THREE.Mesh(geo, mat)
  m.renderOrder = o.orden ?? 1
  return m
}

/** Disco de 2 × 2 acostado sobre la mesa con una textura aditiva (halo en el piso). */
export function crearDisco(r: Recursos, tex: THREE.Texture, color: number, opacidad: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const geo = geometria(r, new THREE.PlaneGeometry(2, 2))
  geo.rotateX(-Math.PI / 2)
  const mat = material(r, new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: opacidad, depthWrite: false, blending: THREE.AdditiveBlending }))
  const m = new THREE.Mesh(geo, mat)
  m.renderOrder = 0
  return m
}
