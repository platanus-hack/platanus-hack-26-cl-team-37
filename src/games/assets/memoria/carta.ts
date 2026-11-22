// Memoria de cartas: figuras, texturas de cara y reverso, y la carta 3D (caja delgada que gira sobre un pivote, con
// un halo plano debajo). Figuras en los pastel del brandbook con borde marino; caras sobre blanco y crema.
import * as THREE from 'three'
import { KUWU, kuwuAlfa, kuwuNum } from '../../../ui/paleta'
import { PASTELES_CSS } from '../colores'
import { geometria, material, textura, type Recursos } from '../recursos'
import { texturaDeLienzo } from '../texturas'

const COLORES_FIGURA = PASTELES_CSS
const FONDOS_CARA = [KUWU.blanco, KUWU.crema]
const TAM_TEX = 192

/** Figura `figura` (0 círculo, 1 triángulo, 2 cuadrado, 3 estrella, 4 rombo, otra hexágono) con borde marino. */
export function dibujarFigura(g: CanvasRenderingContext2D, figura: number, cx: number, cy: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  switch (figura) {
    case 0:
      g.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 1:
      g.moveTo(cx, cy - r)
      g.lineTo(cx + r * 1.05, cy + r * 0.85)
      g.lineTo(cx - r * 1.05, cy + r * 0.85)
      g.closePath()
      break
    case 2:
      g.roundRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, r * 0.12)
      break
    case 3:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.45 : r * 1.05
        if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
        else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      }
      g.closePath()
      break
    case 4:
      g.moveTo(cx, cy - r * 1.1)
      g.lineTo(cx + r * 0.8, cy)
      g.lineTo(cx, cy + r * 1.1)
      g.lineTo(cx - r * 0.8, cy)
      g.closePath()
      break
    default:
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      g.closePath()
  }
  g.fill()
  // Borde marino: los pastel solos se pierden sobre la cara blanca.
  g.strokeStyle = KUWU.marino
  g.lineWidth = Math.max(2, r * 0.08)
  g.lineJoin = 'round'
  g.stroke()
}

function texturaCarta(dibujar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const t = texturaDeLienzo(TAM_TEX, dibujar)
  t.anisotropy = 4
  return t
}

/** Cara con la figura grande. */
export function texturaCara(figura: number): THREE.CanvasTexture {
  return texturaCarta((g) => {
    g.fillStyle = FONDOS_CARA[figura % FONDOS_CARA.length]
    g.fillRect(0, 0, TAM_TEX, TAM_TEX)
    g.strokeStyle = kuwuAlfa('marino', 0.18)
    g.lineWidth = 6
    g.strokeRect(3, 3, TAM_TEX - 6, TAM_TEX - 6)
    dibujarFigura(g, figura, TAM_TEX / 2, TAM_TEX / 2, 56, COLORES_FIGURA[figura % COLORES_FIGURA.length])
  })
}

/** Reverso marino con un círculo amarillo; en "sin memoria" lleva la figura de la carta en pequeño. */
export function texturaReverso(figura: number | null): THREE.CanvasTexture {
  return texturaCarta((g) => {
    g.fillStyle = KUWU.marino
    g.fillRect(0, 0, TAM_TEX, TAM_TEX)
    g.fillStyle = KUWU['noche-borde']
    g.fillRect(14, 14, TAM_TEX - 28, TAM_TEX - 28)
    if (figura == null) dibujarFigura(g, 0, TAM_TEX / 2, TAM_TEX / 2, 30, KUWU.amarillo)
    else {
      g.fillStyle = kuwuAlfa('blanco', 0.88)
      g.beginPath()
      g.arc(TAM_TEX / 2, TAM_TEX / 2, 46, 0, Math.PI * 2)
      g.fill()
      dibujarFigura(g, figura, TAM_TEX / 2, TAM_TEX / 2, 30, COLORES_FIGURA[figura % COLORES_FIGURA.length])
    }
  })
}

export interface CartaVisual {
  /** Grupo sin ubicar (el juego lo pone en su celda, a la altura de la mesa). */
  grupo: THREE.Group
  /** Gira para voltear la carta. */
  pivote: THREE.Group
  /** Plano bajo la carta (opacidad 0); el juego lo enciende al apuntarla. */
  halo: THREE.Mesh
}

/**
 * Una carta por cada figura de `figuras` (en orden), de `ancho` × `fondo` y `grosor`. Comparten geometría y texturas;
 * con `sinMemoria` cada reverso muestra su figura.
 */
export function crearCartas(
  r: Recursos,
  medidas: { ancho: number; fondo: number; grosor: number },
  figuras: number[],
  sinMemoria: boolean,
): CartaVisual[] {
  const { ancho, fondo, grosor } = medidas
  const cara = Array.from({ length: Math.max(...figuras) + 1 }, (_, f) => textura(r, texturaCara(f)))
  const reverso = sinMemoria ? cara.map((_, f) => textura(r, texturaReverso(f))) : [textura(r, texturaReverso(null))]
  const geo = geometria(r, new THREE.BoxGeometry(ancho, grosor, fondo))
  const geoHalo = geometria(r, new THREE.PlaneGeometry(ancho + 0.16, fondo + 0.16))
  const lado = material(r, new THREE.MeshStandardMaterial({ color: kuwuNum('marino'), roughness: 0.6 }))

  return figuras.map((f) => {
    const matCara = material(r, new THREE.MeshStandardMaterial({ map: cara[f], roughness: 0.55 }))
    const matRev = material(r, new THREE.MeshStandardMaterial({ map: sinMemoria ? reverso[f] : reverso[0], roughness: 0.55 }))
    const matHalo = material(r, new THREE.MeshBasicMaterial({ color: kuwuNum('amarillo'), transparent: true, opacity: 0, depthWrite: false }))
    // Orden de caras de BoxGeometry: +x, −x, +y (reverso, arriba), −y (figura, queda arriba al voltear), +z, −z.
    const caja = new THREE.Mesh(geo, [lado, lado, matRev, matCara, lado, lado])
    caja.castShadow = true
    caja.receiveShadow = true
    const pivote = new THREE.Group()
    pivote.add(caja)
    pivote.position.y = grosor / 2
    const halo = new THREE.Mesh(geoHalo, matHalo)
    halo.rotation.x = -Math.PI / 2
    halo.position.y = 0.006
    halo.renderOrder = 1
    const grupo = new THREE.Group()
    grupo.add(halo, pivote)
    return { grupo, pivote, halo }
  })
}
