// Atrapa burbujas: aviso fijo bajo la barra de tiempo que aparece SOLO cuando la mano toca la burbuja sin estar lo
// bastante abierta para reventarla: "¡Abre bien la mano para reventarla!", con el símbolo de Kuwü (brandbook, versión a
// una tinta sobre marino, sin recolorear) y borde de alerta. El resto del tiempo no se ve.
import * as THREE from 'three'
import simbolo from '../../../../brandbook/logos/simbolo-una-tinta-sobre-marino.svg'
import { fuenteKuwu, KUWU, kuwuAlfa } from '../../../ui/paleta'
import { material, textura, type Recursos } from '../recursos'

const ANCHO = 760
const ALTO = 120
const TEXTO = '¡Abre bien la mano para reventarla!'

/** Sprite del aviso (oculto al inicio; escala 1 de ancho) y `mostrar(si)` para encenderlo o apagarlo. */
export function crearAvisoManoAbierta(r: Recursos): { sprite: THREE.Sprite; mostrar: (si: boolean) => void } {
  const lienzo = document.createElement('canvas')
  lienzo.width = ANCHO
  lienzo.height = ALTO
  const tex = textura(r, new THREE.CanvasTexture(lienzo))
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(material(r, new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })))
  sprite.renderOrder = 10
  sprite.scale.set(1, ALTO / ANCHO, 1)
  sprite.visible = false

  const logo = new Image()
  function dibujar() {
    const g = lienzo.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, ANCHO, ALTO)
    g.fillStyle = kuwuAlfa('noche', 0.92)
    g.beginPath()
    g.roundRect(3, 3, ANCHO - 6, ALTO - 6, (ALTO - 6) / 2)
    g.fill()
    g.lineWidth = 5
    g.strokeStyle = KUWU.alerta
    g.stroke()
    const lado = ALTO - 28
    if (logo.complete && logo.naturalWidth > 0) g.drawImage(logo, 30, 14, lado, lado)
    g.font = fuenteKuwu(800, 32)
    g.textBaseline = 'middle'
    g.fillStyle = KUWU.crema
    g.fillText(TEXTO, 30 + lado + 22, ALTO / 2 + 2)
    tex.needsUpdate = true
  }
  logo.onload = dibujar
  logo.src = simbolo
  dibujar()

  return { sprite, mostrar: (si) => void (sprite.visible = si) }
}
