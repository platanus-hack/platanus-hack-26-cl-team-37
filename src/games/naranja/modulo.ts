// Exprime la naranja (F25, J4): cierre de puño sostenido, sin física, sobre la base común.
// Referencia: imagenes_juegos/04_exprime_la_naranja.png y docs/referencia/prompts_juegos/J4_exprime_la_naranja.md.
//
// Escena (mismo lenguaje visual que la base): un vaso de vidrio al centro de la mesa, una fuente con naranjas a la
// izquierda y, a la derecha, las mitades ya exprimidas (una más por cada repetición válida, hasta 4). La mano virtual
// de la base (copia la mano del paciente) flota sobre el vaso; cuando la abres aparece una naranja en ella, se achica
// y se oscurece al cerrar el puño, y al sostenerlo caen gotas al vaso. Al abrir la mano por completo sube el nivel del
// jugo. Arriba, bajo la barra de tiempo, una tarjeta fija a la cámara muestra dos barras: cierre de puño (con la marca
// del nivel) y tiempo sostenido. Los cuatro pasos van en la pista del panel izquierdo, no se repiten en la tarjeta.
//
// Reglas y eventos: logica.ts (pasoNaranja). Eventos: cierre_inicio, umbral_alcanzado, sostenido_completo,
// apertura_completa y repeticion_incompleta { paso en que falló }. Cada repetición cuenta solo si cumple los cuatro pasos.
//
// Decisión: el paso 1 pide la mano abierta; no se exige que esté justo sobre el vaso (la posición de la mano depende de
// cómo se sostiene el teléfono), pero la zona de manos se acota para que quede siempre sobre el centro de la mesa.
import * as THREE from 'three'
import type { LadoMano } from '../../domain/types'
import { num } from '../../lib/formato'
import type { ManoSeguida } from '../../tracking/tipos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  AgregadoNaranja,
  INICIO_CIERRE_PCT,
  NIVELES_NARANJA,
  NOMBRE_PASO,
  PISTAS_PASO,
  cierreDeApertura,
  cortarRepeticion,
  estadoNaranjaInicial,
  nivelNaranja,
  pasoNaranja,
  pistaFallo,
  progresoSostener,
  type EstadoNaranja,
  type EventoNaranja,
  type NivelNaranja,
  type PasoNaranja,
} from './logica'
import { KUWU, kuwuAlfa, fuenteKuwu, kuwuNum } from '../../ui/paleta'

const LADOS: LadoMano[] = ['derecha', 'izquierda']
const COLOR_EXPRIMIDA = new THREE.Color(0xc2570f)

const COLOR_NARANJA = 0xf08a24
const COLOR_ACENTO = kuwuNum('amarillo')
const COLOR_OK = kuwuNum('menta')

/** Posición del vaso en la mesa. */
const VASO = { x: 0, z: -0.5 }
const VASO_ALTO = 0.95
const JUGO_BASE = 0.06
const JUGO_ALTO = 0.82
/** Mitades exprimidas (derecha de la mesa), una por repetición válida. */
const MITADES = [
  { x: 1.75, z: -0.25, giro: 0.4 },
  { x: 2.15, z: -0.7, giro: 1.9 },
  { x: 1.65, z: -0.95, giro: 3.1 },
  { x: 2.1, z: 0.1, giro: 4.5 },
]
const MAX_GOTAS = 18
const GOTA_CADA_S = 0.2
const GOTA_DURACION_S = 0.6
/** Cuánto se muestra el aviso de repetición incompleta (s). */
const AVISO_FALLO_S = 3.2

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_NARANJA[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoNaranjaDepuracion {
  contador: number
  meta: number
  lado: LadoMano
  paso: PasoNaranja
  /** Cierre de puño actual en % (null si no se ve la mano). */
  cierre: number | null
  umbral: number
  sostenerMs: number
  sostenidoMs: number
  cierreMax: number
  naranja: boolean
  validas: number
  incompletas: number
  /** Paso en que falló la última repetición incompleta. */
  ultimoFallo: number | null
  nivelVaso: number
  gotas: number
}

function texturaHalo(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Tarjeta de las dos barras (fija a la cámara, a la derecha). Se diseña en píxeles CSS y se coloca para que mida eso
 * mismo en pantalla (ver ubicarGuia), así la letra de 14-15 px se lee igual en un teléfono de 844x390.
 */
const ANCHO_GUIA = 210
const ALTO_GUIA = 116
/** Fracción del ancho de la pantalla como máximo (pantallas muy angostas). */
const FRACCION_MAX_GUIA = 0.5
/** Margen a la derecha de la pantalla (px CSS). */
const MARGEN_GUIA = 14
/** Distancia de la tarjeta a la cámara (unidades de escena). */
const DIST_GUIA = 5

const FUENTE_BARRA = fuenteKuwu(800, 15)
const FUENTE_MARCA = fuenteKuwu(800, 14)

export const crearNaranja: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelNaranja = nivelNaranja(1)
  let lados: LadoMano[] = ['derecha']
  let ladoActivo: LadoMano = 'derecha'
  let estado: EstadoNaranja = estadoNaranjaInicial()
  const agregado = new AgregadoNaranja()
  let contador = 0
  let cierre: number | null = null
  let ultimoSostenidoMs = 0
  let ultimoFallo: number | null = null
  let falloT = 0
  let reloj = 0

  // Escena
  const grupo = new THREE.Group()
  const luces = new THREE.Group()
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []
  const tmp = new THREE.Vector3()
  let jugo: THREE.Mesh | null = null
  let superficie: THREE.Mesh | null = null
  let anilloVaso: THREE.Mesh | null = null
  let onda: THREE.Mesh | null = null
  let ondaT = -1
  let naranja: THREE.Group | null = null
  let cuerpoNaranja: THREE.Mesh | null = null
  let halo: THREE.Sprite | null = null
  const mitades: THREE.Mesh[] = []
  const popMitad: number[] = MITADES.map(() => 0)
  let nivelVaso = 0
  let aparece = 0
  let pop = 0
  let acumGota = 0
  interface Gota {
    mesh: THREE.Mesh
    activa: boolean
    t: number
    x0: number
    y0: number
    z0: number
  }
  const gotas: Gota[] = []
  let lienzo: HTMLCanvasElement | null = null
  let texGuia: THREE.CanvasTexture | null = null
  let firmaGuia = ''
  let firmaUbicacion = ''
  let resolucionGuia = 1
  let lienzoJuego: HTMLCanvasElement | null | undefined

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && contador >= ctx.meta
  const capacidad = () => (ctx && ctx.meta > 0 ? ctx.meta : 10)

  /** Cierre de puño en % de una mano (apertura calibrada; sin calibración, la apertura sin calibrar). null si no se ve. */
  const cierreDe = (lado: LadoMano): number | null => {
    const m = ctx?.medidas(lado)
    if (!m) return null
    return cierreDeApertura(m.aperturaCalibrada ?? Math.min(1, m.apertura))
  }

  function material(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra })
    materiales.push(m)
    return m
  }
  function geo<T extends THREE.BufferGeometry>(g: T): T {
    geometrias.push(g)
    return g
  }

  function crearNaranja3d(radio: number): THREE.Group {
    const g = new THREE.Group()
    const cuerpo = new THREE.Mesh(geo(new THREE.SphereGeometry(radio, 28, 20)), material(COLOR_NARANJA, { roughness: 0.5, emissive: 0x3a1500, emissiveIntensity: 0.35 }))
    cuerpo.castShadow = true
    const hoja = new THREE.Mesh(geo(new THREE.SphereGeometry(radio * 0.3, 12, 8)), material(0x4fa05a, { roughness: 0.6 }))
    hoja.scale.set(1.5, 0.35, 0.9)
    hoja.position.set(radio * 0.18, radio * 0.97, 0)
    hoja.rotation.z = -0.35
    g.add(cuerpo, hoja)
    g.userData.cuerpo = cuerpo
    return g
  }

  function construirEscena(c: ContextoJuego) {
    const y0 = c.mesa.altura
    const tHalo = texturaHalo()
    texturas.push(tHalo)

    // Vaso: jugo (sube con las repeticiones) dentro de un cilindro de vidrio.
    const matJugo = material(0xf2a02a, { roughness: 0.35, transparent: true, opacity: 0.94, emissive: 0x5a2a00, emissiveIntensity: 0.25 })
    jugo = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.375, 0.345, 1, 32).translate(0, 0.5, 0)), matJugo)
    jugo.position.set(VASO.x, y0 + JUGO_BASE, VASO.z)
    jugo.renderOrder = 2
    superficie = new THREE.Mesh(geo(new THREE.CircleGeometry(0.372, 32).rotateX(-Math.PI / 2)), material(0xffd37a, { roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.3 }))
    superficie.renderOrder = 2
    const vidrio = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.44, 0.4, VASO_ALTO, 36, 1, true)),
      material(0xcfe6f2, { roughness: 0.08, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    )
    vidrio.position.set(VASO.x, y0 + VASO_ALTO / 2, VASO.z)
    vidrio.renderOrder = 3
    const fondo = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.4, 0.4, JUGO_BASE, 36)), material(0xcfe6f2, { roughness: 0.1, transparent: true, opacity: 0.45 }))
    fondo.position.set(VASO.x, y0 + JUGO_BASE / 2, VASO.z)
    const borde = new THREE.Mesh(geo(new THREE.TorusGeometry(0.44, 0.016, 8, 48).rotateX(Math.PI / 2)), material(0xffffff, { transparent: true, opacity: 0.55, roughness: 0.2 }))
    borde.position.set(VASO.x, y0 + VASO_ALTO, VASO.z)
    borde.renderOrder = 3
    // Anillo de la mesa bajo el vaso: late amarillo en el paso 1 ("abre la mano aquí") y onda al completar una repetición.
    anilloVaso = new THREE.Mesh(geo(new THREE.RingGeometry(0.62, 0.7, 56).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: COLOR_ACENTO, transparent: true, opacity: 0.8, depthWrite: false }))
    materiales.push(anilloVaso.material as THREE.Material)
    anilloVaso.position.set(VASO.x, y0 + 0.012, VASO.z)
    anilloVaso.renderOrder = 1
    onda = new THREE.Mesh(geo(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: COLOR_OK, transparent: true, opacity: 0.8, depthWrite: false }))
    materiales.push(onda.material as THREE.Material)
    onda.position.set(VASO.x, y0 + 0.02, VASO.z)
    onda.visible = false
    onda.renderOrder = 1
    for (const m of [vidrio, fondo, jugo]) m.castShadow = m === jugo ? false : true
    grupo.add(jugo, superficie, fondo, vidrio, borde, anilloVaso, onda)

    // Fuente con naranjas (izquierda).
    const fuente = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.72, 0.58, 0.3, 40)), material(0xe9dfca, { roughness: 0.7 }))
    fuente.position.set(-1.9, y0 + 0.15, -0.6)
    fuente.castShadow = fuente.receiveShadow = true
    grupo.add(fuente)
    for (const [dx, dy, dz] of [[-0.22, 0.5, 0.12], [0.24, 0.5, 0.08], [0.0, 0.5, -0.26], [0.02, 0.78, -0.02]] as const) {
      const n = crearNaranja3d(0.3)
      n.position.set(-1.9 + dx, y0 + dy, -0.6 + dz)
      grupo.add(n)
    }

    // Mitades exprimidas (derecha): aparecen de a una.
    const geoMitad = geo(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2))
    const matMitad = material(0xe27a1c, { roughness: 0.5 })
    MITADES.forEach((m) => {
      const h = new THREE.Mesh(geoMitad, matMitad)
      h.position.set(m.x, y0, m.z)
      h.rotation.y = m.giro
      h.castShadow = true
      h.scale.setScalar(0.001)
      h.visible = false
      mitades.push(h)
      grupo.add(h)
    })

    // Naranja en la mano: se achica y se oscurece con el cierre del puño.
    naranja = crearNaranja3d(0.3)
    cuerpoNaranja = naranja.userData.cuerpo as THREE.Mesh
    naranja.visible = false
    const matHalo = new THREE.SpriteMaterial({ map: tHalo, color: COLOR_ACENTO, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
    materiales.push(matHalo)
    halo = new THREE.Sprite(matHalo)
    halo.scale.set(1.25, 1.25, 1)
    naranja.add(halo)
    grupo.add(naranja)

    // Gotas.
    const geoGota = geo(new THREE.SphereGeometry(0.075, 12, 10))
    const matGota = material(COLOR_NARANJA, { roughness: 0.3, emissive: 0x5a2a00, emissiveIntensity: 0.5 })
    for (let i = 0; i < MAX_GOTAS; i++) {
      const mesh = new THREE.Mesh(geoGota, matGota)
      mesh.visible = false
      mesh.scale.set(0.8, 1.15, 0.8)
      gotas.push({ mesh, activa: false, t: 0, x0: 0, y0: 0, z0: 0 })
      grupo.add(mesh)
    }
    c.escena.add(grupo)

    // Tarjeta de las dos barras, fija a la cámara (bajo la barra de tiempo). Lienzo = diseño x min(1.5, devicePixelRatio);
    // sin mipmaps y con filtro lineal para que la letra no se emborrone, y sin tone mapping para que no se lave.
    const resolucion = Math.min(1.5, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    lienzo = document.createElement('canvas')
    lienzo.width = Math.round(ANCHO_GUIA * resolucion)
    lienzo.height = Math.round(ALTO_GUIA * resolucion)
    resolucionGuia = lienzo.width / ANCHO_GUIA
    texGuia = new THREE.CanvasTexture(lienzo)
    texGuia.colorSpace = THREE.SRGBColorSpace
    texGuia.generateMipmaps = false
    texGuia.minFilter = THREE.LinearFilter
    texGuia.magFilter = THREE.LinearFilter
    texturas.push(texGuia)
    const matGuia = new THREE.SpriteMaterial({ map: texGuia, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
    materiales.push(matGuia)
    const sGuia = new THREE.Sprite(matGuia)
    sGuia.renderOrder = 10
    sGuia.scale.set(1, ALTO_GUIA / ANCHO_GUIA, 1)
    sGuia.name = 'guia'
    luces.add(sGuia)
    c.camara.add(luces)
    c.escena.add(c.camara)
  }

  function dibujarGuia() {
    if (!lienzo || !texGuia) return
    const prog = progresoSostener(estado, nivel)
    const sost = estado.paso >= 3 ? Math.min(nivel.sostenerMs, estado.sostenidoMs) : 0
    const sobre = cierre != null && cierre >= nivel.umbral
    const firma = [cierre == null ? -1 : Math.round(cierre), Math.round(sost / 100), sobre ? 1 : 0, nivel.umbral].join(',')
    if (firma === firmaGuia) return
    firmaGuia = firma
    const g = lienzo.getContext('2d')!
    const W = ANCHO_GUIA
    const H = ALTO_GUIA
    g.setTransform(resolucionGuia, 0, 0, resolucionGuia, 0, 0)
    g.clearRect(0, 0, W, H)
    g.fillStyle = kuwuAlfa('noche', 0.92)
    g.beginPath()
    g.roundRect(1, 1, W - 2, H - 2, 16)
    g.fill()
    g.strokeStyle = kuwuAlfa('crema', 0.22)
    g.lineWidth = 1.5
    g.stroke()
    g.textBaseline = 'middle'
    // Texto blanco con contorno oscuro: se lee igual sobre la barra vacía, la amarilla y la verde.
    const texto = (t: string, x: number, y: number, align: CanvasTextAlign, fuente: string) => {
      g.font = fuente
      g.textAlign = align
      g.lineJoin = 'round'
      g.lineWidth = 2.5
      g.strokeStyle = kuwuAlfa('noche', 0.9)
      g.strokeText(t, x, y)
      g.fillStyle = KUWU.crema
      g.fillText(t, x, y)
    }
    const x = 10
    const w = W - 2 * x
    const h = 32
    const barra = (y: number, frac: number, color: string, etiqueta: string) => {
      g.fillStyle = kuwuAlfa('crema', 0.14)
      g.beginPath()
      g.roundRect(x, y, w, h, h / 2)
      g.fill()
      if (frac > 0.01) {
        g.fillStyle = color
        g.beginPath()
        g.roundRect(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2)
        g.fill()
      }
      texto(etiqueta, x + 12, y + h / 2 + 1, 'left', FUENTE_BARRA)
    }
    // Barra de cierre de puño: la marca del nivel es una raya con su número encima (la etiqueta de la barra no la toca).
    const yCierre = 28
    barra(yCierre, (cierre ?? 0) / 100, sobre ? KUWU.menta : KUWU.amarillo, cierre == null ? 'Cierre —' : `Cierre ${Math.round(cierre)} %`)
    const xMarca = x + w * (nivel.umbral / 100)
    g.fillStyle = KUWU.crema
    g.fillRect(xMarca - 1.5, yCierre - 4, 3, h + 8)
    g.font = FUENTE_MARCA
    const textoMarca = `marca ${nivel.umbral} %`
    const anchoMarca = g.measureText(textoMarca).width
    const cx = Math.min(W - 6 - anchoMarca / 2, Math.max(6 + anchoMarca / 2, xMarca))
    texto(textoMarca, cx, 14, 'center', FUENTE_MARCA)
    // Barra de tiempo sostenido.
    barra(72, prog, KUWU.menta, `Sostén ${num(sost / 1000, 1)} / ${num(nivel.sostenerMs / 1000, 0)} s`)
    texGuia.needsUpdate = true
  }

  /** Alto del lienzo 3D en píxeles CSS (la base lo dibuja a pantalla completa). */
  function altoCss(): number {
    if (typeof document === 'undefined') return 390
    if (!lienzoJuego || !lienzoJuego.isConnected) lienzoJuego = document.querySelector<HTMLCanvasElement>('canvas.juego-lienzo')
    return lienzoJuego?.clientHeight || window.innerHeight || 390
  }

  /**
   * Tarjeta de las barras pegada a la derecha, bajo "Menú" y sobre el visor de la cámara. El tamaño se calcula en
   * píxeles CSS: a DIST_GUIA de la cámara la pantalla mide 2·mitadAlto unidades de alto, o sea 2·mitadAlto/altoCss
   * unidades por píxel. Así la tarjeta mide ANCHO_GUIA px en pantalla sea cual sea el campo de la cámara.
   */
  function ubicarGuia(c: ContextoJuego) {
    const alto = altoCss()
    const firma = [c.camara.fov, c.camara.aspect, alto].join(',')
    if (firma === firmaUbicacion) return
    firmaUbicacion = firma
    const mitadAlto = DIST_GUIA * Math.tan((c.camara.fov * Math.PI) / 360)
    const mitadAncho = mitadAlto * c.camara.aspect
    const porPx = (2 * mitadAlto) / alto
    const anchoPx = Math.min(ANCHO_GUIA, FRACCION_MAX_GUIA * alto * c.camara.aspect)
    const k = anchoPx / ANCHO_GUIA
    const ancho = anchoPx * porPx
    const altoU = ALTO_GUIA * k * porPx
    luces.getObjectByName('guia')?.scale.set(ancho, altoU, 1)
    luces.position.set(mitadAncho - MARGEN_GUIA * porPx - ancho / 2, mitadAlto * 0.6 - altoU / 2, -DIST_GUIA)
  }

  function lanzarGota(origen: THREE.Vector3) {
    const g = gotas.find((x) => !x.activa)
    if (!g) return
    g.activa = true
    g.t = 0
    g.x0 = origen.x + (Math.random() - 0.5) * 0.12
    g.y0 = origen.y - 0.15
    g.z0 = origen.z
    g.mesh.visible = true
  }

  function aplicar(ev: EventoNaranja) {
    const c = ctx
    if (!c) return
    const repeticion = agregado.validas + agregado.incompletas + 1
    const mano = ladoActivo
    switch (ev.tipo) {
      case 'naranja':
        pop = 0
        break
      case 'cierre_inicio':
        c.registrar('cierre_inicio', { mano, objeto: 'naranja', datos: { cierrePct: ev.cierrePct, repeticion } })
        break
      case 'umbral_alcanzado':
        c.registrar('umbral_alcanzado', { mano, objeto: 'naranja', datos: { cierrePct: ev.cierrePct, umbralPct: ev.umbralPct, repeticion } })
        break
      case 'sostenido_completo':
        c.registrar('sostenido_completo', { mano, objeto: 'naranja', datos: { sostenidoMs: ev.sostenidoMs, cierreMaxPct: ev.cierreMaxPct, repeticion } })
        break
      case 'apertura_completa':
        agregado.evento(ev, c.ahora())
        contador++
        ultimoSostenidoMs = ev.sostenidoMs
        c.registrar('apertura_completa', { mano, objeto: 'naranja', datos: { aperturaPct: ev.aperturaPct, cierreMaxPct: ev.cierreMaxPct, sostenidoMs: ev.sostenidoMs, repeticion } })
        ondaT = 0
        if (contador <= MITADES.length) popMitad[contador - 1] = 0
        break
      case 'repeticion_incompleta':
        agregado.evento(ev, c.ahora())
        ultimoSostenidoMs = ev.sostenidoMs
        ultimoFallo = ev.paso
        falloT = AVISO_FALLO_S
        c.registrar('repeticion_incompleta', {
          mano,
          objeto: 'naranja',
          datos: { paso: ev.paso, pasoNombre: NOMBRE_PASO[ev.paso], cierreMaxPct: ev.cierreMaxPct, sostenidoMs: ev.sostenidoMs, umbralPct: nivel.umbral, requeridoMs: nivel.sostenerMs, repeticion },
        })
        break
    }
  }

  function dibujar(dt: number) {
    const c = ctx
    if (!c || !naranja || !cuerpoNaranja || !halo || !jugo || !superficie || !anilloVaso || !onda) return
    reloj += dt
    falloT = Math.max(0, falloT - dt)
    const vis = c.manos.visible(ladoActivo)
    ubicarGuia(c)

    // Jugo: sube suave hasta el nivel de las repeticiones válidas.
    const objetivo = Math.min(1, contador / capacidad())
    nivelVaso += (objetivo - nivelVaso) * Math.min(1, dt * 3)
    const alto = Math.max(0.001, nivelVaso * JUGO_ALTO)
    jugo.scale.y = alto
    jugo.visible = nivelVaso > 0.004
    superficie.visible = jugo.visible
    superficie.position.set(VASO.x, c.mesa.altura + JUGO_BASE + alto + 0.002, VASO.z)

    // Anillo de la mesa: pide la mano abierta en el paso 1; en los demás pasos queda tenue y verde.
    const m = anilloVaso.material as THREE.MeshBasicMaterial
    if (estado.paso === 1) {
      m.color.setHex(COLOR_ACENTO)
      m.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(reloj * 5))
      anilloVaso.scale.setScalar(1 + 0.04 * Math.sin(reloj * 5))
    } else {
      m.color.setHex(COLOR_OK)
      m.opacity = 0.35
      anilloVaso.scale.setScalar(1)
    }
    if (ondaT >= 0) {
      ondaT += dt
      const u = ondaT / 0.9
      onda.visible = u < 1
      onda.scale.setScalar(0.75 + u * 0.9)
      ;(onda.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - u)
      if (u >= 1) ondaT = -1
    }

    // Mitades exprimidas.
    mitades.forEach((h, i) => {
      const hay = i < contador
      if (hay && popMitad[i] < 1) popMitad[i] = Math.min(1, popMitad[i] + dt * 3)
      const u = popMitad[i]
      h.visible = hay
      h.scale.setScalar(hay ? Math.max(0.001, Math.min(1, u * 2.5) * (1 + 0.2 * Math.sin(Math.PI * u))) : 0.001)
    })

    // Naranja en la mano.
    const quiere = vis && estado.paso >= 2 ? 1 : 0
    aparece += (quiere - aparece) * Math.min(1, dt * 9)
    pop = Math.min(1, pop + dt * 4)
    naranja.visible = aparece > 0.02
    if (naranja.visible) {
      c.manos.palma(ladoActivo, tmp)
      const k = Math.min(1, Math.max(0, (cierre ?? 0) / 100))
      const rebote = 1 + 0.18 * Math.sin(Math.min(1, pop) * Math.PI) * (1 - pop)
      const s = aparece * rebote * (1 - 0.3 * k)
      naranja.position.set(tmp.x, tmp.y + 0.16, tmp.z + 0.1)
      const temblor = estado.paso === 3 ? 0.015 * Math.sin(reloj * 40) : 0
      naranja.scale.set(s * (1 + 0.12 * k + temblor), s * (1 - 0.3 * k), s * (1 + 0.12 * k - temblor))
      const mat = cuerpoNaranja.material as THREE.MeshStandardMaterial
      mat.color.setHex(COLOR_NARANJA).lerp(COLOR_EXPRIMIDA, k * 0.8)
      const sobre = cierre != null && cierre >= nivel.umbral && estado.paso >= 3
      const hm = halo.material as THREE.SpriteMaterial
      hm.color.setHex(sobre ? COLOR_OK : COLOR_ACENTO)
      hm.opacity = sobre ? 0.55 : estado.paso === 2 ? 0.25 + 0.15 * Math.sin(reloj * 6) : 0.2
    }

    // Gotas: caen de la naranja al vaso mientras se sostiene el puño.
    if (estado.paso === 3 && naranja.visible && cierre != null && cierre >= nivel.umbral - 10) {
      acumGota += dt
      while (acumGota >= GOTA_CADA_S) {
        acumGota -= GOTA_CADA_S
        lanzarGota(naranja.position)
      }
    } else acumGota = 0
    const ySup = c.mesa.altura + JUGO_BASE + alto + 0.03
    for (const g of gotas) {
      if (!g.activa) continue
      g.t += dt
      const u = g.t / GOTA_DURACION_S
      if (u >= 1) {
        g.activa = false
        g.mesh.visible = false
        continue
      }
      const e = 1 - (1 - u) * (1 - u)
      g.mesh.position.set(g.x0 + (VASO.x - g.x0) * e, g.y0 + (ySup - g.y0) * u * u, g.z0 + (VASO.z - g.z0) * e)
    }
    dibujarGuia()
  }

  function depuracion(): EstadoNaranjaDepuracion {
    return {
      contador,
      meta: ctx?.meta ?? 0,
      lado: ladoActivo,
      paso: estado.paso,
      cierre: cierre == null ? null : Math.round(cierre * 10) / 10,
      umbral: nivel.umbral,
      sostenerMs: nivel.sostenerMs,
      sostenidoMs: Math.round(estado.sostenidoMs),
      cierreMax: Math.round(estado.cierreMax * 10) / 10,
      naranja: estado.paso >= 2,
      validas: agregado.validas,
      incompletas: agregado.incompletas,
      ultimoFallo,
      nivelVaso: Math.round(nivelVaso * 100) / 100,
      gotas: gotas.filter((g) => g.activa).length,
    }
  }

  return {
    id: 'exprime-naranja',
    nombre: 'Exprime la naranja',
    gestos: ['Cierre de puño'],
    miniatura: 'naranja',
    niveles,
    meta: { etiqueta: 'Cierres', unidad: 'cierres', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa', 'repeticion_incompleta'],
    metricasVivo: [
      { id: 'cierre', nombre: 'Cierre de puño', unidad: '%', formula: '1 − apertura calibrada: 0 % = mano abierta de la calibración, 100 % = puño de la calibración (distancia de las yemas a la palma normalizada por el largo de la mano)', aprox: true, mejor: 'mayor' },
      { id: 'sostenido', nombre: 'Tiempo sostenido', unidad: 's', formula: 'segundos seguidos con el cierre sobre umbral − 10 (el umbral del nivel menos 10 puntos de margen); deja de sumar al completar el tiempo pedido', mejor: 'mayor' },
      { id: 'apertura', nombre: 'Apertura completa', unidad: '%', formula: '100 % − cierre de puño actual', aprox: true, mejor: 'mayor' },
    ],
    metricasResumen: [
      { id: 'repeticiones', nombre: 'Repeticiones válidas', unidad: '', formula: "eventos 'apertura_completa': las que cumplieron los cuatro pasos", mejor: 'mayor' },
      { id: 'incompletas', nombre: 'Repeticiones incompletas', unidad: '', formula: "eventos 'repeticion_incompleta' (se soltó antes de cumplir un paso)", mejor: 'menor' },
      { id: 'cierreMax', nombre: 'Cierre máximo por repetición', unidad: '%', formula: 'promedio del cierre de puño máximo de cada repetición (válidas e incompletas)', aprox: true, mejor: 'mayor', corto: 'Cierre máximo' },
      { id: 'tiempoSostenido', nombre: 'Tiempo sostenido sobre el umbral', unidad: 's', formula: 'promedio del tiempo con el puño sobre el umbral en las repeticiones que llegaron al paso 3', mejor: 'mayor', corto: 'Tiempo sostenido' },
      { id: 'aperturaCompleta', nombre: 'Apertura completa entre repeticiones', unidad: '%', formula: 'promedio de la mejor apertura (100 % − cierre) al abrir la mano en cada repetición válida', aprox: true, mejor: 'mayor', corto: 'Apertura completa' },
      { id: 'ritmo', nombre: 'Ritmo (repeticiones/min)', unidad: '', decimales: 1, formula: '60 000 × (válidas − 1) / ms entre la primera y la última repetición válida', tarjeta: true },
      { id: 'cierreMaxPico', nombre: 'Mayor cierre de la sesión', unidad: '%', formula: 'máximo del cierre de puño de todas las repeticiones', aprox: true, mejor: 'mayor', tarjeta: false },
      { id: 'completadas', nombre: 'Repeticiones completas', unidad: '%', formula: 'válidas / (válidas + incompletas)', mejor: 'mayor', tarjeta: false },
      { id: 'falloPaso2', nombre: 'Incompletas al cerrar', unidad: '', formula: "'repeticion_incompleta' con paso 2 (no llegó al umbral)", mejor: 'menor', tarjeta: false },
      { id: 'falloPaso3', nombre: 'Incompletas al sostener', unidad: '', formula: "'repeticion_incompleta' con paso 3 (soltó antes de tiempo)", mejor: 'menor', tarjeta: false },
      { id: 'falloPaso4', nombre: 'Incompletas al abrir', unidad: '', formula: "'repeticion_incompleta' con paso 4 (no abrió por completo)", mejor: 'menor', tarjeta: false },
    ],
    usaFisica: false,
    pista: 'Cierra el puño, sostén y abre por completo',
    textoReiniciar: 'Reiniciar',

    montar(c) {
      ctx = c
      nivel = nivelNaranja(c.parametros.nivel)
      const mano = c.parametros.mano
      lados = mano === 'ambas' ? [...LADOS] : [mano === 'izquierda' ? 'izquierda' : 'derecha']
      ladoActivo = lados[0]
      // La mano flota sobre el vaso: zona acotada al centro de la mesa y a media altura.
      c.configurarManos({ x: [-0.8, 0.8], y: [0.6, 1.3], z: [-0.95, -0.15] })
      construirEscena(c)
      estado = estadoNaranjaInicial()
      dibujar(0)
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(_manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      if (lados.length > 1 && estado.paso === 1) ladoActivo = c.manoPrincipal() ?? ladoActivo
      cierre = cierreDe(ladoActivo)
      if (!metaAlcanzada()) {
        const r = pasoNaranja(estado, cierre, Math.min(dt, 0.25) * 1000, nivel)
        estado = r.estado
        for (const ev of r.eventos) {
          aplicar(ev)
          if (metaAlcanzada()) break
        }
      }
      dibujar(dt)
    },

    hud() {
      const c = ctx
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of lados) {
        const k = cierreDe(l)
        if (k == null) continue
        manos[l] = k >= nivel.umbral ? { texto: 'Puño cerrado', tono: 'acento' } : k >= INICIO_CIERRE_PCT ? { texto: 'Cerrando', tono: 'acento' } : { texto: 'Abierta', tono: 'ok' }
      }
      let pista: string | undefined
      if (metaAlcanzada()) pista = '¡Muy bien! Terminaste los cierres'
      else if (falloT > 0 && ultimoFallo != null) pista = pistaFallo(ultimoFallo as 2 | 3 | 4, nivel)
      else if (cierre != null) {
        if (estado.paso === 3) pista = `Sostén el puño: faltan ${num(Math.max(0, nivel.sostenerMs - estado.sostenidoMs) / 1000, 1)} s`
        else if (estado.paso === 2) pista = `Cierra el puño hasta el ${nivel.umbral} %`
        else pista = PISTAS_PASO[estado.paso]
      }
      const sostenido = estado.paso >= 3 ? estado.sostenidoMs : ultimoSostenidoMs
      return {
        contador,
        manos,
        pista,
        vivo: {
          cierre: cierre == null ? null : Math.round(cierre),
          sostenido: c ? Math.round(sostenido / 100) / 10 : null,
          apertura: cierre == null ? null : Math.round(100 - cierre),
        },
      }
    },

    reiniciar() {
      // A mitad de una repetición: queda anotada como incompleta con su paso, para no dejar eventos sin cerrar.
      if (ctx && !metaAlcanzada()) for (const ev of cortarRepeticion(estado)) aplicar(ev)
      estado = estadoNaranjaInicial()
      falloT = 0
    },

    muestra() {
      return { cierrePct: cierre == null ? null : Math.round(cierre), paso: estado.paso }
    },

    resumen() {
      return agregado.resumen()
    },

    desmontar() {
      const c = ctx
      if (c) {
        c.escena.remove(grupo)
        c.camara.remove(luces)
        c.escena.remove(c.camara)
      }
      for (const g of geometrias) g.dispose()
      for (const m of materiales) m.dispose()
      for (const t of texturas) t.dispose()
      if (typeof window !== 'undefined' && window.__manoviva?.juego) {
        const { juego: _quitar, ...resto } = window.__manoviva
        void _quitar
        window.__manoviva = resto
      }
      ctx = null
    },
  }
}
