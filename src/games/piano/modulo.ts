// Piano de dedos (F27, J6): independencia de dedos sin física, sobre la base común.
// Referencia: imagenes_juegos/06_piano_de_dedos.png y docs/referencia/prompts_juegos/J6_piano_de_dedos.md.
//
// Escena: cinco teclas de colores por mano, cada una bajo su dedo (pulgar naranja, índice morado, medio amarillo, anular
// verde, meñique azul); la mano virtual de la base queda sobre ellas. Caen notas del color de la tecla sobre una línea al
// fondo de las teclas; cuando la nota llega, hay que bajar SOLO ese dedo. La tecla se enciende y suena su nota (WebAudio).
// Botón de sonido (DOM, arriba a la derecha) para silenciar.
//
// Antes de empezar (y con "Volver a fijar el reposo"): 3 s con la mano quieta fijan la flexión MCP de reposo de cada dedo
// (logica.ts: CalibradorReposo); mientras tanto las teclas siguen a la mano y al terminar quedan fijas bajo sus dedos.
// Dedo abajo = flexión MCP − reposo del dedo > umbral (logica.ts: DetectorMano). Aciertos, equivocados e independencia: Juez.
//
// Eventos: nota_mostrada {dedo, posicion}, acierto {dedo, desfase, independencia}, dedo_equivocado {dedo, pedido, simultaneo},
// nota_perdida {dedo}. El contador es notas ACERTADAS / total (la meta del plan): una nota perdida no cuenta para la meta.
// La partitura trae tantas notas como la meta; al resolverse todas (acertadas o perdidas) el juego termina, y la meta
// queda cumplida solo si todas fueron aciertos. Sin meta, práctica libre.
import * as THREE from 'three'
import { crearGeoTecla, crearNotas, crearTeclado } from '../assets/piano/tecla'
import type { Recursos } from '../assets/recursos'
import type { LadoMano } from '../../domain/types'
import type { ManoSeguida } from '../../tracking/tipos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import { SonidoPiano, accionToqueSonido, botonSilenciado } from './audio'
import {
  AgregadoPiano,
  CalibradorReposo,
  COLOR_DEDO,
  DEDOS_PIANO,
  DetectorMano,
  ESPERA_FIN_MS,
  Juez,
  NIVELES_PIANO,
  NOMBRE_DEDO,
  REPOSO_MS,
  capital,
  flexionMcp,
  inicioPausa,
  ladosDelNivel,
  nivelPiano,
  relojPartitura,
  separarTeclas,
  type Dedo,
  type EventoPiano,
  type Flexiones,
  type Nota,
  type NivelPiano,
} from './logica'
import './piano.css'
import { KUWU, kuwuAlfa, fuenteKuwu, kuwuNum } from '../../ui/paleta'

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const PUNTA: Record<Dedo, number> = { pulgar: 4, indice: 8, medio: 12, anular: 16, menique: 20 }

const ANCHO_TECLA = 0.22
const SEPARACION_TECLAS = 0.25
const HUECO_MAX_TECLAS = 0.36
const ALTO_TECLA = 0.14
/** La línea de llegada de las notas queda este tanto detrás del fin de las teclas. */
const LINEA_ATRAS = 0.4
const Y_NOTA_ALTA = 1.7
const Y_NOTA_BASE = 0.16
/** Tiempo que una nota resuelta sigue a la vista (ms). */
const VIDA_RESUELTA_MS = 380
const POOL_NOTAS = 10
/** La tecla del dedo pedido late desde este tiempo antes de la línea (ms). */
const AVISO_TECLA_MS = 900

const COLOR_OK = kuwuNum('menta')
const COLOR_PERDIDA = kuwuNum('control')

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_PIANO[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

type Fase = 'calibrando' | 'jugando' | 'fin'

interface Diseno {
  x: Record<Dedo, number>
  zFin: number
  zIni: number
  fijo: boolean
}

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoPianoDepuracion {
  fase: Fase
  contador: number
  meta: number
  lados: LadoMano[]
  /** ms de juego del reloj del piano (las notas se miden contra este reloj). */
  reloj: number
  /** Progreso 0..1 de la quietud del reposo por mano. */
  progresoReposo: Partial<Record<LadoMano, number>>
  reposoListo: Partial<Record<LadoMano, boolean>>
  /** Flexión MCP de reposo fijada por mano (grados). */
  reposo: Partial<Record<LadoMano, Flexiones | null>>
  /** Dedos abajo ahora, por mano. */
  abajo: Partial<Record<LadoMano, Dedo[]>>
  /** Notas abiertas (ya mostradas, sin resolver), con cuánto falta para la línea (ms; negativo = pasó). */
  notas: { i: number; lado: LadoMano; dedo: Dedo; faltaMs: number }[]
  /** Nota cuya ventana está abierta por mano. */
  activa: Partial<Record<LadoMano, { dedo: Dedo; faltaMs: number } | null>>
  ventanaMs: number
  aciertos: number
  perdidas: number
  equivocados: number
  independencia: number | null
  desfaseMedio: number | null
  silencio: boolean
}

function lienzoAviso(): { lienzo: HTMLCanvasElement; tex: THREE.CanvasTexture } {
  const lienzo = document.createElement('canvas')
  lienzo.width = 560
  lienzo.height = 96
  const tex = new THREE.CanvasTexture(lienzo)
  tex.colorSpace = THREE.SRGBColorSpace
  return { lienzo, tex }
}

export const crearPiano: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelPiano = nivelPiano(1)
  let lados: LadoMano[] = ['derecha']
  let total = 0

  const agregado = new AgregadoPiano()
  const sonido = new SonidoPiano()
  const rng = () => Math.random()
  let juez: Juez | null = null
  let fase: Fase = 'calibrando'
  let reloj = 0
  let pausaDesde: number | null = null
  /** ms desde que se resolvió la última nota (fase 'fin'). */
  let finMs = 0
  let ultimasManos: ManoSeguida[] | null = null

  const detectores: Record<LadoMano, DetectorMano> = { derecha: new DetectorMano(), izquierda: new DetectorMano() }
  const calibradores: Record<LadoMano, CalibradorReposo> = { derecha: new CalibradorReposo(), izquierda: new CalibradorReposo() }
  const listo: Record<LadoMano, boolean> = { derecha: false, izquierda: false }
  const progreso: Record<LadoMano, number> = { derecha: 0, izquierda: 0 }
  const vista: Record<LadoMano, boolean> = { derecha: false, izquierda: false }
  const flexActual: Record<LadoMano, Flexiones | null> = { derecha: null, izquierda: null }
  const abajoAntes: Record<LadoMano, Record<Dedo, boolean>> = {
    derecha: { pulgar: false, indice: false, medio: false, anular: false, menique: false },
    izquierda: { pulgar: false, indice: false, medio: false, anular: false, menique: false },
  }
  const brillo: Record<LadoMano, Record<Dedo, number>> = {
    derecha: { pulgar: 0, indice: 0, medio: 0, anular: 0, menique: 0 },
    izquierda: { pulgar: 0, indice: 0, medio: 0, anular: 0, menique: 0 },
  }
  const resueltaEn = new Map<number, number>()
  let anim = 0

  // ── Escena ──
  const grupo = new THREE.Group()
  const materiales: THREE.Material[] = []
  const geometrias: THREE.BufferGeometry[] = []
  const texturas: THREE.Texture[] = []
  const recursos: Recursos = { materiales, geometrias, texturas }
  const diseno: Record<LadoMano, Diseno> = { derecha: disenoPorDefecto('derecha', 1), izquierda: disenoPorDefecto('izquierda', 1) }
  const teclas: Record<LadoMano, Record<Dedo, THREE.Mesh> | null> = { derecha: null, izquierda: null }
  const lineas: Partial<Record<LadoMano, THREE.Mesh>> = {}
  const notasMalla: { malla: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = []
  const aviso = { grupo: new THREE.Group(), lienzo: null as HTMLCanvasElement | null, tex: null as THREE.CanvasTexture | null, firma: '' }
  let botonSonido: HTMLButtonElement | null = null

  function disenoPorDefecto(lado: LadoMano, nLados: number): Diseno {
    const centro = nLados > 1 ? (lado === 'derecha' ? 0.95 : -0.95) : 0
    const signo = lado === 'derecha' ? 1 : -1 // el pulgar de la derecha cae a la izquierda de la pantalla
    const x = {} as Record<Dedo, number>
    DEDOS_PIANO.forEach((d, i) => (x[d] = centro + (i - 2) * SEPARACION_TECLAS * signo))
    return { x, zFin: -0.95, zIni: 0.3, fijo: false }
  }

  const registrar: ContextoJuego['registrar'] = (t, o) => ctx?.registrar(t, o)
  const r0 = (v: number) => Math.round(v)

  // ── Reglas → eventos ──
  function aplicar(ev: EventoPiano) {
    agregado.evento(ev)
    if (ev.tipo === 'nota_mostrada') {
      registrar('nota_mostrada', { mano: ev.nota.lado, objeto: ev.nota.dedo, datos: { dedo: ev.nota.dedo, posicion: ev.nota.i + 1, de: total || null, ritmoMs: nivel.intervaloMs } })
    } else if (ev.tipo === 'acierto') {
      registrar('acierto', { mano: ev.nota.lado, objeto: ev.nota.dedo, datos: { dedo: ev.nota.dedo, desfase: r0(ev.desfaseMs), independencia: r0(ev.independencia), posicion: ev.nota.i + 1 } })
    } else if (ev.tipo === 'dedo_equivocado') {
      registrar('dedo_equivocado', { mano: ev.nota.lado, objeto: ev.dedo, datos: { dedo: ev.dedo, pedido: ev.nota.dedo, simultaneo: ev.simultaneo, posicion: ev.nota.i + 1 } })
    } else if (ev.tipo === 'nota_perdida') {
      registrar('nota_perdida', { mano: ev.nota.lado, objeto: ev.nota.dedo, datos: { dedo: ev.nota.dedo, posicion: ev.nota.i + 1 } })
    }
  }

  /** Contra la meta cuentan solo los aciertos (las notas perdidas resuelven la partitura, no la meta). */
  const contador = () => juez?.aciertos ?? 0
  /** Ya no quedan notas por resolver: el juego terminó, se haya cumplido la meta o no. */
  const partituraCompleta = () => !!ctx && !!juez?.completa

  // ── Reposo ──
  function empezarReposo(desde: number) {
    fase = 'calibrando'
    pausaDesde = inicioPausa(pausaDesde, desde)
    for (const l of lados) {
      listo[l] = false
      progreso[l] = 0
      calibradores[l].reiniciar()
      diseno[l].fijo = false
    }
  }

  function terminarReposo() {
    if (!juez) juez = new Juez(nivel, lados, rng, total, reloj)
    else juez.atrasar(reloj - (pausaDesde ?? reloj))
    pausaDesde = null
    fase = 'jugando'
  }

  // ── Teclas que siguen a la mano mientras no están fijas ──
  function seguirMano(lado: LadoMano) {
    const c = ctx
    const d = diseno[lado]
    if (!c || d.fijo || !c.manos.visible(lado)) return
    const xs = {} as Record<Dedo, number>
    let zMin = Infinity
    for (const f of DEDOS_PIANO) {
      const p = c.manos.punto(lado, PUNTA[f])
      xs[f] = p.x
      zMin = Math.min(zMin, p.z)
    }
    const sep = separarTeclas(xs, SEPARACION_TECLAS, HUECO_MAX_TECLAS)
    const palma = c.manos.punto(lado, 0)
    const k = 0.35
    for (const f of DEDOS_PIANO) d.x[f] += (sep[f] - d.x[f]) * k
    d.zFin += (zMin - 0.14 - d.zFin) * k
    d.zIni += (palma.z + 0.2 - d.zIni) * k
    if (d.zIni - d.zFin < 0.9) d.zIni = d.zFin + 0.9
  }

  function crearTeclas(c: ContextoJuego) {
    const geoTecla = crearGeoTecla(recursos)
    for (const lado of lados) {
      const { teclas: por, linea } = crearTeclado(recursos, geoTecla, DEDOS_PIANO, COLOR_DEDO)
      grupo.add(...DEDOS_PIANO.map((f) => por[f]), linea)
      teclas[lado] = por
      lineas[lado] = linea
    }
    for (const nota of crearNotas(recursos, ANCHO_TECLA, POOL_NOTAS)) {
      grupo.add(nota.malla)
      notasMalla.push(nota)
    }
    c.escena.add(grupo)
  }

  function dibujarAviso(texto: string, frac: number | null) {
    const L = aviso.lienzo
    const tex = aviso.tex
    if (!L || !tex) return
    const firma = `${texto}|${frac == null ? '' : Math.round(frac * 40)}`
    if (firma === aviso.firma) return
    aviso.firma = firma
    const g = L.getContext('2d')!
    const W = L.width
    const H = L.height
    g.clearRect(0, 0, W, H)
    g.fillStyle = kuwuAlfa('noche', 0.92)
    g.beginPath()
    g.roundRect(4, 4, W - 8, H - 8, 26)
    g.fill()
    g.fillStyle = KUWU.crema
    g.font = fuenteKuwu(800, 27)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(texto, W / 2, frac == null ? H / 2 : 33)
    if (frac != null) {
      g.fillStyle = kuwuAlfa('crema', 0.18)
      g.beginPath()
      g.roundRect(40, 62, W - 80, 14, 7)
      g.fill()
      g.fillStyle = KUWU.amarillo
      g.beginPath()
      g.roundRect(40, 62, Math.max(14, (W - 80) * frac), 14, 7)
      g.fill()
    }
    tex.needsUpdate = true
  }

  function textoAviso(): { texto: string; frac: number | null } | null {
    if (fase !== 'calibrando') return null
    const faltan = lados.filter((l) => !listo[l])
    if (faltan.some((l) => !vista[l])) return { texto: lados.length > 1 ? 'Muestra tus dos manos sobre las teclas' : 'Pon la mano sobre las teclas', frac: null }
    const p = Math.min(...faltan.map((l) => progreso[l]))
    const seg = Math.max(0, Math.ceil((1 - p) * (REPOSO_MS / 1000)))
    return { texto: `Mano quieta, fijando el reposo · ${seg} s`, frac: p }
  }

  // ── Dibujo por cuadro ──
  function dibujar(dt: number) {
    const c = ctx
    if (!c) return
    anim += dt
    for (const lado of lados) {
      const d = diseno[lado]
      const por = teclas[lado]
      const linea = lineas[lado]
      if (!por || !linea) continue
      const xs = DEDOS_PIANO.map((f) => d.x[f])
      const xMin = Math.min(...xs) - ANCHO_TECLA / 2
      const xMax = Math.max(...xs) + ANCHO_TECLA / 2
      const largo = Math.max(0.5, d.zIni - d.zFin)
      const proxima = fase === 'jugando' ? (juez?.proxima(lado) ?? null) : null
      for (const f of DEDOS_PIANO) {
        const m = por[f]
        brillo[lado][f] += ((detectores[lado].abajo[f] ? 1 : 0) - brillo[lado][f]) * Math.min(1, dt * 18)
        let pulso = 0
        if (proxima && proxima.dedo === f && reloj >= proxima.tMs - AVISO_TECLA_MS) pulso = 0.3 + 0.2 * Math.sin(anim * 11)
        const b = brillo[lado][f]
        const mat = m.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 0.12 + 0.85 * b + pulso
        m.scale.set(ANCHO_TECLA, ALTO_TECLA - 0.05 * b, largo)
        m.position.set(d.x[f], (ALTO_TECLA - 0.05 * b) / 2, (d.zIni + d.zFin) / 2)
      }
      linea.scale.set(xMax - xMin + 0.1, 0.012, 0.045)
      linea.position.set((xMin + xMax) / 2, 0.006, d.zFin - LINEA_ATRAS)
    }

    // Notas que caen
    let usadas = 0
    const j = juez
    if (j && fase !== 'calibrando') {
      for (const n of j.notas) {
        const fin = resueltaEn.get(n.i)
        if (n.estado !== 'pendiente' && fin == null) resueltaEn.set(n.i, reloj)
        const edad = fin != null ? reloj - fin : -1
        if (edad > VIDA_RESUELTA_MS) continue
        if (usadas >= notasMalla.length) break
        const { malla, mat } = notasMalla[usadas++]
        const d = diseno[n.lado]
        const u = Math.min(1, Math.max(0, (reloj - n.apareceMs) / nivel.caidaMs))
        const caida = u * u * 0.35 + u * 0.65 // cae acelerando un poco
        malla.visible = true
        malla.position.set(d.x[n.dedo], Y_NOTA_ALTA + (Y_NOTA_BASE - Y_NOTA_ALTA) * caida, d.zFin - LINEA_ATRAS)
        let escala = 1
        let opacidad = 1
        let color = COLOR_DEDO[n.dedo]
        if (n.estado === 'acierto') {
          const k = Math.max(0, edad) / VIDA_RESUELTA_MS
          escala = 1 + 0.5 * k
          opacidad = 1 - k
          color = COLOR_OK
        } else if (n.estado === 'perdida') {
          const k = Math.max(0, edad) / VIDA_RESUELTA_MS
          opacidad = 0.7 * (1 - k)
          color = COLOR_PERDIDA
        }
        malla.scale.set(escala, 1, escala)
        mat.color.setHex(color)
        mat.emissive.setHex(color)
        mat.opacity = opacidad
      }
    }
    for (let i = usadas; i < notasMalla.length; i++) notasMalla[i].malla.visible = false

    const a = textoAviso()
    aviso.grupo.visible = !!a
    if (a) dibujarAviso(a.texto, a.frac)
  }

  /** Refleja en el botón lo que realmente pasa: silenciado por el paciente o contexto de audio aún sin correr (iOS). */
  let firmaBoton = ''
  function ponerBoton() {
    const b = botonSonido
    if (!b) return
    const mudo = botonSilenciado(sonido.silencio, sonido.estado())
    const firma = mudo ? '1' : '0'
    if (firma === firmaBoton) return
    firmaBoton = firma
    b.setAttribute('aria-pressed', mudo ? 'true' : 'false')
    b.setAttribute('aria-label', mudo ? 'Activar el sonido' : 'Silenciar el sonido')
    b.title = mudo ? 'Activar el sonido' : 'Silenciar el sonido'
    b.textContent = mudo ? '🔇' : '🔊'
  }

  function crearBotonSonido() {
    if (typeof document === 'undefined') return
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'piano-silencio'
    b.setAttribute('data-testid', 'piano-silencio')
    b.addEventListener('click', () => {
      const a = accionToqueSonido(sonido.silencio, sonido.estado())
      if (a.silencio !== sonido.silencio) sonido.fijarSilencio(a.silencio)
      if (a.desbloquear) sonido.desbloquear() // dentro del toque: iOS solo deja reanudar el audio aquí
      firmaBoton = ''
      ponerBoton()
    })
    // Dentro de `.juego` (no en body): así queda bajo la pausa y el aviso de girar el teléfono.
    ;(document.querySelector('.juego') ?? document.body).appendChild(b)
    botonSonido = b
    firmaBoton = ''
    ponerBoton()
  }

  function depuracion(): EstadoPianoDepuracion {
    const abajo: Partial<Record<LadoMano, Dedo[]>> = {}
    const reposo: Partial<Record<LadoMano, Flexiones | null>> = {}
    const activa: Partial<Record<LadoMano, { dedo: Dedo; faltaMs: number } | null>> = {}
    const progresoReposo: Partial<Record<LadoMano, number>> = {}
    const reposoListo: Partial<Record<LadoMano, boolean>> = {}
    for (const l of lados) {
      abajo[l] = DEDOS_PIANO.filter((d) => detectores[l].abajo[d])
      reposo[l] = detectores[l].reposo ? { ...detectores[l].reposo } : null
      const n = juez?.activa(l, reloj) ?? null
      activa[l] = n ? { dedo: n.dedo, faltaMs: Math.round(n.tMs - reloj) } : null
      progresoReposo[l] = Math.round(progreso[l] * 100) / 100
      reposoListo[l] = listo[l]
    }
    return {
      fase,
      contador: contador(),
      meta: total,
      lados: [...lados],
      reloj: Math.round(reloj),
      progresoReposo,
      reposoListo,
      reposo,
      abajo,
      notas: (juez?.pendientes() ?? []).map((n: Nota) => ({ i: n.i, lado: n.lado, dedo: n.dedo, faltaMs: Math.round(n.tMs - reloj) })),
      activa,
      ventanaMs: nivel.ventanaMs,
      aciertos: agregado.aciertos,
      perdidas: agregado.perdidas,
      equivocados: agregado.equivocados,
      independencia: agregado.independencia(),
      desfaseMedio: agregado.desfaseMedio(),
      silencio: sonido.silencio,
    }
  }

  const FUENTE_DEDOS = DEDOS_PIANO.map((d) => d)

  return {
    id: 'piano-dedos',
    nombre: 'Piano de dedos',
    gestos: ['Independencia de dedos'],
    miniatura: 'piano',
    niveles,
    meta: { etiqueta: 'Notas', unidad: 'notas', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['nota_mostrada', 'acierto', 'dedo_equivocado', 'nota_perdida'],
    metricasVivo: [
      { id: 'independencia', nombre: 'Independencia de dedos', unidad: '%', formula: 'promedio de las últimas pulsaciones de 1 − (movimiento medio de los otros dedos / movimiento del dedo pedido)', aprox: true, mejor: 'mayor' },
      { id: 'aciertos', nombre: 'Aciertos', unidad: '', formula: "eventos 'acierto': solo el dedo pedido bajó, dentro de la ventana de la nota", mejor: 'mayor' },
      { id: 'desfase', nombre: 'Desfase', unidad: 'ms', formula: 'promedio de |inicio de la pulsación − llegada de la nota a la línea| de los aciertos; medido con la cámara (15–30 cuadros/s más la latencia del seguimiento), por eso es aproximado', aprox: true, mejor: 'menor' },
    ],
    metricasResumen: [
      { id: 'independencia', nombre: 'Independencia de dedos', unidad: '%', formula: 'promedio por pulsación del dedo pedido de 1 − (movimiento medio de los otros 4 dedos / movimiento del dedo pedido); bajar dos dedos a la vez la reduce', aprox: true, mejor: 'mayor', corto: 'Independencia' },
      { id: 'desfaseMedio', nombre: 'Desfase medio', unidad: 'ms', formula: 'promedio de |inicio de la pulsación − llegada de la nota a la línea| en los aciertos; medido con la cámara (15–30 cuadros/s más la latencia del seguimiento), por eso es aproximado', aprox: true, mejor: 'menor', tarjeta: true, corto: 'Desfase' },
      { id: 'aciertos', nombre: 'Aciertos', unidad: '', formula: "eventos 'acierto' (solo bajó el dedo pedido, dentro de la ventana)", mejor: 'mayor', tarjeta: true },
      { id: 'notasPerdidas', nombre: 'Notas perdidas', unidad: '', formula: "eventos 'nota_perdida' (terminó la ventana sin acierto)", mejor: 'menor', tarjeta: true, corto: 'Perdidas' },
      { id: 'dedosEquivocados', nombre: 'Dedos equivocados', unidad: '', formula: "eventos 'dedo_equivocado' (bajó un dedo que no era, o uno de más junto al pedido)", mejor: 'menor', tarjeta: true, corto: 'Equivocados' },
      ...FUENTE_DEDOS.map((d) => ({
        id: `independencia${capital(d)}`,
        nombre: `Independencia: ${NOMBRE_DEDO[d]}`,
        unidad: '%' as const,
        formula: `independencia promedio de las pulsaciones con el dedo ${NOMBRE_DEDO[d]} como pedido (incluye las que bajaron otro dedo a la vez)`,
        aprox: true,
        mejor: 'mayor' as const,
        tarjeta: false,
      })),
      ...FUENTE_DEDOS.map((d) => ({
        id: `errores${capital(d)}`,
        nombre: `Errores: ${NOMBRE_DEDO[d]}`,
        unidad: '' as const,
        formula: `notas del dedo ${NOMBRE_DEDO[d]} perdidas o con algún dedo equivocado (una vez por nota): indica qué dedo cuesta más`,
        mejor: 'menor' as const,
        tarjeta: false,
      })),
    ],
    usaFisica: false,
    pista: 'Baja solo el dedo de la tecla que se enciende',
    textoReiniciar: 'Fijar reposo',

    montar(c) {
      ctx = c
      nivel = nivelPiano(c.parametros.nivel)
      lados = ladosDelNivel(nivel, c.parametros.mano)
      total = c.meta > 0 ? c.meta : 0
      for (const l of lados) diseno[l] = disenoPorDefecto(l, lados.length)
      // Manos de frente sobre las teclas: grandes, casi planas y bajas.
      c.configurarManos({ x: [-1.9, 1.9], y: [0.22, 0.5], z: [-0.45, 0.45], escala: 11, inclinacionDeg: 72 })
      crearTeclas(c)

      const { lienzo, tex } = lienzoAviso()
      aviso.lienzo = lienzo
      aviso.tex = tex
      texturas.push(tex)
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
      materiales.push(mat)
      const s = new THREE.Sprite(mat)
      s.renderOrder = 10
      s.scale.set(2.9, 2.9 * (lienzo.height / lienzo.width), 1)
      aviso.grupo.position.set(0, 0.95, -5)
      aviso.grupo.add(s)
      c.camara.add(aviso.grupo)
      c.escena.add(c.camara)

      sonido.desbloquear() // crea el contexto de audio ya (en iOS queda suspendido hasta el toque del botón)
      crearBotonSonido()
      empezarReposo(0)
      dibujar(0)
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      // Sin ninguna mano del juego a la vista la partitura no corre (no se pierden notas por el seguimiento).
      reloj = relojPartitura(reloj, dt * 1000, lados.some((l) => manos.some((x) => x.lado === l)))
      if (fase === 'fin') finMs += dt * 1000
      const nuevo = manos !== ultimasManos
      ultimasManos = manos

      for (const l of lados) {
        const m = manos.find((x) => x.lado === l)
        vista[l] = !!m
        if (!m) {
          if (flexActual[l]) detectores[l].perder()
          flexActual[l] = null
        } else if (nuevo || !flexActual[l]) flexActual[l] = flexionMcp(m.worldLandmarks)
      }

      if (fase === 'calibrando') {
        for (const l of lados) {
          if (listo[l]) continue
          progreso[l] = calibradores[l].paso(flexActual[l], dt * 1000)
          const r = calibradores[l].reposo()
          if (r) {
            detectores[l].fijarReposo(r)
            listo[l] = true
            diseno[l].fijo = true
          } else seguirMano(l)
        }
        if (lados.every((l) => listo[l])) terminarReposo()
      } else if (fase === 'jugando' && juez) {
        for (const l of lados) {
          const f = flexActual[l]
          if (!f) continue
          const det = detectores[l]
          const p = det.paso(f, reloj)
          for (const d of DEDOS_PIANO) {
            if (det.abajo[d] && !abajoAntes[l][d]) sonido.tocar(d, l)
            abajoAntes[l][d] = det.abajo[d]
          }
          if (p) for (const ev of juez.pulsacion(l, p)) aplicar(ev)
        }
        for (const ev of juez.avanzar(reloj, (l) => detectores[l].fase === 'episodio')) aplicar(ev)
        if (partituraCompleta()) fase = 'fin'
      }
      ponerBoton()
      dibujar(dt)
    },

    reiniciar() {
      if (!ctx || fase === 'fin') return
      for (const l of lados) detectores[l].perder()
      empezarReposo(reloj)
    },

    hud() {
      const c = ctx
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of lados) {
        if (!c?.medidas(l)) continue
        if (fase === 'calibrando') manos[l] = listo[l] ? { texto: 'Lista', tono: 'ok' } : { texto: `Quieta ${Math.round(progreso[l] * 100)}%`, tono: 'acento' }
        else {
          const n = juez?.proxima(l)
          manos[l] = n ? { texto: mayuscula(NOMBRE_DEDO[n.dedo]), tono: 'acento' } : { texto: 'Lista', tono: 'ok' }
        }
      }
      let pista: string | undefined
      if (partituraCompleta()) pista = agregado.aciertos > 0 ? '¡Muy bien! Terminaste las notas' : 'Terminaste las notas'
      else if (fase === 'calibrando') pista = lados.length > 1 ? 'Deja las dos manos quietas sobre las teclas' : 'Deja la mano quieta sobre las teclas'
      const ind = agregado.independenciaReciente()
      const des = agregado.desfaseMedio()
      return {
        contador: contador(),
        manos,
        pista,
        // Se resolvieron todas las notas sin cumplir la meta: la base termina la sesión (con la meta cumplida termina sola).
        terminado: fase === 'fin' && contador() < total && finMs >= ESPERA_FIN_MS,
        vivo: {
          independencia: ind == null ? null : Math.round(ind),
          aciertos: agregado.aciertos,
          desfase: des == null ? null : Math.round(des),
        },
      }
    },

    muestra() {
      const ind = agregado.independenciaReciente()
      return { independencia: ind == null ? null : Math.round(ind), dedosAbajo: lados.reduce((s, l) => s + DEDOS_PIANO.filter((d) => detectores[l].abajo[d]).length, 0) }
    },

    resumen() {
      return agregado.resumen()
    },

    desmontar() {
      const c = ctx
      if (c) {
        c.escena.remove(grupo)
        c.camara.remove(aviso.grupo)
        c.escena.remove(c.camara)
      }
      botonSonido?.remove()
      botonSonido = null
      sonido.cerrar()
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
