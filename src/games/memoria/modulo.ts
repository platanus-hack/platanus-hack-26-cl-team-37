// Memoria de cartas (F26, J5): giro del antebrazo (prono-supinación), sin física, sobre la base común.
// Referencia: imagenes_juegos/05_memoria_de_cartas.png y docs/referencia/prompts_juegos/J5_memoria_de_cartas.md.
//
// Escena: cartas azules boca abajo en una grilla sobre la mesa; la mano virtual (palma abajo, casi plana) se mueve sobre
// ellas. Con la mano sobre una carta tapada, girar la palma hacia arriba la inclina siguiendo el giro (progreso = giro /
// umbral del nivel); al alcanzar el umbral y mantenerlo 0,3 s se voltea (con menos giro la carta se inclina pero no se
// voltea). Para voltear otra hay que volver a palma abajo (retorno_palma_abajo). Dos iguales forman un par y quedan
// arriba; si no, se vuelven a tapar (no_par).
//
// Meta: con metaAgarres > 0 en el plan, la sesión termina al encontrar todos los pares del tablero del nivel; con
// metaAgarres = 0 es práctica libre (sin meta, termina solo por tiempo): al completar el tablero se arma otro.
//
// Modo "sin memoria": las figuras se ven siempre (en pequeño sobre el reverso) y solo se trabaja el giro. Se activa con
// el campo opcional `sinMemoria: true` en los parámetros de la sesión (jsonb, no necesita migración; hoy ningún
// formulario lo fija) o, solo con fuente simulada (sintética/grabación, nunca con la cámara real), con `?sinMemoria=1`
// en la URL (pruebas y demostración). Si se usó, queda registrado en el resumen (`sinMemoria` = 1).
//
// Toda la lógica (giro, sostenido, tablero, métricas) está en logica.ts. Los grados son estimaciones SIN VALIDAR.
import * as THREE from 'three'
import { PASTELES_CSS } from '../shell/colores'
import type { LadoMano } from '../../domain/types'
import type { ManoSeguida } from '../../tracking/tipos'
import { ZONA_BASE } from '../shell/manos3d'
import type { ContextoJuego, CrearJuego, EstadoManoHud, HudJuego, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  AgregadoCartas,
  NIVELES_CARTAS,
  NOMBRES_FIGURA,
  RETORNO_DEG,
  SuavizadorGiro,
  anguloGiro,
  cartaBajo,
  configGiro,
  crearTablero,
  estadoManoInicial,
  nivelCartas,
  pasoMano,
  metaCartas,
  progresoGiro,
  tableroCompleto,
  tapar,
  voltear,
  type ConfigGiro,
  type EstadoCarta,
  type EstadoMano,
  type NivelCartas,
  type Tablero,
} from './logica'
import { KUWU, kuwuAlfa, kuwuNum } from '../../ui/paleta'

/** Cuánto se ven abiertas dos cartas distintas antes de volver a taparse (ms). */
export const VER_NO_PAR_MS = 1300
/** Inclinación máxima de una carta que todavía no se voltea (°). */
const INCLINACION_MAX = 55
const PERDIDA_REINICIA_MS = 400
/** Práctica libre: cuánto se ve el tablero completo antes de armar otro (ms). */
export const REARMAR_MS = 1500

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_CARTAS[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

const COLOR_ACENTO = kuwuNum('amarillo')
const COLOR_OK = kuwuNum('menta')
/** Figuras en los pastel del brandbook con borde marino (se distinguen por forma y color); caras sobre blanco y crema. */
const COLORES_FIGURA = PASTELES_CSS
const FONDOS_CARA = [KUWU.blanco, KUWU.crema]

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoCartasDepuracion {
  contador: number
  meta: number
  filas: number
  columnas: number
  umbralDeg: number
  sinMemoria: boolean
  figuras: number[]
  estados: EstadoCarta[]
  /** Inclinación visual actual de cada carta (°; 180 = boca arriba). */
  inclinacion: number[]
  /** Posición de la mano en la imagen (x) y distancia (cm) que dejan la palma sobre cada carta. */
  celdas: { x: number; distanciaCm: number }[]
  resolviendo: boolean
  intentos: number
  pares: number
  supinacionMax: number
  pronacionMax: number
  manos: Partial<Record<LadoMano, { angulo: number | null; crudo: number | null; sobre: number | null; armada: boolean; esperaRetorno: boolean; mantenidoMs: number }>>
}

function dibujarFigura(g: CanvasRenderingContext2D, figura: number, cx: number, cy: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  switch (figura) {
    case 0:
      g.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 1:
      g.moveTo(cx, cy - r)
      g.lineTo(cx + r * 1.05, cy + r * 0.85)
      g.lineTo(cx - r * 1.05, cy + r * 0.85)
      g.closePath()
      break
    case 2:
      g.roundRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, r * 0.12)
      break
    case 3:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.45 : r * 1.05
        if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
        else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      }
      g.closePath()
      break
    case 4:
      g.moveTo(cx, cy - r * 1.1)
      g.lineTo(cx + r * 0.8, cy)
      g.lineTo(cx, cy + r * 1.1)
      g.lineTo(cx - r * 0.8, cy)
      g.closePath()
      break
    default:
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      g.closePath()
  }
  g.fill()
  // Borde marino: los pastel solos se pierden sobre la cara blanca.
  g.strokeStyle = KUWU.marino
  g.lineWidth = Math.max(2, r * 0.08)
  g.lineJoin = 'round'
  g.stroke()
}

const TAM_TEX = 192

function texturaDeLienzo(dibujar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = TAM_TEX
  dibujar(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function texturaCara(figura: number): THREE.CanvasTexture {
  return texturaDeLienzo((g) => {
    g.fillStyle = FONDOS_CARA[figura % FONDOS_CARA.length]
    g.fillRect(0, 0, TAM_TEX, TAM_TEX)
    g.strokeStyle = kuwuAlfa('marino', 0.18)
    g.lineWidth = 6
    g.strokeRect(3, 3, TAM_TEX - 6, TAM_TEX - 6)
    dibujarFigura(g, figura, TAM_TEX / 2, TAM_TEX / 2, 56, COLORES_FIGURA[figura % COLORES_FIGURA.length])
  })
}

/** Reverso azul con un círculo amarillo; en "sin memoria" lleva la figura de la carta en pequeño. */
function texturaReverso(figura: number | null): THREE.CanvasTexture {
  return texturaDeLienzo((g) => {
    g.fillStyle = KUWU.marino
    g.fillRect(0, 0, TAM_TEX, TAM_TEX)
    g.fillStyle = KUWU['noche-borde']
    g.fillRect(14, 14, TAM_TEX - 28, TAM_TEX - 28)
    if (figura == null) dibujarFigura(g, 0, TAM_TEX / 2, TAM_TEX / 2, 30, KUWU.amarillo)
    else {
      g.fillStyle = kuwuAlfa('blanco', 0.88)
      g.beginPath()
      g.arc(TAM_TEX / 2, TAM_TEX / 2, 46, 0, Math.PI * 2)
      g.fill()
      dibujarFigura(g, figura, TAM_TEX / 2, TAM_TEX / 2, 30, COLORES_FIGURA[figura % COLORES_FIGURA.length])
    }
  })
}

interface VisualCarta {
  grupo: THREE.Group
  pivote: THREE.Group
  halo: THREE.Mesh
  phi: number
  x: number
  z: number
}

interface ManoJuego {
  filtro: SuavizadorGiro
  estado: EstadoMano
  angulo: number | null
  crudo: number | null
  perdidoMs: number
}

export const crearMemoria: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelCartas = nivelCartas(1)
  let cfg: ConfigGiro = configGiro(nivel.umbralDeg)
  let lados: LadoMano[] = ['derecha']
  let sinMemoria = false

  const agregado = new AgregadoCartas()
  let tablero: Tablero = crearTablero(2, 2)
  let contador = 0
  let reloj = 0
  let resolviendoMs = 0
  let completoMs = 0
  let resolviendo = false
  let conDato = false
  let ultimoGiro: number | null = null
  const manosJuego: Record<LadoMano, ManoJuego> = {
    derecha: { filtro: new SuavizadorGiro(), estado: estadoManoInicial(), angulo: null, crudo: null, perdidoMs: 0 },
    izquierda: { filtro: new SuavizadorGiro(), estado: estadoManoInicial(), angulo: null, crudo: null, perdidoMs: 0 },
  }

  // Geometría de la grilla (unidades de escena).
  let pasoX = 1
  let pasoZ = 1
  const centroX = 0
  const centroZ = -0.45
  let celdas: { x: number; distanciaCm: number }[] = []

  // Escena
  const grupo = new THREE.Group()
  const visuales: VisualCarta[] = []
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []

  const ladoVisible = (l: LadoMano) => !!ctx?.manos.visible(l)

  function construirTablero(c: ContextoJuego) {
    const filas = nivel.filas
    const columnas = nivel.columnas
    const ancho = Math.min(1.3, 4.6 / columnas - 0.16)
    const fondo = Math.min(1.15, 2.7 / filas - 0.16)
    pasoX = ancho + 0.16
    pasoZ = fondo + 0.16
    const grosor = 0.07

    const cara = Array.from({ length: Math.max(...tablero.figuras) + 1 }, (_, f) => texturaCara(f))
    const reverso = sinMemoria ? cara.map((_, f) => texturaReverso(f)) : [texturaReverso(null)]
    texturas.push(...cara, ...reverso)

    const geo = new THREE.BoxGeometry(ancho, grosor, fondo)
    const geoHalo = new THREE.PlaneGeometry(ancho + 0.16, fondo + 0.16)
    geometrias.push(geo, geoHalo)
    const lado = new THREE.MeshStandardMaterial({ color: kuwuNum('marino'), roughness: 0.6 })
    materiales.push(lado)

    for (let i = 0; i < filas * columnas; i++) {
      const f = tablero.figuras[i]
      const matCara = new THREE.MeshStandardMaterial({ map: cara[f], roughness: 0.55 })
      const matRev = new THREE.MeshStandardMaterial({ map: sinMemoria ? reverso[f] : reverso[0], roughness: 0.55 })
      const matHalo = new THREE.MeshBasicMaterial({ color: COLOR_ACENTO, transparent: true, opacity: 0, depthWrite: false })
      materiales.push(matCara, matRev, matHalo)
      // Orden de caras de BoxGeometry: +x, −x, +y (reverso, arriba), −y (figura, queda arriba al voltear), +z, −z.
      const caja = new THREE.Mesh(geo, [lado, lado, matRev, matCara, lado, lado])
      caja.castShadow = true
      caja.receiveShadow = true
      const pivote = new THREE.Group()
      pivote.add(caja)
      const fila = Math.floor(i / columnas)
      const col = i % columnas
      const x = centroX + (col - (columnas - 1) / 2) * pasoX
      const z = centroZ + (fila - (filas - 1) / 2) * pasoZ
      const g = new THREE.Group()
      g.position.set(x, c.mesa.altura, z)
      const halo = new THREE.Mesh(geoHalo, matHalo)
      halo.rotation.x = -Math.PI / 2
      halo.position.y = 0.006
      halo.renderOrder = 1
      g.add(halo, pivote)
      pivote.position.y = grosor / 2
      grupo.add(g)
      visuales.push({ grupo: g, pivote, halo, phi: 0, x, z })
    }

    // Zona de las manos: la palma recorre la grilla (x: imagen; z: distancia a la cámara; y: altura sobre las cartas).
    const medioX = (columnas * pasoX) / 2 + 0.25
    const zPrimera = centroZ - ((filas - 1) / 2) * pasoZ
    const zUltima = centroZ + ((filas - 1) / 2) * pasoZ
    const margenZ = Math.max(0.3, pasoZ * 0.45)
    const zona = { x: [-medioX, medioX] as [number, number], y: [0.7, 1.1] as [number, number], z: [zPrimera - margenZ, zUltima + margenZ] as [number, number], escala: 5, inclinacionDeg: 80 }
    c.configurarManos(zona)
    // Inverso de anclaEnEscena (shell/manos3d.ts) para que las pruebas pongan la palma sobre cada carta.
    const util = 1 - 2 * ZONA_BASE.margen
    const [d0, d1] = ZONA_BASE.distanciaCm
    celdas = visuales.map((v) => {
      const u = (v.x - zona.x[0]) / (zona.x[1] - zona.x[0])
      const d = (v.z - zona.z[0]) / (zona.z[1] - zona.z[0])
      return { x: Math.round((1 - ZONA_BASE.margen - u * util) * 1000) / 1000, distanciaCm: Math.round((d0 + d * (d1 - d0)) * 10) / 10 }
    })
  }

  /** Arma un tablero nuevo (los conteos de la sesión no se tocan). */
  function nuevoTablero() {
    tablero = crearTablero(nivel.filas, nivel.columnas)
    resolviendo = false
    resolviendoMs = 0
    completoMs = 0
    for (const v of visuales) grupo.remove(v.grupo)
    visuales.length = 0
    for (const m of materiales) m.dispose()
    for (const t of texturas) t.dispose()
    for (const g of geometrias) g.dispose()
    materiales.length = 0
    texturas.length = 0
    geometrias.length = 0
    for (const l of Object.keys(manosJuego) as LadoMano[]) manosJuego[l].estado = estadoManoInicial()
    if (ctx) construirTablero(ctx)
  }

  function nombreCarta(i: number) {
    return `carta${i + 1}`
  }

  function aplicarVolteo(lado: LadoMano, carta: number, grados: number) {
    const c = ctx
    if (!c) return
    const previas = [...tablero.abiertas]
    const r = voltear(tablero, carta)
    if (r.tablero === tablero) return
    tablero = r.tablero
    agregado.volteo(grados)
    c.registrar('volteo', { mano: lado, objeto: nombreCarta(carta), datos: { carta: carta + 1, figura: NOMBRES_FIGURA[tablero.figuras[carta]], grados } })
    if (r.resultado === 'par') {
      contador++
      agregado.resultado('par')
      c.registrar('par', { mano: lado, objeto: NOMBRES_FIGURA[tablero.figuras[carta]], datos: { cartas: [previas[0] + 1, carta + 1], figura: NOMBRES_FIGURA[tablero.figuras[carta]] } })
    } else if (r.resultado === 'no_par') {
      agregado.resultado('no_par')
      resolviendo = true
      resolviendoMs = 0
      c.registrar('no_par', { mano: lado, datos: { cartas: [previas[0] + 1, carta + 1], figuras: [NOMBRES_FIGURA[tablero.figuras[previas[0]]], NOMBRES_FIGURA[tablero.figuras[carta]]] } })
    }
  }

  function procesarMano(lado: LadoMano, mano: ManoSeguida | undefined, dtMs: number) {
    const c = ctx
    const mj = manosJuego[lado]
    if (!c) return
    if (!mano || !c.manos.visible(lado)) {
      mj.perdidoMs += dtMs
      if (mj.perdidoMs > PERDIDA_REINICIA_MS) mj.filtro.reiniciar()
      mj.angulo = null
      mj.crudo = null
      mj.estado = pasoMano(mj.estado, { angulo: null, carta: null, dtMs, bloqueado: resolviendo }, cfg).estado
      return
    }
    mj.perdidoMs = 0
    const crudo = anguloGiro(mano.worldLandmarks, lado)
    mj.crudo = crudo
    mj.angulo = crudo == null ? null : mj.filtro.filtrar(crudo, reloj)
    if (mj.angulo != null) {
      agregado.giro(mj.angulo)
      conDato = true
    }

    const p = c.manos.palma(lado)
    const idx = cartaBajo(p.x, p.z, nivel.filas, nivel.columnas, pasoX, pasoZ, centroX, centroZ)
    const carta = idx != null && tablero.estados[idx] === 'tapada' ? idx : null
    const r = pasoMano(mj.estado, { angulo: mj.angulo, carta, dtMs, bloqueado: resolviendo }, cfg)
    mj.estado = r.estado
    for (const ev of r.eventos) {
      if (ev.tipo === 'sobre_carta') c.registrar('sobre_carta', { mano: lado, objeto: nombreCarta(ev.carta), datos: { carta: ev.carta + 1 } })
      else if (ev.tipo === 'retorno_palma_abajo') c.registrar('retorno_palma_abajo', { mano: lado })
      else aplicarVolteo(lado, ev.carta, ev.grados)
    }
  }

  const principal = (): LadoMano | null => {
    const p = ctx?.manoPrincipal()
    if (p && lados.includes(p) && manosJuego[p].angulo != null) return p
    return lados.find((l) => manosJuego[l].angulo != null) ?? null
  }

  function dibujar(dt: number) {
    const c = ctx
    if (!c) return
    const sigue = 1 - Math.exp(-dt * 14)
    for (let i = 0; i < visuales.length; i++) {
      const v = visuales[i]
      const e = tablero.estados[i]
      let progreso = 0
      let sobre = false
      for (const l of lados) {
        const mj = manosJuego[l]
        if (mj.estado.sobre === i && ladoVisible(l)) {
          sobre = true
          progreso = Math.max(progreso, progresoGiro(mj.estado, mj.angulo, nivel.umbralDeg, resolviendo))
        }
      }
      const objetivo = e === 'tapada' ? progreso * INCLINACION_MAX : 180
      v.phi += (objetivo - v.phi) * sigue
      if (Math.abs(objetivo - v.phi) < 0.05) v.phi = objetivo
      const rad = (v.phi * Math.PI) / 180
      v.pivote.rotation.x = -rad
      v.pivote.position.y = 0.035 + Math.sin(rad) * (pasoZ - 0.16) * 0.5 + (sobre && e === 'tapada' ? 0.02 : 0)
      const mat = v.halo.material as THREE.MeshBasicMaterial
      if (e === 'par') {
        mat.color.setHex(COLOR_OK)
        mat.opacity = 0.7
      } else if (sobre && e === 'tapada') {
        mat.color.setHex(COLOR_ACENTO)
        mat.opacity = 0.35 + 0.45 * progreso
      } else mat.opacity = 0
    }
  }

  function depuracion(): EstadoCartasDepuracion {
    const manos: EstadoCartasDepuracion['manos'] = {}
    for (const l of ['derecha', 'izquierda'] as LadoMano[]) {
      const m = manosJuego[l]
      manos[l] = { angulo: m.angulo, crudo: m.crudo, sobre: m.estado.sobre, armada: m.estado.armada, esperaRetorno: m.estado.esperaRetorno, mantenidoMs: m.estado.mantenidoMs }
    }
    return {
      contador,
      meta: ctx?.meta ?? 0,
      filas: nivel.filas,
      columnas: nivel.columnas,
      umbralDeg: nivel.umbralDeg,
      sinMemoria,
      figuras: [...tablero.figuras],
      estados: [...tablero.estados],
      inclinacion: visuales.map((v) => Math.round(v.phi * 10) / 10),
      celdas,
      resolviendo,
      intentos: agregado.intentos,
      pares: agregado.pares,
      supinacionMax: agregado.supinacionMax,
      pronacionMax: agregado.pronacionMax,
      manos,
    }
  }

  const FORMULA_GIRO = 'estimación de cámara, no validado: ángulo de la normal de la palma (producto cruz de muñeca→base del índice y muñeca→base del meñique) alrededor del eje del antebrazo, respecto de la palma abajo'

  return {
    id: 'memoria-cartas',
    nombre: 'Memoria de cartas',
    gestos: ['Giro del antebrazo'],
    miniatura: 'memoria',
    niveles,
    meta: { etiqueta: 'Pares', unidad: 'pares', desdePlan: (p) => metaCartas(p.nivel, p.metaAgarres) },
    tiposEvento: ['sobre_carta', 'volteo', 'par', 'no_par', 'retorno_palma_abajo'],
    metricasVivo: [
      { id: 'giro', nombre: 'Giro (aprox., no validado)', unidad: '°', formula: `${FORMULA_GIRO} (positivo = supinación, negativo = pronación; suavizado)`, aprox: true },
      { id: 'supMax', nombre: 'Máx. arriba (no validado)', unidad: '°', formula: `mayor giro hacia palma arriba de la sesión, medido desde palma abajo (${FORMULA_GIRO})`, aprox: true, mejor: 'mayor' },
      { id: 'pronMax', nombre: 'Máx. otro lado (no validado)', unidad: '°', formula: `mayor giro hacia el otro lado de palma abajo (la palma gira hacia el meñique) de la sesión (${FORMULA_GIRO})`, aprox: true, mejor: 'mayor' },
    ],
    metricasResumen: [
      { id: 'supinacionMax', nombre: 'Giro hacia palma arriba (desde palma abajo), máximo', unidad: '°', formula: `mayor giro hacia palma arriba de la sesión, medido desde palma abajo (que anatómicamente ya es pronación completa: no es la supinación clínica); ${FORMULA_GIRO}`, aprox: true, mejor: 'mayor', corto: 'Giro a palma arriba máx. (no validado)' },
      { id: 'pronacionMax', nombre: 'Giro hacia el otro lado (desde palma abajo), máximo', unidad: '°', formula: `mayor giro de la sesión hacia el lado contrario a palma arriba, medido desde palma abajo (la palma gira hacia el meñique); ${FORMULA_GIRO}`, aprox: true, mejor: 'mayor', corto: 'Giro al otro lado máx. (no validado)' },
      { id: 'giroMedioVolteo', nombre: 'Giro medio al voltear (no validado)', unidad: '°', formula: `promedio del giro alcanzado en cada volteo (el máximo sostenido 0,3 s); ${FORMULA_GIRO}`, aprox: true, corto: 'Giro al voltear (no validado)' },
      { id: 'giroMinVolteo', nombre: 'Giro mínimo al voltear (no validado)', unidad: '°', formula: `menor giro alcanzado en un volteo; ${FORMULA_GIRO}`, aprox: true, tarjeta: false },
      { id: 'giroMaxVolteo', nombre: 'Giro máximo al voltear (no validado)', unidad: '°', formula: `mayor giro alcanzado en un volteo; ${FORMULA_GIRO}`, aprox: true, tarjeta: false },
      { id: 'pares', nombre: 'Pares encontrados', unidad: '', formula: "eventos 'par'", mejor: 'mayor' },
      { id: 'intentos', nombre: 'Intentos', unidad: '', formula: "parejas de cartas volteadas ('par' + 'no_par')", mejor: 'menor' },
      { id: 'volteos', nombre: 'Volteos', unidad: '', formula: "eventos 'volteo'" },
      { id: 'aciertos', nombre: 'Aciertos', unidad: '%', formula: 'pares / intentos', mejor: 'mayor', tarjeta: false },
      { id: 'sinMemoria', nombre: 'Modo sin memoria (1 = se usó)', unidad: '', formula: 'figuras a la vista durante la sesión (solo se trabaja el giro)', tarjeta: false },
      { id: 'tiempoTotal', nombre: 'Tiempo total', unidad: 's', decimales: 0, formula: 'segundos de juego activo (sin pausas)', mejor: 'menor' },
    ],
    usaFisica: false,
    pista: 'Gira la palma hacia arriba para voltear la carta',
    textoReiniciar: 'Reiniciar',

    montar(c) {
      ctx = c
      nivel = nivelCartas(c.parametros.nivel)
      cfg = configGiro(nivel.umbralDeg)
      const mano = c.parametros.mano
      lados = mano === 'ambas' ? ['derecha', 'izquierda'] : [mano === 'izquierda' ? 'izquierda' : 'derecha']
      const extra = (c.parametros as unknown as { sinMemoria?: unknown }).sinMemoria
      // La URL solo vale con fuente simulada: con la cámara real no se puede activar desde la dirección.
      const url = typeof window !== 'undefined' && c.fuente.tipo !== 'camara' ? new URLSearchParams(window.location.search) : null
      sinMemoria = extra === true || url?.get('sinMemoria') === '1'
      tablero = crearTablero(nivel.filas, nivel.columnas)
      construirTablero(c)
      c.escena.add(grupo)
      dibujar(0)
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      const dtMs = dt * 1000
      reloj += dtMs
      if (resolviendo) {
        resolviendoMs += dtMs
        if (resolviendoMs >= VER_NO_PAR_MS) {
          tablero = tapar(tablero)
          resolviendo = false
        }
      }
      for (const l of lados) procesarMano(l, manos.find((m) => m.lado === l), dtMs)
      // Práctica libre (sin meta): al completar el tablero se arma otro, sin perder los conteos.
      if (c.meta === 0 && tableroCompleto(tablero)) {
        completoMs += dtMs
        if (completoMs >= REARMAR_MS) nuevoTablero()
      }
      const p = principal()
      ultimoGiro = p ? manosJuego[p].angulo : null
      dibujar(dt)
    },

    hud(): HudJuego {
      const c = ctx
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of lados) {
        if (!c?.medidas(l)) continue
        const a = manosJuego[l].angulo
        if (a == null) manos[l] = { texto: 'Sin medir', tono: 'neutro' }
        else if (a <= RETORNO_DEG) manos[l] = { texto: 'Palma abajo', tono: 'ok' }
        else manos[l] = { texto: 'Girando', tono: 'acento' }
      }
      const espera = lados.some((l) => manosJuego[l].estado.esperaRetorno && ladoVisible(l))
      let pista: string | undefined
      if (c && c.meta > 0 && contador >= c.meta) pista = '¡Muy bien! Encontraste todos los pares'
      else if (c && c.meta === 0 && tableroCompleto(tablero)) pista = '¡Muy bien! Armamos otras cartas'
      else if (resolviendo) pista = 'No son iguales: vuelve a palma abajo'
      else if (espera) pista = 'Vuelve a palma abajo para elegir otra carta'
      else if (lados.some((l) => manosJuego[l].estado.sobre != null && ladoVisible(l))) pista = 'Gira la palma hacia arriba para voltear la carta'
      else if (conDato) pista = 'Lleva la mano sobre una carta, con la palma abajo'
      return {
        contador,
        manos,
        pista,
        vivo: {
          giro: ultimoGiro == null ? null : Math.round(ultimoGiro),
          supMax: conDato ? Math.round(agregado.supinacionMax) : null,
          pronMax: conDato ? Math.round(agregado.pronacionMax) : null,
        },
      }
    },

    reiniciar() {
      contador = 0
      agregado.reiniciarTablero()
      nuevoTablero()
    },

    muestra() {
      return { giroDeg: ultimoGiro == null ? null : Math.round(ultimoGiro * 10) / 10 }
    },

    resumen(base) {
      return { ...agregado.resumen(base.duracionS), sinMemoria: sinMemoria ? 1 : 0 }
    },

    desmontar() {
      const c = ctx
      if (c) c.escena.remove(grupo)
      for (const m of materiales) m.dispose()
      for (const t of texturas) t.dispose()
      for (const g of geometrias) g.dispose()
      if (typeof window !== 'undefined' && window.__manoviva?.juego) {
        const { juego: _quitar, ...resto } = window.__manoviva
        void _quitar
        window.__manoviva = resto
      }
      ctx = null
    },
  }
}
