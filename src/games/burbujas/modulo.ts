// Atrapa burbujas (F24, J3): alcance y extensión de dedos, sin física, sobre la base común.
// Referencia: imagenes_juegos/03_atrapa_burbujas.png y docs/referencia/prompts_juegos/J3_atrapa_burbujas.md.
//
// Escena: sobre la mesa flotan burbujas de adorno (verdes, azules, moradas; no cuentan) y UNA es el objetivo: amarilla,
// con brillo y halo. Se revienta cuando la palma está dentro de su radio con los dedos bien extendidos (logica.ts:
// extensionPct ≥ umbral, 80 % por defecto). Con la mano a medio abrir o cerrada dentro de la burbuja el halo se pone
// naranja y la pista pide abrir más la mano (intento_cerrado). Al reventar: anillo de gotas, "+1" y, un momento
// después, la siguiente burbuja. Con vida limitada (niveles 2–5) la burbuja se agota (expirada) y aparece otra.
//
// Zona de aparición: alrededor de la posición de reposo de la mano (promedio del primer segundo con la mano a la vista),
// crece con los aciertos; el terapeuta puede limitarla con `zona` en el plan ('derecha' | 'izquierda' | 'altura-media').
// Con mano 'ambas' los objetivos se alternan entre el lado derecho y el izquierdo (revienta cualquiera de las dos manos).
//
// Eventos: objetivo_mostrado {x,y,z,celda,radio,vidaMs,zonaPct}, reventada {mano, extension, tiempoMs, alcanceCm, celda},
// intento_cerrado {mano, extensionMax}, expirada {tiempoMs}. Mide: extensión al tocar, alcance máximo por mano (cm aprox.,
// muñeca desde el reposo, SOLO el de cada burbuja reventada y solo de las manos de la sesión; el reposo se vuelve a medir
// si la mano se pierde y reaparece), tiempo por burbuja y el mapa de zonas alcanzadas por mano (máscara de bits en el resumen).
// Solo las manos de la sesión (`lados`) revientan burbujas y cuentan para la meta (como movilidad): en una sesión de una
// mano, la otra mano se ignora.
//
// `zona` y `umbralExtensionPct` del plan: el código los lee si vienen en los parámetros de la sesión, pero HOY el editor de
// planes (P2) no los ofrece ni están en ParametrosSesion: en la práctica siempre rigen los valores por defecto (sin límite
// de zona, umbral 80 %). Lo prueba el e2e inyectando el parámetro directo en la sesión; ver docs/equipo/registro-P3.md.
import * as THREE from 'three'
import { NEUTRO, tono } from '../assets/colores'
import { crearAvisoManoAbierta } from '../assets/burbujas/aviso'
import { crearBaseBurbujas, crearBurbujaObjetivo, crearEfectoReventar, texturaMasUno, type BaseBurbujas } from '../assets/burbujas/burbuja'
import { geometria, textura, type Recursos } from '../assets/recursos'
import type { LadoMano } from '../../domain/types'
import type { ManoSeguida } from '../../tracking/tipos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  AgregadoBurbujas,
  AlcanceMano,
  HOLGURA_TOQUE,
  NIVELES_BURBUJAS,
  REPOSO_DEFECTO,
  UMBRAL_EXTENSION_DEFECTO,
  AVISO_MS,
  burbujaAgotada,
  celdaDe,
  extensionPct,
  factorZona,
  limiteDeZona,
  moverEnCaja,
  nacimientoBurbuja,
  nivelBurbujas,
  pasoToque,
  referenciasFlexion,
  sortearPosicion,
  radioBurbuja,
  tocaBurbuja,
  toqueInicial,
  velocidadAleatoria,
  zonaDeAparicion,
  type Caja3,
  type EstadoToque,
  type NivelBurbujas,
  type V3,
} from './logica'
import { kuwuNum } from '../../ui/paleta'

const LADOS: LadoMano[] = ['derecha', 'izquierda']

/** Pausa entre reventar una burbuja y mostrar la siguiente (ms). */
export const ESPERA_SIGUIENTE_MS = 350
/** Tope de espera de la primera burbuja por el reposo de la mano (ms de juego). */
export const ESPERA_INICIAL_MS = 3000
/** Duración de la animación de reventado (ms). */
export const POP_MS = 700
const N_GOTAS = 10
const N_EFECTOS = 3

const COLOR_ACENTO = kuwuNum('amarillo')
const COLOR_OK = kuwuNum('menta')
const COLOR_AVISO = kuwuNum('rojo')

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_BURBUJAS[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

const rnd = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoBurbujasDepuracion {
  contador: number
  meta: number
  /** La burbuja más antigua en la escena (null si no hay ninguna). Posición en la escena. */
  objetivo: { x: number; y: number; z: number; radio: number; celda: number; edadMs: number; vidaMs: number } | null
  /** Todas las burbujas en la escena, de la más antigua a la más nueva. */
  burbujas: { numero: number; x: number; y: number; z: number; radio: number; edadMs: number }[]
  simultaneas: number
  umbral: number
  /** Extensión (%) de cada mano vista. */
  extension: Partial<Record<LadoMano, number>>
  dentro: Partial<Record<LadoMano, boolean>>
  /** Centro de la palma de cada mano vista, en la escena. */
  palma: Partial<Record<LadoMano, V3>>
  reposoListo: Partial<Record<LadoMano, boolean>>
  /** Caja de aparición del objetivo actual y fracción de la zona completa (%). */
  caja: Caja3 | null
  zonaPct: number
  limiteZona: string | null
  intentosCerrados: number
  expiradas: number
  alcanceMax: number
  lados: LadoMano[]
}

/** Una burbuja en la escena. Todas se pueden reventar; cada una con su tamaño, su vida y su estado de toque por mano. */
interface Burbuja {
  numero: number
  lado: LadoMano
  pos: V3
  vel: V3
  caja: Caja3
  radio: number
  t0: number
  visual: VisualBurbuja
  toque: Record<LadoMano, EstadoToque>
  /** Una burbuja que aparece sobre la palma no cuenta hasta que la mano salga y vuelva a entrar. */
  armado: Record<LadoMano, boolean>
}

type VisualBurbuja = ReturnType<typeof crearBurbujaObjetivo>

interface Efecto {
  gotas: THREE.Mesh[]
  matGota: THREE.MeshBasicMaterial
  mas: THREE.Sprite
  matMas: THREE.SpriteMaterial
  centro: THREE.Vector3
  t: number
  activo: boolean
}

export const crearBurbujas: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelBurbujas = nivelBurbujas(1)
  let lados: LadoMano[] = ['derecha']
  let umbral = UMBRAL_EXTENSION_DEFECTO
  let ref = referenciasFlexion(null)
  let limite: Caja3 | null = null
  let limiteTxt: string | null = null
  let aspecto = 0.75

  const agregado = new AgregadoBurbujas()
  let contador = 0
  let reloj = 0
  let anim = 0
  let fin = false
  const burbujas: Burbuja[] = []
  /** Visuales libres para burbujas nuevas (se crean al montar, uno por burbuja simultánea). */
  const libres: VisualBurbuja[] = []
  let esperaMs = 0
  let nObjetivos = 0
  let factorActual = 0
  let cajaActual: Caja3 | null = null
  let avisoHasta = -Infinity
  let ultimoTiempoS: number | null = null
  const rng = () => Math.random()

  const rastro: Record<LadoMano, AlcanceMano> = { derecha: new AlcanceMano(), izquierda: new AlcanceMano() }
  const ext: Partial<Record<LadoMano, number>> = {}
  /** Número de la burbuja que toca cada mano (null = ninguna). */
  const dentro: Partial<Record<LadoMano, number | null>> = {}
  const palmas: Partial<Record<LadoMano, V3>> = {}

  // Escena
  const grupo = new THREE.Group()
  const materiales: THREE.Material[] = []
  const geometrias: THREE.BufferGeometry[] = []
  const texturas: THREE.Texture[] = []
  const efectos: Efecto[] = []
  const recursos: Recursos = { materiales, geometrias, texturas }
  let base: BaseBurbujas
  /** Aviso fijo a la cámara si la mano toca la burbuja sin abrirse lo suficiente (assets/burbujas/aviso.ts). */
  let aviso: ReturnType<typeof crearAvisoManoAbierta> | null = null
  const fijo = new THREE.Group()

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && contador >= ctx.meta

  function crearVisuales(n: number) {
    for (let i = 0; i < n; i++) {
      const v = crearBurbujaObjetivo(recursos, base)
      grupo.add(v.grupo)
      libres.push(v)
    }
  }

  function crearEfectos() {
    const geoGota = geometria(recursos, new THREE.SphereGeometry(0.05, 8, 6))
    const tMas = textura(recursos, texturaMasUno())
    for (let i = 0; i < N_EFECTOS; i++) {
      const e = crearEfectoReventar(recursos, geoGota, tMas, N_GOTAS)
      grupo.add(...e.gotas, e.mas)
      efectos.push({ ...e, centro: new THREE.Vector3(), t: 0, activo: false })
    }
  }

  function lanzarEfecto(p: V3, radio: number) {
    const e = efectos.find((x) => !x.activo) ?? efectos[0]
    e.activo = true
    e.t = 0
    e.centro.set(p.x, p.y, p.z)
    e.gotas.forEach((g) => (g.visible = true))
    e.mas.visible = true
    void radio
  }

  function animarEfectos(dtMs: number, radio: number) {
    for (const e of efectos) {
      if (!e.activo) continue
      e.t += dtMs
      const u = Math.min(1, e.t / POP_MS)
      const salida = 1 - (1 - u) ** 3
      e.gotas.forEach((g, i) => {
        const a = (i / N_GOTAS) * Math.PI * 2
        const r = radio * (0.8 + 1.3 * salida)
        g.position.set(e.centro.x + Math.cos(a) * r, e.centro.y + Math.sin(a) * r * 0.9, e.centro.z + 0.1)
        g.scale.setScalar(1 - 0.6 * u)
      })
      e.matGota.opacity = 1 - u
      e.mas.position.set(e.centro.x, e.centro.y + 0.2 + 0.5 * salida, e.centro.z + 0.3)
      e.matMas.opacity = Math.min(1, u * 8) * (1 - Math.max(0, (u - 0.55) / 0.45))
      if (u >= 1) {
        e.activo = false
        e.gotas.forEach((g) => (g.visible = false))
        e.mas.visible = false
      }
    }
  }

  const palmaVisible = (l: LadoMano) => (ctx?.manos.visible(l) ? palmas[l] : undefined)
  const ladoDe = (numero: number) => lados[(numero - 1) % lados.length]

  /** Centro de la zona de aparición: el reposo de la mano que toca el turno (o su posición actual / el centro). */
  function centroDeZona(lado: LadoMano): V3 | null {
    const r = rastro[lado].reposo.palma
    if (r) return r
    const p = palmaVisible(lado)
    if (p) return p
    if (lados.length > 1) return { ...REPOSO_DEFECTO, x: lado === 'derecha' ? 0.8 : -0.8 }
    return null
  }

  /** Agrega una burbuja (tamaño al azar) lejos de las otras y de las palmas. */
  function nuevaBurbuja() {
    const c = ctx
    const visual = libres.pop()
    if (!c || !visual) return
    const numero = nObjetivos + 1
    const lado = ladoDe(numero)
    factorActual = factorZona(contador, nivel.zonaMax)
    let caja = zonaDeAparicion(centroDeZona(lado), factorActual, limite)
    // Con mano 'ambas' cada burbuja cae del lado de la mano de su turno.
    if (lados.length > 1) {
      const lo = lado === 'derecha' ? Math.max(caja.x[0], 0.1) : caja.x[0]
      const hi = lado === 'derecha' ? caja.x[1] : Math.min(caja.x[1], -0.1)
      if (hi > lo) caja = { ...caja, x: [lo, hi] }
    }
    const radio = radioBurbuja(nivel, rng)
    const evitar: V3[] = burbujas.map((b) => b.pos)
    for (const l of LADOS) {
      const p = palmaVisible(l)
      if (p) evitar.push(p)
    }
    const separacion = radio + Math.max(radio, ...burbujas.map((b) => b.radio)) + HOLGURA_TOQUE + 0.1
    const pos = sortearPosicion(caja, rng, evitar, separacion)
    burbujas.push({
      numero,
      lado,
      pos,
      vel: velocidadAleatoria(nivel.velocidad, rng),
      caja,
      radio,
      t0: reloj,
      visual,
      toque: { derecha: toqueInicial(), izquierda: toqueInicial() },
      armado: { derecha: false, izquierda: false },
    })
    cajaActual = caja
    nObjetivos = numero
    c.registrar('objetivo_mostrado', {
      mano: lado,
      objeto: 'burbuja',
      datos: { x: rnd(pos.x), y: rnd(pos.y), z: rnd(pos.z), celda: celdaDe(pos), radio: rnd(radio), vidaMs: nivel.vidaMs, zonaPct: Math.round(factorActual * 100), numero, enEscena: burbujas.length },
    })
  }

  function quitar(b: Burbuja) {
    burbujas.splice(burbujas.indexOf(b), 1)
    b.visual.grupo.visible = false
    libres.push(b.visual)
    esperaMs = ESPERA_SIGUIENTE_MS
  }

  function reventar(b: Burbuja, lado: LadoMano, extension: number) {
    const c = ctx
    if (!c) return
    const tiempoMs = Math.max(1, reloj - b.t0)
    const celda = celdaDe(b.pos)
    // Alcance al tocar la burbuja: la única fuente de la métrica "alcance máximo".
    const alcance = rastro[lado].actual ?? 0
    agregado.reventada({ mano: lado, extension, tiempoMs, alcanceCm: alcance, celda, numero: b.numero })
    contador++
    ultimoTiempoS = tiempoMs / 1000
    c.registrar('reventada', { mano: lado, objeto: 'burbuja', datos: { extension: Math.round(extension), tiempoMs: Math.round(tiempoMs), alcanceCm: rnd(alcance, 1), celda, numero: b.numero, radio: rnd(b.radio) } })
    lanzarEfecto(b.pos, b.radio)
    quitar(b)
    if (metaAlcanzada()) {
      fin = true
      for (const x of [...burbujas]) quitar(x)
    }
  }

  function expirar(b: Burbuja) {
    const c = ctx
    if (!c) return
    agregado.agotada(b.numero)
    c.registrar('expirada', { mano: b.lado, objeto: 'burbuja', datos: { tiempoMs: Math.round(reloj - b.t0), celda: celdaDe(b.pos), numero: b.numero } })
    quitar(b)
  }

  function dibujarBurbuja(b: Burbuja) {
    const t = b.visual
    t.grupo.visible = true
    const edad = reloj - b.t0
    const entra = Math.min(1, edad / 260)
    const escala = b.radio * (1 - (1 - entra) ** 3)
    t.grupo.position.set(b.pos.x, b.pos.y + 0.015 * Math.sin(anim * 2.4 + b.numero), b.pos.z)
    t.esfera.scale.setScalar(Math.max(0.001, escala))
    // Contacto: verde si la mano está abierta, rojo si no.
    let color = COLOR_ACENTO
    const adentro = LADOS.filter((l) => dentro[l] === b.numero && b.armado[l])
    if (adentro.length) color = adentro.some((l) => (ext[l] ?? 0) >= umbral) ? COLOR_OK : COLOR_AVISO
    const latido = 0.5 + 0.5 * Math.sin(anim * 4 + b.numero)
    const restante = nivel.vidaMs > 0 ? Math.max(0, 1 - edad / nivel.vidaMs) : 1
    const urgente = nivel.vidaMs > 0 && restante < 0.3
    const parpadeo = urgente ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(anim * 18)) : 1
    t.halo.scale.setScalar(escala * (2.7 + 0.25 * latido))
    ;(t.halo.material as THREE.SpriteMaterial).color.setHex(color)
    ;(t.halo.material as THREE.SpriteMaterial).opacity = 0.65 * parpadeo
    t.matEsfera.emissive.setHex(color === COLOR_ACENTO ? tono('amarillo', 0.35) : color === COLOR_OK ? tono('menta', 0.35) : tono('rojo', 0.35))
    // Aro: con vida limitada se achica hacia la burbuja a medida que se agota.
    t.aro.visible = nivel.vidaMs > 0
    if (t.aro.visible) {
      t.aro.scale.setScalar(escala * 2 * (1.08 + 0.55 * restante))
      ;(t.aro.material as THREE.SpriteMaterial).color.setHex(urgente ? COLOR_AVISO : NEUTRO)
      ;(t.aro.material as THREE.SpriteMaterial).opacity = 0.8
    }
  }

  function dibujarBurbujas() {
    for (const b of burbujas) dibujarBurbuja(b)
    // Aviso solo si una mano toca una burbuja sin estar lo bastante abierta para reventarla.
    const cerrada = LADOS.some((l) => {
      const b = burbujas.find((x) => x.numero === dentro[l])
      return !!b && b.armado[l] && (ext[l] ?? 0) < umbral
    })
    aviso?.mostrar(cerrada)
  }

  function depuracion(): EstadoBurbujasDepuracion {
    const o = burbujas[0]
    return {
      contador,
      meta: ctx?.meta ?? 0,
      objetivo: o ? { x: o.pos.x, y: o.pos.y, z: o.pos.z, radio: o.radio, celda: celdaDe(o.pos), edadMs: reloj - o.t0, vidaMs: nivel.vidaMs } : null,
      burbujas: burbujas.map((b) => ({ numero: b.numero, x: b.pos.x, y: b.pos.y, z: b.pos.z, radio: b.radio, edadMs: reloj - b.t0 })),
      simultaneas: nivel.simultaneas,
      umbral,
      extension: { ...ext },
      dentro: Object.fromEntries(LADOS.map((l) => [l, dentro[l] != null])),
      palma: { ...palmas },
      reposoListo: { derecha: rastro.derecha.reposo.listo, izquierda: rastro.izquierda.reposo.listo },
      caja: cajaActual,
      zonaPct: Math.round(factorActual * 100),
      limiteZona: limiteTxt,
      intentosCerrados: agregado.intentosCerrados,
      expiradas: agregado.expiradas,
      alcanceMax: agregado.alcanceMax,
      lados,
    }
  }

  const extPrincipal = (): number | null => {
    const p = ctx?.manoPrincipal()
    if (p && ext[p] != null && ctx?.manos.visible(p)) return ext[p] as number
    for (const l of lados) if (ext[l] != null && ctx?.manos.visible(l)) return ext[l] as number
    return null
  }

  return {
    id: 'atrapa-burbujas',
    nombre: 'Atrapa burbujas',
    gestos: ['Alcance', 'Extensión'],
    miniatura: 'burbujas',
    niveles,
    meta: { etiqueta: 'Burbujas', unidad: 'burbujas', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['objetivo_mostrado', 'reventada', 'intento_cerrado', 'expirada'],
    metricasVivo: [
      { id: 'extension', nombre: 'Extensión de dedos', unidad: '%', formula: 'promedio de la flexión MCP+PIP de los cuatro dedos, normalizado entre el puño y la mano abierta de la calibración (100 % = mano abierta)', aprox: true, mejor: 'mayor' },
      { id: 'alcance', nombre: 'Alcance máximo', unidad: 'cm', formula: 'mayor desplazamiento de la muñeca, desde su posición de reposo, medido al reventar una burbuja (solo las manos de la sesión; el reposo se vuelve a medir si la mano se pierde y reaparece)', aprox: true, mejor: 'mayor' },
      { id: 'tiempoBurbuja', nombre: 'Tiempo por burbuja', unidad: 's', formula: 'tiempo desde que aparece la burbuja objetivo hasta que se revienta, de la última (incluye la animación de entrada y los intentos con la mano sin abrir)', mejor: 'menor' },
    ],
    metricasResumen: [
      { id: 'extensionMedia', nombre: 'Extensión de dedos al tocar', unidad: '%', formula: 'promedio de la extensión de los cuatro dedos (MCP+PIP, normalizada entre el puño y la mano abierta) en cada burbuja reventada', aprox: true, mejor: 'mayor', corto: 'Extensión al tocar' },
      { id: 'alcanceMax', nombre: 'Alcance máximo', unidad: 'cm', formula: 'mayor desplazamiento de la muñeca desde su posición de reposo (aprox., cm), medido solo al reventar una burbuja y solo con las manos de la sesión', aprox: true, mejor: 'mayor' },
      { id: 'tiempoBurbuja', nombre: 'Tiempo por burbuja', unidad: 's', formula: 'promedio de (burbuja reventada − burbuja mostrada); incluye la animación de entrada (~0,3 s), el sostén de 0,12 s y los intentos con la mano sin abrir', decimales: 1, mejor: 'menor', corto: 'Por burbuja' },
      { id: 'alcanceMaxDerecha', nombre: 'Alcance máximo, mano derecha', unidad: 'cm', formula: 'mayor desplazamiento de la muñeca derecha desde su reposo al reventar una burbuja (aprox., cm)', aprox: true, mejor: 'mayor', corto: 'Alcance derecha', tarjeta: false },
      { id: 'alcanceMaxIzquierda', nombre: 'Alcance máximo, mano izquierda', unidad: 'cm', formula: 'mayor desplazamiento de la muñeca izquierda desde su reposo al reventar una burbuja (aprox., cm)', aprox: true, mejor: 'mayor', corto: 'Alcance izquierda', tarjeta: false },
      { id: 'burbujas', nombre: 'Burbujas reventadas', unidad: '', formula: "eventos 'reventada'", mejor: 'mayor' },
      { id: 'intentosCerrados', nombre: 'Intentos con la mano sin abrir', unidad: '', formula: "eventos 'intento_cerrado' (la palma llegó a la burbuja con los dedos bajo el umbral de extensión)", mejor: 'menor' },
      { id: 'expiradas', nombre: 'Burbujas que se agotaron', unidad: '', formula: "eventos 'expirada' (se acabó la vida de la burbuja)", mejor: 'menor' },
      { id: 'extensionMin', nombre: 'Extensión mínima al tocar', unidad: '%', formula: 'menor extensión con la que se reventó una burbuja', aprox: true, mejor: 'mayor', tarjeta: false },
      { id: 'precision', nombre: 'Aciertos', unidad: '%', formula: 'reventadas / (reventadas + burbujas con intento con la mano sin abrir o agotadas que no se reventaron); un intento seguido de reventar la misma burbuja no cuenta como fallo', mejor: 'mayor', tarjeta: false },
      { id: 'zonasDerechaPct', nombre: 'Zonas alcanzadas, mano derecha', unidad: '%', formula: 'celdas de la cuadrícula 5×3 (ancho × altura) donde la mano derecha tocó una burbuja, sobre 15', mejor: 'mayor', tarjeta: false },
      { id: 'zonasIzquierdaPct', nombre: 'Zonas alcanzadas, mano izquierda', unidad: '%', formula: 'celdas de la cuadrícula 5×3 (ancho × altura) donde la mano izquierda tocó una burbuja, sobre 15', mejor: 'mayor', tarjeta: false },
      { id: 'zonasDerecha', nombre: 'Mapa de zonas, mano derecha', unidad: '', formula: 'máscara de bits de la cuadrícula 5×3 (bit = fila × 5 + columna; fila 0 = abajo, columna 0 = izquierda de la pantalla)', tarjeta: false },
      { id: 'zonasIzquierda', nombre: 'Mapa de zonas, mano izquierda', unidad: '', formula: 'máscara de bits de la cuadrícula 5×3 (bit = fila × 5 + columna; fila 0 = abajo, columna 0 = izquierda de la pantalla)', tarjeta: false },
    ],
    usaFisica: false,
    pista: 'Abre bien la mano y toca las burbujas amarillas',
    textoReiniciar: 'Reiniciar',

    montar(c) {
      ctx = c
      nivel = nivelBurbujas(c.parametros.nivel)
      const mano = c.parametros.mano
      lados = mano === 'ambas' ? [...LADOS] : [mano === 'izquierda' ? 'izquierda' : 'derecha']
      // Opciones del plan que NO están en ParametrosSesion ni en el editor de planes (P2) todavía: si algún día llegan, ya
      // funcionan; hoy rigen los valores por defecto (ver registro-P3.md).
      const extra = c.parametros as unknown as { zona?: string | null; umbralExtensionPct?: number | null }
      limiteTxt = extra.zona ?? null
      limite = limiteDeZona(limiteTxt)
      const u = Number(extra.umbralExtensionPct)
      umbral = Number.isFinite(u) && u >= 40 && u <= 100 ? u : UMBRAL_EXTENSION_DEFECTO
      ref = referenciasFlexion(c.calibracion?.rangoAbrirCerrar)
      const f = c.fuente.ultimo
      if (f && f.ancho > 0 && f.alto > 0) aspecto = f.alto / f.ancho

      // Sin mesa: las burbujas flotan sobre el fondo (se repone al desmontar).
      c.mesa.objeto.visible = false
      base = crearBaseBurbujas(recursos)
      crearVisuales(nivel.simultaneas)
      crearEfectos()
      c.escena.add(grupo)
      // Aviso bajo la barra de tiempo, fijo a la cámara (como las luces de Pinza fina).
      aviso = crearAvisoManoAbierta(recursos)
      aviso.sprite.scale.multiplyScalar(1.7)
      fijo.position.set(0, 0.92, -5)
      fijo.add(aviso.sprite)
      c.camara.add(fijo)
      c.escena.add(c.camara)

      // La primera burbuja espera a conocer el reposo de la mano (1 s con la mano a la vista), máximo ESPERA_INICIAL_MS.
      esperaMs = 0
      dibujarBurbujas()
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      const dtMs = dt * 1000
      reloj += dtMs
      anim += dt

      // Medidas por mano: extensión, palma, reposo y alcance. Solo las manos de la sesión (`lados`): la otra se ignora.
      const vistas = new Set<LadoMano>()
      for (const m of manos) {
        const lado = m.lado
        if (!lados.includes(lado) || vistas.has(lado)) continue
        const med = c.medidas(lado)
        if (!med || !c.manos.visible(lado)) continue
        vistas.add(lado)
        const nueva = extensionPct(med.flexion, ref)
        ext[lado] = ext[lado] == null ? nueva : ext[lado]! * 0.4 + nueva * 0.6
        const p = c.manos.palma(lado)
        palmas[lado] = { x: p.x, y: p.y, z: p.z }
        rastro[lado].vista(dtMs, palmas[lado]!, { x: med.muneca.x, y: med.muneca.y, distanciaCm: med.distanciaCm }, aspecto)
      }
      for (const l of LADOS) {
        if (!vistas.has(l)) {
          delete ext[l]
          delete palmas[l]
          dentro[l] = null
          for (const b of burbujas) b.toque[l] = toqueInicial()
          rastro[l].perdida(dtMs)
        }
      }

      if (!fin) {
        // Aparecen de a una hasta `simultaneas`. La primera espera el reposo de la mano (o se rinde pasado un rato).
        esperaMs -= dtMs
        if (burbujas.length < nivel.simultaneas && esperaMs <= 0) {
          if (nObjetivos > 0 || rastro[ladoDe(1)].reposo.listo || reloj >= ESPERA_INICIAL_MS) {
            nuevaBurbuja()
            esperaMs = ESPERA_SIGUIENTE_MS
          }
        }
        // Sin ninguna mano de la sesión a la vista la vida de las burbujas no corre (no expiran por el seguimiento).
        for (const b of burbujas) b.t0 = nacimientoBurbuja(b.t0, dtMs, vistas.size > 0)
        if (nivel.velocidad > 0)
          for (const b of burbujas) {
            const r = moverEnCaja(b.pos, b.vel, dt, b.caja)
            b.pos = r.p
            b.vel = r.v
          }
        // Cada mano toca a lo más una burbuja: la más cercana de las que alcanza.
        for (const l of vistas) {
          const palma = palmas[l]!
          let tocada: Burbuja | null = null
          for (const b of burbujas) {
            const toca = tocaBurbuja(palma, b.pos, b.radio)
            if (!toca) {
              b.armado[l] = true
              b.toque[l] = toqueInicial()
            } else if (!tocada || Math.hypot(palma.x - b.pos.x, palma.y - b.pos.y, palma.z - b.pos.z) < Math.hypot(palma.x - tocada.pos.x, palma.y - tocada.pos.y, palma.z - tocada.pos.z)) tocada = b
          }
          dentro[l] = tocada?.numero ?? null
          if (!tocada) continue
          const r = pasoToque(tocada.toque[l], tocada.armado[l], ext[l] ?? 0, umbral, dtMs)
          tocada.toque[l] = r.estado
          if (r.evento === 'revienta') {
            reventar(tocada, l, ext[l] ?? 0)
            dentro[l] = null
            if (fin) break
          } else if (r.evento === 'intento_cerrado') {
            agregado.intentoCerrado(l, celdaDe(tocada.pos), tocada.numero)
            avisoHasta = reloj + AVISO_MS
            c.registrar('intento_cerrado', { mano: l, objeto: 'burbuja', datos: { extensionMax: Math.round(r.estado.extMax), umbral, numero: tocada.numero } })
          }
        }
        for (const b of [...burbujas]) if (burbujaAgotada(reloj, b.t0, nivel.vidaMs)) expirar(b)
      }
      animarEfectos(dtMs, nivel.radio)
      dibujarBurbujas()
    },

    hud() {
      const c = ctx
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of LADOS) {
        if (!c?.medidas(l) || ext[l] == null) continue
        manos[l] = (ext[l] as number) >= umbral ? { texto: 'Abierta', tono: 'ok' } : { texto: 'Alcanzando', tono: 'acento' }
      }
      let pista: string | undefined
      if (fin) pista = '¡Muy bien! Reventaste todas las burbujas'
      else if (reloj < avisoHasta) pista = 'Abre más la mano para reventarla'
      const e = extPrincipal()
      return {
        contador,
        manos,
        pista,
        vivo: {
          extension: e == null ? null : Math.round(e),
          // Alcance máximo de la sesión: solo el de las burbujas reventadas (null hasta la primera).
          alcance: agregado.reventadas.length ? rnd(agregado.alcanceMax, 1) : null,
          tiempoBurbuja: ultimoTiempoS == null ? null : rnd(ultimoTiempoS, 1),
        },
      }
    },

    muestra() {
      const e = extPrincipal()
      const p = ctx?.manoPrincipal()
      const a = p && lados.includes(p) ? rastro[p].actual : null
      return { extension: e == null ? null : Math.round(e), alcanceCm: a == null ? null : rnd(a, 1) }
    },

    reiniciar() {
      if (fin || !ctx) return
      for (const b of [...burbujas]) quitar(b)
      esperaMs = 0
    },

    resumen() {
      return agregado.resumen()
    },

    desmontar() {
      const c = ctx
      if (c) {
        c.mesa.objeto.visible = true
        c.escena.remove(grupo)
        c.camara.remove(fijo)
      }
      for (const m of materiales) m.dispose()
      for (const g of geometrias) g.dispose()
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
