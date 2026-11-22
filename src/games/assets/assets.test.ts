// Cada fábrica de assets registra en `Recursos` todo material y geometría que pone en sus objetos, para que el juego
// los libere al desmontar o rearmar la escena (las texturas de lienzo necesitan `document` y se prueban en e2e).
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { kuwuNum } from '../../ui/paleta'
import { COLOR_DEDO, DEDOS_PIANO } from '../piano/logica'
import { MANO, NEUTRO } from './colores'
import { crearAnilloPlano } from './formas'
import { ESTILO_JUGADOR, estiloGuia, ModeloMano } from './mano'
import { crearBaseHonda, crearBaseMarcas, crearBlanco, crearBolsa, crearHorquilla, crearMarca } from './honda/honda'
import { crearMesa } from './mesa'
import { crearCuentas } from './movilidad/cuentas'
import { crearGotas, crearMitades, crearNaranja3d, crearVaso } from './naranja/naranja'
import { crearGeoTecla, crearNotas, crearTeclado } from './piano/tecla'
import { liberar, nuevosRecursos, type Recursos } from './recursos'
import { crearSilueta } from './torre/base'

/** Materiales y geometrías de los objetos que no quedaron registrados. */
function sinRegistrar(r: Recursos, objetos: THREE.Object3D[]): string[] {
  const faltan: string[] = []
  for (const o of objetos)
    o.traverse((n) => {
      const m = n as THREE.Mesh
      if (!m.geometry) return
      if (!r.geometrias.includes(m.geometry)) faltan.push(`${n.type}: geometría`)
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!r.materiales.includes(mat)) faltan.push(`${n.type}: material`)
    })
  return faltan
}

/** Las piezas de la Honda: horquilla, tiras con bolsa y piedra, blanco y una marca de caída. */
function hondas(r: Recursos): THREE.Object3D[] {
  const base = crearBaseHonda(r)
  const bolsa = crearBolsa(r, base, 0.085)
  return [crearHorquilla(r, base, { z: 0.7, altoPuntas: 1.05, mitadAncho: 0.36 }).grupo, ...bolsa.tiras, bolsa.cuero, bolsa.piedra, crearBlanco(r, base, 0.42, 0.62).grupo, crearMarca(crearBaseMarcas(r), 0, 0)]
}

describe('assets de los juegos', () => {
  it('cada fábrica registra lo que crea', () => {
    const r = nuevosRecursos()
    const vaso = crearVaso(r, { x: 0, z: 0, alto: 0.95, base: 0.06 }, 0)
    const teclado = crearTeclado(r, crearGeoTecla(r), DEDOS_PIANO, COLOR_DEDO)
    const objetos: THREE.Object3D[] = [
      new ModeloMano(6, estiloGuia(kuwuNum('menta')), r).grupo,
      crearAnilloPlano(r, { interno: 0.5, color: NEUTRO, opacidad: 0.5 }),
      crearCuentas(r, 5, 0, NEUTRO).malla,
      crearNaranja3d(r, 0.3),
      ...Object.values(vaso),
      ...crearMitades(r, 4),
      ...crearGotas(r, 3),
      ...Object.values(teclado.teclas),
      teclado.linea,
      ...crearNotas(r, 0.3, 4).map((n) => n.malla),
      crearSilueta(r, 0.4),
      ...hondas(r),
    ]
    expect(sinRegistrar(r, objetos)).toEqual([])
    liberar(r)
    expect(r.materiales.length + r.geometrias.length + r.texturas.length).toBe(0)
  })

  it('mano del jugador: huesos, articulaciones, puntas, palma y antebrazo con los colores de la marca', () => {
    const mano = new ModeloMano(6.2, ESTILO_JUGADOR)
    expect(mano.grupo.children).toHaveLength(5)
    const colores = mano.grupo.children.map((m) => ((m as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex())
    expect(colores).toEqual([MANO.hueso, MANO.articulacion, MANO.punta, MANO.palma, MANO.antebrazo])
    // Armar la mano con una pose cualquiera deja los 21 puntos y el centro de la palma.
    const p = Array.from({ length: 21 }, (_, i) => [i * 0.01, 1, 0] as [number, number, number])
    mano.poner(p)
    expect(mano.puntos[20].x).toBeCloseTo(0.2)
    expect(mano.centroPalma().y).toBeCloseTo(1)
  })

  it('mano guía: sin puntas ni antebrazo, se dibuja sobre la mesa (orden 2) y no da sombra', () => {
    const guia = new ModeloMano(6.2, estiloGuia(kuwuNum('menta')))
    expect(guia.grupo.children).toHaveLength(3)
    for (const m of guia.grupo.children) {
      expect(m.renderOrder).toBe(2)
      expect(m.castShadow).toBe(false)
    }
  })

  it('mesa: tablero de 5,4 × 3,3 con la cara de arriba en y = 0', () => {
    const mesa = crearMesa()
    const caja = new THREE.Box3().setFromObject(mesa)
    expect(caja.max.y).toBeCloseTo(0)
    expect(caja.max.x - caja.min.x).toBeCloseTo(5.4)
    expect(caja.max.z - caja.min.z).toBeCloseTo(3.3)
  })
})
