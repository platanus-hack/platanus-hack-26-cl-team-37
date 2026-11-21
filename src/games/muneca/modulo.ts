// Muñeca 3D (F37): flexión, extensión y desviación radial/cubital de la muñeca, medidas 3D respecto de una posición
// NEUTRA que toma el propio juego, sobre la base común. La matemática vive en logica.ts (con pruebas).
//
// Flujo: 1) "neutro": mano recta, dedos arriba y quieta 2 s → se toma sola (botón "Repetir neutro" para volver a tomarla);
// 2) fases guiadas con un objetivo por nivel: flexión → extensión → desviación radial → cubital, que se repiten
// (llegar, sostener ~1 s y volver al neutro). El contador cuenta los movimientos logrados (objetivo sostenido).
//
// Escena: la mano virtual de la base, una "mano fantasma" tenue en la orientación neutra (placa + tres ejes) anclada a la
// muñeca, y un sector que muestra el objetivo (ámbar) y el ángulo actual (celeste/verde) en el plano del movimiento.
// Una tarjeta fija a la cámara (como en Exprime la naranja) dice el objetivo, el avance, el sostén y el aviso de antebrazo.
//
// Datos (contrato con la vista de comparación F38): ver `resumen()` y `muestra()`; poses 'neutro', 'flexion-max',
// 'extension-max', 'radial-max' y 'cubital-max' por ctx.guardarPose; R0 (nueve números r0_ij) en metricas.juego.
//
// Todo son estimaciones de cámara ("aprox."): el antebrazo se supone quieto y los giros hacia o desde la cámara son los
// menos precisos.
import * as THREE from 'three'
import { KUWU, kuwuNum } from '../../ui/paleta'
import type { LadoMano } from '../../domain/types'
import { num } from '../../lib/formato'
import type { ManoSeguida } from '../../tracking/tipos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  AVISO_ANTEBRAZO,
  AgregadoMuneca,
  CapturaNeutro,
  DIRECCION_FASE,
  NIVELES_MUNECA,
  NOMBRE_FASE,
  ORDEN_FASES,
  SuavizadorAngulos,
  angulos,
  avisoAntebrazo,
  columna,
  estadoMunecaInicial,
  faseActual,
  marcoMano,
  nivelMuneca,
  objetivoDe,
  pasoMuneca,
  valorFase,
  type AngulosMuneca,
  type EstadoMuneca,
  type EventoMuneca,
  type FaseMuneca,
  type Mat3,
  type NivelMuneca,
  type V3,
} from './logica'

const LADOS: LadoMano[] = ['derecha', 'izquierda']
const COLOR_ACENTO = kuwuNum('amarillo')
const COLOR_OK = kuwuNum('menta')
const COLOR_AVANCE = kuwuNum('azul')
const COLOR_AVISO = kuwuNum('rojo')

const ETIQUETA_POSE: Record<FaseMuneca, string> = { flexion: 'flexion-max', extension: 'extension-max', radial: 'radial-max', cubital: 'cubital-max' }
/** Ángulo (°) mínimo y ganancia mínima para volver a guardar la pose de un máximo. */
const POSE_MIN_DEG = 8
const POSE_GANANCIA_DEG = 1.5

const PISTA_FASE: Record<FaseMuneca, (g: number) => string> = {
  flexion: (g) => `Flexión: lleva los dedos hacia la palma hasta unos ${g}°`,
  extension: (g) => `Extensión: lleva los dedos hacia atrás hasta unos ${g}°`,
  radial: (g) => `Desviación radial: inclina la mano hacia el pulgar, unos ${g}°`,
  cubital: (g) => `Desviación cubital: inclina la mano hacia el meñique, unos ${g}°`,
}

/** Radio del sector (unidades de escena; la mano mide ~1,1) y su tesela. */
const RADIO = 0.95
const SEGMENTOS = 28
/** Ángulo máximo que dibuja el sector actual. */
const ARCO_MAX_DEG = 120
/** Cuánto se muestra el aviso de "no alcanzado" (s). */
const AVISO_FALLO_S = 3

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_MUNECA[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoMunecaDepuracion {
  contador: number
  meta: number
  lado: LadoMano
  /** Ya se tomó el neutro. */
  neutro: boolean
  /** 0..1 de la ventana quieta del neutro. */
  progresoNeutro: number
  fase: FaseMuneca
  etapa: 'ir' | 'volver'
  objetivo: number
  sostenerMs: number
  sostenidoMs: number
  flexExt: number | null
  desviacion: number | null
  giro: number | null
  aviso: boolean
  aciertos: number
  noAlcanzados: number
  muestras: number
  poses: Record<string, number>
}

const CORTO_FASE: Record<FaseMuneca, string> = { flexion: 'Flexión', extension: 'Extensión', radial: 'Desv. radial', cubital: 'Desv. cubital' }

const r1 = (x: number) => Math.round(x * 10) / 10

// ── Tarjeta fija a la cámara (misma idea que en Exprime la naranja: se diseña en px CSS) ──────────
const ANCHO_GUIA = 224
const ALTO_GUIA = 138
const FRACCION_MAX_GUIA = 0.5
const MARGEN_GUIA = 14
const DIST_GUIA = 5
const FUENTE_TITULO = '700 14px Poppins, "DM Sans", system-ui, sans-serif'
const FUENTE_BARRA = '700 15px Poppins, "DM Sans", system-ui, sans-serif'
const FUENTE_AVISO = '700 12.5px Poppins, "DM Sans", system-ui, sans-serif'

export const crearMuneca: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelMuneca = nivelMuneca(1)
  let lados: LadoMano[] = ['derecha']
  let ladoActivo: LadoMano = 'derecha'

  // Medición
  let neutro: Mat3 | null = null
  const captura = new CapturaNeutro()
  const suavizador = new SuavizadorAngulos()
  const agregado = new AgregadoMuneca()
  let ang: AngulosMuneca | null = null
  let aviso = false
  let estado: EstadoMuneca = estadoMunecaInicial()
  let progresoNeutro = 0
  let contador = 0
  let reloj = 0
  let camaraInicial: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null
  let tUltimoCuadro = 0
  let ultimaRef: unknown = null
  let falloT = 0
  let ultimoFallo: { fase: FaseMuneca; max: number } | null = null
  const mejorPose: Record<string, number> = {}

  // Escena
  const grupo = new THREE.Group()
  const luces = new THREE.Group()
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []
  const ex = new THREE.Vector3()
  const ey = new THREE.Vector3()
  const ez = new THREE.Vector3()
  const fantasma = new THREE.Group()
  const plano = new THREE.Group()
  const rayo = new THREE.Group()
  let sectorObjetivo: THREE.Mesh | null = null
  let sectorActual: THREE.Mesh | null = null
  let marcaObjetivo: THREE.Mesh | null = null
  let faseDibujada = ''
  let lienzo: HTMLCanvasElement | null = null
  let texGuia: THREE.CanvasTexture | null = null
  let firmaGuia = ''
  let firmaUbicacion = ''
  let resolucionGuia = 1
  let lienzoJuego: HTMLCanvasElement | null | undefined

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && contador >= ctx.meta
  const faseAhora = (): FaseMuneca => faseActual(estado)
  const objetivoAhora = () => objetivoDe(faseAhora(), nivel)

  function material(color: number, opacity = 1): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false })
    materiales.push(m)
    return m
  }
  function geo<T extends THREE.BufferGeometry>(g: T): T {
    geometrias.push(g)
    return g
  }

  /** Sector (abanico) en el plano XY local, desde +Y hacia +X: de 0 a `grados`. */
  function crearSector(color: number, opacity: number, orden: number): THREE.Mesh {
    const g = geo(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGMENTOS * 9), 3))
    const m = new THREE.Mesh(g, material(color, opacity))
    m.frustumCulled = false
    m.renderOrder = orden
    llenarSector(m, 0)
    return m
  }
  function llenarSector(m: THREE.Mesh, grados: number) {
    const p = m.geometry.getAttribute('position') as THREE.BufferAttribute
    const total = (Math.max(0, grados) * Math.PI) / 180
    for (let i = 0; i < SEGMENTOS; i++) {
      const a0 = (total * i) / SEGMENTOS
      const a1 = (total * (i + 1)) / SEGMENTOS
      p.setXYZ(i * 3, 0, 0, 0)
      p.setXYZ(i * 3 + 1, RADIO * Math.sin(a0), RADIO * Math.cos(a0), 0)
      p.setXYZ(i * 3 + 2, RADIO * Math.sin(a1), RADIO * Math.cos(a1), 0)
    }
    p.needsUpdate = true
  }

  function eje(color: number, hacia: 'x' | 'y' | 'z', largo: number): THREE.Mesh {
    const g = geo(new THREE.CylinderGeometry(0.014, 0.014, largo, 8).translate(0, largo / 2, 0))
    if (hacia === 'x') g.rotateZ(-Math.PI / 2)
    else if (hacia === 'z') g.rotateX(Math.PI / 2)
    const m = new THREE.Mesh(g, material(color, 0.85))
    m.renderOrder = 4
    return m
  }

  function construirEscena(c: ContextoJuego) {
    // Mano fantasma: placa tenue + los tres ejes de la mano neutra (radial, largo, lado de la palma).
    const placa = new THREE.Mesh(geo(new THREE.BoxGeometry(0.56, 1.0, 0.03).translate(0, 0.52, 0)), material(kuwuNum('azul-suave'), 0.14))
    placa.renderOrder = 1
    fantasma.add(placa, eje(COLOR_AVANCE, 'x', 0.7), eje(kuwuNum('azul-suave'), 'y', 1.05), eje(COLOR_ACENTO, 'z', 0.7))
    fantasma.matrixAutoUpdate = false
    fantasma.visible = false

    // Sector del objetivo (ámbar) y del ángulo actual, en el plano del movimiento de la fase.
    sectorObjetivo = crearSector(COLOR_ACENTO, 0.22, 2)
    sectorActual = crearSector(COLOR_AVANCE, 0.5, 3)
    const barra = new THREE.Mesh(geo(new THREE.BoxGeometry(0.02, RADIO, 0.02).translate(0, RADIO / 2, 0)), material(COLOR_ACENTO, 0.95))
    barra.renderOrder = 5
    marcaObjetivo = new THREE.Mesh(geo(new THREE.SphereGeometry(0.05, 12, 10).translate(0, RADIO, 0)), material(COLOR_ACENTO, 1))
    marcaObjetivo.renderOrder = 5
    rayo.add(barra, marcaObjetivo)
    plano.matrixAutoUpdate = false
    plano.add(sectorObjetivo, sectorActual, rayo)
    fantasma.add(plano)
    grupo.add(fantasma)
    c.escena.add(grupo)

    // Tarjeta fija a la cámara.
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

  /** Vector del marco de la cámara-mundo de MediaPipe al de la escena (misma transformación que las manos virtuales). */
  function aEscena(v: V3, out: THREE.Vector3, inclinacionDeg: number): THREE.Vector3 {
    const a = (inclinacionDeg * Math.PI) / 180
    const x = -v[0]
    const y = -v[1]
    const z = v[2]
    return out.set(x, y * Math.cos(a) + z * Math.sin(a), -y * Math.sin(a) + z * Math.cos(a))
  }

  /** Coloca la mano fantasma (orientación neutra) en la muñeca de la mano virtual y orienta el plano del sector. */
  function ubicarFantasma(c: ContextoJuego) {
    const visible = !!neutro && c.manos.visible(ladoActivo)
    fantasma.visible = visible
    if (!visible || !neutro) return
    const incl = c.manos.zona.inclinacionDeg
    aEscena(columna(neutro, 0), ex, incl)
    aEscena(columna(neutro, 1), ey, incl)
    aEscena(columna(neutro, 2), ez, incl)
    fantasma.matrix.makeBasis(ex, ey, ez).setPosition(c.manos.punto(ladoActivo, 0))
    fantasma.matrixWorldNeedsUpdate = true
    const fase = faseAhora()
    if (fase !== faseDibujada) {
      faseDibujada = fase
      const u = DIRECCION_FASE[fase]
      // Plano del movimiento: X local → dirección de la fase, Y local → eje largo, Z local → su normal (en ejes neutros).
      const uv = new THREE.Vector3(u[0], u[1], u[2])
      const yv = new THREE.Vector3(0, 1, 0)
      plano.matrix.makeBasis(uv, yv, new THREE.Vector3().crossVectors(uv, yv))
      plano.matrixWorldNeedsUpdate = true
      const t = objetivoAhora()
      llenarSector(sectorObjetivo!, t)
      rayo.rotation.z = -(t * Math.PI) / 180
    }
    const v = ang ? valorFase(fase, ang) : 0
    const sobre = ang != null && estado.etapa === 'ir' && v >= objetivoAhora()
    llenarSector(sectorActual!, Math.min(ARCO_MAX_DEG, Math.max(0, v)))
    ;(sectorActual!.material as THREE.MeshBasicMaterial).color.setHex(aviso ? COLOR_AVISO : sobre ? COLOR_OK : COLOR_AVANCE)
  }

  // ── Tarjeta ─────────────────────────────────────────────────────────────────────────────────────
  function altoCss(): number {
    if (typeof document === 'undefined') return 390
    if (!lienzoJuego || !lienzoJuego.isConnected) lienzoJuego = document.querySelector<HTMLCanvasElement>('canvas.juego-lienzo')
    return lienzoJuego?.clientHeight || window.innerHeight || 390
  }
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

  function dibujarGuia() {
    if (!lienzo || !texGuia) return
    const fase = faseAhora()
    const objetivo = objetivoAhora()
    const v = ang ? valorFase(fase, ang) : null
    const ir = !!neutro && estado.etapa === 'ir'
    const sost = Math.min(nivel.sostenerMs, estado.sostenidoMs)
    const firma = [neutro ? 1 : 0, Math.round(progresoNeutro * 20), estado.etapa, fase, objetivo, v == null ? 'x' : Math.round(v), Math.round(sost / 100), aviso ? 1 : 0, falloT > 0 ? 1 : 0].join(',')
    if (firma === firmaGuia) return
    firmaGuia = firma
    const g = lienzo.getContext('2d')!
    const W = ANCHO_GUIA
    const H = ALTO_GUIA
    g.setTransform(resolucionGuia, 0, 0, resolucionGuia, 0, 0)
    g.clearRect(0, 0, W, H)
    g.fillStyle = 'rgba(15,20,26,0.92)'
    g.beginPath()
    g.roundRect(1, 1, W - 2, H - 2, 16)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.22)'
    g.lineWidth = 1.5
    g.stroke()
    g.textBaseline = 'middle'
    const texto = (t: string, x: number, y: number, align: CanvasTextAlign, fuente: string, color = KUWU.blanco) => {
      g.font = fuente
      g.textAlign = align
      g.lineJoin = 'round'
      g.lineWidth = 2.5
      g.strokeStyle = 'rgba(10,16,22,0.9)'
      g.strokeText(t, x, y)
      g.fillStyle = color
      g.fillText(t, x, y)
    }
    const x = 10
    const w = W - 2 * x
    const h = 28
    const barra = (y: number, frac: number, color: string, etiqueta: string) => {
      g.fillStyle = 'rgba(255,255,255,0.14)'
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
    if (!neutro) {
      texto('Posición neutra', W / 2, 18, 'center', FUENTE_TITULO)
      barra(34, progresoNeutro, KUWU.azul, `Quieta ${num(progresoNeutro * 2, 1)} / 2 s`)
      texto('Mano recta, dedos arriba', W / 2, 82, 'center', FUENTE_AVISO, KUWU['noche-texto-2'])
      texto('Valores aprox.', W / 2, 108, 'center', FUENTE_AVISO, KUWU.control)
    } else if (!ir) {
      texto(`${CORTO_FASE[fase]} ${falloT > 0 ? 'no alcanzada' : 'lograda'}`, W / 2, 18, 'center', FUENTE_TITULO)
      barra(34, 1, falloT > 0 ? KUWU.rojo : KUWU.menta, falloT > 0 ? 'Sigue con la siguiente' : '¡Bien!')
      texto('Vuelve a la posición neutra', W / 2, 82, 'center', FUENTE_AVISO, KUWU['noche-texto-2'])
      texto('Valores aprox.', W / 2, 108, 'center', FUENTE_AVISO, KUWU.control)
    } else {
      const sobre = v != null && v >= objetivo
      texto(`${CORTO_FASE[fase]} · objetivo ${objetivo}°`, W / 2, 18, 'center', FUENTE_TITULO)
      barra(34, (v ?? 0) / objetivo, aviso ? KUWU.rojo : sobre ? KUWU.menta : KUWU.amarillo, v == null ? 'Ahora —' : `Ahora ${Math.max(0, Math.round(v))}° aprox.`)
      barra(68, sost / nivel.sostenerMs, KUWU.menta, `Sostén ${num(sost / 1000, 1)} / ${num(nivel.sostenerMs / 1000, nivel.sostenerMs % 1000 ? 2 : 0)} s`)
      if (aviso) {
        texto('Puede ser el antebrazo:', W / 2, 112, 'center', FUENTE_AVISO, KUWU.rojo)
        texto('mantenlo quieto', W / 2, 128, 'center', FUENTE_AVISO, KUWU.rojo)
      } else texto('Valores aprox.', W / 2, 118, 'center', FUENTE_AVISO, KUWU.control)
    }
    texGuia.needsUpdate = true
  }

  // ── Lógica ──────────────────────────────────────────────────────────────────────────────────────
  function tomarNeutro(R: Mat3) {
    const c = ctx
    neutro = R
    suavizador.reiniciar()
    agregado.reiniciarSeries()
    ang = null
    aviso = false
    estado = estadoMunecaInicial()
    for (const k of Object.keys(mejorPose)) delete mejorPose[k]
    faseDibujada = ''
    c?.guardarPose('neutro', ladoActivo, null)
  }

  function aplicar(ev: EventoMuneca) {
    const c = ctx
    if (!c) return
    const mano = ladoActivo
    switch (ev.tipo) {
      case 'objetivo_mostrado':
        c.registrar('objetivo_mostrado', { mano, objeto: ev.fase, datos: { fase: ev.fase, objetivoGrados: ev.objetivoGrados } })
        break
      case 'acierto':
        contador++
        agregado.movimientos++
        c.registrar('acierto', { mano, objeto: ev.fase, datos: { fase: ev.fase, grados: ev.grados } })
        break
      case 'no_alcanzado':
        agregado.noAlcanzados++
        ultimoFallo = { fase: ev.fase, max: ev.maxGrados }
        falloT = AVISO_FALLO_S
        c.registrar('no_alcanzado', { mano, objeto: ev.fase, datos: { fase: ev.fase, maxGrados: ev.maxGrados } })
        break
    }
  }

  function guardarPoses(a: AngulosMuneca) {
    const c = ctx
    if (!c || aviso) return
    for (const f of ORDEN_FASES) {
      const v = valorFase(f, a)
      if (v < POSE_MIN_DEG || v < (mejorPose[f] ?? 0) + POSE_GANANCIA_DEG) continue
      if (c.guardarPose(ETIQUETA_POSE[f], ladoActivo, r1(v))) mejorPose[f] = v
    }
  }

  function procesar(a: AngulosMuneca, dtMs: number) {
    ang = a
    const fase = estado.etapa === 'ir' ? faseAhora() : null
    aviso = avisoAntebrazo(fase, a)
    agregado.muestra(a, aviso, reloj)
    if (metaAlcanzada()) return
    guardarPoses(a)
    const r = pasoMuneca(estado, a, aviso, dtMs, nivel)
    estado = r.estado
    for (const ev of r.eventos) {
      aplicar(ev)
      if (metaAlcanzada()) break
    }
  }

  function depuracion(): EstadoMunecaDepuracion {
    return {
      contador,
      meta: ctx?.meta ?? 0,
      lado: ladoActivo,
      neutro: !!neutro,
      progresoNeutro: Math.round(progresoNeutro * 100) / 100,
      fase: faseAhora(),
      etapa: estado.etapa,
      objetivo: objetivoAhora(),
      sostenerMs: nivel.sostenerMs,
      sostenidoMs: Math.round(estado.sostenidoMs),
      flexExt: ang ? r1(ang.flexExt) : null,
      desviacion: ang ? r1(ang.desviacion) : null,
      giro: ang ? r1(ang.giro) : null,
      aviso,
      aciertos: agregado.movimientos,
      noAlcanzados: agregado.noAlcanzados,
      muestras: agregado.muestras,
      poses: Object.fromEntries(Object.entries(mejorPose).map(([k, v]) => [k, r1(v)])),
    }
  }

  return {
    id: 'muneca-3d',
    nombre: 'Muñeca 3D',
    gestos: ['Giro del antebrazo'],
    miniatura: 'muneca',
    niveles,
    meta: { etiqueta: 'Movimientos', unidad: 'movimientos', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['objetivo_mostrado', 'acierto', 'no_alcanzado'],
    metricasVivo: [
      { id: 'flexExt', nombre: 'Flexión + / extensión − (aprox.)', unidad: '°', formula: 'rotación de la mano respecto del neutro hacia la palma (+) o hacia el dorso (−), en los ejes de la mano neutra', aprox: true, mejor: 'mayor' },
      { id: 'desviacion', nombre: 'Radial + / cubital − (aprox.)', unidad: '°', formula: 'desviación de los dedos hacia el pulgar (+) o hacia el meñique (−) respecto del neutro', aprox: true, mejor: 'mayor' },
      { id: 'giro', nombre: 'Giro (aprox.)', unidad: '°', formula: 'rotación sobre el eje largo de la mano, quitada la flexión y la desviación; si es grande puede ser el antebrazo', aprox: true },
    ],
    metricasResumen: [
      { id: 'flexionMax', nombre: 'Flexión máxima', unidad: '°', formula: 'percentil 98 de la flexión de la sesión (muestras en movimiento, sin aviso de antebrazo), respecto del neutro', aprox: true, mejor: 'mayor', corto: 'Flexión' },
      { id: 'extensionMax', nombre: 'Extensión máxima', unidad: '°', formula: 'percentil 98 de la extensión de la sesión (muestras en movimiento, sin aviso de antebrazo), respecto del neutro', aprox: true, mejor: 'mayor', corto: 'Extensión' },
      { id: 'radialMax', nombre: 'Desviación radial máxima', unidad: '°', formula: 'percentil 98 de la desviación hacia el pulgar, respecto del neutro', aprox: true, mejor: 'mayor', corto: 'Desv. radial' },
      { id: 'cubitalMax', nombre: 'Desviación cubital máxima', unidad: '°', formula: 'percentil 98 de la desviación hacia el meñique, respecto del neutro', aprox: true, mejor: 'mayor', corto: 'Desv. cubital' },
      { id: 'giroPosMax', nombre: 'Giro máximo (+)', unidad: '°', formula: 'percentil 98 del giro sobre el eje largo en el sentido + (el pulgar gira hacia el dorso), respecto del neutro', aprox: true, mejor: 'mayor', tarjeta: false },
      { id: 'giroNegMax', nombre: 'Giro máximo (−)', unidad: '°', formula: 'percentil 98 del giro sobre el eje largo en el sentido − (el pulgar gira hacia la palma), respecto del neutro', aprox: true, mejor: 'mayor', tarjeta: false },
      { id: 'conoMax', nombre: 'Desvío máximo de los dedos', unidad: '°', formula: 'percentil 98 del ángulo entre la dirección de los dedos y la dirección neutra (combina flexión y desviación)', aprox: true, mejor: 'mayor', corto: 'Desvío total' },
      { id: 'movimientos', nombre: 'Movimientos logrados', unidad: '', formula: "eventos 'acierto': objetivo alcanzado y sostenido el tiempo del nivel", mejor: 'mayor' },
    ],
    usaFisica: false,
    pista: 'Mano recta, dedos arriba, quieta',
    textoReiniciar: 'Repetir neutro',

    montar(c) {
      ctx = c
      nivel = nivelMuneca(c.parametros.nivel)
      const mano = c.parametros.mano
      lados = mano === 'ambas' ? [...LADOS] : [mano === 'izquierda' ? 'izquierda' : 'derecha']
      ladoActivo = lados[0]
      // La mano flota al centro de la mesa, algo más inclinada hacia quien mira que en los juegos de agarre.
      c.configurarManos({ x: [-0.45, 0.45], y: [0.8, 1.2], z: [-0.6, -0.2], inclinacionDeg: 30 })
      // Vista de 3/4 desde la derecha: de frente el plano de la flexión (dedos–palma) queda de canto y el sector no se vería.
      camaraInicial = { pos: c.camara.position.clone(), quat: c.camara.quaternion.clone() }
      c.camara.position.set(1.9, 2.1, 2.5)
      c.camara.lookAt(0, 0.95, -0.4)
      construirEscena(c)
      dibujarGuia()
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      reloj += dt * 1000
      falloT = Math.max(0, falloT - dt)
      if (lados.length > 1 && !neutro) ladoActivo = c.manoPrincipal() ?? ladoActivo
      const mano = manos.find((m) => m.lado === ladoActivo) ?? null
      if (!mano) {
        if (ang || progresoNeutro) {
          ang = null
          aviso = false
          suavizador.reiniciar()
          captura.paso(null, reloj)
          progresoNeutro = 0
        }
      } else if (mano.worldLandmarks !== ultimaRef) {
        ultimaRef = mano.worldLandmarks
        const dtMs = Math.min(250, reloj - tUltimoCuadro)
        tUltimoCuadro = reloj
        const R = marcoMano(mano.worldLandmarks, mano.lado)
        if (!neutro) {
          const r = captura.paso(R, reloj)
          progresoNeutro = r.progreso
          if (r.neutro) tomarNeutro(r.neutro)
        } else if (R) procesar(suavizador.filtrar(angulos(neutro, R)), dtMs)
      }
      ubicarFantasma(c)
      ubicarGuia(c)
      dibujarGuia()
    },

    hud() {
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of lados) {
        if (!ctx?.manos.visible(l)) continue
        let m: EstadoManoHud
        if (!neutro) m = { texto: 'Tomando neutro', tono: 'acento' }
        else if (aviso) m = { texto: 'Antebrazo quieto', tono: 'acento' }
        else if (estado.etapa === 'volver') m = { texto: 'Vuelve al neutro', tono: 'neutro' }
        else if (ang && valorFase(faseAhora(), ang) >= objetivoAhora()) m = { texto: 'En el objetivo', tono: 'ok' }
        else m = { texto: NOMBRE_FASE[faseAhora()], tono: 'neutro' }
        manos[l] = m
      }
      let pista: string | undefined
      if (metaAlcanzada()) pista = '¡Muy bien! Terminaste los movimientos'
      else if (!neutro) pista = ang === null && progresoNeutro === 0 ? 'Mano recta, dedos arriba, quieta' : `Quieta… ${num(progresoNeutro * 2, 1)} / 2 s`
      else if (aviso) pista = AVISO_ANTEBRAZO
      else if (falloT > 0 && ultimoFallo) pista = `${NOMBRE_FASE[ultimoFallo.fase]}: llegaste a unos ${Math.round(ultimoFallo.max)}° (aprox.). Sigue con la siguiente`
      else if (estado.etapa === 'volver') pista = 'Vuelve a la posición neutra'
      else pista = PISTA_FASE[faseAhora()](objetivoAhora())
      const v = (x: number | undefined) => (x == null ? null : Math.round(x))
      return { contador, manos, pista, vivo: { flexExt: v(ang?.flexExt), desviacion: v(ang?.desviacion), giro: v(ang?.giro) } }
    },

    reiniciar() {
      // "Repetir neutro": se descarta el neutro y las series (eran respecto del anterior); el contador y los eventos quedan.
      neutro = null
      captura.reiniciar()
      suavizador.reiniciar()
      agregado.reiniciarSeries()
      ang = null
      aviso = false
      progresoNeutro = 0
      estado = estadoMunecaInicial(estado.indice)
      faseDibujada = ''
      firmaGuia = ''
    },

    muestra() {
      const a = ang
      const d = (x: number | undefined) => (x == null ? null : x)
      return { flexExt: d(a?.flexExt), desviacion: d(a?.desviacion), giro: d(a?.giro), dirX: d(a?.dir[0]), dirY: d(a?.dir[1]), dirZ: d(a?.dir[2]) }
    },

    resumen() {
      return agregado.resumen(neutro)
    },

    desmontar() {
      const c = ctx
      if (c) {
        if (camaraInicial) {
          c.camara.position.copy(camaraInicial.pos)
          c.camara.quaternion.copy(camaraInicial.quat)
        }
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
