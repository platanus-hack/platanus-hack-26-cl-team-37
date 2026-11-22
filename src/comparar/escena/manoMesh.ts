// F38 · Mano 3D de la comparación de sesiones. Usa el MISMO modelo que los juegos (`ModeloMano` de
// src/games/assets/mano.ts: huesos, articulaciones, puntas, palma translúcida y antebrazo), así el terapeuta y el paciente
// ven en la comparación la mano que se vio al jugar. Las escenas pasan los 21 puntos en mm (ya escalados al largo de mano).
//  · Mano de una sesión: el estilo del jugador (articulaciones y puntas iguales que en los juegos); los huesos y la palma
//    toman el color de la sesión (antes/después) para distinguirlas lado a lado o superpuestas.
//  · Mano de referencia (neutra): la mano guía de Movilidad guiada (`estiloGuia`), más tenue para no tapar a la otra.
// El modelo se arma en las mismas unidades que en los juegos (ZONA_BASE.escala por metro) y el grupo se escala a mm: así
// el antebrazo y los radios quedan con las proporciones de los juegos (el antebrazo se estira en largo y, en mm, quedaba
// como un poste que cruzaba toda la escena).
import type * as THREE from 'three'
import { ESTILO_JUGADOR, estiloGuia, ModeloMano, type EstiloMano } from '../../games/assets/mano'
import { ZONA_BASE } from '../../games/shell/manos3d'
import type { V3 } from '../mano'

/** Unidades de los juegos por mm de mano. */
const UNIDADES_POR_MM = ZONA_BASE.escala / 1000

export interface ManoMesh {
  g: THREE.Group
  /** Pone los 21 puntos (mm). */
  poner(p: V3[]): void
  /** Cambia la opacidad de toda la mano (1 = como en los juegos). */
  opacidad(o: number): void
}

/** Estilo del jugador de los juegos con los huesos y la palma del color de la sesión. */
export function estiloSesion(color: THREE.Color, conAntebrazo = true): EstiloMano {
  const c = color.getHex()
  return {
    ...ESTILO_JUGADOR,
    hueso: { ...ESTILO_JUGADOR.hueso, material: { ...ESTILO_JUGADOR.hueso.material, color: c } },
    palma: { ...ESTILO_JUGADOR.palma, color: c },
    antebrazo: conAntebrazo ? ESTILO_JUGADOR.antebrazo : undefined,
  }
}

/** Mano guía de los juegos, tenue: es solo la referencia de la posición neutra. */
export function estiloReferencia(color: THREE.Color): EstiloMano {
  const g = estiloGuia(color.getHex())
  const tenue = (m: THREE.MeshStandardMaterialParameters, opacity: number) => ({ ...m, opacity, emissiveIntensity: 0.15 })
  return {
    ...g,
    hueso: { ...g.hueso, material: tenue(g.hueso.material, 0.22) },
    articulacion: { ...g.articulacion, material: tenue(g.articulacion.material, 0.26) },
    palma: tenue(g.palma, 0.12),
  }
}

/**
 * `escala` = factor de tamaño de la mano (1 = mano modelo). `antebrazo: false` en escenas donde importa el ángulo de la
 * muñeca: el antebrazo del modelo sigue la dirección de la mano y taparía ese ángulo.
 */
export function crearMano(color: THREE.Color, opciones: { escala?: number; fantasma?: boolean; antebrazo?: boolean } = {}): ManoMesh {
  const { escala = 1, fantasma = false, antebrazo = true } = opciones
  const modelo = new ModeloMano(ZONA_BASE.escala * escala, fantasma ? estiloReferencia(color) : estiloSesion(color, antebrazo))
  modelo.grupo.scale.setScalar(1 / UNIDADES_POR_MM)
  // Materiales del modelo con sus valores originales, para volver a ellos con opacidad(1).
  const materiales: { m: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }[] = []
  modelo.grupo.traverse((n) => {
    const mat = (n as THREE.Mesh).material as THREE.Material | undefined
    if (mat && !materiales.some((x) => x.m === mat)) materiales.push({ m: mat, opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite })
  })
  return {
    g: modelo.grupo,
    poner(p) {
      modelo.poner(p.map((q) => [q[0] * UNIDADES_POR_MM, q[1] * UNIDADES_POR_MM, q[2] * UNIDADES_POR_MM] as V3))
    },
    opacidad(o) {
      if (fantasma) return
      const solida = o >= 1
      for (const x of materiales) {
        x.m.transparent = solida ? x.transparent : true
        x.m.opacity = solida ? x.opacity : Math.min(x.opacity, o)
        x.m.depthWrite = solida ? x.depthWrite : false
        x.m.needsUpdate = true
      }
    },
  }
}
