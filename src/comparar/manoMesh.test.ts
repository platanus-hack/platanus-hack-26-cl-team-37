// La comparación 3D usa el mismo modelo de mano que los juegos (src/games/assets/mano.ts).
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { MANO } from '../games/assets/colores'
import { ModeloMano } from '../games/assets/mano'
import { crearMano } from './escena/manoMesh'
import { poseModelo } from './mano'

const AZUL = new THREE.Color(0x3b82f6)
const colorDe = (o: THREE.Object3D) => ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()
const materialDe = (o: THREE.Object3D) => (o as THREE.Mesh).material as THREE.MeshStandardMaterial

describe('mano de la comparación', () => {
  it('es el modelo de los juegos: huesos, articulaciones, puntas, palma y antebrazo', () => {
    const mano = crearMano(AZUL)
    const juego = new ModeloMano(1000)
    expect(mano.g.children.map((c) => c.type)).toEqual(juego.grupo.children.map((c) => c.type))
    const [huesos, articulaciones, puntas, palma, antebrazo] = mano.g.children
    // Articulaciones, puntas y antebrazo como en los juegos; huesos y palma llevan el color de la sesión.
    expect(colorDe(articulaciones!)).toBe(MANO.articulacion)
    expect(colorDe(puntas!)).toBe(MANO.punta)
    expect(colorDe(antebrazo!)).toBe(MANO.antebrazo)
    expect(colorDe(huesos!)).toBe(AZUL.getHex())
    expect(colorDe(palma!)).toBe(AZUL.getHex())
  })

  it('sin antebrazo para la escena de la muñeca; la referencia neutra es la mano guía de los juegos', () => {
    expect(crearMano(AZUL, { antebrazo: false }).g.children).toHaveLength(4)
    const guia = crearMano(AZUL, { fantasma: true })
    expect(guia.g.children).toHaveLength(3) // huesos, articulaciones y palma, translúcidos
    expect(guia.g.children.every((c) => materialDe(c).transparent)).toBe(true)
  })

  it('arma la pose en mm y la opacidad vuelve a la original', () => {
    const mano = crearMano(AZUL, { escala: 1.1 })
    const pose = poseModelo({ pulgar: 40, indice: 90, medio: 90, anular: 90, menique: 90 }, 0.5, 1.1, 'derecha')
    mano.poner(pose)
    // En mm, del tamaño de una mano (y no un antebrazo de metros: el modelo se arma en unidades de los juegos).
    const tam = new THREE.Box3().setFromObject(mano.g).getSize(new THREE.Vector3())
    expect(Math.max(tam.x, tam.y, tam.z)).toBeGreaterThan(150)
    expect(Math.max(tam.x, tam.y, tam.z)).toBeLessThan(600)
    const palma = materialDe(mano.g.children[3]!)
    const huesos = materialDe(mano.g.children[0]!)
    mano.opacidad(0.45)
    expect(huesos.transparent).toBe(true)
    expect(huesos.opacity).toBeCloseTo(0.45)
    expect(palma.opacity).toBeCloseTo(0.45)
    mano.opacidad(1)
    expect(huesos.transparent).toBe(false)
    expect(huesos.opacity).toBe(1)
    expect(palma.opacity).toBeCloseTo(0.82)
  })
})
