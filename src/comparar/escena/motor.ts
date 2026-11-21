// F38 · Motor 3D de la vista Comparar: renderer, luces, controles de órbita y etiquetas HTML proyectadas.
// Este archivo (y todo src/comparar/escena/) solo se carga cuando se abre la pantalla Comparar: three.js, OrbitControls y
// RoomEnvironment quedan en su propio chunk, fuera del bundle principal.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type Lado = 'antes' | 'despues'

export interface TextoEtiqueta {
  lado: Lado
  nom: string
  val: string
  det?: string
}

/** Etiqueta HTML ubicada sobre un punto 3D. Los textos van con textContent y los colores con clases (la CSP no permite estilos en línea). */
export interface Etiqueta {
  el: HTMLElement
  poner(t: TextoEtiqueta): void
  /** Etiqueta chica (grados por dedo): solo `val`. */
  ponerChica(lado: Lado, texto: string): void
  ocultar(): void
}

export interface ModoEscena {
  id: string
  texto: string
  /** Modo con reproductor (animación). */
  anima?: boolean
}
export interface CapaEscena {
  id: string
  texto: string
  activa: boolean
}

/** Lo que una escena de juego entrega al estadio. */
export interface EscenaJuego {
  modos: ModoEscena[]
  capas: CapaEscena[]
  /** Aclaración bajo la vista ("ubicación de los objetos ilustrativa"). */
  nota: string
  /** De dónde sale la mano de cada sesión. */
  fuente: Record<Lado, 'real' | 'modelo'>
  /** Banda: carga (kg) que corresponde al rojo de la escala de color. */
  escalaKg?: number
  /** Duración de una vuelta de la animación (ms). */
  duracionMs: number
  /** Texto grande bajo la barra: qué muestra el modo actual, con los valores antes → después. */
  titulo?(): { que: string; antes: string; despues: string } | null
  fijarModo(id: string): void
  fijarCapa(id: string, on: boolean): void
  /** avance 0..1 de la animación (también se llama sin animar, con el último avance). */
  actualizar(avance: number): void
  /** Después de cada render: ubica las etiquetas. */
  etiquetas(ancho: number, alto: number): void
  /** Cambió el tamaño del estadio (aspecto = ancho / alto). */
  alAjustar?(aspecto: number): void
  dispose?(): void
}

export interface Motor {
  THREE: typeof THREE
  raiz: THREE.Group
  camara: THREE.PerspectiveCamera
  controles: OrbitControls
  colores: { antes: THREE.Color; despues: THREE.Color; gris: THREE.Color }
  aspecto(): number
  etiqueta(): Etiqueta
  etiquetaChica(): Etiqueta
  /** Proyecta un punto del mundo a la etiqueta (la oculta si queda detrás de la cámara). */
  proyectar(e: Etiqueta, pos: THREE.Vector3, ancho: number, alto: number, margen?: number): void
  /** Descarta la escena actual (y sus mallas y etiquetas) antes de armar otra. */
  soltar(): void
  /** Activa una escena ya armada (armarla DESPUÉS de soltar la anterior). */
  fijar(e: EscenaJuego): void
  actual(): EscenaJuego | null
  fijarAvance(a: number): void
  fijarReproduciendo(on: boolean): void
  autoGirar(on: boolean): void
  /** El reproductor se entera del avance (para mover su control). */
  alAvanzar: ((a: number) => void) | null
  dispose(): void
}

function cssColor(host: HTMLElement, variable: string, respaldo: string): THREE.Color {
  const v = getComputedStyle(host).getPropertyValue(variable).trim()
  try {
    return new THREE.Color(v || respaldo)
  } catch {
    return new THREE.Color(respaldo)
  }
}

function liberar(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose?.()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose?.()
  })
}

export function crearMotor(host: HTMLElement, capaEtiquetas: HTMLElement): Motor {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  host.prepend(renderer.domElement)

  const escena = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const entorno = new RoomEnvironment()
  const envRT = pmrem.fromScene(entorno, 0.04)
  escena.environment = envRT.texture
  entorno.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose?.()
    ;(m.material as THREE.Material | undefined)?.dispose?.()
  })
  pmrem.dispose()

  const camara = new THREE.PerspectiveCamera(32, 1, 5, 20000)
  const controles = new OrbitControls(camara, renderer.domElement)
  controles.enableDamping = true
  controles.autoRotateSpeed = 0.7
  controles.minDistance = 250
  controles.maxDistance = 6000
  controles.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }

  const luz = new THREE.DirectionalLight(0xffffff, 2.3)
  luz.position.set(250, 700, 600)
  luz.castShadow = true
  luz.shadow.mapSize.set(2048, 2048)
  Object.assign(luz.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 50, far: 3500 })
  escena.add(luz, new THREE.HemisphereLight(0xffffff, 0x223344, 0.6))
  const raiz = new THREE.Group()
  escena.add(raiz)

  const colores = {
    antes: cssColor(host, '--cmp-antes', '#4a72c9'),
    despues: cssColor(host, '--cmp-despues', '#f0a000'),
    gris: cssColor(host, '--suave', '#5f5f59'),
  }

  const etiquetas: HTMLElement[] = []
  function crearEtiqueta(chica: boolean): Etiqueta {
    const el = document.createElement('div')
    el.className = chica ? 'cmp-etq chica' : 'cmp-etq'
    const nom = document.createElement('span')
    nom.className = 'nom'
    const val = document.createElement('span')
    val.className = 'val'
    const det = document.createElement('span')
    det.className = 'det'
    if (chica) el.append(val)
    else el.append(nom, val, det)
    capaEtiquetas.append(el)
    etiquetas.push(el)
    const cambiar = (n: HTMLElement, t: string) => {
      if (n.textContent !== t) n.textContent = t
    }
    return {
      el,
      poner(t) {
        const clase = `cmp-etq ${t.lado}`
        if (el.className !== clase) el.className = clase
        cambiar(nom, t.nom)
        cambiar(val, t.val)
        cambiar(det, t.det ?? '')
      },
      ponerChica(lado, texto) {
        const clase = `cmp-etq chica ${lado}`
        if (el.className !== clase) el.className = clase
        cambiar(val, texto)
      },
      ocultar() {
        el.style.display = 'none'
      },
    }
  }

  const v3 = new THREE.Vector3()
  let actual: EscenaJuego | null = null
  let avance = 0
  let reproduciendo = true
  let vivo = true
  let ultimo = performance.now()
  let raf = 0
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const motor: Motor = {
    THREE,
    raiz,
    camara,
    controles,
    colores,
    alAvanzar: null,
    aspecto: () => camara.aspect,
    etiqueta: () => crearEtiqueta(false),
    etiquetaChica: () => crearEtiqueta(true),
    proyectar(e, pos, ancho, alto, margen = 60) {
      v3.copy(pos).project(camara)
      if (v3.z > 1) {
        e.el.style.display = 'none'
        return
      }
      e.el.style.display = ''
      e.el.style.left = `${Math.max(margen, Math.min(ancho - margen, ((v3.x + 1) / 2) * ancho))}px`
      e.el.style.top = `${Math.max(8, ((1 - v3.y) / 2) * alto)}px`
    },
    soltar() {
      actual?.dispose?.()
      actual = null
      liberar(raiz)
      raiz.clear()
      etiquetas.splice(0).forEach((x) => x.remove())
      controles.minDistance = 250
      controles.maxDistance = 6000
      controles.maxPolarAngle = Math.PI
      camara.far = 20000
      camara.updateProjectionMatrix()
    },
    fijar(e) {
      actual = e
      avance = 0
      e.alAjustar?.(camara.aspect)
      e.actualizar(avance)
    },
    actual: () => actual,
    fijarAvance(a) {
      avance = a
      actual?.actualizar(avance)
    },
    fijarReproduciendo(on) {
      reproduciendo = on
    },
    autoGirar(on) {
      controles.autoRotate = on && !reducido
    },
    dispose() {
      vivo = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      actual?.dispose?.()
      liberar(raiz)
      raiz.clear()
      etiquetas.splice(0).forEach((x) => x.remove())
      controles.dispose()
      envRT.dispose()
      luz.shadow.map?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }

  function ajustar() {
    const r = host.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    renderer.setSize(r.width, r.height, false)
    camara.aspect = r.width / r.height
    camara.zoom = Math.min(1.1, camara.aspect / 1.3 + 0.2)
    camara.updateProjectionMatrix()
    actual?.alAjustar?.(camara.aspect)
  }
  const ro = new ResizeObserver(ajustar)
  ro.observe(host)
  ajustar()

  function cuadro(ahora: number) {
    if (!vivo) return
    const dt = Math.max(0, Math.min(64, ahora - ultimo))
    ultimo = ahora
    if (actual && reproduciendo && actual.duracionMs > 0 && motor.alAvanzar) {
      avance = (avance + dt / actual.duracionMs) % 1
      actual.actualizar(avance)
      motor.alAvanzar(avance)
    }
    controles.update()
    renderer.render(escena, camara)
    const r = host.getBoundingClientRect()
    actual?.etiquetas(r.width, r.height)
    raf = requestAnimationFrame(cuadro)
  }
  raf = requestAnimationFrame(cuadro)
  return motor
}

