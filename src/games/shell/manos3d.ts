// Manos virtuales del paciente: mapeo de los landmarks a la escena y una mano 3D por lado (modelo en assets/mano.ts).
//
// Mapeo a la escena (puro: puntosEnEscena, con pruebas):
// - Posición: el centro de la palma en la imagen + la distancia estimada. Como un ESPEJO: la imagen cruda se
//   invierte en x (la mano derecha del paciente aparece a la derecha de la pantalla); subir la mano en la imagen
//   la sube sobre la mesa. La pantalla es una ventana al juego: acercar la mano a la cámara (a la pantalla) la
//   METE hacia el fondo de la mesa y alejarla la trae hacia el frente (corregido tras la prueba con cámara real).
// - Forma: worldLandmarks (metros, centrados) pasados al marco de la escena en espejo (x → −x, y → −y, z → −z),
//   escalados (`escala` unidades por metro) e inclinados `inclinacionDeg` hacia el fondo, para que una mano con
//   los dedos hacia arriba frente al teléfono se vea "entrando" a la mesa como en la imagen de referencia.
import * as THREE from 'three'
import { ESTILO_JUGADOR, ModeloMano, PALMA } from '../assets/mano'
import type { LadoMano } from '../../domain/types'
import type { P3 } from '../../metrics/geometria'
import type { ManoSeguida } from '../../tracking/tipos'

export interface ZonaManos {
  /** x de la escena para el borde izquierdo y derecho de la imagen (ya en espejo). */
  x: [number, number]
  /** Altura de la palma para la mano abajo y arriba en la imagen. */
  y: [number, number]
  /** z de la escena con la mano cerca de la cámara (fondo de la mesa) y lejos de ella (frente de la mesa). */
  z: [number, number]
  /** Distancias (cm) que corresponden a z[0] y z[1]. */
  distanciaCm: [number, number]
  /** Margen de la imagen que no se usa (fracción a cada lado): llegar a los bordes de la mesa sin salir de cuadro. */
  margen: number
  /** Unidades de escena por metro de mano. */
  escala: number
  inclinacionDeg: number
}

export const ZONA_BASE: ZonaManos = {
  x: [-2.1, 2.1],
  y: [0.3, 1.6],
  z: [-0.9, 0.9],
  distanciaCm: [30, 65],
  margen: 0.1,
  escala: 6.2,
  inclinacionDeg: 68,
}

export { PALMA, PUNTAS } from '../assets/mano'

type V3 = [number, number, number]

const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const recorte = (u: number) => Math.min(1, Math.max(0, u))

export function centroPalma(p: P3[]): P3 {
  const c = { x: 0, y: 0, z: 0 }
  for (const i of PALMA) {
    c.x += p[i].x / PALMA.length
    c.y += p[i].y / PALMA.length
    c.z += p[i].z / PALMA.length
  }
  return c
}

/** Posición en la escena del centro de la palma (imagen cruda 0..1 + distancia). */
export function anclaEnEscena(cx: number, cy: number, distanciaCm: number | null, zona: ZonaManos = ZONA_BASE): V3 {
  const util = 1 - 2 * zona.margen
  const u = recorte((1 - cx - zona.margen) / util) // espejo
  const v = recorte((1 - cy - zona.margen) / util)
  const d = distanciaCm == null ? 0.5 : recorte((distanciaCm - zona.distanciaCm[0]) / (zona.distanciaCm[1] - zona.distanciaCm[0]))
  return [lerp(zona.x[0], zona.x[1], u), lerp(zona.y[0], zona.y[1], v), lerp(zona.z[0], zona.z[1], d)]
}

/** Los 21 puntos de la mano en coordenadas de la escena. */
export function puntosEnEscena(mano: Pick<ManoSeguida, 'landmarks' | 'worldLandmarks'>, distanciaCm: number | null, zona: ZonaManos = ZONA_BASE): V3[] {
  const c = centroPalma(mano.landmarks)
  const [ax, ay, az] = anclaEnEscena(c.x, c.y, distanciaCm, zona)
  const w0 = centroPalma(mano.worldLandmarks)
  const a = (zona.inclinacionDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return mano.worldLandmarks.map((w) => {
    // espejo: x → −x; imagen y abajo → escena y arriba; z de MediaPipe (+ = más lejos de la cámara) → hacia el frente.
    // La pantalla es una ventana al juego: lo más cercano a la cámara queda más al fondo de la mesa.
    const x = -(w.x - w0.x) * zona.escala
    const y = -(w.y - w0.y) * zona.escala
    const z = (w.z - w0.z) * zona.escala
    // inclinación alrededor de x: los dedos (+y) se van hacia el fondo (−z)
    return [ax + x, ay + y * cos + z * sin, az - y * sin + z * cos]
  })
}

// ── Malla (el modelo está en assets/mano.ts) ─────────────────────────────────────────────────────

/** Una mano del paciente: el modelo y si se vio en el último cuadro. */
class ManoVirtual {
  readonly modelo: ModeloMano
  visible = false

  constructor(escala: number) {
    this.modelo = new ModeloMano(escala, ESTILO_JUGADOR)
    this.modelo.grupo.visible = false
  }

  get grupo(): THREE.Group {
    return this.modelo.grupo
  }

  get puntos(): THREE.Vector3[] {
    return this.modelo.puntos
  }

  actualizar(p: V3[] | null) {
    this.visible = !!p
    this.modelo.grupo.visible = !!p
    if (p) this.modelo.poner(p)
  }
}

export class ManosVirtuales {
  readonly grupo = new THREE.Group()
  zona: ZonaManos
  private manos: Record<LadoMano, ManoVirtual>

  constructor(zona: ZonaManos = ZONA_BASE) {
    this.zona = { ...zona }
    this.manos = { izquierda: new ManoVirtual(zona.escala), derecha: new ManoVirtual(zona.escala) }
    this.grupo.add(this.manos.izquierda.grupo, this.manos.derecha.grupo)
  }

  /** Arma las manos del cuadro. `distancias` = distancia estimada por lado (cm aprox.). */
  actualizar(manos: ManoSeguida[], distancias: Partial<Record<LadoMano, number | null>>) {
    const vistas = new Set<LadoMano>()
    for (const m of manos) {
      if (vistas.has(m.lado)) continue
      vistas.add(m.lado)
      this.manos[m.lado].actualizar(puntosEnEscena(m, distancias[m.lado] ?? null, this.zona))
    }
    for (const lado of ['izquierda', 'derecha'] as LadoMano[]) if (!vistas.has(lado)) this.manos[lado].actualizar(null)
  }

  visible(lado: LadoMano): boolean {
    return this.manos[lado].visible
  }

  /** Posición en la escena del landmark i (0..20) de esa mano (última conocida). */
  punto(lado: LadoMano, i: number): THREE.Vector3 {
    return this.manos[lado].puntos[i]
  }

  /** Centro de la palma en la escena. */
  palma(lado: LadoMano, destino = new THREE.Vector3()): THREE.Vector3 {
    destino.set(0, 0, 0)
    for (const i of PALMA) destino.add(this.manos[lado].puntos[i])
    return destino.multiplyScalar(1 / PALMA.length)
  }
}
