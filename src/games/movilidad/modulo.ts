// Movilidad guiada (F11): calentamiento sin física sobre la base común. Lo pide el diseño de Inicio
// (imagenes/02_inicio_paciente.png: "Movilidad guiada · Calentamiento") y el plan demo; no tiene prompt propio.
//
// Escena (mismo lenguaje visual que la base: mesa de madera, manos articuladas, acentos amarillo/verde):
// - Mano guía: una mano fantasma verde agua, translúcida y con halo, que abre y cierra a ritmo fijo según el nivel
//   (logica.ts: guiaEn). Bajo ella, un anillo en la mesa que "respira" con la guía.
// - Tu mano: la mano virtual de la base, a la derecha (o a la izquierda si se trabaja la izquierda). Bajo ella, un
//   anillo amarillo cuyo radio es tu apertura y, encima, el anillo guía (blanco) con el radio que pide la guía:
//   cuando calzan, tu anillo se pone verde. Cada ciclo completo lanza una onda y enciende una cuenta del arco.
// - Arco de cuentas al fondo, entre ambas manos: una por ciclo de la meta (hasta 12; con más, cada una vale varios).
//
// Ciclos: apertura calibrada (rangoAbrirCerrar de la calibración) con histéresis por nivel (logica.ts: pasoCiclo).
// Eventos, iguales al seed demo para que agregados y adherencia funcionen igual que en Caja:
//   cerrar → agarre_inicio { objeto: 'ciclo', datos.apertura } · reabrir → soltar { objeto: 'ciclo', datos.enCaja:
//   true, duracionMs, rango }. Con 'ambas' cuenta cada mano por separado (abrir y cerrar las dos = 2 ciclos). Al llegar a la meta deja de contar
//   (la base muestra "¡Meta cumplida!" y termina 2,5 s después), así el contador queda exacto.
import * as THREE from 'three'
import type { LadoMano } from '../../domain/types'
import { CONEXIONES } from '../../metrics/geometria'
import { manoSintetica } from '../../tracking/sintetica'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import { ZONA_BASE, puntosEnEscena, type ZonaManos } from '../shell/manos3d'
import {
  NIVELES_MOVILIDAD,
  PISTAS,
  cicloInicial,
  guiaEn,
  nivelMovilidad,
  pasoCiclo,
  ritmoCpm,
  ritmoMedio,
  type EstadoCiclo,
  type FaseGuia,
  type NivelMovilidad,
} from './logica'

const LADOS: LadoMano[] = ['izquierda', 'derecha']

/** Diferencia de apertura (0..1) con la guía para considerar que el paciente la sigue. */
export const TOLERANCIA_GUIA = 0.22

const COLOR_GUIA = 0x4fd1a1
const COLOR_ACENTO = 0xffc83d
const COLOR_PENDIENTE = 0x34485a
/** Cuentas del arco del fondo (una por ciclo de la meta; con más ciclos, cada cuenta vale varios). */
const MAX_CUENTAS = 12

const niveles = Object.fromEntries(
  ([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => {
    const v = NIVELES_MOVILIDAD[n]
    return [n, { ...v }]
  }),
) as unknown as Record<NumeroNivel, ParametrosNivel>

/** Radio en la mesa (unidades de escena) para una apertura 0..1. */
const radioDe = (a: number) => 0.3 + 0.42 * Math.min(1, Math.max(0, a))
const r2 = (x: number) => Math.round(x * 100) / 100

/** Disposición: dónde va la mano guía y por dónde se mueve la mano del paciente. */
function disposicion(mano: string): { guia: { x: number; y: number; z: number }; zona: Partial<ZonaManos>; ladoGuia: LadoMano } {
  if (mano === 'izquierda') return { guia: { x: 0.95, y: 0.68, z: -0.15 }, zona: { x: [-2.0, 0.4], y: [0.1, 1.35] }, ladoGuia: 'izquierda' }
  if (mano === 'ambas') return { guia: { x: 0, y: 0.72, z: -0.75 }, zona: { x: [-2.2, 2.2], y: [0.1, 1.35] }, ladoGuia: 'derecha' }
  return { guia: { x: -0.95, y: 0.68, z: -0.15 }, zona: { x: [-0.4, 2.0], y: [0.1, 1.35] }, ladoGuia: 'derecha' }
}

/** Textura de halo radial (blanco → transparente) para brillos aditivos. */
function texturaHalo(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Rótulo tipo píldora (fondo oscuro, texto claro) como los del HUD. */
function texturaRotulo(texto: string, punto: string): { textura: THREE.Texture; aspecto: number } {
  const c = document.createElement('canvas')
  const alto = 64
  const g = c.getContext('2d')!
  const fuente = '700 30px Poppins, "DM Sans", system-ui, sans-serif'
  g.font = fuente
  const ancho = Math.ceil(g.measureText(texto).width) + 30 + 44
  c.width = ancho
  c.height = alto
  g.font = fuente
  g.fillStyle = 'rgba(15,20,26,0.88)'
  g.beginPath()
  g.roundRect(1, 1, ancho - 2, alto - 2, alto / 2)
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.16)'
  g.lineWidth = 2
  g.stroke()
  g.fillStyle = punto
  g.beginPath()
  g.arc(30, alto / 2, 8, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#eef3f7'
  g.textBaseline = 'middle'
  g.fillText(texto, 48, alto / 2 + 1)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return { textura: t, aspecto: ancho / alto }
}

const ARRIBA = new THREE.Vector3(0, 1, 0)
const PALMA_ABANICO = [0, 1, 5, 0, 5, 9, 0, 9, 13, 0, 13, 17]

/** Mano guía fantasma: huesos y articulaciones instanciados + palma, translúcidos y con halo. */
class ManoGuia {
  readonly grupo = new THREE.Group()
  private huesos: THREE.InstancedMesh
  private articulaciones: THREE.InstancedMesh
  private palma: THREE.Mesh
  private posPalma = new Float32Array(12 * 3)
  private puntos = Array.from({ length: 21 }, () => new THREE.Vector3())
  readonly materiales: THREE.Material[] = []
  readonly geometrias: THREE.BufferGeometry[] = []
  private readonly zona: ZonaManos
  private readonly lado: LadoMano

  constructor(ancla: { x: number; y: number; z: number }, lado: LadoMano) {
    this.lado = lado
    this.zona = { ...ZONA_BASE, x: [ancla.x, ancla.x], y: [ancla.y, ancla.y], z: [ancla.z, ancla.z] }
    const r = 0.0085 * ZONA_BASE.escala
    const mat = new THREE.MeshStandardMaterial({ color: 0x9af5d6, emissive: COLOR_GUIA, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.72, depthWrite: false })
    const matPunta = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: COLOR_GUIA, emissiveIntensity: 0.9, roughness: 0.25, transparent: true, opacity: 0.9, depthWrite: false })
    const matPalma = new THREE.MeshStandardMaterial({ color: 0x9af5d6, emissive: COLOR_GUIA, emissiveIntensity: 0.35, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    const gHueso = new THREE.CylinderGeometry(r * 1.05, r * 1.05, 1, 10, 1, true)
    const gArt = new THREE.SphereGeometry(r * 1.55, 14, 10)
    const gPalma = new THREE.BufferGeometry()
    gPalma.setAttribute('position', new THREE.BufferAttribute(this.posPalma, 3))
    this.materiales.push(mat, matPunta, matPalma)
    this.geometrias.push(gHueso, gArt, gPalma)
    this.huesos = new THREE.InstancedMesh(gHueso, mat, CONEXIONES.length)
    this.articulaciones = new THREE.InstancedMesh(gArt, matPunta, 21)
    this.palma = new THREE.Mesh(gPalma, matPalma)
    for (const m of [this.huesos, this.articulaciones, this.palma]) {
      m.frustumCulled = false
      m.renderOrder = 2
      this.grupo.add(m)
    }
  }

  private ultima = -1
  private readonly m4 = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly dir = new THREE.Vector3()
  private readonly medio = new THREE.Vector3()
  private readonly esc = new THREE.Vector3()

  /** Arma la mano guía con apertura `a` (0..1). No hace nada si no cambió (tramos en que la guía se mantiene). */
  actualizar(a: number) {
    if (Math.abs(a - this.ultima) < 1e-4) return
    this.ultima = a
    const mano = manoSintetica({ apertura: a, lado: this.lado, x: 0.5, y: 0.5 })
    const p = puntosEnEscena(mano, 47, this.zona)
    p.forEach((q, i) => this.puntos[i].set(q[0], q[1], q[2]))
    const { m4, q, dir, medio, esc } = this
    CONEXIONES.forEach(([i, k], n) => {
      dir.subVectors(this.puntos[k], this.puntos[i])
      const largo = dir.length()
      q.setFromUnitVectors(ARRIBA, dir.normalize())
      medio.addVectors(this.puntos[i], this.puntos[k]).multiplyScalar(0.5)
      this.huesos.setMatrixAt(n, m4.compose(medio, q, esc.set(1, largo, 1)))
    })
    this.huesos.instanceMatrix.needsUpdate = true
    q.identity()
    esc.set(1, 1, 1)
    this.puntos.forEach((v, i) => this.articulaciones.setMatrixAt(i, m4.compose(v, q, esc)))
    this.articulaciones.instanceMatrix.needsUpdate = true
    PALMA_ABANICO.forEach((i, k) => this.posPalma.set([p[i][0], p[i][1], p[i][2]], k * 3))
    const g = this.palma.geometry
    g.attributes.position.needsUpdate = true
    g.computeVertexNormals()
    g.computeBoundingSphere()
  }

  centro(destino = new THREE.Vector3()): THREE.Vector3 {
    destino.set(0, 0, 0)
    for (const i of [0, 5, 9, 13, 17]) destino.add(this.puntos[i])
    return destino.multiplyScalar(1 / 5)
  }
}

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoMovilidadDepuracion {
  contador: number
  meta: number
  lados: LadoMano[]
  cerrada: Partial<Record<LadoMano, boolean>>
  apertura: number | null
  objetivo: number
  fase: FaseGuia
  umbrales: { cierre: number; apertura: number }
  ciclosT: number[]
}

export const crearMovilidad: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelMovilidad = nivelMovilidad(1)
  let lados: LadoMano[] = ['derecha']
  const ciclo: Record<LadoMano, EstadoCiclo> = { izquierda: cicloInicial(), derecha: cicloInicial() }
  /** ms de juego de cada ciclo completo, en total y por mano (el ritmo se mide por mano). */
  const ciclosT: number[] = []
  const ciclosLado: Record<LadoMano, number[]> = { izquierda: [], derecha: [] }
  const duraciones: number[] = []
  const rangos: number[] = []
  let contador = 0
  let aperturaMax = 0
  let cuadrosMano = 0
  let cuadrosSiguiendo = 0
  let objetivo = 1
  let fase: FaseGuia = 'abierta'
  let aperturaVista: number | null = null
  let reloj = 0

  // Escena
  const grupo = new THREE.Group()
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []
  let guia: ManoGuia | null = null
  let halo: THREE.Sprite | null = null
  let anilloGuia: THREE.Mesh | null = null
  let discoGuia: THREE.Mesh | null = null
  /** Lo que se dibuja bajo cada mano que cuenta: tu anillo, el anillo guía de referencia, brillo, onda y rótulo. */
  interface VisualMano {
    anillo: THREE.Mesh
    ref: THREE.Mesh
    disco: THREE.Mesh
    onda: THREE.Mesh
    ondaT: number
    rotulo: THREE.Sprite | null
    centro: THREE.Vector3
    listo: boolean
    color: THREE.Color
  }
  const visuales: Partial<Record<LadoMano, VisualMano>> = {}
  let cuentas: THREE.InstancedMesh | null = null
  let posCuentas: THREE.Vector3[] = []
  const popCuenta: number[] = []
  const tmp = new THREE.Vector3()
  const COLOR_OK = new THREE.Color(COLOR_GUIA)
  const COLOR_AMARILLO = new THREE.Color(COLOR_ACENTO)

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && contador >= ctx.meta

  /** Apertura 0..1 de una mano (calibrada si hay calibración). null si no se ve. */
  const aperturaDe = (lado: LadoMano): number | null => {
    const m = ctx?.medidas(lado)
    if (!m) return null
    return m.aperturaCalibrada ?? Math.min(1, m.apertura)
  }

  /** Mano que dibuja el anillo amarillo: la principal si cuenta; si no, la primera que se vea de las que cuentan. */
  const manoVista = (): LadoMano | null => {
    const p = ctx?.manoPrincipal() ?? null
    if (p && lados.includes(p)) return p
    return lados.find((l) => ctx?.medidas(l)) ?? null
  }

  function anillo(radioInterno: number, color: number, opacidad: number, segmentos = 96): THREE.Mesh {
    const geo = new THREE.RingGeometry(radioInterno, 1, segmentos)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacidad, depthWrite: false })
    geometrias.push(geo)
    materiales.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 1
    return m
  }

  function disco(textura: THREE.Texture, color: number, opacidad: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(2, 2)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ map: textura, color, transparent: true, opacity: opacidad, depthWrite: false, blending: THREE.AdditiveBlending })
    geometrias.push(geo)
    materiales.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 0
    return m
  }

  function rotulo(texto: string, punto: string, alto = 0.2): THREE.Sprite {
    const { textura, aspecto } = texturaRotulo(texto, punto)
    texturas.push(textura)
    const mat = new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, depthTest: false })
    materiales.push(mat)
    const s = new THREE.Sprite(mat)
    s.scale.set(alto * aspecto, alto, 1)
    s.renderOrder = 5
    return s
  }

  function crearCuentas(c: ContextoJuego) {
    const n = Math.min(MAX_CUENTAS, c.meta)
    if (n <= 0) return
    const radio = n > 8 ? 0.07 : 0.08
    const geo = new THREE.SphereGeometry(radio, 18, 12)
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 })
    geometrias.push(geo)
    materiales.push(mat)
    cuentas = new THREE.InstancedMesh(geo, mat, n)
    cuentas.castShadow = true
    // Arco suave al fondo de la mesa, centrado.
    const R = 4.2
    const cz = 2.55
    const abertura = Math.min(0.22, 0.04 * (n - 1))
    posCuentas = Array.from({ length: n }, (_, i) => {
      const th = n === 1 ? 0 : -abertura + (2 * abertura * i) / (n - 1)
      return new THREE.Vector3(R * Math.sin(th), c.mesa.altura + radio, cz - R * Math.cos(th))
    })
    for (let i = 0; i < n; i++) {
      popCuenta.push(0)
      cuentas.setColorAt(i, new THREE.Color(COLOR_PENDIENTE))
    }
    grupo.add(cuentas)
  }

  const m4 = new THREE.Matrix4()
  const qId = new THREE.Quaternion()
  const escala3 = new THREE.Vector3()
  const col = new THREE.Color()

  function actualizarCuentas(dt: number) {
    if (!cuentas) return
    const n = posCuentas.length
    // Con una meta mayor a MAX_CUENTAS, cada cuenta vale varios ciclos.
    const porCuenta = ctx && ctx.meta > n ? ctx.meta / n : 1
    const llenas = Math.min(n, Math.floor(contador / porCuenta + 1e-9))
    for (let i = 0; i < n; i++) {
      popCuenta[i] = Math.max(0, popCuenta[i] - dt * 2.2)
      const siguiente = i === llenas && !metaAlcanzada()
      const pulso = siguiente ? 1 + 0.18 * (0.5 + 0.5 * Math.sin(reloj * 5)) : 1
      const escala = pulso + popCuenta[i] * 0.7
      m4.compose(posCuentas[i], qId, escala3.set(escala, escala, escala))
      cuentas.setMatrixAt(i, m4)
      if (i < llenas) col.setHex(COLOR_ACENTO)
      else if (siguiente) col.setHex(0x8fa3b5)
      else col.setHex(COLOR_PENDIENTE)
      cuentas.setColorAt(i, col)
    }
    cuentas.instanceMatrix.needsUpdate = true
    if (cuentas.instanceColor) cuentas.instanceColor.needsUpdate = true
  }

  function lanzarOnda(lado: LadoMano) {
    const v = visuales[lado]
    if (v) v.ondaT = 0
    if (cuentas) {
      const n = posCuentas.length
      const porCuenta = ctx && ctx.meta > n ? ctx.meta / n : 1
      const k = Math.min(n, Math.floor(contador / porCuenta + 1e-9)) - 1
      if (k >= 0 && k < n) popCuenta[k] = 1
    }
  }

  function depuracion(): EstadoMovilidadDepuracion {
    return {
      contador,
      meta: ctx?.meta ?? 0,
      lados,
      cerrada: Object.fromEntries(lados.map((l) => [l, ciclo[l].cerrada])),
      apertura: aperturaVista,
      objetivo: r2(objetivo),
      fase,
      umbrales: { cierre: nivel.cierre, apertura: nivel.apertura },
      ciclosT: [...ciclosT],
    }
  }

  /** Dibujo de cada cuadro (también en pausa no se llama: la guía se congela con el tiempo de juego). */
  function dibujar(dt: number) {
    const c = ctx
    if (!c || !guia) return
    reloj += dt
    guia.actualizar(objetivo)
    const centroGuia = guia.centro(tmp)
    if (halo) {
      halo.position.copy(centroGuia)
      const s = 1.1 + 0.35 * objetivo
      halo.scale.set(s, s, 1)
    }
    const rg = radioDe(objetivo)
    anilloGuia?.scale.setScalar(rg)
    if (discoGuia) {
      discoGuia.scale.setScalar(rg * 1.25)
      ;(discoGuia.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.18 * objetivo
    }

    // Bajo cada mano que cuenta: tu anillo (amarillo, verde si sigues la guía) y el anillo que pide la guía.
    const y = c.mesa.altura + 0.012
    for (const lado of lados) {
      const v = visuales[lado]
      if (!v) continue
      const a = aperturaDe(lado)
      const visible = a != null
      if (visible) {
        c.manos.palma(lado, tmp)
        if (!v.listo) v.centro.copy(tmp)
        else v.centro.lerp(tmp, Math.min(1, dt * 10))
        v.listo = true
      }
      v.anillo.visible = v.ref.visible = v.disco.visible = visible
      if (v.rotulo) v.rotulo.visible = visible
      if (visible) {
        v.anillo.position.set(v.centro.x, y + 0.003, v.centro.z)
        v.ref.position.set(v.centro.x, y + 0.006, v.centro.z)
        v.disco.position.set(v.centro.x, y, v.centro.z)
        const ra = radioDe(a)
        v.anillo.scale.setScalar(ra)
        v.ref.scale.setScalar(rg)
        v.disco.scale.setScalar(ra * 1.2)
        v.color.lerp(Math.abs(a - objetivo) < TOLERANCIA_GUIA ? COLOR_OK : COLOR_AMARILLO, Math.min(1, dt * 8))
        ;(v.anillo.material as THREE.MeshBasicMaterial).color.copy(v.color)
        ;(v.disco.material as THREE.MeshBasicMaterial).color.copy(v.color)
        v.rotulo?.position.set(v.centro.x, y + 0.05, v.centro.z + Math.max(ra, rg) + 0.1)
      }
      // Onda de ciclo completo.
      if (v.ondaT >= 0) {
        v.ondaT += dt
        const u = v.ondaT / 0.8
        v.onda.visible = u < 1
        v.onda.position.set(v.centro.x, c.mesa.altura + 0.02, v.centro.z)
        v.onda.scale.setScalar(radioDe(1) + u * 0.9)
        ;(v.onda.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - u)
        if (u >= 1) v.ondaT = -1
      } else v.onda.visible = false
    }
    actualizarCuentas(dt)
  }

  return {
    id: 'movilidad-guiada',
    nombre: 'Movilidad guiada',
    gestos: ['Apertura', 'Extensión'],
    miniatura: 'movilidad',
    niveles,
    meta: { etiqueta: 'Ciclos', unidad: 'ciclos', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['agarre_inicio', 'soltar'],
    metricasVivo: [
      { id: 'apertura', nombre: 'Apertura de la mano', unidad: '%', formula: 'aperturaMano (puntas–muñeca / palma) normalizada con el rango abrir/cerrar de la calibración', mejor: 'mayor' },
      { id: 'flexIndice', nombre: 'Flexión del índice', unidad: '°', formula: 'flexión MCP (0-5 / 5-6) + PIP (5-6 / 6-7) del índice, worldLandmarks', aprox: true },
      { id: 'ritmo', nombre: 'Ritmo (ciclos/min)', unidad: '', formula: '60 000 / intervalo medio de los últimos 5 ciclos de la mano principal (crece si el último ciclo tarda más)' },
    ],
    metricasResumen: [
      { id: 'ciclos', nombre: 'Ciclos completos', unidad: '', formula: "eventos 'soltar' (objeto 'ciclo'): cerrar bajo el umbral del nivel y volver a abrir", mejor: 'mayor' },
      { id: 'ritmo', nombre: 'Ritmo medio (ciclos/min)', unidad: '', decimales: 1, formula: '60 000 × (ciclos − 1) / ms entre el primer y el último ciclo, por mano (promedio de las manos)' },
      { id: 'tiempoMedioCiclo', nombre: 'Tiempo medio cerrar → abrir', unidad: 's', formula: 'promedio de agarre_inicio (cierre) → soltar (apertura)', corto: 'Tiempo por ciclo' },
      { id: 'rango', nombre: 'Rango medio usado', unidad: '%', formula: 'promedio por ciclo de (apertura máx. − mín.), apertura calibrada', mejor: 'mayor' },
      { id: 'aperturaMax', nombre: 'Apertura máxima', unidad: '%', formula: 'máximo de la apertura calibrada', mejor: 'mayor', corto: 'Apertura máx.' },
      { id: 'flexionIndiceMax', nombre: 'Flexión máxima del índice', unidad: '°', formula: 'máximo de MCP + PIP del índice', aprox: true, mejor: 'mayor', corto: 'Flexión del índice' },
      { id: 'seguimiento', nombre: 'Siguió la guía', unidad: '%', formula: `cuadros con |apertura − guía| < ${TOLERANCIA_GUIA} / cuadros con mano`, mejor: 'mayor' },
    ],
    usaFisica: false,
    pista: 'Abre y cierra la mano junto con la guía',

    montar(c) {
      ctx = c
      nivel = nivelMovilidad(c.parametros.nivel)
      const mano = c.parametros.mano
      lados = mano === 'ambas' ? [...LADOS] : [mano === 'izquierda' ? 'izquierda' : 'derecha']
      const disp = disposicion(mano)
      c.configurarManos(disp.zona)

      const tHalo = texturaHalo()
      texturas.push(tHalo)

      // Mano guía + halo + anillo y disco en la mesa.
      guia = new ManoGuia(disp.guia, disp.ladoGuia)
      geometrias.push(...guia.geometrias)
      materiales.push(...guia.materiales)
      grupo.add(guia.grupo)
      const matHalo = new THREE.SpriteMaterial({ map: tHalo, color: COLOR_GUIA, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending })
      materiales.push(matHalo)
      halo = new THREE.Sprite(matHalo)
      halo.renderOrder = 1
      grupo.add(halo)
      const yMesa = c.mesa.altura
      anilloGuia = anillo(0.9, COLOR_GUIA, 0.9)
      anilloGuia.position.set(disp.guia.x, yMesa + 0.015, disp.guia.z)
      discoGuia = disco(tHalo, COLOR_GUIA, 0.3)
      discoGuia.position.set(disp.guia.x, yMesa + 0.01, disp.guia.z)
      const rotuloGuia = rotulo('Guía', '#4fd1a1')
      rotuloGuia.position.set(disp.guia.x, yMesa + 0.05, disp.guia.z + radioDe(1) + 0.1)
      grupo.add(anilloGuia, discoGuia, rotuloGuia)

      // Por mano que cuenta: tu anillo (amarillo → verde al seguir la guía) + anillo de referencia (blanco) + onda.
      for (const lado of lados) {
        const v: VisualMano = {
          anillo: anillo(0.86, COLOR_ACENTO, 0.95),
          ref: anillo(0.965, 0xffffff, 0.55, 128),
          disco: disco(tHalo, COLOR_ACENTO, 0.28),
          onda: anillo(0.93, COLOR_ACENTO, 0.8),
          ondaT: -1,
          rotulo: lados.length === 1 ? rotulo('Tu mano', '#ffc83d') : null,
          centro: new THREE.Vector3(),
          listo: false,
          color: new THREE.Color(COLOR_ACENTO),
        }
        v.onda.visible = false
        grupo.add(v.disco, v.anillo, v.ref, v.onda)
        if (v.rotulo) grupo.add(v.rotulo)
        visuales[lado] = v
      }

      crearCuentas(c)
      c.escena.add(grupo)
      objetivo = guiaEn(0, nivel).objetivo
      dibujar(0)
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(_manos, dt) {
      const c = ctx
      if (!c) return
      const t = c.ahora()
      const g = guiaEn(t, nivel)
      objetivo = g.objetivo
      fase = g.fase
      const vista = manoVista()
      aperturaVista = vista ? aperturaDe(vista) : null
      if (aperturaVista != null) {
        cuadrosMano++
        if (Math.abs(aperturaVista - objetivo) < TOLERANCIA_GUIA) cuadrosSiguiendo++
      }
      if (!metaAlcanzada()) {
        for (const lado of lados) {
          const a = aperturaDe(lado)
          // Sin mano el ciclo en curso se conserva (si vuelve abierta, el ciclo se completa).
          if (a == null) continue
          aperturaMax = Math.max(aperturaMax, a)
          const r = pasoCiclo(ciclo[lado], a, t, nivel)
          ciclo[lado] = r.estado
          if (r.cambio?.tipo === 'cierre') {
            c.registrar('agarre_inicio', { mano: lado, objeto: 'ciclo', datos: { apertura: r2(a) } })
          } else if (r.cambio?.tipo === 'ciclo') {
            contador++
            ciclosT.push(t)
            ciclosLado[lado].push(t)
            duraciones.push(r.cambio.duracionMs)
            rangos.push(r.cambio.rango)
            c.registrar('soltar', { mano: lado, objeto: 'ciclo', datos: { enCaja: true, duracionMs: Math.round(r.cambio.duracionMs), rango: Math.round(r.cambio.rango * 100) } })
            lanzarOnda(lado)
            if (metaAlcanzada()) break
          }
        }
      }
      dibujar(dt)
    },

    hud() {
      const c = ctx
      const principal = manoVista()
      const m = principal ? c!.medidas(principal) : null
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const lado of lados) if (c?.medidas(lado)) manos[lado] = ciclo[lado].cerrada ? { texto: 'Cerrada', tono: 'acento' } : { texto: 'Abierta', tono: 'ok' }
      const a = principal ? aperturaDe(principal) : null
      return {
        contador,
        manos,
        pista: metaAlcanzada() ? '¡Muy bien! Terminaste el calentamiento' : !m ? undefined : PISTAS[fase],
        vivo: {
          apertura: a == null ? null : Math.round(a * 100),
          flexIndice: m ? m.flexion.indice : null,
          ritmo: c && principal ? ritmoCpm(ciclosLado[principal], c.ahora()) : null,
        },
      }
    },

    muestra() {
      return { aperturaMano: aperturaVista == null ? null : Math.round(aperturaVista * 100), guia: Math.round(objetivo * 100) }
    },

    resumen(base) {
      const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
      // Ritmo medio por mano (con 'ambas', el promedio de las manos que hicieron al menos 2 ciclos).
      const rms = lados.map((l) => ritmoMedio(ciclosLado[l])).filter((x): x is number => x != null)
      const rm = media(rms)
      const dur = media(duraciones)
      const rango = media(rangos)
      return {
        ciclos: contador,
        ritmo: rm == null ? null : Math.round(rm * 10) / 10,
        tiempoMedioCiclo: dur == null ? null : Math.round(dur / 100) / 10,
        rango: rango == null ? null : Math.round(rango * 100),
        aperturaMax: cuadrosMano ? Math.round(aperturaMax * 100) : null,
        flexionIndiceMax: Math.round(base.flexionMax.indice),
        seguimiento: cuadrosMano ? Math.round((cuadrosSiguiendo / cuadrosMano) * 100) : null,
      }
    },

    desmontar() {
      ctx?.escena.remove(grupo)
      for (const g of geometrias) g.dispose()
      for (const m of materiales) m.dispose()
      for (const t of texturas) t.dispose()
      if (typeof window !== 'undefined' && window.__manoviva?.juego) {
        const { juego: _quitar, ...resto } = window.__manoviva
        void _quitar
        window.__manoviva = resto
      }
      ctx = null
      guia = null
    },
  }
}
