// Modelo 3D de la mano: cilindros por hueso, esferas por articulación, palma translúcida y, opcionalmente, puntas de
// otro color y antebrazo. Se arma en cada cuadro desde los 21 puntos ya pasados a la escena (shell/manos3d.ts).
// Dos estilos: la mano del paciente (ESTILO_JUGADOR, imagenes/06a_juego_agarre.png) y la mano guía de Movilidad
// (estiloGuia), translúcida y luminosa. Huesos, articulaciones y puntas son mallas instanciadas (pocas llamadas).
import * as THREE from 'three'
import { CONEXIONES } from '../../metrics/geometria'
import { MANO, NEUTRO } from './colores'
import { geometria, material, type Recursos } from './recursos'

export const PALMA = [0, 5, 9, 13, 17]
export const PUNTAS = [4, 8, 12, 16, 20]
/** Triángulos de la palma: (0,1,5), (0,5,9), (0,9,13), (0,13,17). */
export const PALMA_ABANICO = [0, 1, 5, 0, 5, 9, 0, 9, 13, 0, 13, 17]

type V3 = [number, number, number]
type Material = THREE.MeshStandardMaterialParameters

export interface EstiloMano {
  /** Radio de hueso y esferas, como fracción de la escala (unidades de escena por metro de mano). */
  radio: number
  hueso: { factor: number; material: Material }
  /** Con `puntas` las yemas van aparte; sin él, las esferas cubren los 21 puntos. */
  articulacion: { factor: number; segmentos: [number, number]; material: Material }
  punta?: { factor: number; material: Material }
  palma: Material
  /** Radio del antebrazo como fracción de la escala. */
  antebrazo?: { radio: number; material: Material }
  sombra: boolean
  orden?: number
}

export const ESTILO_JUGADOR: EstiloMano = {
  radio: 0.0085,
  hueso: { factor: 1, material: { color: MANO.hueso, roughness: 0.45, metalness: 0.05 } },
  articulacion: { factor: 1.45, segmentos: [12, 10], material: { color: MANO.articulacion, roughness: 0.4 } },
  punta: { factor: 1.55, material: { color: MANO.punta, roughness: 0.35 } },
  palma: { color: MANO.palma, roughness: 0.6, transparent: true, opacity: 0.82, side: THREE.DoubleSide },
  antebrazo: { radio: 0.026, material: { color: MANO.antebrazo, roughness: 0.5 } },
  sombra: true,
}

/** Mano guía translúcida que brilla en `color` (Movilidad guiada). */
export function estiloGuia(color: number): EstiloMano {
  const translucido = { transparent: true, depthWrite: false }
  return {
    radio: 0.0085,
    hueso: { factor: 1.05, material: { color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, opacity: 0.72, ...translucido } },
    articulacion: { factor: 1.55, segmentos: [14, 10], material: { color: NEUTRO, emissive: color, emissiveIntensity: 0.9, roughness: 0.25, opacity: 0.9, ...translucido } },
    palma: { color, emissive: color, emissiveIntensity: 0.35, opacity: 0.35, side: THREE.DoubleSide, ...translucido },
    sombra: false,
    orden: 2,
  }
}

const ARRIBA = new THREE.Vector3(0, 1, 0)
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpDir = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpM = new THREE.Matrix4()
const tmpS = new THREE.Vector3()

export class ModeloMano {
  readonly grupo = new THREE.Group()
  /** Últimos 21 puntos puestos (coordenadas de la escena). */
  readonly puntos: THREE.Vector3[] = Array.from({ length: 21 }, () => new THREE.Vector3())
  private readonly huesos: THREE.InstancedMesh
  private readonly articulaciones: THREE.InstancedMesh
  private readonly puntas: THREE.InstancedMesh | null = null
  private readonly palma: THREE.Mesh
  private readonly antebrazo: THREE.Mesh | null = null
  private readonly posPalma = new Float32Array(PALMA_ABANICO.length * 3)
  private readonly radio: number
  private readonly indicesArticulacion: number[]

  /**
   * `escala` = unidades de escena por metro de mano (ZonaManos.escala). Con `recursos`, lo creado queda registrado para
   * liberarlo; sin él, lo libera EscenaBase.liberar() al recorrer la escena.
   */
  constructor(escala: number, estilo: EstiloMano = ESTILO_JUGADOR, recursos: Recursos = { materiales: [], geometrias: [], texturas: [] }) {
    const r = estilo.radio * escala
    this.radio = r
    const mat = (p: Material) => material(recursos, new THREE.MeshStandardMaterial(p))
    const geo = <G extends THREE.BufferGeometry>(g: G) => geometria(recursos, g)
    this.indicesArticulacion = estilo.punta ? Array.from({ length: 21 }, (_, i) => i).filter((i) => !PUNTAS.includes(i)) : Array.from({ length: 21 }, (_, i) => i)

    const rh = r * estilo.hueso.factor
    this.huesos = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(rh, rh, 1, 10, 1, true)), mat(estilo.hueso.material), CONEXIONES.length)
    const [s1, s2] = estilo.articulacion.segmentos
    this.articulaciones = new THREE.InstancedMesh(
      geo(new THREE.SphereGeometry(r * estilo.articulacion.factor, s1, s2)),
      mat(estilo.articulacion.material),
      this.indicesArticulacion.length,
    )
    if (estilo.punta) {
      this.puntas = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(r * estilo.punta.factor, 12, 10)), mat(estilo.punta.material), PUNTAS.length)
    }
    const gPalma = geo(new THREE.BufferGeometry())
    gPalma.setAttribute('position', new THREE.BufferAttribute(this.posPalma, 3))
    this.palma = new THREE.Mesh(gPalma, mat(estilo.palma))
    if (estilo.antebrazo) {
      this.antebrazo = new THREE.Mesh(geo(new THREE.CapsuleGeometry(estilo.antebrazo.radio * escala, 1, 6, 14)), mat(estilo.antebrazo.material))
    }
    for (const m of [this.huesos, this.articulaciones, this.puntas, this.palma, this.antebrazo]) {
      if (!m) continue
      if (estilo.sombra) m.castShadow = true
      if (estilo.orden != null) m.renderOrder = estilo.orden
      m.frustumCulled = false
      this.grupo.add(m)
    }
  }

  /** Arma la mano con los 21 puntos de la escena. */
  poner(p: V3[]) {
    p.forEach((q, i) => this.puntos[i].set(q[0], q[1], q[2]))
    CONEXIONES.forEach(([a, b], k) => {
      tmpA.copy(this.puntos[a])
      tmpB.copy(this.puntos[b])
      tmpDir.subVectors(tmpB, tmpA)
      const largo = tmpDir.length()
      tmpQ.setFromUnitVectors(ARRIBA, tmpDir.normalize())
      tmpM.compose(tmpA.add(tmpB).multiplyScalar(0.5), tmpQ, tmpS.set(1, largo, 1))
      this.huesos.setMatrixAt(k, tmpM)
    })
    this.huesos.instanceMatrix.needsUpdate = true
    tmpQ.identity()
    tmpS.set(1, 1, 1)
    this.indicesArticulacion.forEach((i, k) => this.articulaciones.setMatrixAt(k, tmpM.compose(this.puntos[i], tmpQ, tmpS)))
    this.articulaciones.instanceMatrix.needsUpdate = true
    if (this.puntas) {
      PUNTAS.forEach((i, k) => this.puntas!.setMatrixAt(k, tmpM.compose(this.puntos[i], tmpQ, tmpS)))
      this.puntas.instanceMatrix.needsUpdate = true
    }
    // Palma: abanico de triángulos desde la muñeca.
    PALMA_ABANICO.forEach((i, k) => this.posPalma.set([p[i][0], p[i][1], p[i][2]], k * 3))
    const g = this.palma.geometry
    g.attributes.position.needsUpdate = true
    g.computeVertexNormals()
    g.computeBoundingSphere()
    // Antebrazo: desde la muñeca, en sentido contrario al dedo medio.
    if (this.antebrazo) {
      const muneca = this.puntos[0]
      tmpDir.subVectors(muneca, this.puntos[9]).normalize()
      const largoBrazo = muneca.distanceTo(this.puntos[9]) * 1.7
      tmpA.copy(muneca).addScaledVector(tmpDir, largoBrazo / 2 + this.radio)
      this.antebrazo.position.copy(tmpA)
      this.antebrazo.quaternion.setFromUnitVectors(ARRIBA, tmpDir)
      this.antebrazo.scale.set(1, largoBrazo, 1)
    }
  }

  /** Centro de la palma (promedio de muñeca y nudillos) con los últimos puntos. */
  centroPalma(destino = new THREE.Vector3()): THREE.Vector3 {
    destino.set(0, 0, 0)
    for (const i of PALMA) destino.add(this.puntos[i])
    return destino.multiplyScalar(1 / PALMA.length)
  }
}
