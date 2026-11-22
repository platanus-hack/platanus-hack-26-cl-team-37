// Texturas dibujadas en un lienzo 2D que usan varios juegos: halo difuso, anillo y vetas de madera.
import * as THREE from 'three'
import { kuwuAlfa, KUWU } from '../../ui/paleta'
import { VETAS } from './colores'

/** Textura sRGB a partir de un lienzo cuadrado de `tam` px dibujado por `dibujar`. */
export function texturaDeLienzo(tam: number, dibujar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = tam
  const g = c.getContext('2d')
  if (g) dibujar(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Halo blanco difuso (128 px) para sprites y discos: centro casi opaco que se desvanece hacia el borde.
 * `medio` = [posición, opacidad] de la parada intermedia del degradé (cada juego tiene la suya).
 */
export function texturaHalo(medio: [posicion: number, opacidad: number] = [0.4, 0.45]): THREE.CanvasTexture {
  return texturaDeLienzo(128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, kuwuAlfa('blanco', 0.95))
    grad.addColorStop(medio[0], kuwuAlfa('blanco', medio[1]))
    grad.addColorStop(1, kuwuAlfa('blanco', 0))
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  })
}

/** Anillo blanco (128 px) de `grosor` px y `radio` px; se tiñe con el color del material. */
export function texturaAnillo(grosor: number, radio: number): THREE.CanvasTexture {
  return texturaDeLienzo(128, (g) => {
    g.strokeStyle = KUWU.blanco
    g.lineWidth = grosor
    g.beginPath()
    g.arc(64, 64, radio, 0, Math.PI * 2)
    g.stroke()
  })
}

/** Vetas suaves de madera (256 px) para la mesa. Sin `document` (pruebas) devuelve null. */
export function texturaMadera(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  return texturaDeLienzo(256, (g) => {
    g.fillStyle = VETAS.fondo
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 46; i++) {
      const y = (i * 37) % 256
      g.strokeStyle = i % 3 ? VETAS.oscura : VETAS.clara
      g.lineWidth = 1 + (i % 4)
      g.beginPath()
      g.moveTo(0, y)
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin((x + i * 13) / 40) * 3)
      g.stroke()
    }
  })
}
