// Honda (F39): el paciente toma una banda elástica con las dos manos frente a la cámara y carga una honda sobre la
// mesa. Estirar la banda tira de la bolsa hacia atrás; cuando la carga entra en la zona verde del nivel hay que
// sostenerla el tiempo del nivel, y al soltar sale la piedra: da en el blanco el tiro que llegó a la zona y la sostuvo;
// el que no llegó cae antes y el que pasó de largo sin sostener cae después.
//
// La medida es la del laboratorio de banda (src/banda/): largo entre los centros de las palmas con la escala 3D de
// cada mano, estiramiento sobre el reposo, y carga con la curva no lineal del látex de la banda configurada en
// /laboratorio (o la Corength de 5 kg en lazo). Es una estimación: el juego dice «aprox.». El nivel pide un
// estiramiento (30 a 110 %) y la carga de la zona sale de la banda (ver logica.ts, con lo aprendido en la prueba real).
//
// Eventos (tipos existentes): umbral_alcanzado al entrar en la zona verde, sostenido_completo al cumplir el tiempo,
// soltar en cada tiro (con todos sus datos) y además acierto o no_alcanzado según el resultado.
import * as THREE from 'three'
import { KUWU, kuwuAlfa, kuwuNum } from '../../ui/paleta'
import type { LadoMano } from '../../domain/types'
import { num } from '../../lib/formato'
import { AGARRE_POR_DEFECTO, medirBanda, type MedidaBanda } from '../../banda/medicion'
import type { ManoSeguida } from '../../tracking/tipos'
import { crearEfectoReventar, texturaMasUno } from '../assets/burbujas/burbuja'
import { crearBaseHonda, crearBaseMarcas, crearBlanco, crearBolsa, crearHorquilla, crearMarca, tender, type BaseMarcas } from '../assets/honda/honda'
import { geometria, liberar, material as registrar, nuevosRecursos, textura } from '../assets/recursos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  ANCHO_ZONA,
  NIVELES_HONDA,
  SesionHonda,
  TEXTO_RESULTADO,
  PISTA_BORDE,
  PISTA_CERO_DUDOSO,
  alcanceCorto,
  bandaConfigurada,
  nivelHonda,
  pistaHonda,
  type EventoHonda,
  type FaseHonda,
  type NivelHonda,
  type ResultadoTiro,
  type Tiro,
} from './logica'

const LADOS: LadoMano[] = ['derecha', 'izquierda']
const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_HONDA[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

// Escena (unidades ≈ 10 cm; la mesa va de z = −1,9 al fondo a z = 1,4 al frente).
const Z_HONDA = 0.7
const Y_PUNTAS = 1.05
const X_PUNTAS = 0.36
const Z_BLANCO = -1.55
const Y_BLANCO = 0.62
const RADIO_BLANCO = 0.42
const RADIO_PIEDRA = 0.085
const TIRON_MAX = 1.05
const VUELO_S = 0.95
const RESULTADO_S = 2.2
/** Manos virtuales: a esta distancia del centro en reposo y con la zona verde al tope, su altura, su z y su tamaño. */
const X_MANOS_MIN = 1.2
const X_MANOS_MAX = 2.0
const Y_MANOS = 0.75
const Z_MANOS = 0.75
const ESCALA_MANOS = 4.6
/** Gotas del festejo y cuánto dura (s). */
const N_GOTAS = 10
const FESTEJO_S = 0.9
/** Cuadros seguidos con una mano en el borde de la imagen antes de avisar (≈ 0,3 s). */
const CUADROS_BORDE = 8

/** Tarjeta del medidor, fija a la cámara (píxeles CSS de diseño). */
const ANCHO_GUIA = 220
const ALTO_GUIA = 150
const FRACCION_MAX_GUIA = 0.5
const MARGEN_GUIA = 14
const DIST_GUIA = 5
const FUENTE_GRANDE = '700 26px Poppins, "DM Sans", system-ui, sans-serif'
const FUENTE_TEXTO = '600 13px Poppins, "DM Sans", system-ui, sans-serif'
const FUENTE_NOTA = '500 11px Poppins, "DM Sans", system-ui, sans-serif'

/** Resultado del tiro en pocas palabras, para la tarjeta del medidor (la pista del panel lleva el texto largo). */
const CORTO_RESULTADO: Record<ResultadoTiro, string> = {
  acierto: '¡En el blanco!',
  corto: 'Quedó corto',
  largo: 'Te pasaste',
  'sin-sostener': 'Faltó sostener',
}

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoHondaDepuracion {
  fase: FaseHonda
  contador: number
  meta: number
  /** Zona verde del nivel con la banda configurada (kg aprox.). */
  metaKg: number
  topeKg: number
  sostenerS: number
  ceroDudoso: boolean
  alBorde: boolean
  banda: string
  reposoCm: number | null
  kg: number | null
  progresoSostener: number
  tiros: { resultado: ResultadoTiro; picoKg: number; sostenidoS: number }[]
  vuelo: boolean
}

interface Vuelo {
  t: number
  desde: THREE.Vector3
  hasta: THREE.Vector3
  altura: number
  tiro: Tiro
}

export const crearHonda: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelHonda = nivelHonda(1)
  let banda = bandaConfigurada()
  let sesion = new SesionHonda(banda.curva, nivel)
  /** Cuadros seguidos con una mano tocando el borde de la imagen (para avisar sin parpadeos). */
  let cuadrosAlBorde = 0
  let manosUbicadas = false
  let ultimoT: number | null = null
  let vuelo: Vuelo | null = null
  let resultado: { r: ResultadoTiro; t: number } | null = null
  let golpeBlanco = 0
  let picoPoseKg = 0
  let tiron = 0

  const grupo = new THREE.Group()
  const fija = new THREE.Group()
  const recursos = nuevosRecursos()
  const bolsa = new THREE.Vector3()
  const extremo = new THREE.Vector3()
  let puntas: [THREE.Vector3, THREE.Vector3] | null = null
  let tiras: THREE.Mesh[] = []
  let matTira: THREE.MeshStandardMaterial | null = null
  let piedra: THREE.Mesh | null = null
  let cuero: THREE.Mesh | null = null
  let blanco: THREE.Group | null = null
  let matCentro: THREE.MeshStandardMaterial | null = null
  let baseMarcas: BaseMarcas | null = null
  const marcas: THREE.Mesh[] = []
  let efecto: ReturnType<typeof crearEfectoReventar> | null = null
  /** Segundos desde el último acierto (anima las gotas y el «+1»); null sin efecto en curso. */
  let festejo: number | null = null
  const gotasVel: THREE.Vector3[] = []
  let lienzo: HTMLCanvasElement | null = null
  let texGuia: THREE.CanvasTexture | null = null
  let firmaGuia = ''
  let firmaUbicacion = ''
  let resolucionGuia = 1
  let lienzoJuego: HTMLCanvasElement | null | undefined

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && sesion.aciertos >= ctx.meta

  function construirEscena(c: ContextoJuego) {
    const base = crearBaseHonda(recursos)
    const horquilla = crearHorquilla(recursos, base, { z: Z_HONDA, altoPuntas: Y_PUNTAS, mitadAncho: X_PUNTAS })
    puntas = horquilla.puntas
    const b = crearBolsa(recursos, base, RADIO_PIEDRA)
    tiras = b.tiras
    matTira = b.matTira
    cuero = b.cuero
    piedra = b.piedra
    const diana = crearBlanco(recursos, base, RADIO_BLANCO, Y_BLANCO)
    blanco = diana.grupo
    matCentro = diana.matCentro
    blanco.position.set(0, 0, Z_BLANCO)
    baseMarcas = crearBaseMarcas(recursos)
    // Festejo del acierto: las gotas y el «+1» de Atrapa burbujas, que salen del centro del blanco.
    efecto = crearEfectoReventar(recursos, geometria(recursos, new THREE.SphereGeometry(0.07, 10, 8)), textura(recursos, texturaMasUno()), N_GOTAS)
    for (let i = 0; i < N_GOTAS; i++) gotasVel.push(new THREE.Vector3())
    grupo.add(horquilla.grupo, ...tiras, cuero, piedra, blanco, ...efecto.gotas, efecto.mas)
    c.escena.add(grupo)
    ponerBolsa(0)

    // Tarjeta del medidor fija a la cámara (misma técnica que Banda elástica y Exprime la naranja).
    // Lienzo a 2,5× el diseño: la tarjeta crece en pantallas grandes y no debe verse borrosa.
    const resolucion = 2.5
    lienzo = document.createElement('canvas')
    lienzo.width = Math.round(ANCHO_GUIA * resolucion)
    lienzo.height = Math.round(ALTO_GUIA * resolucion)
    resolucionGuia = lienzo.width / ANCHO_GUIA
    texGuia = textura(recursos, new THREE.CanvasTexture(lienzo))
    texGuia.colorSpace = THREE.SRGBColorSpace
    texGuia.generateMipmaps = false
    texGuia.minFilter = THREE.LinearFilter
    texGuia.magFilter = THREE.LinearFilter
    const sGuia = new THREE.Sprite(registrar(recursos, new THREE.SpriteMaterial({ map: texGuia, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })))
    sGuia.renderOrder = 10
    sGuia.name = 'guia'
    fija.add(sGuia)
    c.camara.add(fija)
    c.escena.add(c.camara)
  }

  /**
   * Las manos virtuales van siempre a los lados de la honda y se abren con el estiramiento, sin importar dónde estén en
   * la imagen: con manos reales (prueba con la banda, 22-nov-2026) el mapeo de la base las llevaba fuera de la mesa y
   * detrás de los paneles en los estirones grandes, o encima de la honda en reposo. Se logra moviendo la zona de la base:
   * su mapeo es lineal en x, así que basta elegir los extremos para que cada palma caiga en ±d.
   */
  function ubicarManos(c: ContextoJuego, medida: MedidaBanda | null) {
    const base = { y: [Y_MANOS, Y_MANOS] as [number, number], z: [Z_MANOS, Z_MANOS] as [number, number], margen: 0, escala: ESCALA_MANOS }
    if (!medida) {
      if (!manosUbicadas) c.configurarManos({ ...base, x: [-X_MANOS_MAX, X_MANOS_MAX] })
      return
    }
    // u = 1 − x de la imagen (espejo), como en la base con margen 0.
    const u = medida.extremos.map((p) => 1 - p.x).sort((a, b) => a - b)
    const ancho = u[1] - u[0]
    if (ancho < 0.02) return
    const e = sesion.ultimo?.e ?? 0
    const d = X_MANOS_MIN + (X_MANOS_MAX - X_MANOS_MIN) * Math.min(1, Math.max(0, e / (nivel.estirar + ANCHO_ZONA)))
    const pendiente = (2 * d) / ancho
    const x0 = -d - pendiente * u[0]
    c.configurarManos({ ...base, x: [x0, x0 + pendiente] })
    manosUbicadas = true
  }

  /** Bolsa tirada hacia atrás (hacia la cámara) según `f` (0 = en reposo, 1 = el tirón máximo dibujado). */
  function ponerBolsa(f: number) {
    if (!puntas) return
    bolsa.set(0, Y_PUNTAS - 0.06 - 0.22 * f, Z_HONDA + 0.12 + TIRON_MAX * f)
    if (cuero) cuero.position.copy(bolsa)
    // La piedra queda donde cayó mientras se muestra el resultado; después vuelve a la bolsa.
    if (piedra && !vuelo && resultado == null) piedra.position.set(bolsa.x, bolsa.y + 0.06, bolsa.z)
    const radio = 0.024 * (1 - 0.35 * Math.min(1, f))
    tiras.forEach((t, i) => tender(t, puntas![i], extremo.set(bolsa.x + (i === 0 ? -0.12 : 0.12), bolsa.y, bolsa.z), radio))
  }

  function marcaCaida(p: THREE.Vector3) {
    if (!baseMarcas) return
    if (marcas.length >= 12) grupo.remove(marcas.shift()!)
    const m = crearMarca(baseMarcas, p.x, p.z)
    marcas.push(m)
    grupo.add(m)
  }

  function lanzar(t: Tiro) {
    const desde = new THREE.Vector3(bolsa.x, bolsa.y + 0.06, bolsa.z)
    const distancia = Z_HONDA - Z_BLANCO
    // Dónde cae: el acierto, en el blanco; el corto, antes (más cerca cuanto menos se estiró) y un poco al lado para que
    // la honda no lo tape; el largo pasa por un lado del blanco y cae detrás; el que no sostuvo cae al otro lado.
    let hasta: THREE.Vector3
    if (t.resultado === 'acierto') hasta = new THREE.Vector3(0, Y_BLANCO, Z_BLANCO + 0.08)
    else if (t.resultado === 'sin-sostener') hasta = new THREE.Vector3(RADIO_BLANCO * 1.7, RADIO_PIEDRA, Z_BLANCO + 0.3)
    else if (t.resultado === 'largo') hasta = new THREE.Vector3(-RADIO_BLANCO * 1.7, RADIO_PIEDRA, Z_BLANCO - 0.2)
    else hasta = new THREE.Vector3(0.45, RADIO_PIEDRA, Z_HONDA - distancia * alcanceCorto(t.picoKg, sesion.zona))
    vuelo = { t: 0, desde, hasta, altura: t.resultado === 'corto' ? 0.4 : t.resultado === 'largo' ? 0.8 : 0.5, tiro: t }
  }

  /** Arranca el festejo: las gotas salen del centro del blanco hacia la cámara y cae un «+1». */
  function festejar() {
    if (!efecto) return
    festejo = 0
    efecto.gotas.forEach((g, i) => {
      const a = (i / N_GOTAS) * Math.PI * 2
      g.position.set(0, Y_BLANCO, Z_BLANCO + 0.12)
      gotasVel[i].set(Math.cos(a) * (1.1 + 0.5 * ((i * 7) % 3)), 1.6 + 0.6 * Math.sin(a), 0.9 + 0.3 * ((i * 5) % 3))
      g.visible = true
    })
    // El «+1» sale al lado del blanco (arriba lo taparía la barra del tiempo).
    efecto.mas.position.set(RADIO_BLANCO + 0.45, Y_BLANCO - 0.1, Z_BLANCO + 0.1)
    efecto.mas.visible = true
  }

  function avanzarFestejo(dt: number) {
    if (festejo == null || !efecto) return
    festejo += dt
    const u = festejo / FESTEJO_S
    efecto.gotas.forEach((g, i) => {
      gotasVel[i].y -= 5.5 * dt
      g.position.addScaledVector(gotasVel[i], dt)
      if (g.position.y < 0.03) g.visible = false
    })
    efecto.matGota.opacity = Math.min(1, 2 * (1 - u))
    efecto.mas.position.y += 0.35 * dt
    efecto.matMas.opacity = u < 0.15 ? u / 0.15 : Math.max(0, 1 - (u - 0.15) / 0.85)
    if (u >= 1) {
      festejo = null
      for (const g of efecto.gotas) g.visible = false
      efecto.mas.visible = false
    }
  }

  function avanzarVuelo(dt: number) {
    if (!vuelo || !piedra) return
    vuelo.t += dt
    const u = Math.min(1, vuelo.t / VUELO_S)
    piedra.position.lerpVectors(vuelo.desde, vuelo.hasta, u)
    piedra.position.y += vuelo.altura * 4 * u * (1 - u)
    if (u >= 1) {
      if (vuelo.tiro.resultado === 'acierto') {
        golpeBlanco = 1
        festejar()
      } else marcaCaida(vuelo.hasta)
      resultado = { r: vuelo.tiro.resultado, t: RESULTADO_S }
      vuelo = null
    }
  }

  // ── Medidor ────────────────────────────────────────────────────────────────────────────────────────────────────
  function dibujarGuia() {
    if (!lienzo || !texGuia) return
    const kg = sesion.kg
    const fase = sesion.fase
    const prog = sesion.progresoSostener
    const firma = [sesion.racha, fase, kg == null ? -1 : Math.round(kg * 20), Math.round(prog * 24), resultado?.r ?? '', Math.round(fase === 'reposo' ? (sesion.ultimo?.progresoReposo ?? 0) * 20 : 99)].join(',')
    if (firma === firmaGuia) return
    firmaGuia = firma
    const g = lienzo.getContext('2d')!
    const W = ANCHO_GUIA
    const H = ALTO_GUIA
    g.setTransform(resolucionGuia, 0, 0, resolucionGuia, 0, 0)
    g.clearRect(0, 0, W, H)
    g.fillStyle = kuwuAlfa('noche', 0.92)
    g.beginPath()
    g.roundRect(1, 1, W - 2, H - 2, 18)
    g.fill()
    g.strokeStyle = kuwuAlfa('blanco', 0.2)
    g.lineWidth = 1.5
    g.stroke()
    g.textBaseline = 'middle'
    const texto = (t: string, x: number, y: number, fuente: string, color: string = KUWU.blanco, align: CanvasTextAlign = 'center') => {
      g.font = fuente
      g.textAlign = align
      g.fillStyle = color
      g.fillText(t, x, y)
    }

    // Arco de 180° de 0 a 1,6 × meta: la zona verde es la ventana de carga.
    const cx = W / 2
    const cy = 92
    const r = 64
    const { minKg, maxKg } = sesion.zona
    // El arco llega un poco más allá de la zona verde, para que pasarse también se vea.
    const tope = maxKg * 1.3
    const ang = (v: number) => Math.PI + Math.PI * Math.min(1, Math.max(0, v / tope))
    g.lineCap = 'round'
    g.lineWidth = 12
    g.strokeStyle = kuwuAlfa('blanco', 0.14)
    g.beginPath()
    g.arc(cx, cy, r, Math.PI, 2 * Math.PI)
    g.stroke()
    g.lineCap = 'butt'
    g.strokeStyle = kuwuAlfa('menta', 0.85)
    g.beginPath()
    g.arc(cx, cy, r, ang(minKg), ang(maxKg))
    g.stroke()
    if (kg != null && kg > 0) {
      const enVentana = fase === 'en-ventana' || fase === 'sostenido'
      g.lineCap = 'round'
      g.lineWidth = 6
      g.strokeStyle = fase === 'pasado' ? KUWU.rojo : enVentana ? KUWU.blanco : KUWU.amarillo
      g.beginPath()
      g.arc(cx, cy, r, Math.PI, ang(kg))
      g.stroke()
      // aguja
      const a = ang(kg)
      g.fillStyle = KUWU.blanco
      g.beginPath()
      g.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), 6, 0, 2 * Math.PI)
      g.fill()
    }
    // Anillo de sostener alrededor de la cifra.
    if (prog > 0) {
      g.lineCap = 'round'
      g.lineWidth = 4
      g.strokeStyle = KUWU.menta
      g.beginPath()
      g.arc(cx, cy - 18, 25, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * prog)
      g.stroke()
    }
    const sinReposo = fase === 'reposo'
    if (fase === 'sin-manos') {
      texto('—', cx, cy - 17, FUENTE_GRANDE)
      texto('Muestra las dos manos', cx, cy + 32, FUENTE_TEXTO)
    } else if (sinReposo) {
      const p = sesion.ultimo?.progresoReposo ?? 0
      texto(`${Math.round(p * 100)} %`, cx, cy - 17, FUENTE_GRANDE)
      texto('Banda recta y quieto', cx, cy + 32, FUENTE_TEXTO)
    } else {
      texto(`${num(kg ?? 0, 1)}`, cx, cy - 17, FUENTE_GRANDE)
      texto('kg aprox.', cx, cy + 18, FUENTE_NOTA, kuwuAlfa('blanco', 0.75))
      const linea =
        resultado != null
          ? resultado.r === 'acierto' && sesion.racha >= 2
            ? `¡En el blanco! ×${sesion.racha}`
            : CORTO_RESULTADO[resultado.r]
          : fase === 'volver'
            ? 'Vuelve al centro'
            : fase === 'en-ventana'
              ? `Sostén ${num(Math.max(0, nivel.sostenerS * (1 - prog)), 1)} s`
              : fase === 'pasado'
                ? 'Te pasaste: afloja'
                : `Zona verde: ${num(minKg, 1)} a ${num(maxKg, 1)} kg`
      const color = resultado?.r === 'acierto' ? KUWU.menta : resultado ? KUWU.amarillo : KUWU.blanco
      texto(linea, cx, cy + 40, FUENTE_TEXTO, color)
    }
    // Arriba, la banda en uso y a qué distancia entre las manos quedó el cero: si a esa distancia la banda cuelga, el
    // cero quedó corto y conviene ponerlo de nuevo.
    const cero = sesion.seguidor.reposoCm
    texto(cero == null ? banda.origen : `${banda.origen} · cero ${Math.round(cero)} cm`, cx, 16, FUENTE_NOTA, kuwuAlfa('blanco', 0.6))
    texGuia.needsUpdate = true
  }

  function altoCss(): number {
    if (typeof document === 'undefined') return 390
    if (!lienzoJuego || !lienzoJuego.isConnected) lienzoJuego = document.querySelector<HTMLCanvasElement>('canvas.juego-lienzo')
    return lienzoJuego?.clientHeight || window.innerHeight || 390
  }

  /** Tarjeta a la derecha, bajo «Menú»: mide ANCHO_GUIA px en pantalla sea cual sea el campo de la cámara. */
  function ubicarGuia(c: ContextoJuego) {
    const alto = altoCss()
    const firma = [c.camara.fov, c.camara.aspect, alto].join(',')
    if (firma === firmaUbicacion) return
    firmaUbicacion = firma
    const mitadAlto = DIST_GUIA * Math.tan((c.camara.fov * Math.PI) / 360)
    const mitadAncho = mitadAlto * c.camara.aspect
    const porPx = (2 * mitadAlto) / alto
    // En teléfono mide ANCHO_GUIA; en pantallas más altas crece con la ventana (un tercio del alto) para que se lea de lejos.
    const anchoPx = Math.min(Math.max(ANCHO_GUIA, 0.34 * alto), FRACCION_MAX_GUIA * alto * c.camara.aspect, 0.42 * alto * (ANCHO_GUIA / ALTO_GUIA))
    const k = anchoPx / ANCHO_GUIA
    const ancho = anchoPx * porPx
    const altoU = ALTO_GUIA * k * porPx
    fija.getObjectByName('guia')?.scale.set(ancho, altoU, 1)
    fija.position.set(mitadAncho - MARGEN_GUIA * porPx - ancho / 2, mitadAlto * 0.62 - altoU / 2, -DIST_GUIA)
  }

  function dibujar(dt: number) {
    const c = ctx
    if (!c) return
    ubicarGuia(c)
    // La bolsa sigue la carga con un suavizado corto; al soltar vuelve rápido, como una honda.
    const kg = sesion.kg ?? 0
    // Tras el tiro la bolsa queda suelta hasta que se vuelve al centro, aunque las manos sigan abiertas.
    const objetivo = vuelo || sesion.fase === 'volver' ? 0 : Math.min(1.15, kg / sesion.zona.maxKg)
    tiron += (objetivo - tiron) * Math.min(1, dt * (objetivo < tiron ? 18 : 10))
    ponerBolsa(tiron)
    if (matTira) {
      const fase = sesion.fase
      matTira.emissive.setHex(fase === 'en-ventana' || fase === 'sostenido' ? kuwuNum('menta') : fase === 'pasado' ? kuwuNum('rojo') : kuwuNum('marino'))
      matTira.emissiveIntensity = fase === 'en-ventana' || fase === 'sostenido' || fase === 'pasado' ? 0.55 : 0.35
    }
    avanzarVuelo(dt)
    avanzarFestejo(dt)
    if (blanco) {
      golpeBlanco = Math.max(0, golpeBlanco - dt * 0.8)
      blanco.rotation.x = -0.18 * Math.sin(golpeBlanco * 14) * golpeBlanco
      if (matCentro) matCentro.emissiveIntensity = 1.2 * golpeBlanco
    }
    // Al empezar otro tiro, la piedra vuelve a la bolsa aunque el cartel del resultado no haya terminado.
    if (resultado && !vuelo && sesion.enTiro) resultado = null
    if (resultado) {
      resultado.t -= dt
      if (resultado.t <= 0) resultado = null
    }
    dibujarGuia()
  }

  function aplicar(ev: EventoHonda) {
    const c = ctx
    if (!c) return
    switch (ev.tipo) {
      case 'reposo':
        for (const l of LADOS) c.guardarPose('reposo', l, null)
        break
      case 'en-ventana':
        c.registrar('umbral_alcanzado', { objeto: 'honda', datos: { kg: r2(ev.kg), metaKg: r2(sesion.zona.minKg), topeKg: r2(sesion.zona.maxKg) } })
        break
      case 'sostenido':
        c.registrar('sostenido_completo', { objeto: 'honda', datos: { kg: r2(ev.kg), sostenerS: nivel.sostenerS } })
        break
      case 'tiro': {
        const t = ev.tiro
        const datos = { tiro: t.n, resultado: t.resultado, picoKg: r2(t.picoKg), metaKg: r2(sesion.zona.minKg), topeKg: r2(sesion.zona.maxKg), estiramientoPct: Math.round(t.picoEstiramiento * 100), sePaso: t.sePaso, sostenidoS: r2(t.sostenidoS), tensionS: r2(t.tensionS), trabajoJ: r2(t.trabajoJ), vueltaMs: Math.round(t.vueltaMs) }
        c.registrar('soltar', { objeto: 'honda', datos })
        c.registrar(t.resultado === 'acierto' ? 'acierto' : 'no_alcanzado', { objeto: 'blanco', datos })
        picoPoseKg = 0
        lanzar(t)
        break
      }
    }
  }

  function depuracion(): EstadoHondaDepuracion {
    return {
      fase: sesion.fase,
      contador: sesion.aciertos,
      meta: ctx?.meta ?? 0,
      metaKg: r2(sesion.zona.minKg),
      topeKg: r2(sesion.zona.maxKg),
      sostenerS: nivel.sostenerS,
      ceroDudoso: sesion.ceroDudoso,
      alBorde: cuadrosAlBorde >= CUADROS_BORDE,
      banda: banda.origen,
      reposoCm: sesion.seguidor.reposoCm == null ? null : Math.round(sesion.seguidor.reposoCm * 10) / 10,
      kg: sesion.kg == null ? null : r2(sesion.kg),
      progresoSostener: r2(sesion.progresoSostener),
      tiros: sesion.tiros.map((t) => ({ resultado: t.resultado, picoKg: r2(t.picoKg), sostenidoS: r2(t.sostenidoS) })),
      vuelo: vuelo != null,
    }
  }

  return {
    id: 'honda',
    nombre: 'Honda',
    gestos: ['Agarre'],
    miniatura: 'honda',
    niveles,
    meta: { etiqueta: 'Aciertos', unidad: 'aciertos', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['umbral_alcanzado', 'sostenido_completo', 'soltar', 'acierto', 'no_alcanzado'],
    metricasVivo: [
      { id: 'cargaKg', nombre: 'Carga aprox.', unidad: 'kg', formula: 'curva carga–estiramiento de la banda (no lineal, del látex; calibrable con pesos en /laboratorio) en el estiramiento entre los centros de las palmas sobre el reposo, con 5 % de zona muerta', aprox: true, mejor: 'mayor' },
      { id: 'sostenidoPct', nombre: 'Sostenido', unidad: '%', formula: 'tiempo seguido dentro de la zona verde / tiempo pedido por el nivel' },
    ],
    metricasResumen: [
      { id: 'aciertos', nombre: 'Aciertos', unidad: '', formula: 'tiros que llegaron a la zona verde del nivel (del estiramiento pedido a 35 puntos más) y la sostuvieron sin salir el tiempo del nivel', mejor: 'mayor' },
      { id: 'precisionPct', nombre: 'Tiros en el blanco', unidad: '%', formula: 'aciertos / tiros × 100', mejor: 'mayor', corto: 'En el blanco' },
      { id: 'cargaMaxKg', nombre: 'Carga máxima aprox.', unidad: 'kg', formula: 'mayor pico de carga de un tiro (curva de la banda en el estiramiento pico)', aprox: true, mejor: 'mayor', corto: 'Carga máx. aprox.' },
      { id: 'constanciaPct', nombre: 'Constancia entre tiros', unidad: '%', formula: '1 − desviación estándar / promedio de los picos de carga (vacío con menos de 2 tiros)', mejor: 'mayor', corto: 'Constancia' },
      { id: 'tiempoBajoTensionS', nombre: 'Tiempo bajo tensión', unidad: 's', formula: 'suma de segundos con la banda estirada sobre el 10 % en cada tiro, hasta soltar', mejor: 'mayor', corto: 'Bajo tensión' },
      { id: 'rachaMax', nombre: 'Mejor racha', unidad: '', formula: 'mayor cantidad de aciertos seguidos en la sesión', mejor: 'mayor', tarjeta: false },
      { id: 'cargaPromedioKg', nombre: 'Carga promedio aprox.', unidad: 'kg', formula: 'promedio de los picos de carga de los tiros', aprox: true, tarjeta: false },
      { id: 'cargaMetaKg', nombre: 'Carga del nivel', unidad: 'kg', formula: 'carga que da la banda configurada en el estiramiento que pide el nivel (borde inferior de la zona verde)', aprox: true, tarjeta: false },
      { id: 'tiros', nombre: 'Tiros', unidad: '', formula: 'estirones de al menos 0,4 s sobre el 10 % que terminan al soltar (la carga cae a la mitad del pico)', tarjeta: false },
      { id: 'sostenidoPromedioS', nombre: 'Sostenido promedio', unidad: 's', formula: 'promedio del mayor tramo seguido dentro de la zona verde en cada tiro', tarjeta: false },
      { id: 'vueltaPromedioS', nombre: 'Vuelta promedio', unidad: 's', formula: 'promedio del tiempo desde el pico hasta soltar (bajada controlada o de golpe)', tarjeta: false },
      { id: 'trabajoJ', nombre: 'Trabajo aprox.', unidad: '', formula: 'suma del área bajo la curva carga–estiramiento hasta cada pico × largo de reposo × g, en joules', tarjeta: false },
      { id: 'cortos', nombre: 'Tiros cortos', unidad: '', formula: 'tiros que no llegaron a la zona verde', tarjeta: false },
      { id: 'largos', nombre: 'Tiros en que se pasó', unidad: '', formula: 'tiros en que la carga pasó de la zona verde en algún momento, aunque después haya vuelto a sostener', tarjeta: false },
      { id: 'estiramientoMaxPct', nombre: 'Estiramiento máximo (% del reposo)', unidad: '%', formula: 'mayor estiramiento de un tiro sobre el largo en reposo', tarjeta: false },
      { id: 'estiramientoMaxCm', nombre: 'Estiramiento máximo', unidad: 'cm', formula: 'mayor estiramiento de un tiro × largo en reposo', aprox: true, tarjeta: false },
      { id: 'reposoCm', nombre: 'Largo de la banda en reposo', unidad: 'cm', formula: 'distancia entre los centros de las palmas con la banda recién tensa', aprox: true, tarjeta: false },
    ],
    usaFisica: false,
    pista: pistaHonda('sin-manos'),
    textoReiniciar: 'Poner en cero',

    montar(c) {
      ctx = c
      nivel = nivelHonda(c.parametros.nivel)
      banda = bandaConfigurada()
      sesion = new SesionHonda(banda.curva, nivel)
      ubicarManos(c, null)
      construirEscena(c)
      dibujar(0)
      // Con cámara, solo en desarrollo (la prueba con video como cámara lo lee).
      if ((c.fuente.tipo !== 'camara' || import.meta.env.DEV) && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      const f = c.fuente.ultimo
      if (f && f.t !== ultimoT && !metaAlcanzada()) {
        ultimoT = f.t
        const medida = medirBanda({ t: f.t, manos, ancho: f.ancho, alto: f.alto }, AGARRE_POR_DEFECTO)
        cuadrosAlBorde = medida?.alBorde ? cuadrosAlBorde + 1 : 0
        ubicarManos(c, medida)
        for (const ev of sesion.paso(f.t, medida?.largoCm ?? null)) aplicar(ev)
        const kg = sesion.kg ?? 0
        if (kg > picoPoseKg + 0.05) {
          let ok = false
          for (const l of LADOS) ok = c.guardarPose('pico', l, kg) || ok
          if (ok) picoPoseKg = kg
        }
      }
      dibujar(dt)
    },

    hud() {
      const fase = sesion.fase
      const estado: EstadoManoHud =
        fase === 'sin-manos' ? { texto: '—', tono: 'neutro' } : fase === 'en-ventana' || fase === 'sostenido' ? { texto: 'En la zona', tono: 'acento' } : fase === 'tensando' || fase === 'pasado' ? { texto: 'Estirando', tono: 'acento' } : { texto: 'Con la banda', tono: 'ok' }
      const kg = sesion.kg
      return {
        contador: sesion.aciertos,
        manos: { derecha: estado, izquierda: estado },
        pista: metaAlcanzada()
          ? '¡Muy bien! Completaste los aciertos'
          : sesion.ceroDudoso
            ? PISTA_CERO_DUDOSO
            : (cuadrosAlBorde >= CUADROS_BORDE && !sesion.enTiro) || (fase === 'sin-manos' && sesion.enTiro)
              ? PISTA_BORDE
              : resultado
                ? TEXTO_RESULTADO[resultado.r]
                : pistaHonda(fase),
        vivo: { cargaKg: kg == null ? null : Math.round(kg * 10) / 10, sostenidoPct: Math.round(sesion.progresoSostener * 100) },
      }
    },

    reiniciar() {
      // «Poner en cero»: el próximo tramo quieto (0,4 s) pasa a ser el reposo, como la tara de una balanza.
      sesion.pedirCero()
    },

    muestra() {
      const kg = sesion.kg
      return { cargaKg: kg == null ? null : r2(kg), estiramientoPct: sesion.ultimo?.e == null ? null : Math.round(sesion.ultimo.e * 1000) / 10 }
    },

    resumen() {
      return sesion.resumen()
    },

    desmontar() {
      const c = ctx
      if (c) {
        c.escena.remove(grupo)
        c.camara.remove(fija)
        c.escena.remove(c.camara)
      }
      liberar(recursos)
      if (typeof window !== 'undefined' && window.__manoviva?.juego) {
        const { juego: _quitar, ...resto } = window.__manoviva
        void _quitar
        window.__manoviva = resto
      }
      ctx = null
    },
  }
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}
