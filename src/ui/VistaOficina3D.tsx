// Vista previa interactiva del ambiente 3D de la oficina Platanus Hack [26] ft. Buk (/oficina-3d).
// Muestra la mesa base (y = 0, ancho 5,4, fondo 3,3) a escala real 1:1 dentro de la oficina con el ángulo
// natural de escritorio (CAMARA_OFICINA), más un modo libre para recorrer toda la sala y el Costanera Center.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CAMARA_OFICINA, crearAmbienteOficina, type AmbienteOficina3D } from './ambienteOficina3d'
import './oficina3d.css'

type ModoCamara = 'juego' | 'libre'

const CAMARA_JUEGO = {
  pos: new THREE.Vector3(...CAMARA_OFICINA.posicion),
  objetivo: new THREE.Vector3(...CAMARA_OFICINA.objetivo),
}

function texturaMesaPreview(): THREE.CanvasTexture | null {
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

export default function VistaOficina3D() {
  const lienzoRef = useRef<HTMLCanvasElement>(null)
  const ambienteRef = useRef<AmbienteOficina3D | null>(null)
  const [modo, setModo] = useState<ModoCamara>('juego')
  const [conHud, setConHud] = useState(true)
  const [calidad, setCalidad] = useState(0)
  const [fps, setFps] = useState(0)

  const modoRef = useRef<ModoCamara>(modo)
  modoRef.current = modo

  // Órbita libre arrancando en una vista 3/4 a altura humana mirando hacia el banner, ·buk· y Costanera Center
  const orbita = useRef({ yaw: -0.28, pitch: 0.06, dist: 11.5, arrastrando: false, x0: 0, y0: 0 })

  useEffect(() => {
    ambienteRef.current?.aplicarCalidad(calidad)
  }, [calidad])

  useEffect(() => {
    const lienzo = lienzoRef.current
    if (!lienzo) return

    const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06

    const escena = new THREE.Scene()
    escena.fog = new THREE.Fog(0xb9cce0, 58, 155)

    const camara = new THREE.PerspectiveCamera(CAMARA_OFICINA.fov, 2, 0.1, CAMARA_OFICINA.far)
    camara.position.copy(CAMARA_JUEGO.pos)
    camara.lookAt(CAMARA_JUEGO.objetivo)

    // Iluminación idéntica a EscenaBase
    escena.add(new THREE.HemisphereLight(0xdfe9f3, 0x3a2e24, 1.25))
    const luz = new THREE.DirectionalLight(0xfff3e2, 2.1)
    luz.position.set(-1.6, 5.5, 2.4)
    luz.castShadow = true
    luz.shadow.mapSize.set(1024, 1024)
    luz.shadow.radius = 4
    luz.shadow.bias = -0.0008
    const s = luz.shadow.camera
    s.left = -3.2
    s.right = 3.2
    s.top = 2.6
    s.bottom = -2.6
    s.near = 1
    s.far = 12
    escena.add(luz)

    // Mesa base idéntica a EscenaBase (y = 0, ancho 5.4, fondo 3.3, z = -0.25)
    const madera = texturaMesaPreview()
    const tablero = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.16, 3.3),
      new THREE.MeshStandardMaterial({ color: madera ? 0xffffff : 0xc69463, map: madera, roughness: 0.82 }),
    )
    tablero.position.set(0, -0.08, -0.25)
    tablero.receiveShadow = true
    escena.add(tablero)

    // Objetos de muestra sobre la mesa (simulan Caja de juguetes para validar escala y contraste)
    const demo = new THREE.Group()
    const cubo = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.46, 0.46),
      new THREE.MeshStandardMaterial({ color: 0xe66530, roughness: 0.45 }),
    )
    cubo.position.set(-1.35, 0.23, 0.35)
    cubo.rotation.y = 0.4
    cubo.castShadow = true

    const esfera = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x3ec48f, roughness: 0.35 }),
    )
    esfera.position.set(0, 0.28, -0.2)
    esfera.castShadow = true

    const esferaAm = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xf2c138, roughness: 0.35 }),
    )
    esferaAm.position.set(1.42, 0.24, 0.3)
    esferaAm.castShadow = true

    const cilindro = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.48, 20),
      new THREE.MeshStandardMaterial({ color: 0x6f4ad8, roughness: 0.45 }),
    )
    cilindro.position.set(0.85, 0.24, -0.6)
    cilindro.castShadow = true

    demo.add(cubo, esfera, esferaAm, cilindro)
    escena.add(demo)

    // Ambiente 3D de la oficina Platanus Hack [26] ft. Buk + Costanera Center
    const ambiente = crearAmbienteOficina({ conBaseMesa: true, calidad })
    ambienteRef.current = ambiente
    escena.add(ambiente.grupo)

    const ajustar = () => {
      const w = lienzo.clientWidth || 1
      const h = lienzo.clientHeight || 1
      const aspecto = w / h
      renderer.setSize(w, h, false)
      camara.aspect = aspecto
      // En ventanas más angostas se abre el campo suavemente para mantener la mesa y el banner en cuadro.
      camara.fov = aspecto >= 1.8 ? CAMARA_OFICINA.fov : Math.min(68, CAMARA_OFICINA.fov * (1.8 / aspecto) ** 0.38)
      camara.updateProjectionMatrix()
    }
    ajustar()
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null
    obs?.observe(lienzo)

    const alBajar = (e: PointerEvent) => {
      if (modoRef.current !== 'libre') return
      orbita.current.arrastrando = true
      orbita.current.x0 = e.clientX
      orbita.current.y0 = e.clientY
      lienzo.setPointerCapture(e.pointerId)
    }
    const alMover = (e: PointerEvent) => {
      if (!orbita.current.arrastrando || modoRef.current !== 'libre') return
      const dx = e.clientX - orbita.current.x0
      const dy = e.clientY - orbita.current.y0
      orbita.current.x0 = e.clientX
      orbita.current.y0 = e.clientY
      orbita.current.yaw = Math.max(-1.45, Math.min(1.45, orbita.current.yaw - dx * 0.005))
      orbita.current.pitch = Math.max(-0.18, Math.min(0.65, orbita.current.pitch + dy * 0.004))
    }
    const alSubir = () => {
      orbita.current.arrastrando = false
    }
    const alRueda = (e: WheelEvent) => {
      if (modoRef.current !== 'libre') return
      orbita.current.dist = Math.max(4.5, Math.min(20, orbita.current.dist + e.deltaY * 0.008))
    }

    lienzo.addEventListener('pointerdown', alBajar)
    lienzo.addEventListener('pointermove', alMover)
    lienzo.addEventListener('pointerup', alSubir)
    lienzo.addEventListener('pointercancel', alSubir)
    lienzo.addEventListener('wheel', alRueda, { passive: true })

    let raf = 0
    let ultimo = performance.now()
    let inicioVentana = ultimo
    let cuadros = 0
    const objetivoLibre = new THREE.Vector3(1.5, 2.1, -17.0)
    const destino = new THREE.Vector3()

    const bucle = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000)
      ultimo = ahora

      if (modoRef.current === 'juego') {
        camara.position.lerp(CAMARA_JUEGO.pos, 0.14)
        camara.lookAt(CAMARA_JUEGO.objetivo)
      } else {
        const { yaw, pitch, dist } = orbita.current
        destino.set(
          Math.sin(yaw) * Math.cos(pitch) * dist,
          Math.max(0.2, 2.2 + Math.sin(pitch) * dist),
          -4.5 + Math.cos(yaw) * Math.cos(pitch) * dist,
        )
        camara.position.lerp(destino, 0.14)
        camara.lookAt(objetivoLibre)
      }

      ambiente.actualizar(dt)
      renderer.render(escena, camara)

      cuadros++
      if (ahora - inicioVentana >= 1000) {
        setFps(Math.round((cuadros * 1000) / (ahora - inicioVentana)))
        cuadros = 0
        inicioVentana = ahora
      }
      raf = requestAnimationFrame(bucle)
    }
    raf = requestAnimationFrame(bucle)

    return () => {
      cancelAnimationFrame(raf)
      obs?.disconnect()
      lienzo.removeEventListener('pointerdown', alBajar)
      lienzo.removeEventListener('pointermove', alMover)
      lienzo.removeEventListener('pointerup', alSubir)
      lienzo.removeEventListener('pointercancel', alSubir)
      lienzo.removeEventListener('wheel', alRueda)
      ambiente.liberar()
      ambienteRef.current = null
      escena.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const mt of mats) {
          ;(mt as THREE.MeshStandardMaterial).map?.dispose()
          mt.dispose()
        }
      })
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="oficina-vista" data-testid="vista-oficina-3d">
      <canvas ref={lienzoRef} className="oficina-lienzo" aria-label="Vista 3D de la oficina Platanus Hack ft. Buk" />

      {conHud && modo === 'juego' && (
        <>
          <div className="oficina-hud-izq">
            <strong>Caja de juguetes</strong>
            <div>Oficina Platanus Hack [26] ft. Buk + Costanera Center</div>
          </div>
          <div className="oficina-hud-top">
            <div>
              <div>Tiempo</div>
              <b>00:28</b>
            </div>
            <div>
              <div>Agarres</div>
              <b>2/6</b>
            </div>
          </div>
        </>
      )}

      <div className="oficina-controles">
        <button type="button" className="oficina-btn" aria-pressed={modo === 'juego'} onClick={() => setModo('juego')}>
          Vista de juego
        </button>
        <button type="button" className="oficina-btn" aria-pressed={modo === 'libre'} onClick={() => setModo('libre')}>
          Explorar oficina 3D
        </button>
        {modo === 'juego' && (
          <button type="button" className="oficina-btn" aria-pressed={conHud} onClick={() => setConHud((v) => !v)}>
            {conHud ? 'Ocultar HUD' : 'Simular HUD'}
          </button>
        )}
        <button
          type="button"
          className="oficina-btn"
          aria-pressed={calidad > 0}
          onClick={() => setCalidad((c) => (c + 1) % 4)}
        >
          Calidad: {calidad}
        </button>
        <span className="oficina-fps">{fps} fps</span>
      </div>
    </main>
  )
}
