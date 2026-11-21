// Movilidad guiada: cuentas del arco al fondo de la mesa (una por ciclo de la meta). El juego las colorea y anima.
import * as THREE from 'three'
import { NEUTRO } from '../colores'
import { estandar, geometria, type Recursos } from '../recursos'

/** `n` esferas instanciadas en un arco suave y centrado al fondo de la mesa, todas con `colorInicial`. */
export function crearCuentas(r: Recursos, n: number, alturaMesa: number, colorInicial: number): { malla: THREE.InstancedMesh; posiciones: THREE.Vector3[] } {
  const radio = n > 8 ? 0.07 : 0.08
  const geo = geometria(r, new THREE.SphereGeometry(radio, 18, 12))
  const mat = estandar(r, NEUTRO, { roughness: 0.35, metalness: 0.05 })
  const malla = new THREE.InstancedMesh(geo, mat, n)
  malla.castShadow = true
  const R = 4.2
  const cz = 2.55
  const abertura = Math.min(0.22, 0.04 * (n - 1))
  const posiciones = Array.from({ length: n }, (_, i) => {
    const th = n === 1 ? 0 : -abertura + (2 * abertura * i) / (n - 1)
    return new THREE.Vector3(R * Math.sin(th), alturaMesa + radio, cz - R * Math.cos(th))
  })
  for (let i = 0; i < n; i++) malla.setColorAt(i, new THREE.Color(colorInicial))
  return { malla, posiciones }
}
