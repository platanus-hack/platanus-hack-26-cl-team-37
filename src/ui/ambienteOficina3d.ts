// Ambiente 3D procedural de la oficina Platanus Hack [26] ft. Buk (Santiago, Chile) en three.js directo.
// Escala arquitectónica real 1:1 respecto al tablero base (1 metro real ≈ 2,65 unidades de escena):
// - Tablero de juego en y = 0 (ancho 5,4 ≈ 2,0 m, fondo 3,3 ≈ 1,25 m), igual que todos los escritorios de la sala.
// - Piso laminado de madera en y = -2,0 (≈ 75 cm bajo el escritorio).
// - Cielo raso industrial en y = +6,1 (≈ 3,05 m piso a techo) con lámparas circulares cálidas y nubes acústicas.
// - Columna central ·buk·, pendón colgante "platanus hack [26] FT. buk", ventanales con persianas roller y
//   skyline 3D de Santiago con la Gran Torre Santiago (Costanera Center) y la cordillera al fondo.
//
// 100% libre de recursos externos (solo CanvasTexture y geometrías livianas), seguro para CSP y modo sin conexión.
import * as THREE from 'three'

export interface OpcionesAmbienteOficina {
  /** Agrega patas negras de escritorio bajo el tablero base (y = 0, ancho 5.4, fondo 3.3, z = -0.25). Por defecto true. */
  conBaseMesa?: boolean
  /** Nivel de detalle inicial (0 = completa, 1 = sin props menores, 2 = arquitectura y marca, 3 = mínimo). */
  calidad?: number
}

export interface AmbienteOficina3D {
  /** Grupo raíz para agregar a THREE.Scene. */
  readonly grupo: THREE.Group
  /** Ajusta el detalle visible según la degradación de FPS (0..3). */
  aplicarCalidad(calidad: number): void
  /** Animación sutil opcional (dt en segundos). */
  actualizar(dt: number): void
  /** Libera geometrías, materiales y texturas procedurales. */
  liberar(): void
}

/**
 * Cámara recomendada para ver el tablero de juego en primer plano y la oficina 3D a escala real detrás
 * (ángulo sentado en escritorio, fiel a las fotos de la oficina Buk).
 */
export const CAMARA_OFICINA = {
  posicion: [0, 2.42, 5.05] as const,
  objetivo: [0, 1.08, -0.65] as const,
  fov: 53,
  far: 160,
} as const

/** Cotas arquitectónicas a escala real (1 m ≈ 2,65 u; mesa de juego en y = 0). */
export const COTAS_OFICINA = {
  pisoY: -2.0,
  techoY: 6.1,
  paredFondoZ: -25.0,
  pilarZ: -19.2,
  bannerZ: -16.4,
  anchoSala: 44,
  fondoSala: 36,
  costaneraZ: -74,
} as const

// ---------------------------------------------------------------------------
// Texturas procedurales (100% locales, sin red)
// ---------------------------------------------------------------------------

function crearCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) return null
  return { canvas, g }
}

function texturaDesdeCanvas(canvas: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  t.anisotropy = 4
  return t
}

/** Piso de madera cálida en listones (laminado de la oficina Buk). */
function texturaPisoMadera(): THREE.CanvasTexture | null {
  const c = crearCanvas(512, 512)
  if (!c) return null
  const { canvas, g } = c
  g.fillStyle = '#a4794f'
  g.fillRect(0, 0, 512, 512)

  const filas = 8
  const altoFila = 512 / filas
  for (let f = 0; f < filas; f++) {
    const y = f * altoFila
    const tono = (f * 19) % 3
    g.fillStyle = tono === 0 ? '#ad8257' : tono === 1 ? '#9b7149' : '#b58b60'
    g.fillRect(0, y, 512, altoFila)

    for (let v = 0; v < 7; v++) {
      g.strokeStyle = v % 2 === 0 ? 'rgba(72, 42, 18, 0.08)' : 'rgba(255, 228, 190, 0.08)'
      g.lineWidth = 1.5
      g.beginPath()
      const vy = y + ((v + 0.5) * altoFila) / 7
      g.moveTo(0, vy)
      for (let x = 0; x <= 512; x += 64) {
        g.lineTo(x, vy + Math.sin((x + f * 41 + v * 17) / 55) * 2.5)
      }
      g.stroke()
    }

    g.strokeStyle = 'rgba(54, 32, 14, 0.25)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(512, y)
    const corte = ((f * 173 + 90) % 420) + 45
    g.moveTo(corte, y)
    g.lineTo(corte, y + altoFila)
    g.stroke()
  }
  return texturaDesdeCanvas(canvas, [10, 9])
}

/** Cielo raso acústico beige perforado con grilla (como en las fotos de Buk). */
function texturaTechoAcustico(): THREE.CanvasTexture | null {
  const c = crearCanvas(256, 256)
  if (!c) return null
  const { canvas, g } = c
  g.fillStyle = '#b4a894'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(66, 56, 44, 0.22)'
  g.lineWidth = 2
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i, 256)
    g.moveTo(0, i)
    g.lineTo(256, i)
    g.stroke()
  }
  g.fillStyle = 'rgba(66, 56, 44, 0.17)'
  for (let y = 10; y < 256; y += 14) {
    for (let x = 8; x < 256; x += 22) g.fillRect(x, y, 10, 2)
  }
  return texturaDesdeCanvas(canvas, [12, 10])
}

/** Pendón negro colgante "platanus hack [26] FT. buk" fiel a las fotos. */
function texturaBannerPlatanus(): THREE.CanvasTexture | null {
  const c = crearCanvas(1024, 320)
  if (!c) return null
  const { canvas, g } = c

  const grad = g.createLinearGradient(0, 0, 0, 320)
  grad.addColorStop(0, '#232629')
  grad.addColorStop(0.5, '#1a1c1f')
  grad.addColorStop(1, '#15171a')
  g.fillStyle = grad
  g.fillRect(0, 0, 1024, 320)

  g.fillStyle = '#30343a'
  g.fillRect(0, 0, 1024, 5)
  g.fillRect(0, 315, 1024, 5)

  const amarillo = '#d6c343'
  const amarilloSuave = 'rgba(214, 195, 67, 0.72)'

  g.fillStyle = amarilloSuave
  g.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace'
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillText('[20 - 22 DE NOVIEMBRE]', 40, 38)
  g.textAlign = 'center'
  g.fillText('[2026]', 500, 38)
  g.textAlign = 'right'
  g.fillText('[SANTIAGO] [CHL]', 984, 38)

  g.fillStyle = amarillo
  g.textAlign = 'left'
  g.font = '300 70px "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  g.fillText('platanus hack', 42, 138)

  g.font = '600 70px ui-monospace, SFMono-Regular, Menlo, monospace'
  g.fillText('[26]', 505, 138)

  g.fillStyle = amarilloSuave
  g.font = '600 28px ui-monospace, SFMono-Regular, Menlo, monospace'
  g.fillText('FT.', 698, 134)

  g.fillStyle = amarillo
  g.font = '700 74px "Poppins", -apple-system, BlinkMacSystemFont, sans-serif'
  g.fillText('buk', 784, 138)

  g.strokeStyle = 'rgba(214, 195, 67, 0.48)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(42, 212)
  g.lineTo(982, 212)
  g.stroke()
  g.fillStyle = amarillo
  g.beginPath()
  g.arc(42, 212, 3.5, 0, Math.PI * 2)
  g.arc(982, 212, 3.5, 0, Math.PI * 2)
  g.fill()

  g.fillStyle = amarillo
  g.textAlign = 'center'
  g.font = '600 32px ui-monospace, SFMono-Regular, Menlo, monospace'
  g.fillText('200 HACKERS, DE CERO A PRODUCTO EN 36 HORAS', 512, 266)

  return texturaDesdeCanvas(canvas)
}

/** Logo azul "·buk·" sobre la columna central blanca. */
function texturaPilarBuk(): THREE.CanvasTexture | null {
  const c = crearCanvas(512, 512)
  if (!c) return null
  const { canvas, g } = c

  g.fillStyle = '#ece6d8'
  g.fillRect(0, 0, 512, 512)

  const azulBuk = '#2c54c8'
  g.fillStyle = azulBuk
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '700 132px "Poppins", -apple-system, BlinkMacSystemFont, sans-serif'
  g.fillText('buk', 256, 256)

  g.beginPath()
  g.arc(98, 260, 10, 0, Math.PI * 2)
  g.arc(414, 260, 10, 0, Math.PI * 2)
  g.fill()

  return texturaDesdeCanvas(canvas)
}

/** Fachada acristalada de la Gran Torre Santiago (Costanera Center): muros cortina celestes + costillas verticales. */
function texturaFachadaCostanera(): THREE.CanvasTexture | null {
  const c = crearCanvas(256, 512)
  if (!c) return null
  const { canvas, g } = c

  const grad = g.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, '#7ea5c4')
  grad.addColorStop(0.45, '#5d84a6')
  grad.addColorStop(1, '#436582')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 512)

  // Pisos horizontales (los 62 pisos de la torre)
  for (let y = 0; y < 512; y += 10) {
    g.fillStyle = y % 40 === 0 ? 'rgba(22, 38, 56, 0.42)' : 'rgba(225, 240, 252, 0.22)'
    g.fillRect(0, y, 256, y % 40 === 0 ? 3 : 2)
  }

  // Costillas verticales estructurales plateadas características del Costanera Center
  for (let x = 0; x < 256; x += 24) {
    g.fillStyle = 'rgba(220, 234, 246, 0.5)'
    g.fillRect(x, 0, 4, 512)
    g.fillStyle = 'rgba(30, 52, 74, 0.28)'
    g.fillRect(x + 4, 0, 2, 512)
  }

  // Reflejo diagonal suave del cielo
  const refl = g.createLinearGradient(0, 0, 256, 360)
  refl.addColorStop(0, 'rgba(255, 255, 255, 0.26)')
  refl.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)')
  refl.addColorStop(1, 'rgba(255, 255, 255, 0.16)')
  g.fillStyle = refl
  g.fillRect(0, 0, 256, 512)

  return texturaDesdeCanvas(canvas)
}

/** Fachada genérica de edificios de Providencia / Las Condes. */
function texturaEdificioCiudad(claro: boolean): THREE.CanvasTexture | null {
  const c = crearCanvas(128, 256)
  if (!c) return null
  const { canvas, g } = c
  g.fillStyle = claro ? '#b7c6d4' : '#6a8298'
  g.fillRect(0, 0, 128, 256)
  for (let y = 8; y < 250; y += 14) {
    g.fillStyle = claro ? 'rgba(65, 86, 108, 0.35)' : 'rgba(218, 232, 244, 0.34)'
    for (let x = 8; x < 120; x += 18) g.fillRect(x, y, 11, 7)
  }
  return texturaDesdeCanvas(canvas)
}

/** Cielo santiaguino + Cordillera de los Andes nevada + ciudad lejana en el horizonte. */
function texturaHorizonteSantiago(): THREE.CanvasTexture | null {
  const c = crearCanvas(1024, 512)
  if (!c) return null
  const { canvas, g } = c

  const cielo = g.createLinearGradient(0, 0, 0, 512)
  cielo.addColorStop(0, '#8fb2d4')
  cielo.addColorStop(0.45, '#bcd3e8')
  cielo.addColorStop(0.75, '#dce7f2')
  cielo.addColorStop(1, '#cfd9e3')
  g.fillStyle = cielo
  g.fillRect(0, 0, 1024, 512)

  // Cordillera de los Andes al fondo
  g.fillStyle = 'rgba(126, 149, 176, 0.45)'
  g.beginPath()
  g.moveTo(0, 325)
  g.lineTo(115, 235)
  g.lineTo(240, 275)
  g.lineTo(395, 190)
  g.lineTo(540, 250)
  g.lineTo(710, 185)
  g.lineTo(860, 240)
  g.lineTo(1024, 205)
  g.lineTo(1024, 512)
  g.lineTo(0, 512)
  g.closePath()
  g.fill()

  // Cumbres nevadas sutiles
  g.fillStyle = 'rgba(244, 248, 252, 0.55)'
  const cumbres: [number, number, number][] = [
    [115, 235, 36],
    [395, 190, 52],
    [710, 185, 56],
    [1010, 208, 42],
  ]
  for (const [cx, cy, w] of cumbres) {
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx - w, cy + w * 0.65)
    g.lineTo(cx - w * 0.3, cy + w * 0.45)
    g.lineTo(cx + w * 0.2, cy + w * 0.58)
    g.lineTo(cx + w, cy + w * 0.65)
    g.closePath()
    g.fill()
  }

  // Capa baja densa de edificios de Santiago (Providencia / Ñuñoa / Centro)
  for (let i = 0; i < 64; i++) {
    const x = i * 17 - 6
    const w = 13 + ((i * 11) % 14)
    const h = 70 + ((i * 47) % 125)
    const y = 512 - h
    g.fillStyle = i % 3 === 0 ? '#aebecd' : i % 3 === 1 ? '#becbd7' : '#9eb0c2'
    g.fillRect(x, y, w, h)
  }

  return texturaDesdeCanvas(canvas)
}

/** Pantalla de monitor con código en modo oscuro. */
function texturaPantallaCodigo(variante: number): THREE.CanvasTexture | null {
  const c = crearCanvas(256, 144)
  if (!c) return null
  const { canvas, g } = c

  g.fillStyle = variante === 0 ? '#11161f' : '#141a24'
  g.fillRect(0, 0, 256, 144)
  g.fillStyle = '#1b2230'
  g.fillRect(0, 0, 40, 144)
  g.fillStyle = '#242d3e'
  g.fillRect(0, 0, 256, 14)

  const colores = ['#61afef', '#e5c07b', '#98c379', '#c678dd', '#abb2bf', '#56b6c2']
  for (let fila = 0; fila < 13; fila++) {
    const y = 24 + fila * 9
    const indent = ((fila * 3 + variante * 2) % 4) * 12
    const largo = 35 + ((fila * 37 + variante * 29) % 120)
    g.fillStyle = colores[(fila + variante) % colores.length]
    g.globalAlpha = 0.8
    g.fillRect(50 + indent, y, largo, 4)
  }
  g.globalAlpha = 1
  return texturaDesdeCanvas(canvas)
}

/** Afiche oscuro con arte dorado colgado en los ventanales (IMG_9987). */
function texturaAficheVentana(): THREE.CanvasTexture | null {
  const c = crearCanvas(256, 192)
  if (!c) return null
  const { canvas, g } = c

  g.fillStyle = '#181a1d'
  g.fillRect(0, 0, 256, 192)
  g.strokeStyle = '#c8b43c'
  g.lineWidth = 3
  g.strokeRect(10, 10, 236, 172)

  g.beginPath()
  g.moveTo(24, 146)
  g.lineTo(232, 104)
  g.moveTo(76, 48)
  g.lineTo(76, 154)
  g.moveTo(186, 40)
  g.lineTo(186, 146)
  g.stroke()
  g.lineWidth = 1.5
  for (let i = 0; i < 7; i++) {
    g.beginPath()
    g.moveTo(76, 56 + i * 10)
    g.lineTo(28 + i * 24, 142 - i * 4)
    g.moveTo(186, 48 + i * 10)
    g.lineTo(106 + i * 18, 130 - i * 4)
    g.stroke()
  }
  return texturaDesdeCanvas(canvas)
}

/** Marquesina de la máquina arcade de Buk (rincón derecho en frame_06). */
function texturaArcadeBuk(): THREE.CanvasTexture | null {
  const c = crearCanvas(256, 96)
  if (!c) return null
  const { canvas, g } = c
  g.fillStyle = '#13203d'
  g.fillRect(0, 0, 256, 96)
  g.fillStyle = '#f2d34c'
  g.font = '700 54px "Poppins", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('·buk·', 128, 50)
  return texturaDesdeCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Constructor principal del ambiente 3D
// ---------------------------------------------------------------------------

export function crearAmbienteOficina(opciones: OpcionesAmbienteOficina = {}): AmbienteOficina3D {
  const { conBaseMesa = true, calidad: calidadInicial = 0 } = opciones
  const grupo = new THREE.Group()
  grupo.name = 'ambiente-oficina-platanus'

  const capaEsencial = new THREE.Group()
  capaEsencial.name = 'oficina-esencial'
  const capaMobiliario = new THREE.Group()
  capaMobiliario.name = 'oficina-mobiliario'
  const capaDetalles = new THREE.Group()
  capaDetalles.name = 'oficina-detalles'
  grupo.add(capaEsencial, capaMobiliario, capaDetalles)

  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []
  const propsDetalle: THREE.Object3D[] = []

  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometrias.push(g)
    return g
  }
  const mat = <T extends THREE.Material>(m: T): T => {
    materiales.push(m)
    return m
  }
  const tex = (t: THREE.CanvasTexture | null): THREE.CanvasTexture | null => {
    if (t) texturas.push(t)
    return t
  }

  const { pisoY, techoY, paredFondoZ, pilarZ, bannerZ, anchoSala, fondoSala, costaneraZ } = COTAS_OFICINA
  const altoSala = techoY - pisoY // 8.1 u ≈ 3.05 m

  // ---- Materiales compartidos ----
  const tPiso = tex(texturaPisoMadera())
  const matPiso = mat(
    new THREE.MeshStandardMaterial({
      color: tPiso ? 0xffffff : 0xa4794f,
      map: tPiso,
      roughness: 0.78,
      metalness: 0.04,
    }),
  )
  const matParedClara = mat(
    new THREE.MeshStandardMaterial({
      color: 0xebe5d7,
      emissive: 0x423b30,
      emissiveIntensity: 0.25,
      roughness: 0.9,
    }),
  )
  const tTecho = tex(texturaTechoAcustico())
  const matTechoBase = mat(
    new THREE.MeshStandardMaterial({
      color: tTecho ? 0xffffff : 0xb4a894,
      map: tTecho,
      emissive: 0x6e624f,
      emissiveIntensity: 0.58,
      roughness: 0.92,
    }),
  )
  const matMarcoOscuro = mat(new THREE.MeshStandardMaterial({ color: 0x1e2329, roughness: 0.52, metalness: 0.25 }))
  const matPersiana = mat(
    new THREE.MeshStandardMaterial({
      color: 0xeef2f6,
      emissive: 0xd0dce8,
      emissiveIntensity: 0.3,
      roughness: 0.85,
    }),
  )
  const matNubeAcustica = mat(
    new THREE.MeshStandardMaterial({
      color: 0xefe9dc,
      emissive: 0x6b6252,
      emissiveIntensity: 0.42,
      roughness: 0.85,
    }),
  )
  const matAroLampara = mat(
    new THREE.MeshStandardMaterial({
      color: 0x2f3338,
      emissive: 0x202226,
      emissiveIntensity: 0.25,
      roughness: 0.55,
      metalness: 0.2,
    }),
  )
  const matLuzDisco = mat(new THREE.MeshBasicMaterial({ color: 0xfff1c4 }))
  const matLuzLineal = mat(new THREE.MeshBasicMaterial({ color: 0xf7fbff }))
  const matDucto = mat(
    new THREE.MeshStandardMaterial({
      color: 0xb0a798,
      emissive: 0x453f36,
      emissiveIntensity: 0.35,
      roughness: 0.65,
      metalness: 0.2,
    }),
  )
  const matTuberiaRoja = mat(
    new THREE.MeshStandardMaterial({
      color: 0x992b2b,
      emissive: 0x3b0f0f,
      emissiveIntensity: 0.3,
      roughness: 0.5,
    }),
  )
  const matEscritorio = mat(
    new THREE.MeshStandardMaterial({
      color: 0xe9e3d5,
      emissive: 0x26221b,
      emissiveIntensity: 0.14,
      roughness: 0.72,
    }),
  )
  const matPataNegra = mat(new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.5, metalness: 0.3 }))
  const matMonitorCarcasa = mat(new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.45, metalness: 0.2 }))
  const matSillaGris = mat(new THREE.MeshStandardMaterial({ color: 0xc8c3b8, roughness: 0.7 }))
  const matSillaMalla = mat(new THREE.MeshStandardMaterial({ color: 0x52565e, roughness: 0.85 }))
  const matSillaNegra = mat(new THREE.MeshStandardMaterial({ color: 0x1d2127, roughness: 0.8 }))
  const matCabinaGris = mat(new THREE.MeshStandardMaterial({ color: 0x7b7e86, roughness: 0.9 }))
  const matPlanta = mat(new THREE.MeshStandardMaterial({ color: 0x457d47, roughness: 0.8 }))
  const matMaceta = mat(new THREE.MeshStandardMaterial({ color: 0x35383e, roughness: 0.85 }))
  const matAluminio = mat(new THREE.MeshStandardMaterial({ color: 0xa2aab5, roughness: 0.35, metalness: 0.5 }))

  const tCodigoA = tex(texturaPantallaCodigo(0))
  const tCodigoB = tex(texturaPantallaCodigo(1))
  const matPantallaA = mat(new THREE.MeshBasicMaterial({ color: tCodigoA ? 0xffffff : 0x1e293b, map: tCodigoA }))
  const matPantallaB = mat(new THREE.MeshBasicMaterial({ color: tCodigoB ? 0xffffff : 0x1e293b, map: tCodigoB }))
  const pantallasAnimables = [matPantallaA, matPantallaB]

  const agregar = (padre: THREE.Group, obj: THREE.Object3D) => {
    padre.add(obj)
    return obj
  }

  // -------------------------------------------------------------------------
  // 1. PISO DE MADERA + PATAS DEL ESCRITORIO DEL JUGADOR (y = 0 → y = -2,0)
  // -------------------------------------------------------------------------
  const piso = new THREE.Mesh(geo(new THREE.PlaneGeometry(anchoSala, fondoSala)), matPiso)
  piso.rotation.x = -Math.PI / 2
  piso.position.set(0, pisoY, -8.0)
  agregar(capaEsencial, piso)

  if (conBaseMesa) {
    const bastidor = new THREE.Mesh(geo(new THREE.BoxGeometry(5.15, 0.14, 3.05)), matPataNegra)
    bastidor.position.set(0, -0.23, -0.25)
    agregar(capaEsencial, bastidor)

    const altoPata = Math.abs(pisoY) - 0.16
    const geoPataMesa = geo(new THREE.BoxGeometry(0.14, altoPata, 0.14))
    for (const [px, pz] of [
      [-2.42, -1.65],
      [2.42, -1.65],
      [-2.42, 1.15],
      [2.42, 1.15],
    ] as const) {
      const pata = new THREE.Mesh(geoPataMesa, matPataNegra)
      pata.position.set(px, -0.16 - altoPata / 2, pz)
      agregar(capaEsencial, pata)
    }
  }

  // -------------------------------------------------------------------------
  // 2. SKYLINE 3D DE SANTIAGO + GRAN TORRE SANTIAGO (COSTANERA CENTER)
  // -------------------------------------------------------------------------
  const tHorizonte = tex(texturaHorizonteSantiago())
  const matHorizonte = mat(new THREE.MeshBasicMaterial({ color: tHorizonte ? 0xffffff : 0xc0d5e8, map: tHorizonte }))
  const fondoHorizonte = new THREE.Mesh(geo(new THREE.PlaneGeometry(185, 72)), matHorizonte)
  fondoHorizonte.position.set(0, 14, -108)
  agregar(capaEsencial, fondoHorizonte)

  // Gran Torre Santiago (Costanera Center): silueta completa visible a través del ventanal
  // (cuerpo cónico biselado de vidrio celeste, costillas blancas, mirador Sky Costanera y corona angular).
  const construirCostaneraCenter = (cx: number, cz: number) => {
    const torre = new THREE.Group()
    torre.name = 'costanera-center'
    // Base baja en el valle de Providencia para que toda la torre + corona (hasta y ≈ +10,2) se luzca por la ventana
    torre.position.set(cx, -18.5, cz)
    torre.rotation.y = -0.32

    const tCostanera = tex(texturaFachadaCostanera())
    const matCristalCostanera = mat(
      new THREE.MeshBasicMaterial({
        color: tCostanera ? 0xeaf4fc : 0x6b90b0,
        map: tCostanera,
      }),
    )
    const matEstructuraBlanca = mat(new THREE.MeshBasicMaterial({ color: 0xe3edf5 }))
    const matCoronaCristal = mat(new THREE.MeshBasicMaterial({ color: 0x9fc4de }))

    // Cuerpo principal ahusado (y local 0..19.5 → mundo -18.5..+1.0)
    const cuerpo = new THREE.Mesh(geo(new THREE.CylinderGeometry(2.75, 4.15, 19.5, 8)), matCristalCostanera)
    cuerpo.position.y = 9.75
    torre.add(cuerpo)

    // Tramo superior más esbelto (y local 19.5..25.0 → mundo +1.0..+6.5)
    const superior = new THREE.Mesh(geo(new THREE.CylinderGeometry(2.05, 2.75, 5.5, 8)), matCristalCostanera)
    superior.position.y = 22.25
    torre.add(superior)

    // Mirador Sky Costanera (y local 25.0..26.9 → mundo +6.5..+8.4)
    const mirador = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.75, 2.05, 1.9, 8)), matCoronaCristal)
    mirador.position.y = 25.95
    torre.add(mirador)

    // Costillas estructurales blancas que suben por los 8 vértices hasta la corona
    const geoCostilla = geo(new THREE.BoxGeometry(0.15, 27.2, 0.2))
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI * 2) / 8 + Math.PI / 8
      const r = 2.9
      const costilla = new THREE.Mesh(geoCostilla, matEstructuraBlanca)
      costilla.position.set(Math.cos(ang) * r, 13.6, Math.sin(ang) * r)
      costilla.rotation.y = -ang
      costilla.rotation.z = -0.05
      torre.add(costilla)
    }

    // Corona angular abierta emblemática del Costanera Center (y local 26.9..29.1 → mundo +8.4..+10.6)
    const coronaTop = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.18, 1.75, 2.2, 8, 1, true)), matEstructuraBlanca)
    coronaTop.position.y = 28.0
    torre.add(coronaTop)

    // Anillo superior sutil de la corona
    const anilloCorona = new THREE.Mesh(geo(new THREE.TorusGeometry(1.22, 0.08, 6, 8)), matEstructuraBlanca)
    anilloCorona.rotation.x = Math.PI / 2
    anilloCorona.position.y = 29.05
    torre.add(anilloCorona)

    // Torre vecina baja del complejo Costanera (Torre 4, mucho más baja para destacar la Gran Torre)
    const torreBaja = new THREE.Mesh(geo(new THREE.BoxGeometry(4.6, 17.5, 3.8)), matCristalCostanera)
    torreBaja.position.set(-5.6, 8.75, 2.4)
    torre.add(torreBaja)

    agregar(capaEsencial, torre)
  }

  // Enmarcada 100% despejada en el ventanal derecho (al lado del pendón, con toda la corona visible)
  construirCostaneraCenter(20.5, costaneraZ)

  // Otros edificios de Santiago (más bajos para que el Costanera Center domine el horizonte)
  const tEdifClaro = tex(texturaEdificioCiudad(true))
  const tEdifOscuro = tex(texturaEdificioCiudad(false))
  const matEdifClaro = mat(new THREE.MeshBasicMaterial({ color: 0xe6eef5, map: tEdifClaro }))
  const matEdifOscuro = mat(new THREE.MeshBasicMaterial({ color: 0xd8e4ef, map: tEdifOscuro }))

  const edificios: [number, number, number, number, number, boolean][] = [
    [-28, -54, 6.2, 16, 5.2, false],
    [-19, -58, 5.6, 18.5, 5.0, true],
    [-10.5, -62, 5.8, 15, 5.2, false],
    [-2.5, -68, 6.5, 14.5, 5.4, true],
    [10.5, -66, 5.2, 14.5, 4.8, true],
    [32.5, -58, 6.0, 16.5, 5.2, false],
    [-36, -50, 6.8, 14, 5.0, true],
    [3.5, -72, 5.0, 12.5, 4.8, true],
  ]
  for (const [ex, ez, ew, eh, ed, claro] of edificios) {
    const edif = new THREE.Mesh(geo(new THREE.BoxGeometry(ew, eh, ed)), claro ? matEdifClaro : matEdifOscuro)
    edif.position.set(ex, -15 + eh / 2, ez)
    agregar(capaEsencial, edif)
  }

  // -------------------------------------------------------------------------
  // 3. MURO CORTINA DE VENTANALES + PERSIANAS ROLLER BLANCAS + AFICHES
  // -------------------------------------------------------------------------
  const zocalo = new THREE.Mesh(geo(new THREE.BoxGeometry(anchoSala, 0.35, 0.3)), matMarcoOscuro)
  zocalo.position.set(0, pisoY + 0.175, paredFondoZ)
  agregar(capaEsencial, zocalo)

  const dintel = new THREE.Mesh(geo(new THREE.BoxGeometry(anchoSala, 0.55, 0.4)), matParedClara)
  dintel.position.set(0, techoY - 0.27, paredFondoZ)
  agregar(capaEsencial, dintel)

  // Montantes verticales del ventanal (espaciado real ≈ 1,75 m = 4,6 u)
  const geoMontante = geo(new THREE.BoxGeometry(0.18, altoSala, 0.24))
  for (let x = -20.7; x <= 20.8; x += 4.6) {
    const m = new THREE.Mesh(geoMontante, matMarcoOscuro)
    m.position.set(x, pisoY + altoSala / 2, paredFondoZ)
    agregar(capaEsencial, m)
  }
  // Travesaños horizontales (uno a altura de escritorio y otro alto)
  const geoTrav = geo(new THREE.BoxGeometry(anchoSala, 0.1, 0.18))
  for (const ty of [pisoY + 2.05, pisoY + 5.15]) {
    const tr = new THREE.Mesh(geoTrav, matMarcoOscuro)
    tr.position.set(0, ty, paredFondoZ)
    agregar(capaEsencial, tr)
  }

  // Persianas roller blancas bajadas a distintas alturas (muy arriba sobre el Costanera Center para ver la corona)
  const alturasPersiana = [2.4, 2.0, 2.2, 1.8, 2.2, 0.75, 0.75, 1.8, 2.2]
  for (let i = 0; i < 9; i++) {
    const xCentro = -18.4 + i * 4.6
    const h = alturasPersiana[i % alturasPersiana.length]
    const persiana = new THREE.Mesh(geo(new THREE.BoxGeometry(4.36, h, 0.06)), matPersiana)
    persiana.position.set(xCentro, techoY - 0.45 - h / 2, paredFondoZ + 0.16)
    agregar(capaEsencial, persiana)
  }

  // Afiches oscuros con arte dorado en los vidrios (como en IMG_9987)
  const tAfiche = tex(texturaAficheVentana())
  const matAfiche = mat(new THREE.MeshBasicMaterial({ color: tAfiche ? 0xffffff : 0x1a1c1f, map: tAfiche }))
  for (const ax of [-13.8, 18.4]) {
    const afiche = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.3, 1.72)), matAfiche)
    afiche.position.set(ax, 1.85, paredFondoZ + 0.22)
    agregar(capaDetalles, afiche)
  }

  // -------------------------------------------------------------------------
  // 4. COLUMNA CENTRAL BLANCA CON LOGO ·buk·
  // -------------------------------------------------------------------------
  const pilarW = 3.3
  const pilarD = 2.6
  const pilar = new THREE.Mesh(geo(new THREE.BoxGeometry(pilarW, altoSala, pilarD)), matParedClara)
  pilar.position.set(0, pisoY + altoSala / 2, pilarZ)
  agregar(capaEsencial, pilar)

  // Logo azul ·buk· a altura real (~1,55 m sobre el piso = y +2,05, sobre los monitores y bajo el pendón)
  const tBuk = tex(texturaPilarBuk())
  const matBuk = mat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tBuk,
      emissive: 0x353129,
      emissiveIntensity: 0.25,
      roughness: 0.72,
    }),
  )
  const placaBuk = new THREE.Mesh(geo(new THREE.PlaneGeometry(3.18, 3.18)), matBuk)
  placaBuk.position.set(0, 1.82, pilarZ + pilarD / 2 + 0.02)
  agregar(capaEsencial, placaBuk)

  // Extintor rojo al costado derecho de la columna (IMG_9987)
  const extintor = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.16, 0.85, 10)), matTuberiaRoja)
  extintor.position.set(pilarW / 2 + 0.24, pisoY + 0.75, pilarZ + 0.45)
  agregar(capaDetalles, extintor)

  // -------------------------------------------------------------------------
  // 5. PENDÓN COLGANTE "platanus hack [26] FT. buk"
  // -------------------------------------------------------------------------
  const bannerW = 8.4
  const bannerH = 2.05
  const bannerY = 3.55 // cuelga arriba de ·buk· y bajo el HUD superior en horizontal y vertical
  const tBanner = tex(texturaBannerPlatanus())
  const matBannerFrente = mat(new THREE.MeshBasicMaterial({ color: tBanner ? 0xffffff : 0x1a1c1f, map: tBanner }))
  const matBannerDorso = mat(new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.9 }))

  const bannerMesh = new THREE.Mesh(geo(new THREE.BoxGeometry(bannerW, bannerH, 0.07)), [
    matBannerDorso,
    matBannerDorso,
    matBannerDorso,
    matBannerDorso,
    matBannerFrente,
    matBannerDorso,
  ])
  bannerMesh.position.set(0, bannerY, bannerZ)
  agregar(capaEsencial, bannerMesh)

  const largoCable = Math.max(0.4, techoY - (bannerY + bannerH / 2))
  const geoCable = geo(new THREE.CylinderGeometry(0.025, 0.025, largoCable, 6))
  for (const cx of [-bannerW * 0.44, bannerW * 0.44]) {
    const cable = new THREE.Mesh(geoCable, matMarcoOscuro)
    cable.position.set(cx, bannerY + bannerH / 2 + largoCable / 2, bannerZ)
    agregar(capaEsencial, cable)
  }

  // -------------------------------------------------------------------------
  // 6. TECHO INDUSTRIAL: DISCOS LUMINOSOS CÁLIDOS, NUBES ACÚSTICAS, LED Y DUCTOS
  // -------------------------------------------------------------------------
  const techo = new THREE.Mesh(geo(new THREE.PlaneGeometry(anchoSala, fondoSala)), matTechoBase)
  techo.rotation.x = Math.PI / 2
  techo.position.set(0, techoY, -8.0)
  agregar(capaEsencial, techo)

  // Ductos grises y tuberías rojas contra incendio en el cielo raso
  const geoDucto = geo(new THREE.CylinderGeometry(0.36, 0.36, anchoSala, 10))
  for (const dz of [-21.5, -15.5, -9.5]) {
    const ducto = new THREE.Mesh(geoDucto, matDucto)
    ducto.rotation.z = Math.PI / 2
    ducto.position.set(0, techoY - 0.45, dz)
    agregar(capaDetalles, ducto)
  }
  const geoTuboRojo = geo(new THREE.CylinderGeometry(0.08, 0.08, anchoSala, 8))
  for (const tz of [-18.5, -12.5]) {
    const tubo = new THREE.Mesh(geoTuboRojo, matTuberiaRoja)
    tubo.rotation.z = Math.PI / 2
    tubo.position.set(0, techoY - 0.25, tz)
    agregar(capaDetalles, tubo)
  }

  // Lámparas circulares grandes colgantes (cara inferior luminosa cálida, vistas desde abajo como en IMG_9987)
  const geoAro = geo(new THREE.CylinderGeometry(1.75, 1.75, 0.22, 28))
  const geoDiscoLuz = geo(new THREE.CircleGeometry(1.66, 28))
  const geoNube = geo(new THREE.CylinderGeometry(1.68, 1.68, 0.16, 28))
  const geoVarilla = geo(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6))

  const lamparasDisco: [number, number, number][] = [
    [-5.8, 4.75, -10.8],
    [5.8, 4.75, -10.8],
    [-9.5, 4.95, -16.8],
    [9.5, 4.95, -16.8],
    [-4.8, 5.05, -4.2],
    [4.8, 5.05, -4.2],
  ]
  for (const [lx, ly, lz] of lamparasDisco) {
    const aro = new THREE.Mesh(geoAro, matAroLampara)
    aro.position.set(lx, ly, lz)
    const disco = new THREE.Mesh(geoDiscoLuz, matLuzDisco)
    disco.rotation.x = Math.PI / 2
    disco.position.set(lx, ly - 0.115, lz)
    const varilla = new THREE.Mesh(geoVarilla, matMarcoOscuro)
    varilla.position.set(lx, ly + 0.85, lz)
    agregar(capaEsencial, aro)
    agregar(capaEsencial, disco)
    agregar(capaDetalles, varilla)
  }

  // Nubes acústicas circulares blancas intercaladas
  const nubes: [number, number, number][] = [
    [0, 5.2, -10.5],
    [-12.2, 5.1, -11.5],
    [12.2, 5.1, -11.5],
    [0, 5.25, -4.5],
  ]
  for (const [nx, ny, nz] of nubes) {
    const nube = new THREE.Mesh(geoNube, matNubeAcustica)
    nube.position.set(nx, ny, nz)
    agregar(capaMobiliario, nube)
  }

  // Barras LED lineales blancas perpendiculares al ventanal (IMG_9987)
  const geoBarraLed = geo(new THREE.BoxGeometry(0.12, 0.1, 6.2))
  for (const bx of [-13.4, -7.8, 7.8, 13.4]) {
    const barra = new THREE.Mesh(geoBarraLed, matLuzLineal)
    barra.position.set(bx, 4.35, -19.2)
    agregar(capaMobiliario, barra)
  }

  // -------------------------------------------------------------------------
  // 7. PAREDES LATERALES: CABINAS GRISES + PLANTAS + MÁQUINA ARCADE BUK
  // -------------------------------------------------------------------------
  const paredIzq = new THREE.Mesh(geo(new THREE.BoxGeometry(0.5, altoSala, fondoSala)), matParedClara)
  paredIzq.position.set(-anchoSala / 2, pisoY + altoSala / 2, -8.0)
  const paredDer = new THREE.Mesh(geo(new THREE.BoxGeometry(0.5, altoSala, fondoSala)), matParedClara)
  paredDer.position.set(anchoSala / 2, pisoY + altoSala / 2, -8.0)
  agregar(capaEsencial, paredIzq)
  agregar(capaEsencial, paredDer)

  const construirCabina = (lado: -1 | 1, zCentro: number) => {
    const xBase = lado * (anchoSala / 2 - 2.1)
    const cab = new THREE.Group()
    cab.position.set(xBase, pisoY, zCentro)

    const fondo = new THREE.Mesh(geo(new THREE.BoxGeometry(0.24, 4.2, 4.4)), matCabinaGris)
    fondo.position.set(lado * 1.65, 2.1, 0)
    cab.add(fondo)

    const tabique = geo(new THREE.BoxGeometry(3.7, altoSala - 0.8, 0.24))
    for (const tz of [-2.35, 2.35]) {
      const t = new THREE.Mesh(tabique, matParedClara)
      t.position.set(0, (altoSala - 0.8) / 2, tz)
      cab.add(t)
    }

    const asiento = new THREE.Mesh(geo(new THREE.BoxGeometry(1.45, 0.95, 4.15)), matCabinaGris)
    asiento.position.set(lado * 0.85, 0.475, 0)
    cab.add(asiento)

    const mesita = new THREE.Mesh(geo(new THREE.BoxGeometry(1.2, 0.12, 2.1)), matEscritorio)
    mesita.position.set(-lado * 0.45, 1.9, 0)
    cab.add(mesita)

    agregar(capaMobiliario, cab)
  }
  construirCabina(-1, -13.5)
  construirCabina(-1, -8.2)
  construirCabina(1, -13.5)
  construirCabina(1, -8.2)

  // Máquina arcade de Buk en el rincón trasero derecho (a escala real ≈ 1,85 m = 4,9 u)
  const arcade = new THREE.Group()
  arcade.position.set(17.8, pisoY, -21.2)
  arcade.rotation.y = -0.35
  const cuerpoArcade = new THREE.Mesh(geo(new THREE.BoxGeometry(1.9, 4.7, 1.55)), matMarcoOscuro)
  cuerpoArcade.position.y = 2.35
  arcade.add(cuerpoArcade)
  const tArcade = tex(texturaArcadeBuk())
  const matArcade = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, map: tArcade }))
  const marquesina = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.68, 0.62)), matArcade)
  marquesina.position.set(0, 4.25, 0.79)
  arcade.add(marquesina)
  const pantallaArcade = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.42, 1.08)), matPantallaB)
  pantallaArcade.position.set(0, 2.85, 0.79)
  arcade.add(pantallaArcade)
  agregar(capaDetalles, arcade)

  // Plantas verdes altas cerca de los ventanales
  const construirPlanta = (px: number, pz: number) => {
    const p = new THREE.Group()
    p.position.set(px, pisoY, pz)
    const maceta = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.55, 0.42, 1.1, 10)), matMaceta)
    maceta.position.y = 0.55
    p.add(maceta)
    const geoHoja = geo(new THREE.ConeGeometry(0.45, 2.3, 6))
    for (let i = 0; i < 6; i++) {
      const hoja = new THREE.Mesh(geoHoja, matPlanta)
      const ang = (i * Math.PI * 2) / 6
      hoja.position.set(Math.cos(ang) * 0.28, 1.95 + (i % 2) * 0.25, Math.sin(ang) * 0.28)
      hoja.rotation.z = -Math.cos(ang) * 0.34
      hoja.rotation.x = Math.sin(ang) * 0.34
      p.add(hoja)
    }
    agregar(capaDetalles, p)
  }
  construirPlanta(-17.8, -22.8)
  construirPlanta(15.2, -22.8)

  // -------------------------------------------------------------------------
  // 8. ESCRITORIOS DE HACKATÓN A ESCALA REAL 1:1 (y = 0, IGUAL QUE LA MESA DE JUEGO)
  // -------------------------------------------------------------------------
  const altoDesk = Math.abs(pisoY) // 2.0 u → tapa en y = 0.0 (misma altura que tu mesa!)
  const geoMonitor = geo(new THREE.BoxGeometry(1.52, 0.9, 0.08))
  const geoPantalla = geo(new THREE.PlaneGeometry(1.4, 0.78))
  const geoBaseMon = geo(new THREE.BoxGeometry(0.2, 0.42, 0.18))
  const geoPieMon = geo(new THREE.BoxGeometry(0.54, 0.06, 0.38))

  const geoAsientoSilla = geo(new THREE.BoxGeometry(1.22, 0.14, 1.16))
  const geoRespaldoSilla = geo(new THREE.BoxGeometry(1.16, 1.48, 0.13))
  const geoMarcoRespaldo = geo(new THREE.BoxGeometry(1.26, 1.56, 0.08))
  const geoTuboSilla = geo(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6))
  const geoEstrellaSilla = geo(new THREE.CylinderGeometry(0.66, 0.66, 0.09, 6))

  const geoBotella = geo(new THREE.CylinderGeometry(0.085, 0.095, 0.42, 8))
  const matBotellaRoja = mat(new THREE.MeshStandardMaterial({ color: 0xc93b34, roughness: 0.35 }))
  const matBotellaAgua = mat(new THREE.MeshStandardMaterial({ color: 0xb9d8ea, roughness: 0.25 }))
  const geoLaptopBase = geo(new THREE.BoxGeometry(0.82, 0.04, 0.56))
  const geoLaptopTapa = geo(new THREE.BoxGeometry(0.82, 0.54, 0.035))

  const crearMonitor = (x: number, y: number, z: number, rotY: number, conCodigo: boolean, variante: number) => {
    const m = new THREE.Group()
    m.position.set(x, y, z)
    m.rotation.y = rotY
    const pie = new THREE.Mesh(geoPieMon, matPataNegra)
    pie.position.y = 0.03
    const brazo = new THREE.Mesh(geoBaseMon, matPataNegra)
    brazo.position.set(0, 0.24, -0.05)
    const carcasa = new THREE.Mesh(geoMonitor, matMonitorCarcasa)
    carcasa.position.y = 0.78
    m.add(pie, brazo, carcasa)
    if (conCodigo) {
      const screen = new THREE.Mesh(geoPantalla, variante % 2 === 0 ? matPantallaA : matPantallaB)
      screen.position.set(0, 0.78, 0.045)
      m.add(screen)
    }
    return m
  }

  const crearSilla = (x: number, z: number, rotY: number, oscura: boolean) => {
    const s = new THREE.Group()
    s.position.set(x, 0, z)
    s.rotation.y = rotY
    const matCuerpo = oscura ? matSillaNegra : matSillaMalla
    const matBase = oscura ? matPataNegra : matSillaGris
    const estrella = new THREE.Mesh(geoEstrellaSilla, matBase)
    estrella.position.y = 0.1
    const tubo = new THREE.Mesh(geoTuboSilla, matPataNegra)
    tubo.position.y = 0.62
    const asiento = new THREE.Mesh(geoAsientoSilla, matCuerpo)
    asiento.position.y = 1.18
    if (!oscura) {
      const marco = new THREE.Mesh(geoMarcoRespaldo, matSillaGris)
      marco.position.set(0, 1.98, -0.56)
      marco.rotation.x = -0.1
      s.add(marco)
    }
    const respaldo = new THREE.Mesh(geoRespaldoSilla, matCuerpo)
    respaldo.position.set(0, 1.98, -0.52)
    respaldo.rotation.x = -0.1
    s.add(estrella, tubo, asiento, respaldo)
    return s
  }

  const construirIslaEscritorios = (
    cx: number,
    cz: number,
    largo: number,
    ancho: number,
    rotY: number,
    semilla: number,
    conMonitores = true,
  ) => {
    const isla = new THREE.Group()
    isla.position.set(cx, pisoY, cz)
    isla.rotation.y = rotY

    const tabla = new THREE.Mesh(geo(new THREE.BoxGeometry(ancho, 0.12, largo)), matEscritorio)
    tabla.position.y = altoDesk - 0.06
    isla.add(tabla)

    const geoPata = geo(new THREE.BoxGeometry(0.12, altoDesk - 0.06, 0.12))
    for (const zp of [-largo / 2 + 0.22, 0, largo / 2 - 0.22]) {
      for (const xp of [-ancho / 2 + 0.18, ancho / 2 - 0.18]) {
        const pata = new THREE.Mesh(geoPata, matPataNegra)
        pata.position.set(xp, (altoDesk - 0.06) / 2, zp)
        isla.add(pata)
      }
    }

    const puestos = Math.max(2, Math.floor(largo / 2.75))
    const paso = largo / puestos
    for (let i = 0; i < puestos; i++) {
      const zp = -largo / 2 + paso * (i + 0.5)
      if (conMonitores) {
        isla.add(crearMonitor(-0.34, altoDesk, zp, -Math.PI / 2, true, semilla + i))
        isla.add(crearMonitor(0.34, altoDesk, zp, Math.PI / 2, (i + semilla) % 2 === 0, semilla + i + 1))
      }

      const jitter = ((i * 37 + semilla * 13) % 5) * 0.09 - 0.18
      isla.add(crearSilla(-ancho / 2 - 0.92, zp + jitter, Math.PI / 2 + jitter * 0.8, (i + semilla) % 3 === 0))
      isla.add(crearSilla(ancho / 2 + 0.92, zp - jitter, -Math.PI / 2 - jitter * 0.8, (i + semilla) % 2 === 0))

      if ((i + semilla) % 2 === 0) {
        const lap = new THREE.Group()
        lap.position.set(-ancho * 0.32, altoDesk + 0.02, zp + 0.6)
        lap.rotation.y = Math.PI / 2 + 0.15
        lap.add(new THREE.Mesh(geoLaptopBase, matAluminio))
        const tapa = new THREE.Mesh(geoLaptopTapa, matAluminio)
        tapa.position.set(0, 0.26, -0.26)
        tapa.rotation.x = -0.2
        lap.add(tapa)
        isla.add(lap)
        propsDetalle.push(lap)
      }
      if ((i + semilla) % 3 === 1) {
        const bot = new THREE.Mesh(geoBotella, i % 2 === 0 ? matBotellaRoja : matBotellaAgua)
        bot.position.set(ancho * 0.34, altoDesk + 0.21, zp - 0.45)
        isla.add(bot)
        propsDetalle.push(bot)
      }
    }

    agregar(capaMobiliario, isla)
  }

  // Distribución fiel a IMG_9987 (a escala 1:1 con tu escritorio!):
  // 1) Isla central frente a la columna ·buk· (con laptops/sillas, sin monitores que tapen el logo ·buk·)
  construirIslaEscritorios(0, -11.4, 6.2, 3.0, 0, 1, false)
  // 2) Islas izquierdas (entre tu escritorio, el pasillo y el ventanal)
  construirIslaEscritorios(-9.2, -13.2, 8.2, 3.1, 0.05, 2, true)
  construirIslaEscritorios(-8.6, -2.6, 5.6, 3.0, 0.03, 3, true)
  // 3) Islas derechas (pasillo derecho hacia el Costanera Center)
  construirIslaEscritorios(9.2, -13.2, 8.2, 3.1, -0.05, 4, true)
  construirIslaEscritorios(8.6, -2.6, 5.6, 3.0, -0.03, 5, true)
  // 4) Bancos de escritorios pegados al fondo junto a los ventanales
  construirIslaEscritorios(-7.8, -21.2, 5.6, 2.8, Math.PI / 2, 6, true)
  construirIslaEscritorios(8.2, -21.2, 5.6, 2.8, Math.PI / 2, 7, true)

  // -------------------------------------------------------------------------
  // 9. LUZ DE RELLENO CÁLIDA DE LAS LÁMPARAS DEL TECHO (sin sombras)
  // -------------------------------------------------------------------------
  const luzTecho = new THREE.PointLight(0xffe9c2, 2.4, 42, 1.1)
  luzTecho.position.set(0, 4.2, -11.0)
  agregar(capaMobiliario, luzTecho)

  grupo.traverse((obj) => {
    obj.castShadow = false
    obj.receiveShadow = false
  })

  let calidadActual = 0
  const aplicarCalidad = (calidad: number) => {
    calidadActual = Math.max(0, Math.min(3, Math.round(calidad)))
    const verDetalles = calidadActual === 0
    capaDetalles.visible = verDetalles
    for (const p of propsDetalle) p.visible = verDetalles
    capaMobiliario.visible = calidadActual <= 1
    capaEsencial.visible = calidadActual <= 2
  }
  aplicarCalidad(calidadInicial)

  let reloj = 0
  const actualizar = (dt: number) => {
    if (calidadActual >= 2) return
    reloj += dt
    const pulso = 0.94 + Math.sin(reloj * 1.4) * 0.06
    for (const m of pantallasAnimables) m.color.setRGB(pulso, pulso, Math.min(1, pulso + 0.03))
  }

  const liberar = () => {
    for (const g of geometrias) g.dispose()
    for (const m of materiales) m.dispose()
    for (const t of texturas) t.dispose()
  }

  return { grupo, aplicarCalidad, actualizar, liberar }
}
