// F38 · Mano 3D con volumen a partir de 21 puntos (orden MediaPipe): falanges como cilindros que se afinan, nudillos
// esféricos y palma rellena. Mismo dibujo del prototipo aprobado.
import * as THREE from 'three'
import type { V3 } from '../mano'

const DEDOS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]
/** [desde, hasta, radio en mm] */
const HUESOS: [number, number, number][] = []
DEDOS.forEach((d, f) => {
  const base = f === 0 ? 9 : f === 4 ? 6.5 : 7.5
  HUESOS.push([0, d[0]!, base + 1.5])
  for (let i = 0; i < 3; i++) HUESOS.push([d[i]!, d[i + 1]!, base - i * 1.1])
})
HUESOS.push([5, 9, 7], [9, 13, 7], [13, 17, 6.5])
const PALMA = [
  [0, 1, 5],
  [0, 5, 9],
  [0, 9, 13],
  [0, 13, 17],
  [1, 2, 5],
]

export interface ManoMesh {
  g: THREE.Group
  /** Pone los 21 puntos (mm). */
  poner(p: V3[]): void
  /** Cambia la opacidad de toda la mano (1 = sólida). */
  opacidad(o: number): void
}

export function crearMano(color: THREE.Color, opciones: { escala?: number; fantasma?: boolean } = {}): ManoMesh {
  const { escala = 1, fantasma = false } = opciones
  const g = new THREE.Group()
  const mat = fantasma
    ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false })
    : new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 })
  const cil = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true)
  const esf = new THREE.SphereGeometry(1, 20, 14)
  const huesos = HUESOS.map(([, , r]) => {
    const m = new THREE.Mesh(cil, mat)
    m.userData.r = r * escala
    m.castShadow = !fantasma
    g.add(m)
    return m
  })
  const juntas = Array.from({ length: 21 }, (_, i) => {
    const r = Math.max(...HUESOS.filter((h) => h[0] === i || h[1] === i).map((h) => h[2]))
    const m = new THREE.Mesh(esf, mat)
    m.scale.setScalar((i === 0 ? 11 : r * 1.06) * escala)
    m.castShadow = !fantasma
    g.add(m)
    return m
  })
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PALMA.length * 9), 3))
  const matPalma = fantasma ? mat : new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
  const palma = new THREE.Mesh(pg, matPalma)
  palma.castShadow = !fantasma
  g.add(palma)
  const arriba = new THREE.Vector3(0, 1, 0)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const d = new THREE.Vector3()
  return {
    g,
    poner(p) {
      juntas.forEach((j, i) => j.position.set(p[i]![0], p[i]![1], p[i]![2]))
      HUESOS.forEach(([i, k], n) => {
        a.set(...p[i]!)
        b.set(...p[k]!)
        d.subVectors(b, a)
        const h = huesos[n]!
        const r = h.userData.r as number
        h.position.addVectors(a, b).multiplyScalar(0.5)
        h.scale.set(r, Math.max(d.length(), 0.01), r)
        h.quaternion.setFromUnitVectors(arriba, d.normalize())
      })
      const pos = pg.attributes.position as THREE.BufferAttribute
      PALMA.forEach((t, ti) => t.forEach((i, v) => pos.setXYZ(ti * 3 + v, p[i]![0], p[i]![1], p[i]![2])))
      pos.needsUpdate = true
      pg.computeVertexNormals()
      pg.computeBoundingSphere()
    },
    opacidad(o) {
      if (fantasma) return
      const solida = o >= 1
      for (const m of [mat, matPalma]) {
        m.transparent = !solida || m === matPalma
        m.opacity = m === matPalma ? Math.min(o, 0.92) : o
        m.depthWrite = solida
        m.needsUpdate = true
      }
    },
  }
}
