// Escena 3D base de todos los juegos (three.js directo): fondo azul grisáceo, mesa de madera cálida, luz de
// ambiente + luz direccional con sombra suave barata (un mapa de 1024, frustum ajustado a la mesa), cámara
// mirando la mesa desde el frente y arriba (imagenes/06a_juego_agarre.png, imagenes_juegos/00_seis_juegos_nuevos.png).
//
// Rendimiento: pixel ratio ≤ 1,5. Si el promedio de fps de una ventana de 2 s cae bajo 24, se abarata en pasos:
// 1) pixel ratio 1; 2) sombras de 512; 3) sin sombras. Nunca se vuelve a subir en la sesión (evita oscilar).
import * as THREE from 'three'
import type { MesaEscena } from './contrato'
import { ManosVirtuales } from './manos3d'

export const PIXEL_RATIO_MAX = 1.5
export const FPS_OBJETIVO = 24
const VENTANA_FPS_MS = 2000

export const COLOR_FONDO = 0x2c3a47
export const COLOR_MESA = 0xc69463

/** Textura de vetas suaves para la mesa (lienzo de 256×256, se genera una vez). */
function texturaMadera(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#c69463'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 46; i++) {
    const y = (i * 37) % 256
    g.strokeStyle = i % 3 ? 'rgba(120, 72, 36, 0.06)' : 'rgba(255, 230, 190, 0.07)'
    g.lineWidth = 1 + (i % 4)
    g.beginPath()
    g.moveTo(0, y)
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin((x + i * 13) / 40) * 3)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2.4, 1.6)
  return t
}

export class EscenaBase {
  readonly renderer: THREE.WebGLRenderer
  readonly escena = new THREE.Scene()
  readonly camara: THREE.PerspectiveCamera
  readonly mesa: MesaEscena
  readonly manos: ManosVirtuales
  readonly luz: THREE.DirectionalLight
  /** fps de dibujo (promedio de la última ventana de 2 s). */
  fps = 0
  /** 0 = calidad completa; 1 = pixel ratio 1; 2 = sombras 512; 3 = sin sombras. */
  calidad = 0
  private ventanas = 0
  private cuadrosVentana = 0
  private inicioVentana = 0
  private observador: ResizeObserver | null = null
  private readonly lienzo: HTMLCanvasElement

  constructor(lienzo: HTMLCanvasElement) {
    this.lienzo = lienzo
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(PIXEL_RATIO_MAX, window.devicePixelRatio || 1))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    // Fondo: transparente sobre el degradé CSS de .juego (azul grisáceo, más claro arriba), sin costo de dibujo.

    this.camara = new THREE.PerspectiveCamera(42, 2, 0.1, 40)
    this.camara.position.set(0, 3.3, 4.0)
    this.camara.lookAt(0, 0.1, -0.55)

    this.escena.add(new THREE.HemisphereLight(0xdfe9f3, 0x3a2e24, 1.25))
    this.luz = new THREE.DirectionalLight(0xfff3e2, 2.1)
    this.luz.position.set(-1.6, 5.5, 2.4)
    this.luz.castShadow = true
    this.luz.shadow.mapSize.set(1024, 1024)
    this.luz.shadow.radius = 4
    this.luz.shadow.bias = -0.0008
    const s = this.luz.shadow.camera
    s.left = -3.2
    s.right = 3.2
    s.top = 2.6
    s.bottom = -2.6
    s.near = 1
    s.far = 12
    this.escena.add(this.luz)

    // Mesa: tablero con canto (la cara de arriba en y = 0).
    const ancho = 5.4
    const fondo = 3.3
    const grosor = 0.16
    const z = -0.25
    const madera = texturaMadera()
    const tablero = new THREE.Mesh(
      new THREE.BoxGeometry(ancho, grosor, fondo),
      new THREE.MeshStandardMaterial({ color: madera ? 0xffffff : COLOR_MESA, map: madera, roughness: 0.82, metalness: 0 }),
    )
    tablero.position.set(0, -grosor / 2, z)
    tablero.receiveShadow = true
    this.escena.add(tablero)
    this.mesa = { ancho, fondo, altura: 0, z, objeto: tablero }

    this.manos = new ManosVirtuales()
    this.escena.add(this.manos.grupo)

    this.ajustar()
    if (typeof ResizeObserver !== 'undefined') {
      this.observador = new ResizeObserver(() => this.ajustar())
      this.observador.observe(lienzo)
    }
  }

  /** Ajusta el tamaño del dibujo y la cámara al tamaño CSS del lienzo. */
  ajustar() {
    const w = this.lienzo.clientWidth || 1
    const h = this.lienzo.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camara.aspect = w / h
    // En pantallas más angostas que 2:1 se abre el campo para que la mesa siga entrando.
    this.camara.fov = w / h >= 2 ? 42 : Math.min(62, 42 * (2 / (w / h)) ** 0.6)
    this.camara.updateProjectionMatrix()
  }

  /** Dibuja y mide fps; abarata la calidad si hace falta. `ahora` = performance.now(). */
  dibujar(ahora: number) {
    this.renderer.render(this.escena, this.camara)
    if (!this.inicioVentana) this.inicioVentana = ahora
    this.cuadrosVentana++
    const transcurrido = ahora - this.inicioVentana
    if (transcurrido >= VENTANA_FPS_MS) {
      this.fps = (this.cuadrosVentana * 1000) / transcurrido
      this.cuadrosVentana = 0
      this.inicioVentana = ahora
      // La primera ventana incluye compilar shaders y cargar texturas: no se usa para decidir.
      if (this.ventanas++ > 0 && this.fps < FPS_OBJETIVO && this.calidad < 3) this.abaratar()
    }
  }

  private abaratar() {
    this.calidad++
    if (this.calidad === 1) {
      this.renderer.setPixelRatio(1)
      this.ajustar()
    } else if (this.calidad === 2) {
      this.luz.shadow.mapSize.set(512, 512)
      this.luz.shadow.map?.dispose()
      this.luz.shadow.map = null
      this.renderer.shadowMap.type = THREE.PCFShadowMap
    } else {
      this.renderer.shadowMap.enabled = false
      this.luz.castShadow = false
    }
  }

  liberar() {
    this.observador?.disconnect()
    this.escena.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      for (const mat of mats) {
        ;(mat as THREE.MeshStandardMaterial).map?.dispose()
        mat.dispose()
      }
    })
    this.renderer.dispose()
  }
}
