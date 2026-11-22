// Banda elástica (F36): el paciente tensa una banda en lazo con las dos manos frente a la cámara, sin física, sobre la
// base común. Mide cuánto separa los nudillos de ambas manos (logica.ts) y lo muestra como estiramiento en cm y %, una
// barra de tensión y una carga APROXIMADA (kg nominales de la banda × estiramiento; es una estimación, no una medida).
//
// Escena: las dos manos virtuales de la base y, entre sus nudillos, la banda como dos hebras que cambian de azul
// (frío) a rojo (cálido) y se adelgazan al estirarse, con un marcador tenue del largo en reposo. Los extremos llevan el
// color de la banda del nivel. Una tarjeta fija a la cámara (como en Exprime la naranja) muestra la barra: primero el
// avance del reposo (2 s quieto) y después el estiramiento con la carga aprox.
//
// Eventos (solo tipos que ya existen): umbral_alcanzado en cada repetición (en su pico: cm, %, carga, número) y
// repeticion_incompleta si un tramo de tensión no llegó al 25 %. Poses: 'reposo' (ambas manos al marcarlo) y 'pico'
// (ambas manos, valor = estiramiento en cm, queda la de mayor valor).
import * as THREE from 'three'
import { KUWU, kuwuAlfa, kuwuNum } from '../../ui/paleta'
import type { LadoMano } from '../../domain/types'
import { num } from '../../lib/formato'
import type { ManoSeguida } from '../../tracking/tipos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  NIVELES_BANDA,
  PISTA_REPOSO,
  REPOSO_MS,
  REP_MIN_PCT,
  SesionBanda,
  grosorDeEstiramiento,
  medirCuadro,
  nivelBanda,
  pistaBanda,
  tonoDeEstiramiento,
  type EventoBanda,
  type NivelBanda,
} from './logica'

const LADOS: LadoMano[] = ['derecha', 'izquierda']
const NUDILLOS = [5, 9, 13, 17]
const COLOR_OK = KUWU.menta

/** ms mínimos entre dos poses 'pico' guardadas (cada una copia 21 puntos por mano). */
const POSE_CADA_MS = 100
/** Mejora mínima (cm) sobre la pose 'pico' guardada para guardar otra. */
const POSE_MEJORA_CM = 0.05
/** Cuánto se muestra el aviso de repetición incompleta (s). */
const AVISO_INCOMPLETA_S = 3

const RADIO_HEBRA = 0.045
const SEPARACION_HEBRAS = 0.075

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_BANDA[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoBandaDepuracion {
  contador: number
  meta: number
  fase: string
  manos: number
  kgBanda: number
  reposoCm: number | null
  estiramientoCm: number | null
  estiramientoPct: number | null
  cargaKg: number | null
  maxPct: number
  maxCm: number
  repeticiones: number
  incompletas: number
  fragmentos: number
  picosPct: number[]
  progresoReposo: number
  /** Poses 'pico' guardadas (veces) y valor de la última. */
  posesPico: number
  posesReposo: number
}

/** Tarjeta fija a la cámara, diseñada en píxeles CSS (misma técnica que Exprime la naranja). */
const ANCHO_GUIA = 210
const ALTO_GUIA = 116
const FRACCION_MAX_GUIA = 0.5
const MARGEN_GUIA = 14
const DIST_GUIA = 5
const FUENTE_BARRA = '700 15px Poppins, "DM Sans", system-ui, sans-serif'
const FUENTE_TEXTO = '600 14px Poppins, "DM Sans", system-ui, sans-serif'
const FUENTE_NOTA = '500 12px Poppins, "DM Sans", system-ui, sans-serif'

export const crearBanda: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelBanda = nivelBanda(1)
  let sesion = new SesionBanda(nivel.kgBanda)
  let contador = 0
  let ultimoT: number | null = null
  let incompletaT = 0
  let reloj = 0
  let ultimaPoseMs = -Infinity
  let picoGuardadoCm = 0
  let posesPico = 0
  let posesReposo = 0
  /** Largo de la banda en reposo, en unidades de escena (para el marcador). */
  let reposoEscena = 0

  // Escena
  const grupo = new THREE.Group()
  const luces = new THREE.Group()
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const mitad = new THREE.Vector3()
  const d0 = new THREE.Vector3()
  const d1 = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const ARRIBA = new THREE.Vector3(0, 1, 0)
  const hebras: THREE.Mesh[] = []
  const extremos: THREE.Mesh[] = []
  const marcador: THREE.Mesh[] = []
  let matBanda: THREE.MeshStandardMaterial | null = null
  let lienzo: HTMLCanvasElement | null = null
  let texGuia: THREE.CanvasTexture | null = null
  let firmaGuia = ''
  let firmaUbicacion = ''
  let resolucionGuia = 1
  let lienzoJuego: HTMLCanvasElement | null | undefined

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && contador >= ctx.meta

  function material(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra })
    materiales.push(m)
    return m
  }
  function geo<T extends THREE.BufferGeometry>(g: T): T {
    geometrias.push(g)
    return g
  }

  /** Centro de los nudillos de esa mano en la escena (false si no se ve). */
  function nudillosEscena(c: ContextoJuego, lado: LadoMano, destino: THREE.Vector3): boolean {
    if (!c.manos.visible(lado)) return false
    destino.set(0, 0, 0)
    for (const i of NUDILLOS) destino.add(c.manos.punto(lado, i))
    destino.multiplyScalar(1 / NUDILLOS.length)
    return true
  }

  function construirEscena(c: ContextoJuego) {
    matBanda = material(kuwuNum('azul'), { roughness: 0.4, emissive: kuwuNum('marino'), emissiveIntensity: 0.5 })
    const cilindro = geo(new THREE.CylinderGeometry(1, 1, 1, 10, 1))
    for (let i = 0; i < 2; i++) {
      const h = new THREE.Mesh(cilindro, matBanda)
      h.castShadow = true
      h.frustumCulled = false
      hebras.push(h)
      grupo.add(h)
    }
    // Extremos: la banda envuelve los nudillos; llevan el color de la banda del nivel.
    const esfera = geo(new THREE.SphereGeometry(1, 14, 10))
    const matExtremo = material(new THREE.Color(nivel.color).getHex(), { roughness: 0.45 })
    for (let i = 0; i < 2; i++) {
      const e = new THREE.Mesh(esfera, matExtremo)
      e.castShadow = true
      e.frustumCulled = false
      extremos.push(e)
      grupo.add(e)
    }
    // Marcador del largo en reposo: línea tenue con una marca en cada punta.
    const matMarca = new THREE.MeshBasicMaterial({ color: kuwuNum('blanco'), transparent: true, opacity: 0.4, depthWrite: false })
    materiales.push(matMarca)
    const linea = new THREE.Mesh(cilindro, matMarca)
    const marcaA = new THREE.Mesh(esfera, matMarca)
    const marcaB = new THREE.Mesh(esfera, matMarca)
    for (const m of [linea, marcaA, marcaB]) {
      m.frustumCulled = false
      m.renderOrder = 1
      m.visible = false
      marcador.push(m)
      grupo.add(m)
    }
    grupo.visible = false
    c.escena.add(grupo)

    // Tarjeta de la barra, fija a la cámara. Lienzo = diseño × min(1,5; devicePixelRatio), sin mipmaps para que no se emborrone.
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
    const fase = sesion.fase
    const pct = sesion.estiramientoPct
    const kg = sesion.cargaKg
    const prog = sesion.progresoReposo
    const firma = [fase, pct == null ? -1 : Math.round(pct), kg == null ? -1 : Math.round(kg * 10), Math.round(prog * 20), incompletaT > 0 ? 1 : 0].join(',')
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
    g.strokeStyle = kuwuAlfa('blanco', 0.22)
    g.lineWidth = 1.5
    g.stroke()
    g.textBaseline = 'middle'
    const texto = (t: string, x: number, y: number, align: CanvasTextAlign, fuente: string, color = KUWU.blanco) => {
      g.font = fuente
      g.textAlign = align
      g.lineJoin = 'round'
      g.lineWidth = 2.5
      g.strokeStyle = kuwuAlfa('noche', 0.9)
      g.strokeText(t, x, y)
      g.fillStyle = color
      g.fillText(t, x, y)
    }
    const x = 10
    const w = W - 2 * x
    const h = 30
    const yBarra = 16
    const barra = (frac: number, color: string, etiqueta: string) => {
      g.fillStyle = kuwuAlfa('blanco', 0.14)
      g.beginPath()
      g.roundRect(x, yBarra, w, h, h / 2)
      g.fill()
      if (frac > 0.01) {
        g.fillStyle = color
        g.beginPath()
        g.roundRect(x, yBarra, Math.max(h, w * Math.min(1, frac)), h, h / 2)
        g.fill()
      }
      texto(etiqueta, x + 12, yBarra + h / 2 + 1, 'left', FUENTE_BARRA)
    }
    if (fase === 'listo' && pct != null) {
      const tono = Math.round(tonoDeEstiramiento(pct) * 360)
      barra(pct / 100, `hsl(${tono} 75% 55%)`, `Estiramiento ${Math.round(pct)} %`)
      // marca (solo en los bordes, para no cruzar el texto): desde aquí cuenta una repetición
      const xm = x + w * (REP_MIN_PCT / 100)
      g.fillStyle = kuwuAlfa('blanco', 0.9)
      g.fillRect(xm - 1.5, yBarra - 7, 3, 7)
      g.fillRect(xm - 1.5, yBarra + h, 3, 7)
      texto(`Carga aprox. ${num(kg ?? 0, 1)} kg`, W / 2, 68, 'center', FUENTE_TEXTO)
      texto(incompletaT > 0 ? `Cuenta desde el ${REP_MIN_PCT} %` : 'es una estimación', W / 2, 92, 'center', FUENTE_NOTA, incompletaT > 0 ? KUWU.amarillo : kuwuAlfa('blanco', 0.7))
    } else if (fase === 'buscando-reposo') {
      barra(prog, COLOR_OK, `Reposo ${num(prog * (REPOSO_MS / 1000), 1)} / ${num(REPOSO_MS / 1000, 0)} s`)
      texto('Banda recién tensa,', W / 2, 66, 'center', FUENTE_TEXTO)
      texto('manos quietas', W / 2, 88, 'center', FUENTE_TEXTO)
    } else {
      barra(0, COLOR_OK, 'Reposo —')
      texto(fase === 'una-mano' ? 'Veo solo una mano' : 'Muestra las dos manos', W / 2, 70, 'center', FUENTE_TEXTO)
    }
    texGuia.needsUpdate = true
  }

  function altoCss(): number {
    if (typeof document === 'undefined') return 390
    if (!lienzoJuego || !lienzoJuego.isConnected) lienzoJuego = document.querySelector<HTMLCanvasElement>('canvas.juego-lienzo')
    return lienzoJuego?.clientHeight || window.innerHeight || 390
  }

  /** Tarjeta pegada a la derecha, bajo "Menú": mide ANCHO_GUIA px en pantalla sea cual sea el campo de la cámara. */
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

  /** Cilindro unitario (alto 1 sobre Y) puesto entre dos puntos con ese radio. */
  function entre(m: THREE.Mesh, desde: THREE.Vector3, hasta: THREE.Vector3, radio: number) {
    dir.subVectors(hasta, desde)
    const largo = dir.length()
    if (largo < 1e-4) {
      m.visible = false
      return
    }
    m.visible = true
    q.setFromUnitVectors(ARRIBA, dir.multiplyScalar(1 / largo))
    m.position.addVectors(desde, hasta).multiplyScalar(0.5)
    m.quaternion.copy(q)
    m.scale.set(radio, largo, radio)
  }

  function dibujar(dt: number) {
    const c = ctx
    if (!c || !matBanda) return
    reloj += dt
    incompletaT = Math.max(0, incompletaT - dt)
    ubicarGuia(c)

    const dos = nudillosEscena(c, 'derecha', a) && nudillosEscena(c, 'izquierda', b)
    grupo.visible = dos
    if (dos) {
      const pct = sesion.estiramientoPct ?? 0
      const hue = tonoDeEstiramiento(pct)
      matBanda.color.setHSL(hue, 0.75, 0.52)
      matBanda.emissive.setHSL(hue, 0.85, 0.18)
      const radio = RADIO_HEBRA * grosorDeEstiramiento(pct)
      // dos hebras paralelas (arriba y abajo) entre los nudillos
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 1 : -1
        d0.copy(a)
        d0.y += s * SEPARACION_HEBRAS
        d1.copy(b)
        d1.y += s * SEPARACION_HEBRAS
        entre(hebras[i], d0, d1, radio)
      }
      extremos[0].position.copy(a)
      extremos[1].position.copy(b)
      for (const e of extremos) e.scale.setScalar(RADIO_HEBRA * 2.4)
      // marcador del largo en reposo, centrado entre las manos y un poco más abajo
      const hay = sesion.conReposo && reposoEscena > 0
      for (const m of marcador) m.visible = hay
      if (hay) {
        dir.subVectors(b, a).normalize()
        mitad.addVectors(a, b).multiplyScalar(0.5)
        mitad.y -= 0.24
        d0.copy(mitad).addScaledVector(dir, -reposoEscena / 2)
        d1.copy(mitad).addScaledVector(dir, reposoEscena / 2)
        entre(marcador[0], d0, d1, 0.012)
        marcador[1].position.copy(d0)
        marcador[2].position.copy(d1)
        marcador[1].scale.setScalar(0.04)
        marcador[2].scale.setScalar(0.04)
      }
    }
    dibujarGuia()
  }

  /** Guarda la pose de ambas manos con esa etiqueta (la base copia el cuadro actual). */
  function guardarPoses(etiqueta: string, valor: number | null): boolean {
    const c = ctx
    if (!c) return false
    let ok = false
    for (const lado of LADOS) ok = c.guardarPose(etiqueta, lado, valor) || ok
    return ok
  }

  function aplicar(ev: EventoBanda) {
    const c = ctx
    if (!c) return
    switch (ev.tipo) {
      case 'reposo': {
        if (nudillosEscena(c, 'derecha', a) && nudillosEscena(c, 'izquierda', b)) reposoEscena = a.distanceTo(b)
        picoGuardadoCm = 0
        if (guardarPoses('reposo', null)) posesReposo++
        break
      }
      case 'repeticion':
        contador = sesion.repeticiones
        c.registrar('umbral_alcanzado', {
          mano: null,
          objeto: 'banda',
          datos: { rep: ev.n, estiramientoCm: Math.round(ev.picoCm * 10) / 10, estiramientoPct: Math.round(ev.picoPct * 10) / 10, cargaKg: Math.round(ev.cargaKg * 100) / 100, duracionMs: Math.round(ev.duracionMs) },
        })
        break
      case 'incompleta':
        incompletaT = AVISO_INCOMPLETA_S
        c.registrar('repeticion_incompleta', {
          mano: null,
          objeto: 'banda',
          datos: { rep: sesion.repeticiones + sesion.incompletas, estiramientoCm: Math.round(ev.picoCm * 10) / 10, estiramientoPct: Math.round(ev.picoPct * 10) / 10, cargaKg: Math.round(ev.cargaKg * 100) / 100, umbralPct: ev.umbralPct },
        })
        break
    }
  }

  function depuracion(): EstadoBandaDepuracion {
    const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10)
    return {
      contador,
      meta: ctx?.meta ?? 0,
      fase: sesion.fase,
      manos: sesion.nManos,
      kgBanda: nivel.kgBanda,
      reposoCm: r1(sesion.reposoCm),
      estiramientoCm: r1(sesion.estiramientoCm),
      estiramientoPct: r1(sesion.estiramientoPct),
      cargaKg: sesion.cargaKg == null ? null : Math.round(sesion.cargaKg * 100) / 100,
      maxPct: Math.round(sesion.maxPct * 10) / 10,
      maxCm: Math.round(sesion.maxCm * 10) / 10,
      repeticiones: sesion.repeticiones,
      incompletas: sesion.incompletas,
      fragmentos: sesion.fragmentos,
      picosPct: sesion.picos.map((p) => Math.round(p.picoPct * 10) / 10),
      progresoReposo: Math.round(sesion.progresoReposo * 100) / 100,
      posesPico,
      posesReposo,
    }
  }

  return {
    id: 'banda-elastica',
    nombre: 'Banda elástica',
    gestos: ['Agarre'],
    miniatura: 'banda',
    niveles,
    meta: { etiqueta: 'Repeticiones', unidad: 'repeticiones', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['umbral_alcanzado', 'repeticion_incompleta'],
    metricasVivo: [
      { id: 'estiramientoCm', nombre: 'Estiramiento', unidad: 'cm', formula: '(distancia entre los nudillos de ambas manos − distancia en reposo) en cm; la escala px→cm se congela al marcar el reposo', aprox: true, mejor: 'mayor' },
      { id: 'estiramientoPct', nombre: 'Sobre el reposo', unidad: '%', formula: 'distancia entre nudillos / distancia en reposo − 1 (no depende de la escala en cm)', mejor: 'mayor' },
      { id: 'cargaKg', nombre: 'Carga aprox.', unidad: 'kg', formula: 'kg nominales de la banda × estiramiento (modelo lineal: la banda marca sus kg al doble de largo, o sea al 100 %); es una estimación', aprox: true, mejor: 'mayor' },
    ],
    metricasResumen: [
      { id: 'estiramientoMaxCm', nombre: 'Estiramiento máximo', unidad: 'cm', formula: 'mayor estiramiento de la sesión en cm (distancia entre nudillos − reposo)', aprox: true, mejor: 'mayor', corto: 'Estiramiento máx.' },
      { id: 'estiramientoMaxPct', nombre: 'Estiramiento máximo (% del reposo)', unidad: '%', formula: 'mayor distancia entre nudillos / distancia en reposo − 1', mejor: 'mayor', corto: 'Estiramiento máx. %' },
      { id: 'repeticiones', nombre: 'Repeticiones', unidad: '', formula: 'tramos seguidos sobre el 15 % del pico (mínimo 10 %), con huecos de hasta 0,35 s, sin fragmentos bajo el 35 % del pico y que pasen del 25 % de estiramiento', mejor: 'mayor' },
      { id: 'cargaMaxKg', nombre: 'Carga máxima aprox.', unidad: 'kg', formula: 'kg nominales de la banda × estiramiento máximo (estimación con modelo lineal)', aprox: true, mejor: 'mayor', corto: 'Carga máx. aprox.' },
      { id: 'tiempoBajoTensionS', nombre: 'Tiempo bajo tensión', unidad: 's', formula: 'segundos con la carga sobre el 50 % del pico de la sesión (cada cuadro suma a lo más 0,1 s)', mejor: 'mayor', corto: 'Bajo tensión' },
      { id: 'cambioPicoPct', nombre: 'Cambio del pico entre repeticiones', unidad: '%', formula: '(pico de la última repetición − pico de la primera) / pico de la primera × 100; vacío con menos de 2 repeticiones', corto: 'Cambio del pico' },
      { id: 'reposoCm', nombre: 'Largo de la banda en reposo', unidad: 'cm', formula: 'distancia entre nudillos al marcar el reposo (banda recién tensa)', aprox: true, tarjeta: false },
      { id: 'kgBanda', nombre: 'Banda del nivel', unidad: 'kg', formula: 'kg nominales de la banda al doble de largo (según el nivel)', tarjeta: false },
    ],
    usaFisica: false,
    pista: PISTA_REPOSO,
    textoReiniciar: 'Marcar reposo de nuevo',

    montar(c) {
      ctx = c
      nivel = nivelBanda(c.parametros.nivel)
      sesion = new SesionBanda(nivel.kgBanda)
      // Zona más angosta que la de la base: con la banda real se estira hasta el doble y las manos llegaban a los bordes
      // de la imagen, detrás del panel y de la tarjeta (prueba con grabaciones reales, 22-nov-2026).
      c.configurarManos({ x: [-1.55, 1.55] })
      construirEscena(c)
      dibujar(0)
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      const f = c.fuente.ultimo
      // La base llama en cada cuadro de pantalla; solo se mide con un cuadro nuevo de la fuente.
      if (f && f.t !== ultimoT && !metaAlcanzada()) {
        const dtMs = ultimoT == null ? 0 : f.t - ultimoT
        ultimoT = f.t
        const medida = medirCuadro(manos, f.ancho, f.alto, c.escalaCm)
        for (const ev of sesion.paso(dtMs, medida, manos.length)) aplicar(ev)
        const cm = sesion.estiramientoCm
        if (cm != null && cm > picoGuardadoCm + POSE_MEJORA_CM && c.ahora() - ultimaPoseMs >= POSE_CADA_MS) {
          if (guardarPoses('pico', cm)) {
            posesPico++
            picoGuardadoCm = cm
            ultimaPoseMs = c.ahora()
          }
        }
      }
      dibujar(dt)
    },

    hud() {
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      const pct = sesion.estiramientoPct
      for (const l of LADOS) {
        manos[l] = !sesion.conReposo ? { texto: 'Con la banda', tono: 'ok' } : pct != null && pct >= REP_MIN_PCT ? { texto: 'Estirando', tono: 'acento' } : { texto: 'En reposo', tono: 'ok' }
      }
      const pista = metaAlcanzada() ? '¡Muy bien! Terminaste las repeticiones' : pistaBanda(sesion.fase, incompletaT > 0)
      const r = (x: number | null, d: number) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
      return {
        contador,
        manos,
        pista,
        vivo: { estiramientoCm: r(sesion.estiramientoCm, 1), estiramientoPct: r(pct, 0), cargaKg: r(sesion.cargaKg, 1) },
      }
    },

    reiniciar() {
      // "Marcar reposo de nuevo": con las dos manos a la vista toma la distancia de ahora; si no, borra el reposo.
      const e = sesion.marcarReposo()
      if (e) aplicar(e)
      else sesion.borrarReposo()
    },

    muestra() {
      const r = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100)
      return { estiramientoCm: r(sesion.estiramientoCm), cargaKg: r(sesion.cargaKg) }
    },

    resumen() {
      return sesion.resumen()
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
