// Atrapa burbujas: burbujas de adorno, burbuja objetivo (esfera brillante con halo y aro de tiempo) y el efecto al
// reventarla (gotas y "+1"). Todas comparten una esfera de radio 1 (el juego la escala) y la textura de halo.
import * as THREE from 'three'
import { fuenteKuwu, KUWU, kuwuAlfa, kuwuNum } from '../../../ui/paleta'
import { NEUTRO, tono } from '../colores'
import { geometria, material, textura, type Recursos } from '../recursos'
import { crearSprite } from '../sprites'
import { texturaAnillo, texturaHalo } from '../texturas'

/** Recursos compartidos por todas las burbujas: esfera unitaria y halo. */
export interface BaseBurbujas {
  geo: THREE.SphereGeometry
  halo: THREE.Texture
}

export function crearBaseBurbujas(r: Recursos): BaseBurbujas {
  return { geo: geometria(r, new THREE.SphereGeometry(1, 24, 16)), halo: textura(r, texturaHalo([0.4, 0.45])) }
}

/** Texto "+1" menta con borde oscuro (256 × 128). */
export function texturaMasUno(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.font = fuenteKuwu(900, 96)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 10
  g.strokeStyle = kuwuAlfa('noche', 0.7)
  g.strokeText('+1', 128, 70)
  g.fillStyle = KUWU.menta
  g.fillText('+1', 128, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Burbuja de adorno de radio `radio` y color `color`, con un brillo. Sin ubicar. */
export function crearBurbujaAdorno(r: Recursos, base: BaseBurbujas, radio: number, color: number): THREE.Group {
  const g = new THREE.Group()
  const e = new THREE.Mesh(base.geo, material(r, new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.78 })))
  e.scale.setScalar(radio)
  g.add(e)
  const { s } = crearSprite(r, base.halo, { color: NEUTRO, opacidad: 0.9 })
  s.scale.setScalar(radio * 0.42)
  s.position.set(-radio * 0.3, radio * 0.38, radio * 0.85)
  g.add(s)
  return g
}

/** Burbuja objetivo (oculta): esfera amarilla brillante con brillo, halo aditivo y aro que marca el tiempo. */
export function crearBurbujaObjetivo(r: Recursos, base: BaseBurbujas) {
  const amarillo = kuwuNum('amarillo')
  const grupo = new THREE.Group()
  const matEsfera = material(
    r,
    new THREE.MeshStandardMaterial({ color: amarillo, emissive: tono('amarillo', 0.35), emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.88 }),
  )
  const esfera = new THREE.Mesh(base.geo, matEsfera)
  grupo.add(esfera)
  const brillo = crearSprite(r, base.halo, { color: NEUTRO, opacidad: 0.95 })
  brillo.s.position.set(-0.3, 0.38, 0.85)
  brillo.s.scale.setScalar(0.42)
  esfera.add(brillo.s)
  const halo = crearSprite(r, base.halo, { color: amarillo, aditivo: true, opacidad: 0.75 })
  grupo.add(halo.s)
  const aro = crearSprite(r, textura(r, texturaAnillo(6, 58)), { color: amarillo, opacidad: 0.9 })
  grupo.add(aro.s)
  grupo.visible = false
  return { grupo, esfera, matEsfera, halo: halo.s, aro: aro.s }
}

/** Efecto de reventar: `nGotas` gotas menta ocultas y un "+1" invisible. El juego los agrega y anima. */
export function crearEfectoReventar(r: Recursos, geoGota: THREE.BufferGeometry, texMas: THREE.Texture, nGotas: number) {
  const matGota = material(r, new THREE.MeshBasicMaterial({ color: kuwuNum('menta'), transparent: true }))
  const gotas = Array.from({ length: nGotas }, () => {
    const m = new THREE.Mesh(geoGota, matGota)
    m.visible = false
    return m
  })
  const { s: mas, m: matMas } = crearSprite(r, texMas, { color: NEUTRO, opacidad: 0 })
  mas.scale.set(0.8, 0.4, 1)
  mas.visible = false
  mas.renderOrder = 8
  return { gotas, matGota, mas, matMas }
}
