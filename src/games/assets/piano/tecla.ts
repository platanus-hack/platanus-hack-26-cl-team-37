// Piano de dedos: teclas (una por dedo, con su color), la línea donde se tocan las notas y las notas que bajan.
// Las teclas y la línea usan una caja unitaria que el juego escala y ubica en cada cuadro.
import * as THREE from 'three'
import type { Dedo } from '../../../metrics/geometria'
import { NEUTRO } from '../colores'
import { geometria, material, type Recursos } from '../recursos'

/** Caja unitaria compartida por teclas y líneas. */
export function crearGeoTecla(r: Recursos): THREE.BoxGeometry {
  return geometria(r, new THREE.BoxGeometry(1, 1, 1))
}

/** Teclas de una mano, en el orden de `dedos`, con el color de cada dedo, y la línea blanca de toque. */
export function crearTeclado(r: Recursos, geo: THREE.BufferGeometry, dedos: Dedo[], colores: Record<Dedo, number>) {
  const teclas = {} as Record<Dedo, THREE.Mesh>
  for (const f of dedos) {
    const m = new THREE.Mesh(geo, material(r, new THREE.MeshStandardMaterial({ color: colores[f], emissive: colores[f], emissiveIntensity: 0.12, roughness: 0.5 })))
    m.castShadow = true
    m.receiveShadow = true
    teclas[f] = m
  }
  const linea = new THREE.Mesh(geo, material(r, new THREE.MeshBasicMaterial({ color: NEUTRO, transparent: true, opacity: 0.75, depthWrite: false })))
  return { teclas, linea }
}

/** `cantidad` notas ocultas de `ancho` (cada una con su material, que el juego tiñe del color del dedo). */
export function crearNotas(r: Recursos, ancho: number, cantidad: number): { malla: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] {
  const geo = geometria(r, new THREE.BoxGeometry(ancho, 0.14, 0.3))
  return Array.from({ length: cantidad }, () => {
    const mat = material(r, new THREE.MeshStandardMaterial({ color: NEUTRO, emissive: NEUTRO, emissiveIntensity: 0.2, roughness: 0.4, transparent: true }))
    const malla = new THREE.Mesh(geo, mat)
    malla.castShadow = true
    malla.visible = false
    return { malla, mat }
  })
}
