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
import { NEUTRO } from '../assets/colores'
import { crearAnilloPlano, crearDisco } from '../assets/formas'
import { estiloGuia, ModeloMano } from '../assets/mano'
import { crearCuentas as crearArcoCuentas } from '../assets/movilidad/cuentas'
import { textura, type Recursos } from '../assets/recursos'
import { crearSprite } from '../assets/sprites'
import { texturaHalo } from '../assets/texturas'
import type { LadoMano } from '../../domain/types'
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
import { KUWU, kuwuAlfa, fuenteKuwu, kuwuNum } from '../../ui/paleta'

const LADOS: LadoMano[] = ['izquierda', 'derecha']

/** Diferencia de apertura (0..1) con la guía para considerar que el paciente la sigue. */
export const TOLERANCIA_GUIA = 0.22

const COLOR_GUIA = kuwuNum('menta')
const COLOR_ACENTO = kuwuNum('amarillo')
const COLOR_PENDIENTE = kuwuNum('noche-borde')
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

/** Rótulo tipo píldora (fondo oscuro, texto claro) como los del HUD. */
function texturaRotulo(texto: string, punto: string): { textura: THREE.Texture; aspecto: number } {
  const c = document.createElement('canvas')
  const alto = 64
  const g = c.getContext('2d')!
  const fuente = fuenteKuwu(800, 30)
  g.font = fuente
  const ancho = Math.ceil(g.measureText(texto).width) + 30 + 44
  c.width = ancho
  c.height = alto
  g.font = fuente
  g.fillStyle = kuwuAlfa('noche', 0.88)
  g.beginPath()
  g.roundRect(1, 1, ancho - 2, alto - 2, alto / 2)
  g.fill()
  g.strokeStyle = kuwuAlfa('crema', 0.16)
  g.lineWidth = 2
  g.stroke()
  g.fillStyle = punto
  g.beginPath()
  g.arc(30, alto / 2, 8, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = KUWU.crema
  g.textBaseline = 'middle'
  g.fillText(texto, 48, alto / 2 + 1)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return { textura: t, aspecto: ancho / alto }
}

/** Mano guía fantasma (modelo en assets/mano.ts, estilo guía): se arma con la mano sintética de apertura `a`. */
class ManoGuia {
  private readonly modelo: ModeloMano
  private readonly zona: ZonaManos
  private readonly lado: LadoMano
  private ultima = -1

  constructor(ancla: { x: number; y: number; z: number }, lado: LadoMano, recursos: Recursos) {
    this.lado = lado
    this.zona = { ...ZONA_BASE, x: [ancla.x, ancla.x], y: [ancla.y, ancla.y], z: [ancla.z, ancla.z] }
    this.modelo = new ModeloMano(ZONA_BASE.escala, estiloGuia(COLOR_GUIA), recursos)
  }

  get grupo(): THREE.Group {
    return this.modelo.grupo
  }

  /** Arma la mano guía con apertura `a` (0..1). No hace nada si no cambió (tramos en que la guía se mantiene). */
  actualizar(a: number) {
    if (Math.abs(a - this.ultima) < 1e-4) return
    this.ultima = a
    const mano = manoSintetica({ apertura: a, lado: this.lado, x: 0.5, y: 0.5 })
    this.modelo.poner(puntosEnEscena(mano, 47, this.zona))
  }

  centro(destino = new THREE.Vector3()): THREE.Vector3 {
    return this.modelo.centroPalma(destino)
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
  const recursos: Recursos = { materiales, geometrias, texturas }
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

  const anillo = (interno: number, color: number, opacidad: number, segmentos = 96): THREE.Mesh =>
    crearAnilloPlano(recursos, { interno, color, opacidad, segmentos })
  const disco = (tex: THREE.Texture, color: number, opacidad: number): THREE.Mesh => crearDisco(recursos, tex, color, opacidad)

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
    const arco = crearArcoCuentas(recursos, n, c.mesa.altura, COLOR_PENDIENTE)
    cuentas = arco.malla
    posCuentas = arco.posiciones
    for (let i = 0; i < n; i++) popCuenta.push(0)
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
      else if (siguiente) col.setHex(kuwuNum('control'))
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
      // Sin mesa: no hay objetos que tomar; las manos y los anillos quedan sobre el fondo (se repone al desmontar).
      c.mesa.objeto.visible = false

      const tHalo = textura(recursos, texturaHalo([0.35, 0.45]))

      // Mano guía + halo + anillo y disco en la mesa.
      guia = new ManoGuia(disp.guia, disp.ladoGuia, recursos)
      grupo.add(guia.grupo)
      halo = crearSprite(recursos, tHalo, { color: COLOR_GUIA, aditivo: true, opacidad: 0.38 }).s
      halo.renderOrder = 1
      grupo.add(halo)
      const yMesa = c.mesa.altura
      anilloGuia = anillo(0.9, COLOR_GUIA, 0.9)
      anilloGuia.position.set(disp.guia.x, yMesa + 0.015, disp.guia.z)
      discoGuia = disco(tHalo, COLOR_GUIA, 0.3)
      discoGuia.position.set(disp.guia.x, yMesa + 0.01, disp.guia.z)
      const rotuloGuia = rotulo('Guía', KUWU.menta)
      rotuloGuia.position.set(disp.guia.x, yMesa + 0.05, disp.guia.z + radioDe(1) + 0.1)
      grupo.add(anilloGuia, discoGuia, rotuloGuia)

      // Por mano que cuenta: tu anillo (amarillo → verde al seguir la guía) + anillo de referencia (blanco) + onda.
      for (const lado of lados) {
        const v: VisualMano = {
          anillo: anillo(0.86, COLOR_ACENTO, 0.95),
          ref: anillo(0.965, NEUTRO, 0.55, 128),
          disco: disco(tHalo, COLOR_ACENTO, 0.28),
          onda: anillo(0.93, COLOR_ACENTO, 0.8),
          ondaT: -1,
          rotulo: lados.length === 1 ? rotulo('Tu mano', KUWU.amarillo) : null,
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
      if (ctx) ctx.mesa.objeto.visible = true
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
