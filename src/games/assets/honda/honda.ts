// Honda (F39): la horquilla de madera, las tiras de la banda con la bolsa y la piedra, el blanco y la marca de caída.
// Los crea el juego (src/games/honda/modulo.ts), que los ubica y los anima. El efecto de acierto (gotas y «+1») es el
// de Atrapa burbujas (assets/burbujas/burbuja.ts).
import * as THREE from 'three'
import { kuwuNum } from '../../../ui/paleta'
import { NATURAL, tono } from '../colores'
import { estandar, geometria, material, type Recursos } from '../recursos'

const ARRIBA = new THREE.Vector3(0, 1, 0)

/** Pone un cilindro unitario (alto 1 sobre Y) entre dos puntos con ese radio. Oculta la malla si los puntos coinciden. */
export function tender(m: THREE.Mesh, desde: THREE.Vector3, hasta: THREE.Vector3, radio: number) {
  const dir = new THREE.Vector3().subVectors(hasta, desde)
  const largo = dir.length()
  m.visible = largo > 1e-4
  if (!m.visible) return
  m.quaternion.setFromUnitVectors(ARRIBA, dir.multiplyScalar(1 / largo))
  m.position.addVectors(desde, hasta).multiplyScalar(0.5)
  m.scale.set(radio, largo, radio)
}

export interface BaseHonda {
  cilindro: THREE.CylinderGeometry
  esfera: THREE.SphereGeometry
  madera: THREE.MeshStandardMaterial
}

/** Geometrías y madera que comparten las piezas de la honda. */
export function crearBaseHonda(r: Recursos): BaseHonda {
  return {
    cilindro: geometria(r, new THREE.CylinderGeometry(1, 1, 1, 14, 1)),
    esfera: geometria(r, new THREE.SphereGeometry(1, 20, 14)),
    madera: estandar(r, new THREE.Color(NATURAL.madera).multiplyScalar(0.72).getHex(), { roughness: 0.75 }),
  }
}

export interface MedidasHorquilla {
  /** z de la honda sobre la mesa. */
  z: number
  /** Altura y media separación de las puntas de la horquilla. */
  altoPuntas: number
  mitadAncho: number
}

/** Horquilla en Y con mango y base, de pie sobre la mesa. Devuelve también dónde quedan sus dos puntas. */
export function crearHorquilla(r: Recursos, b: BaseHonda, m: MedidasHorquilla): { grupo: THREE.Group; puntas: [THREE.Vector3, THREE.Vector3] } {
  const grupo = new THREE.Group()
  const pie = new THREE.Mesh(geometria(r, new THREE.CylinderGeometry(0.2, 0.24, 0.08, 20)), b.madera)
  pie.position.set(0, 0.04, m.z)
  const nudo = new THREE.Vector3(0, 0.62, m.z)
  const mango = new THREE.Mesh(b.cilindro, b.madera)
  tender(mango, new THREE.Vector3(0, 0.05, m.z), nudo, 0.07)
  const union = new THREE.Mesh(b.esfera, b.madera)
  union.position.copy(nudo)
  union.scale.setScalar(0.085)
  grupo.add(pie, mango, union)
  const puntas: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-m.mitadAncho, m.altoPuntas, m.z), new THREE.Vector3(m.mitadAncho, m.altoPuntas, m.z)]
  for (const p of puntas) {
    const brazo = new THREE.Mesh(b.cilindro, b.madera)
    tender(brazo, nudo, p, 0.06)
    const punta = new THREE.Mesh(b.esfera, b.madera)
    punta.position.copy(p)
    punta.scale.setScalar(0.065)
    grupo.add(brazo, punta)
  }
  for (const o of grupo.children) (o as THREE.Mesh).castShadow = true
  return { grupo, puntas }
}

/** Las dos tiras de la banda (azules, como la banda real), la bolsa de cuero y la piedra. El juego las mueve. */
export function crearBolsa(r: Recursos, b: BaseHonda, radioPiedra: number) {
  const matTira = estandar(r, kuwuNum('azul'), { roughness: 0.45, emissive: kuwuNum('marino'), emissiveIntensity: 0.35 })
  const tiras = [0, 1].map(() => {
    const t = new THREE.Mesh(b.cilindro, matTira)
    t.castShadow = true
    t.frustumCulled = false
    return t
  })
  const cuero = new THREE.Mesh(geometria(r, new THREE.BoxGeometry(0.26, 0.1, 0.14)), estandar(r, NATURAL.cuero, { roughness: 0.85 }))
  cuero.castShadow = true
  const piedra = new THREE.Mesh(b.esfera, estandar(r, NATURAL.piedra, { roughness: 0.9 }))
  piedra.scale.setScalar(radioPiedra)
  piedra.castShadow = true
  return { tiras, matTira, cuero, piedra }
}

/** Blanco de pie sobre un poste: anillos rojo y blanco con el centro amarillo, que se enciende al acertar. */
export function crearBlanco(r: Recursos, b: BaseHonda, radio: number, alto: number) {
  const grupo = new THREE.Group()
  const poste = new THREE.Mesh(b.cilindro, b.madera)
  tender(poste, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, alto, 0), 0.05)
  poste.castShadow = true
  grupo.add(poste)
  const anillos: [number, number][] = [
    [1, kuwuNum('rojo')],
    [0.78, kuwuNum('blanco')],
    [0.56, kuwuNum('rojo')],
    [0.34, kuwuNum('blanco')],
  ]
  anillos.forEach(([f, color], i) => {
    const disco = new THREE.Mesh(geometria(r, new THREE.CylinderGeometry(radio * f, radio * f, 0.05, 40)), estandar(r, color, { roughness: 0.55 }))
    disco.rotation.x = Math.PI / 2
    disco.position.set(0, alto, 0.01 + i * 0.012)
    disco.castShadow = i === 0
    grupo.add(disco)
  })
  const matCentro = estandar(r, kuwuNum('amarillo'), { roughness: 0.4, emissive: tono('amarillo', 0.9), emissiveIntensity: 0 })
  const centro = new THREE.Mesh(geometria(r, new THREE.CylinderGeometry(radio * 0.14, radio * 0.14, 0.05, 28)), matCentro)
  centro.rotation.x = Math.PI / 2
  centro.position.set(0, alto, 0.06)
  grupo.add(centro)
  return { grupo, matCentro }
}

export interface BaseMarcas {
  geo: THREE.CircleGeometry
  mat: THREE.MeshBasicMaterial
}

/** Geometría y material de las marcas que dejan en la mesa los tiros que no dieron en el blanco. */
export function crearBaseMarcas(r: Recursos): BaseMarcas {
  return {
    geo: geometria(r, new THREE.CircleGeometry(0.12, 24)),
    mat: material(r, new THREE.MeshBasicMaterial({ color: kuwuNum('marino'), transparent: true, opacity: 0.35, depthWrite: false })),
  }
}

/** Una marca plana sobre la mesa en (x, z). */
export function crearMarca(b: BaseMarcas, x: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(b.geo, b.mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, 0.005, z)
  return m
}
