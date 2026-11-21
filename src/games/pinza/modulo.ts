// Pinza fina (F23, J2): oposición del pulgar con cada dedo, sin física, sobre la base común.
// Referencia: imagenes_juegos/02_pinza_fina.png y docs/referencia/prompts_juegos/J2_pinza_fina.md.
//
// Escena: la mano virtual de la base, grande y de frente (copia la mano del paciente). En la punta del dedo pedido
// hay un anillo amarillo que late; los demás llevan un anillo blanco fino; los toques logrados quedan con halo verde.
// Arriba, bajo la barra de tiempo, una fila de luces (una por toque de la secuencia): verde = tocado, amarillo = ahora,
// gris claro = no alcanzado, oscuro = pendiente. Nivel 5: primero se ilumina la secuencia (demostración) y después hay
// que repetirla de memoria (sin anillo amarillo).
//
// Toques y tiempos: logica.ts (pasoPinza). Eventos: objetivo_mostrado {dedo, posicion}, toque {dedo, tiempoMs},
// error {dedo tocado}, no_alcanzado {dedo, distanciaMinCm}. Con mano 'ambas' las secuencias se alternan entre
// derecha e izquierda (la mano que corresponde lleva los anillos).
import * as THREE from 'three'
import type { LadoMano } from '../../domain/types'
import type { ManoSeguida } from '../../tracking/tipos'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import {
  AgregadoPinza,
  DEDOS_PINZA,
  LARGO_SECUENCIA,
  NIVELES_PINZA,
  NOMBRE_DEDO,
  PUNTA_DEDO,
  PUNTA_PULGAR,
  capital,
  distanciasPulgar,
  estadoPinzaInicial,
  fijarObjetivo,
  generarSecuencia,
  masCercano,
  nivelPinza,
  pasoPinza,
  umbralesToque,
  type ConfigPinza,
  type DedoPinza,
  type Distancias,
  type EstadoPinza,
  type EventoPinza,
  type NivelPinza,
  type Umbrales,
} from './logica'
import { KUWU, kuwuAlfa, kuwuNum } from '../../ui/paleta'

const LADOS: LadoMano[] = ['derecha', 'izquierda']

/** Demostración del nivel 5: cuánto se ilumina cada dedo y la pausa entre uno y otro (ms). */
export const DEMO_ENCENDIDO_MS = 800
export const DEMO_PASO_MS = 1100
/** Pausa entre secuencias, con todas las luces a la vista (ms). */
export const ENTRE_MS = 900

const COLOR_ACENTO = kuwuNum('amarillo')
const COLOR_OK = kuwuNum('menta')
const COLOR_AVISO = kuwuNum('rojo')

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_PINZA[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

type Resultado = 'hecho' | 'perdido' | null
type VistaDedo = 'objetivo' | 'pendiente' | 'hecho' | 'perdido' | 'oculto'
type Fase = 'demostrando' | 'tocando' | 'entre' | 'fin'

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoPinzaDepuracion {
  contador: number
  meta: number
  fase: Fase
  lado: LadoMano
  secuencia: DedoPinza[]
  posicion: number
  /** Dedo que hay que tocar ahora (null en la demostración del nivel 5 y entre secuencias). */
  objetivo: DedoPinza | null
  /** En el nivel 5 el dedo pedido no se muestra durante la repetición, pero el estado sí lo dice (para probar). */
  memoria: boolean
  resultados: Resultado[]
  contacto: DedoPinza | null
  distancias: Distancias | null
  umbrales: Umbrales
  limiteMs: number
  secuencias: number
  errores: number
  noAlcanzados: number
}

function texturaAnillo(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = '#ffffff'
  g.lineWidth = 9
  g.beginPath()
  g.arc(64, 64, 54, 0, Math.PI * 2)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function texturaHalo(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const COLORES_LUZ: Record<string, string> = { hecho: KUWU.menta, actual: KUWU.amarillo, perdido: KUWU['noche-texto-2'], pendiente: KUWU['noche-borde'] }

export const crearPinza: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let nivel: NivelPinza = nivelPinza(1)
  let lados: LadoMano[] = ['derecha']
  let umbrales: Umbrales = umbralesToque(null)
  let cfg: ConfigPinza = { ...umbrales, limiteMs: 0 }

  const agregado = new AgregadoPinza()
  let contador = 0
  let reloj = 0
  let anim = 0
  let fase: Fase = 'tocando'
  let secuencia: DedoPinza[] = [...DEDOS_PINZA]
  let nSecuencias = 0
  let posicion = 0
  let resultados: Resultado[] = []
  let estado: EstadoPinza = estadoPinzaInicial()
  let lado: LadoMano = 'derecha'
  let distancias: Distancias | null = null
  let ultimoTiempoS: number | null = null
  let demoT = 0
  let demoPaso = -1
  let entreT = 0
  const error: Record<DedoPinza, number> = { indice: 0, medio: 0, anular: 0, menique: 0 }

  // Escena
  const grupo = new THREE.Group()
  const luces = new THREE.Group()
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []
  interface VisualDedo {
    anillo: THREE.Sprite
    halo: THREE.Sprite
  }
  const visual: Partial<Record<DedoPinza, VisualDedo>> = {}
  let anilloPulgar: THREE.Sprite | null = null
  let lienzoLuces: HTMLCanvasElement | null = null
  let texLuces: THREE.CanvasTexture | null = null
  let firmaLuces = ''

  const metaAlcanzada = () => !!ctx && ctx.meta > 0 && contador >= ctx.meta
  const rng = () => Math.random()

  function ladoDeSecuencia(n: number): LadoMano {
    return lados[n % lados.length]
  }

  function mostrarObjetivo(i: number, visible: boolean) {
    const dedo = secuencia[i]
    estado = fijarObjetivo(estado, dedo, reloj)
    ctx?.registrar('objetivo_mostrado', {
      mano: lado,
      objeto: dedo,
      datos: { dedo, posicion: i + 1, de: secuencia.length, limiteMs: nivel.limiteMs, visible },
    })
  }

  function iniciarSecuencia() {
    secuencia = generarSecuencia(nivel, rng, secuencia)
    lado = ladoDeSecuencia(nSecuencias)
    nSecuencias++
    posicion = 0
    resultados = secuencia.map(() => null)
    estado = fijarObjetivo(estado, null, reloj)
    if (nivel.memoria) {
      fase = 'demostrando'
      demoT = 0
      demoPaso = -1
    } else {
      fase = 'tocando'
      mostrarObjetivo(0, true)
    }
  }

  function avanzar() {
    posicion++
    if (posicion >= secuencia.length) {
      fase = 'entre'
      entreT = 0
      estado = fijarObjetivo(estado, null, reloj)
    } else mostrarObjetivo(posicion, !nivel.memoria)
  }

  function aplicar(ev: EventoPinza) {
    const c = ctx
    if (!c) return
    agregado.evento(ev)
    if (ev.tipo === 'toque') {
      contador++
      resultados[posicion] = 'hecho'
      ultimoTiempoS = ev.tiempoMs / 1000
      c.registrar('toque', { mano: lado, objeto: ev.dedo, datos: { dedo: ev.dedo, tiempoMs: Math.round(ev.tiempoMs), distanciaMinCm: Math.round(ev.distMinCm * 10) / 10, posicion: posicion + 1 } })
      if (metaAlcanzada()) {
        fase = 'fin'
        estado = fijarObjetivo(estado, null, reloj)
      } else avanzar()
    } else if (ev.tipo === 'error') {
      error[ev.dedo] = 1
      c.registrar('error', { mano: lado, objeto: ev.dedo, datos: { dedo: ev.dedo, pedido: estado.objetivo } })
    } else {
      resultados[posicion] = 'perdido'
      c.registrar('no_alcanzado', { mano: lado, objeto: ev.dedo, datos: { dedo: ev.dedo, distanciaMinCm: Math.round(ev.distMinCm * 10) / 10, tiempoMs: Math.round(ev.tiempoMs), posicion: posicion + 1 } })
      avanzar()
    }
  }

  function vistaDedo(f: DedoPinza): VistaDedo {
    if (fase === 'demostrando') return demoPaso >= 0 && demoPaso < secuencia.length && secuencia[demoPaso] === f && demoT - demoPaso * DEMO_PASO_MS < DEMO_ENCENDIDO_MS ? 'objetivo' : 'oculto'
    const i = secuencia.indexOf(f)
    const r = i >= 0 ? resultados[i] : null
    if (r) return r
    if (fase === 'tocando' && !nivel.memoria && estado.objetivo === f) return 'objetivo'
    return 'pendiente'
  }

  function estadoLuz(i: number): string {
    const r = resultados[i]
    if (r) return r
    if ((fase === 'tocando' || fase === 'demostrando') && i === posicion) return 'actual'
    return 'pendiente'
  }

  function dibujarLuces() {
    if (!lienzoLuces || !texLuces) return
    const n = secuencia.length
    const luz = Array.from({ length: n }, (_, i) => estadoLuz(i))
    const firma = luz.join(',')
    if (firma === firmaLuces) return
    firmaLuces = firma
    const g = lienzoLuces.getContext('2d')!
    const W = lienzoLuces.width
    const H = lienzoLuces.height
    g.clearRect(0, 0, W, H)
    const paso = 52
    const ancho = n * paso + 30
    const x0 = (W - ancho) / 2
    g.fillStyle = kuwuAlfa('noche', 0.9)
    g.beginPath()
    g.roundRect(x0, 4, ancho, H - 8, (H - 8) / 2)
    g.fill()
    luz.forEach((l, i) => {
      const cx = x0 + 15 + paso / 2 + i * paso
      const cy = H / 2
      g.fillStyle = COLORES_LUZ[l]
      g.beginPath()
      g.arc(cx, cy, 17, 0, Math.PI * 2)
      g.fill()
      if (l === 'actual') {
        g.strokeStyle = kuwuAlfa('amarillo', 0.45)
        g.lineWidth = 5
        g.beginPath()
        g.arc(cx, cy, 22, 0, Math.PI * 2)
        g.stroke()
      }
    })
    texLuces.needsUpdate = true
  }

  function sprite(textura: THREE.Texture, color: number, aditivo = false): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: textura, color, transparent: true, depthWrite: false, depthTest: false, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending })
    materiales.push(mat)
    const s = new THREE.Sprite(mat)
    s.renderOrder = aditivo ? 4 : 5
    s.visible = false
    return s
  }

  function ajustar(s: THREE.Sprite, tam: number, opacidad: number, color: number) {
    s.visible = opacidad > 0.01
    if (!s.visible) return
    s.scale.set(tam, tam, 1)
    const m = s.material as THREE.SpriteMaterial
    m.opacity = opacidad
    m.color.setHex(color)
  }

  /** Anillos y halos sobre la mano activa (se llama en cada cuadro). */
  function dibujar(dt: number) {
    const c = ctx
    if (!c) return
    anim += dt
    const hay = c.manos.visible(lado)
    for (const f of DEDOS_PINZA) {
      const v = visual[f]
      if (!v) continue
      error[f] = Math.max(0, error[f] - dt * 2.5)
      if (!hay) {
        v.anillo.visible = v.halo.visible = false
        continue
      }
      const p = c.manos.punto(lado, PUNTA_DEDO[f])
      v.anillo.position.copy(p)
      v.halo.position.copy(p)
      const vista = vistaDedo(f)
      const late = 0.5 + 0.5 * Math.sin(anim * 6)
      let halo = 0
      let colorHalo = COLOR_OK
      if (vista === 'objetivo') {
        ajustar(v.anillo, 0.5 + 0.06 * late, 0.95, COLOR_ACENTO)
        halo = 0.55
        colorHalo = COLOR_ACENTO
      } else if (vista === 'hecho') {
        ajustar(v.anillo, 0.36, 0.85, COLOR_OK)
        halo = 0.55
      } else if (vista === 'perdido') ajustar(v.anillo, 0.32, 0.35, 0x9fb2c4)
      else if (vista === 'pendiente') ajustar(v.anillo, 0.34, 0.55, 0xffffff)
      else ajustar(v.anillo, 0, 0, 0xffffff)
      // Dedo equivocado: un destello suave, sin castigo.
      if (error[f] > 0) {
        halo = Math.max(halo, 0.5 * error[f])
        colorHalo = COLOR_AVISO
      }
      ajustar(v.halo, 0.85 + 0.12 * late * (vista === 'objetivo' ? 1 : 0), halo, colorHalo)
    }
    if (anilloPulgar) {
      if (!hay) anilloPulgar.visible = false
      else {
        anilloPulgar.position.copy(c.manos.punto(lado, PUNTA_PULGAR))
        const tocaObjetivo = estado.contacto != null && estado.contacto === estado.objetivo
        ajustar(anilloPulgar, 0.3, estado.contacto ? 0.9 : 0.5, tocaObjetivo ? COLOR_OK : estado.contacto ? COLOR_AVISO : 0xffffff)
      }
    }
    dibujarLuces()
  }

  function depuracion(): EstadoPinzaDepuracion {
    return {
      contador,
      meta: ctx?.meta ?? 0,
      fase,
      lado,
      secuencia: [...secuencia],
      posicion,
      objetivo: estado.objetivo,
      memoria: nivel.memoria,
      resultados: [...resultados],
      contacto: estado.contacto,
      distancias,
      umbrales,
      limiteMs: nivel.limiteMs,
      secuencias: nSecuencias,
      errores: agregado.errores,
      noAlcanzados: agregado.noAlcanzados,
    }
  }

  const distObjetivo = () => (distancias && estado.objetivo ? distancias[estado.objetivo] : distancias ? masCercano(distancias).cm : null)

  return {
    id: 'pinza-fina',
    nombre: 'Pinza fina',
    gestos: ['Oposición del pulgar'],
    miniatura: 'pinza',
    niveles,
    meta: { etiqueta: 'Toques', unidad: 'toques', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['objetivo_mostrado', 'toque', 'error', 'no_alcanzado'],
    metricasVivo: [
      { id: 'tiempoToque', nombre: 'Tiempo por toque', unidad: 's', formula: 'tiempo desde que se ilumina el dedo hasta confirmar el toque (0,3 s), del último toque', mejor: 'menor' },
      { id: 'distancia', nombre: 'Distancia pulgar–dedo', unidad: 'cm', formula: 'distancia entre la punta del pulgar (4) y la punta del dedo pedido (worldLandmarks × escala de la calibración)', aprox: true, mejor: 'menor' },
      { id: 'secuencia', nombre: 'Secuencia (de 4)', unidad: '', formula: 'posición del dedo pedido dentro de la secuencia actual' },
    ],
    metricasResumen: [
      { id: 'tiempoMedioToque', nombre: 'Tiempo medio por toque', unidad: 's', formula: 'promedio de (toque confirmado − dedo mostrado) de los toques logrados', mejor: 'menor', corto: 'Tiempo por toque' },
      ...DEDOS_PINZA.map((d) => ({
        id: `distMin${capital(d)}`,
        nombre: `Distancia mínima pulgar–${NOMBRE_DEDO[d]}`,
        unidad: 'cm' as const,
        formula: `mínima distancia entre la punta del pulgar y la del ${NOMBRE_DEDO[d]} en todos los intentos (aprox., cm)`,
        aprox: true,
        mejor: 'menor' as const,
        corto: `Pulgar–${NOMBRE_DEDO[d]}`,
      })),
      { id: 'toques', nombre: 'Toques logrados', unidad: '', formula: "eventos 'toque'", mejor: 'mayor' },
      { id: 'errores', nombre: 'Errores', unidad: '', formula: "eventos 'error' (tocó un dedo distinto al iluminado)", mejor: 'menor' },
      { id: 'noAlcanzados', nombre: 'Toques no alcanzados', unidad: '', formula: "eventos 'no_alcanzado' (se acabó el tiempo y el juego siguió)", mejor: 'menor' },
      { id: 'dedosNoAlcanzados', nombre: 'Dedos que no alcanza', unidad: '', formula: "dedos con algún 'no_alcanzado'", mejor: 'menor' },
      { id: 'precision', nombre: 'Aciertos', unidad: '%', formula: 'toques / (toques + errores + no alcanzados)', mejor: 'mayor', tarjeta: false },
      ...DEDOS_PINZA.map((d) => ({ id: `noAlcanza${capital(d)}`, nombre: `No alcanzado: ${NOMBRE_DEDO[d]}`, unidad: '' as const, formula: `eventos 'no_alcanzado' del dedo ${NOMBRE_DEDO[d]}`, mejor: 'menor' as const })),
    ],
    usaFisica: false,
    pista: 'Toca con el pulgar el dedo que se ilumina',

    montar(c) {
      ctx = c
      nivel = nivelPinza(c.parametros.nivel)
      const mano = c.parametros.mano
      lados = mano === 'ambas' ? [...LADOS] : [mano === 'izquierda' ? 'izquierda' : 'derecha']
      umbrales = umbralesToque(c.calibracion?.largoManoCm)
      cfg = { ...umbrales, limiteMs: nivel.limiteMs }
      // Mano grande y de frente: se acerca a la cámara, casi vertical y centrada en la mesa.
      c.configurarManos({ x: [-1.0, 1.0], y: [0.1, 0.5], z: [0.9, 0.3], escala: 9, inclinacionDeg: 10 })

      const tAnillo = texturaAnillo()
      const tHalo = texturaHalo()
      texturas.push(tAnillo, tHalo)
      for (const f of DEDOS_PINZA) {
        const v = { anillo: sprite(tAnillo, 0xffffff), halo: sprite(tHalo, COLOR_ACENTO, true) }
        visual[f] = v
        grupo.add(v.halo, v.anillo)
      }
      anilloPulgar = sprite(tAnillo, 0xffffff)
      grupo.add(anilloPulgar)
      c.escena.add(grupo)

      // Fila de luces fija a la cámara (bajo la barra de tiempo).
      lienzoLuces = document.createElement('canvas')
      lienzoLuces.width = 360
      lienzoLuces.height = 90
      texLuces = new THREE.CanvasTexture(lienzoLuces)
      texLuces.colorSpace = THREE.SRGBColorSpace
      texturas.push(texLuces)
      const matLuces = new THREE.SpriteMaterial({ map: texLuces, transparent: true, depthWrite: false, depthTest: false })
      materiales.push(matLuces)
      const sLuces = new THREE.Sprite(matLuces)
      sLuces.renderOrder = 10
      const alto = 0.3
      sLuces.scale.set(alto * 4, alto, 1)
      luces.position.set(0, 0.92, -5)
      luces.add(sLuces)
      c.camara.add(luces)
      c.escena.add(c.camara)

      secuencia = Array(LARGO_SECUENCIA).fill('indice') as DedoPinza[]
      iniciarSecuencia()
      dibujar(0)
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(manos: ManoSeguida[], dt) {
      const c = ctx
      if (!c) return
      reloj += dt * 1000
      const m = manos.find((x) => x.lado === lado)
      distancias = m ? distanciasPulgar(m.worldLandmarks, c.escalaCm) : null

      if (fase === 'demostrando') {
        demoT += dt * 1000
        const paso = Math.floor(demoT / DEMO_PASO_MS)
        if (paso !== demoPaso) {
          demoPaso = paso
          if (paso < secuencia.length) {
            c.registrar('objetivo_mostrado', { mano: lado, objeto: secuencia[paso], datos: { dedo: secuencia[paso], posicion: paso + 1, de: secuencia.length, fase: 'demostracion', visible: true } })
            posicion = paso
          } else {
            // Ahora la repite el paciente: sin anillo amarillo, con el tiempo corriendo.
            fase = 'tocando'
            posicion = 0
            mostrarObjetivo(0, false)
          }
        }
      } else if (fase === 'entre') {
        entreT += dt * 1000
        if (entreT >= ENTRE_MS) iniciarSecuencia()
      }

      // La detección corre siempre (también entre secuencias, para saber cuándo se separó el pulgar).
      const r = pasoPinza(estado, distancias, reloj, cfg)
      estado = r.estado
      if (fase === 'tocando') for (const ev of r.eventos) aplicar(ev)
      dibujar(dt)
    },

    hud() {
      const c = ctx
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of lados) {
        if (!c?.medidas(l)) continue
        if (l !== lado) manos[l] = { texto: 'En espera', tono: 'neutro' }
        else manos[l] = estado.contacto ? { texto: 'Tocando', tono: 'acento' } : { texto: 'Libre', tono: 'ok' }
      }
      let pista: string | undefined
      if (metaAlcanzada()) pista = '¡Muy bien! Terminaste los toques'
      else if (fase === 'demostrando') pista = 'Mira la secuencia'
      else if (nivel.memoria && fase === 'tocando') pista = 'Ahora repítela de memoria'
      else if (lados.length > 1 && fase === 'tocando') pista = `Mano ${lado}: toca con el pulgar el dedo que se ilumina`
      return {
        contador,
        manos,
        pista,
        vivo: {
          tiempoToque: ultimoTiempoS == null ? null : Math.round(ultimoTiempoS * 10) / 10,
          distancia: distObjetivo() == null ? null : Math.round((distObjetivo() as number) * 10) / 10,
          secuencia: fase === 'tocando' || fase === 'demostrando' ? Math.min(secuencia.length, posicion + 1) : fase === 'entre' ? secuencia.length : null,
        },
      }
    },

    muestra() {
      const d = distObjetivo()
      return { distanciaCm: d == null ? null : Math.round(d * 10) / 10, tocando: estado.contacto ? 1 : 0 }
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
