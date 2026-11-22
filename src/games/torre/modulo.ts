// Torre de cubos (F22, J1; imagenes_juegos/01_torre_de_cubos.png y docs/referencia/prompts_juegos/J1_torre_de_cubos.md).
//
// Base redonda al centro de la mesa y cubos de colores sueltos a los lados. Física con Rapier (cubos dinámicos, base
// fija). Pinza con histéresis como en la Caja (src/metrics/agarre.ts): se toma el cubo si el punto de pinza está
// cerca; mientras se sostiene es cinemático (y se endereza, para apilar), al abrir la pinza cae. Una silueta
// amarilla translúcida (y un aro de tolerancia sobre la base) marca dónde va el cubo siguiente.
//
// Colocado: el cubo queda quieto 1 s con el centro dentro de la tolerancia del nivel y a la altura de la silueta.
// Si queda quieto sobre la torre pero fuera de tolerancia no cuenta y vuelve a la mesa; si queda en otro lado de la
// mesa se puede volver a tomar. Si algún cubo colocado se corre o baja → `caida`: tras 1,5 s se rearma la torre
// (todos los cubos vuelven a su lugar; la sesión sigue) y las métricas se conservan.
//
// Eventos por cubo: tomar {aperturaCm} + agarre_inicio {aperturaCm} (al cerrar la pinza) → agarre_fin {duracionMs}
// (al abrirla) → soltar {desvioCm, estabilidad, aperturaCm, enCaja, motivo?} (cuando queda quieto) → colocado
// {piso, alturaCubos, desvioCm, desvioFinalCm}. `agarre_inicio`/`agarre_fin` y `soltar.enCaja` (= colocado) se
// anotan para que los agregados de la base (contarAgarres: agarres, intentos, precisión, tiempo) sigan funcionando.
// `caida {alturaCubos}` al caer la torre.
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { kuwuNum } from '../../ui/paleta'
import { crearAnilloPlano } from '../assets/formas'
import { crearPiezaFisica } from '../assets/piezas'
import type { Recursos } from '../assets/recursos'
import { crearBaseTorre, crearSilueta } from '../assets/torre/base'
import type { LadoMano } from '../../domain/types'
import { configDesdeCalibracion, pasoAgarreTolerante, type ConfigAgarre, type EstadoAgarre } from '../../metrics/agarre'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import { ZONA_BASE, type ZonaManos } from '../shell/manos3d'
import {
  alturaMinimaSostenido,
  BASE,
  COLORES,
  MS_MAX_ASENTAR,
  NIVELES_TORRE,
  U_POR_CM,
  Y_CAIDA,
  alturaSilueta,
  aperturaAlTomar,
  colocacionSinMano,
  desvioCm,
  distanciaToma,
  estaQuieto,
  estabilidad,
  evaluarColocacion,
  ladoUnidades,
  MS_ANTES_SOLTAR,
  nivelTorre,
  pasoReposo,
  posicionAntes,
  posicionesCubos,
  registroVacio,
  resumenTorre,
  torreCaida,
  type MuestraApertura,
  type MuestraMano,
  type NivelTorre,
} from './logica'

const LADOS: LadoMano[] = ['izquierda', 'derecha']

/** Zona de las manos: más alta que la base, para llegar al piso 6. */
export const ZONA_TORRE: Partial<ZonaManos> = { x: [-2.35, 2.35], y: [0.2, 1.9] }

/** Espera tras caer la torre antes de rearmarla (ms). */
export const MS_REARMAR = 1500

type EstadoCubo = 'mesa' | 'tomado' | 'soltado' | 'colocado'

interface Cubo {
  id: string
  inicio: { x: number; y: number; z: number }
  cuerpo: RAPIER_NS.RigidBody
  malla: THREE.Mesh
  estado: EstadoCubo
  mano: LadoMano | null
  soltadoT: number
  quietoDesde: number | null
  sostenido: THREE.Vector3
  /** Datos del último soltar (a la espera de que quede quieto). */
  desvio: number | null
  estab: number | null
  apertura: number | null
  /** Dónde quedó al colocarse. */
  colocadoEn: { x: number; y: number; z: number } | null
  /** El último agarre terminó porque se dejó de ver la mano (no lo soltó el paciente): no cuenta como colocado. */
  perdido: boolean
}

const niveles = Object.fromEntries(([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { ...NIVELES_TORRE[n] }])) as unknown as Record<NumeroNivel, ParametrosNivel>

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoTorreDepuracion {
  contador: number
  meta: number
  caidas: number
  lado: number
  toleranciaCm: number
  base: typeof BASE
  silueta: { x: number; y: number; z: number } | null
  cubos: { id: string; estado: EstadoCubo; mano: LadoMano | null; x: number; y: number; z: number; inicio: { x: number; y: number; z: number } }[]
  zona: ZonaManos
  pinza: Partial<Record<LadoMano, { x: number; y: number; z: number }>>
  punta: Partial<Record<LadoMano, { x: number; y: number; z: number }>>
  agarrando: Partial<Record<LadoMano, boolean>>
  umbrales: ConfigAgarre
  desvioPorPiso: (number | null)[]
}

export const crearTorre: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let R: typeof RAPIER_NS | null = null
  let nivel: NivelTorre = NIVELES_TORRE[1]
  let lado = ladoUnidades(NIVELES_TORRE[1])
  const cubos: Cubo[] = []
  const colocados: Cubo[] = []
  const escenaExtra: THREE.Object3D[] = []
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const recursos: Recursos = { materiales, geometrias, texturas: [] }
  let silueta: THREE.Group | null = null
  let cfg: ConfigAgarre = configDesdeCalibracion(null)
  const agarre: Record<LadoMano, EstadoAgarre> = { izquierda: { agarrando: false }, derecha: { agarrando: false } }
  const sostiene: Partial<Record<LadoMano, { cubo: Cubo; inicioT: number; rastro: MuestraMano[] }>> = {}
  const histAperturas: Record<LadoMano, MuestraApertura[]> = { izquierda: [], derecha: [] }
  const histPosicion: Record<LadoMano, MuestraMano[]> = { izquierda: [], derecha: [] }
  const registro = registroVacio()
  let caidaT: number | null = null
  let completaT: number | null = null
  let avisoHasta = 0
  let aviso = ''
  let vivoDesvio: number | null = null
  let vivoApertura: number | null = null
  let vivoEstab: number | null = null
  const tmp = new THREE.Vector3()

  const pinza = (l: LadoMano, destino = new THREE.Vector3()) => destino.addVectors(ctx!.manos.punto(l, 4), ctx!.manos.punto(l, 8)).multiplyScalar(0.5)
  const posDe = (c: Cubo) => (c.estado === 'tomado' ? c.sostenido : c.cuerpo.translation())

  function montarBase(c: ContextoJuego) {
    const malla = crearBaseTorre(recursos, c.fisica!, BASE, c.mesa.altura)
    c.escena.add(malla)
    escenaExtra.push(malla)
    // Aro de tolerancia sobre la base (radio = tolerancia del nivel).
    const r = nivel.toleranciaCm * U_POR_CM
    const aro = crearAnilloPlano(recursos, { interno: Math.max(0.01, r - 0.012), externo: r, color: kuwuNum('amarillo'), opacidad: 0.7, segmentos: 48, dobleCara: true, orden: 0 })
    aro.position.set(BASE.x, c.mesa.altura + BASE.grosor + 0.003, BASE.z)
    c.escena.add(aro)
    escenaExtra.push(aro)
  }

  function montarSilueta(c: ContextoJuego) {
    const g = crearSilueta(recursos, lado)
    c.escena.add(g)
    escenaExtra.push(g)
    silueta = g
    posicionarSilueta()
  }

  function posicionarSilueta() {
    if (!silueta || !ctx) return
    silueta.visible = colocados.length < nivel.cubos
    silueta.position.set(BASE.x, alturaSilueta(colocados.length, lado, ctx.mesa.altura), BASE.z)
  }

  function crearCubo(c: ContextoJuego, i: number, pos: { x: number; z: number }): Cubo {
    const inicio = { x: pos.x, y: c.mesa.altura + lado / 2 + 0.005, z: pos.z }
    const yaw = ((i * 0.7) % 1.2) - 0.5
    const { malla, cuerpo } = crearPiezaFisica(recursos, c.fisica!, {
      forma: 'cubo',
      tam: lado,
      color: COLORES[i % COLORES.length],
      rugosidad: 0.5,
      inicio,
      rotacion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      amortiguacion: [0.4, 1.5],
      roce: 0.9,
      rebote: 0.05,
    })
    c.escena.add(malla)
    const cubo: Cubo = {
      id: `cubo-${i + 1}`,
      inicio,
      cuerpo,
      malla,
      estado: 'mesa',
      mano: null,
      soltadoT: 0,
      quietoDesde: null,
      sostenido: new THREE.Vector3(),
      desvio: null,
      estab: null,
      apertura: null,
      colocadoEn: null,
      perdido: false,
    }
    sincronizar(cubo)
    return cubo
  }

  function sincronizar(j: Cubo) {
    if (j.estado === 'tomado') j.malla.position.copy(j.sostenido)
    else {
      const p = j.cuerpo.translation()
      j.malla.position.set(p.x, p.y, p.z)
    }
    const q = j.cuerpo.rotation()
    j.malla.quaternion.set(q.x, q.y, q.z, q.w)
  }

  function aDinamico(j: Cubo) {
    j.cuerpo.setBodyType(R!.RigidBodyType.Dynamic, true)
    j.cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true)
    j.cuerpo.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  function volverAlInicio(j: Cubo) {
    if (j.cuerpo.bodyType() !== R!.RigidBodyType.Dynamic) aDinamico(j)
    j.cuerpo.setTranslation(j.inicio, true)
    j.cuerpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    j.cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true)
    j.cuerpo.setAngvel({ x: 0, y: 0, z: 0 }, true)
    j.estado = 'mesa'
    j.mano = null
    j.quietoDesde = null
    j.colocadoEn = null
    j.perdido = false
    sincronizar(j)
  }

  function mostrarAviso(texto: string, ms = 3000) {
    aviso = texto
    avisoHasta = (ctx?.ahora() ?? 0) + ms
  }

  function tomar(l: LadoMano, j: Cubo) {
    const c = ctx!
    const t = c.ahora()
    if (j.estado === 'soltado') {
      // Se volvió a tomar antes de quedar quieto: ese soltar termina sin colocarse.
      c.registrar('soltar', { mano: j.mano, objeto: j.id, datos: { desvioCm: j.desvio, estabilidad: j.estab, aperturaCm: j.apertura, enCaja: false, motivo: 'retomado' } })
    }
    j.estado = 'tomado'
    j.mano = l
    j.quietoDesde = null
    j.perdido = false
    const p = j.cuerpo.translation()
    j.sostenido.set(p.x, p.y, p.z)
    // Se endereza para poder apilarlo (queda alineado con la torre).
    j.cuerpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    j.cuerpo.setBodyType(R!.RigidBodyType.KinematicPositionBased, true)
    const apertura = aperturaAlTomar(histAperturas[l], t) ?? c.medidas(l)?.aperturaPinzaCm ?? null
    const ap = apertura == null ? null : Math.round(apertura * 10) / 10
    j.apertura = ap
    if (ap != null) {
      registro.aperturas.push(ap)
      vivoApertura = ap
    }
    sostiene[l] = { cubo: j, inicioT: t, rastro: [] }
    c.registrar('tomar', { mano: l, objeto: j.id, datos: { aperturaCm: ap } })
    c.registrar('agarre_inicio', { mano: l, objeto: j.id, datos: { aperturaCm: ap } })
  }

  /** `perdida` = el agarre terminó porque se dejó de ver la mano (pasada la gracia), no porque el paciente abrió la pinza. */
  function soltarDeMano(l: LadoMano, perdida = false) {
    const c = ctx!
    const s = sostiene[l]
    delete sostiene[l]
    if (!s) return
    const j = s.cubo
    const t = c.ahora()
    // Al abrir los dedos el punto medio de la pinza se corre: el cubo se suelta donde estaba MS_ANTES_SOLTAR antes.
    const antes = posicionAntes(s.rastro, t) ?? { x: j.sostenido.x, y: j.sostenido.y, z: j.sostenido.z }
    // Esa posición puede quedar dentro de la torre: nunca por debajo del piso (mesa / base / último cubo colocado).
    const donde = { ...antes, y: Math.max(antes.y, alturaMinimaSostenido(antes.x, antes.z, colocados.length, lado, c.mesa.altura)) }
    j.sostenido.set(donde.x, donde.y, donde.z)
    j.desvio = desvioCm(donde)
    j.estab = estabilidad(histPosicion[l], t - MS_ANTES_SOLTAR)
    j.perdido = perdida
    // Una pérdida de seguimiento no es un soltar del paciente: no entra en el desvío en vivo ni en la estabilidad.
    if (!perdida) {
      vivoDesvio = j.desvio
      if (j.estab != null) vivoEstab = j.estab
      if (j.estab != null) registro.estabilidades.push(j.estab)
    }
    const duracionMs = Math.round(t - s.inicioT)
    c.registrar('agarre_fin', { mano: l, objeto: j.id, datos: perdida ? { duracionMs, motivo: 'sin-mano' } : { duracionMs } })
    aDinamico(j)
    j.cuerpo.setTranslation({ x: j.sostenido.x, y: j.sostenido.y, z: j.sostenido.z }, true)
    j.estado = 'soltado'
    j.soltadoT = t
    j.quietoDesde = null
  }

  /** El cubo quedó quieto: cuenta como colocado o no, y se anota `soltar`. */
  function resolverSoltado(j: Cubo) {
    const c = ctx!
    const p = j.cuerpo.translation()
    const perdido = j.perdido
    const medida = evaluarColocacion(p, colocados.length, lado, nivel.toleranciaCm, c.mesa.altura)
    // Soltado por pérdida de seguimiento: nunca cuenta como colocado (y si quedó sobre la torre, vuelve a la mesa).
    const ev = perdido ? colocacionSinMano(medida) : medida
    const datos = { desvioCm: j.desvio, estabilidad: j.estab, aperturaCm: j.apertura, enCaja: ev.valida, ...(perdido ? { motivo: 'sin-mano' } : {}) }
    if (ev.valida) {
      c.registrar('soltar', { mano: j.mano, objeto: j.id, datos })
      const piso = colocados.length
      j.estado = 'colocado'
      j.colocadoEn = { x: p.x, y: p.y, z: p.z }
      colocados.push(j)
      const d = j.desvio ?? ev.desvioCm
      registro.desvioPorPiso[piso] = d
      registro.desviosColocados.push(d)
      registro.alturaMax = Math.max(registro.alturaMax, colocados.length)
      c.registrar('colocado', { mano: j.mano, objeto: j.id, datos: { piso: piso + 1, alturaCubos: colocados.length, desvioCm: d, desvioFinalCm: ev.desvioCm } })
      posicionarSilueta()
    } else if (ev.enHuella) {
      c.registrar('soltar', { mano: j.mano, objeto: j.id, datos: perdido ? datos : { ...datos, motivo: 'fuera de tolerancia' } })
      volverAlInicio(j)
      mostrarAviso(perdido ? 'No vimos tu mano: el cubo vuelve a la mesa' : 'Centra el cubo sobre la silueta amarilla')
    } else {
      c.registrar('soltar', { mano: j.mano, objeto: j.id, datos })
      j.estado = 'mesa'
    }
    j.mano = null
    j.quietoDesde = null
    j.perdido = false
  }

  function cercano(l: LadoMano): Cubo | null {
    const p = pinza(l, tmp)
    let mejor: Cubo | null = null
    let dMejor = Infinity
    for (const j of cubos) {
      if (j.estado === 'tomado' || j.estado === 'colocado') continue
      const d = distanciaToma(p, j.cuerpo.translation(), lado)
      if (d != null && d < dMejor) {
        dMejor = d
        mejor = j
      }
    }
    return mejor
  }

  /** Rearma la torre: todos los cubos a su lugar (la sesión sigue). */
  function reconstruir(motivo: string) {
    for (const l of LADOS) if (sostiene[l]) soltarDeMano(l)
    for (const j of cubos) {
      if (j.estado === 'soltado') {
        ctx!.registrar('soltar', { mano: j.mano, objeto: j.id, datos: { desvioCm: j.desvio, estabilidad: j.estab, aperturaCm: j.apertura, enCaja: false, motivo } })
      }
      volverAlInicio(j)
    }
    colocados.length = 0
    caidaT = null
    completaT = null
    posicionarSilueta()
  }

  function depuracion(): EstadoTorreDepuracion {
    const v = (p: { x: number; y: number; z: number }) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) })
    const pinzas: EstadoTorreDepuracion['pinza'] = {}
    const puntas: EstadoTorreDepuracion['punta'] = {}
    for (const l of LADOS) {
      if (ctx?.manos.visible(l)) {
        pinzas[l] = v(pinza(l))
        puntas[l] = v(ctx.manos.punto(l, 8))
      }
    }
    return {
      contador: colocados.length,
      meta: nivel.cubos,
      caidas: registro.caidas,
      lado,
      toleranciaCm: nivel.toleranciaCm,
      base: BASE,
      silueta: silueta?.visible ? v(silueta.position) : null,
      cubos: cubos.map((j) => ({ id: j.id, estado: j.estado, mano: j.mano, ...v(posDe(j)), inicio: v(j.inicio) })),
      zona: { ...ZONA_BASE, ...ZONA_TORRE },
      pinza: pinzas,
      punta: puntas,
      agarrando: { izquierda: agarre.izquierda.agarrando, derecha: agarre.derecha.agarrando },
      umbrales: cfg,
      desvioPorPiso: [...registro.desvioPorPiso],
    }
  }

  return {
    id: 'torre-cubos',
    nombre: 'Torre de cubos',
    gestos: ['Precisión', 'Control'],
    miniatura: 'torre',
    niveles,
    meta: { etiqueta: 'Altura', unidad: 'cubos', desdePlan: (p) => (p.metaAgarres > 0 ? nivelTorre(p.nivel).cubos : 0) },
    tiposEvento: ['tomar', 'agarre_inicio', 'agarre_fin', 'soltar', 'colocado', 'caida'],
    metricasVivo: [
      { id: 'desvio', nombre: 'Desvío al soltar', unidad: 'cm', formula: 'distancia horizontal entre el centro del cubo y el centro de la silueta al abrir la pinza (cm de la escena, aprox.)', aprox: true },
      { id: 'apertura', nombre: 'Apertura de pinza', unidad: 'cm', formula: 'mayor distancia 4–8 (worldLandmarks × escala) en los 1,5 s antes de cerrar la pinza sobre el cubo', aprox: true },
      { id: 'estabilidad', nombre: 'Estabilidad', unidad: '%', formula: '100 × (1 − variación del punto de pinza en el último segundo antes de soltar / 5 cm de la escena, aprox.)', mejor: 'mayor' },
    ],
    metricasResumen: [
      { id: 'desvioMedio', nombre: 'Desvío medio al soltar', unidad: 'cm', formula: 'promedio del desvío al soltar de los cubos colocados (cm de la escena, aprox.)', aprox: true, mejor: 'menor', corto: 'Desvío al soltar' },
      { id: 'aperturaPinza', nombre: 'Apertura de pinza al tomar', unidad: 'cm', formula: 'promedio de la apertura de pinza al tomar cada cubo', aprox: true, corto: 'Apertura de pinza' },
      { id: 'estabilidad', nombre: 'Estabilidad', unidad: '%', formula: 'promedio de la estabilidad del último segundo antes de cada soltar (0–100; la variación se mide en cm de la escena, aprox.)', mejor: 'mayor' },
      { id: 'alturaMax', nombre: 'Altura máxima', unidad: '', formula: 'mayor número de cubos colocados a la vez', mejor: 'mayor', tarjeta: true, corto: 'Altura máxima (cubos)' },
      { id: 'caidas', nombre: 'Caídas de la torre', unidad: '', formula: "eventos 'caida'", mejor: 'menor', tarjeta: true, corto: 'Caídas de la torre' },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `desvioCubo${n}`, nombre: `Desvío del cubo ${n}`, unidad: 'cm' as const, formula: `desvío al soltar del cubo del piso ${n} (el último colocado ahí; cm de la escena, aprox.)`, aprox: true, mejor: 'menor' as const, tarjeta: false })),
    ],
    usaFisica: true,
    pista: 'Apila el cubo sobre la torre',
    textoReiniciar: 'Reiniciar',

    montar(c) {
      if (!c.fisica) throw new Error('Torre de cubos necesita física')
      ctx = c
      R = c.fisica.RAPIER
      nivel = nivelTorre(c.parametros.nivel)
      lado = ladoUnidades(nivel)
      cfg = configDesdeCalibracion(c.calibracion?.aperturaPinzaMaxCm)
      c.configurarManos(ZONA_TORRE)
      montarBase(c)
      montarSilueta(c)
      posicionesCubos(nivel.cubos).forEach((pos, i) => cubos.push(crearCubo(c, i, pos)))
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(_manos, dt) {
      const c = ctx
      if (!c) return
      const t = c.ahora()
      // 1) Historial de mano y pinza con histéresis.
      for (const l of LADOS) {
        const m = c.medidas(l)
        if (m) {
          const ha = histAperturas[l]
          ha.push({ t, cm: m.aperturaPinzaCm })
          while (ha.length && ha[0].t < t - 3000) ha.shift()
          const hp = histPosicion[l]
          const p = pinza(l, tmp)
          hp.push({ t, x: p.x, y: p.y, z: p.z })
          while (hp.length && hp[0].t < t - 3000) hp.shift()
        }
        const candidato = m && !agarre[l].agarrando && caidaT == null ? cercano(l) : null
        // Un hueco corto sin ver la mano no suelta el cubo; si se pierde de verdad, se suelta sin contar como colocado.
        const r = pasoAgarreTolerante(agarre[l], m ? m.aperturaPinzaCm : null, !!candidato, dt * 1000, cfg)
        agarre[l] = r.estado
        if (r.cambio === 'inicio' && candidato) tomar(l, candidato)
        else if (r.cambio === 'fin') soltarDeMano(l, r.perdida)
      }
      // 2) Cubos sostenidos siguen al punto de pinza (sin hundirse en la mesa ni en la base).
      const k = Math.min(1, dt * 25)
      for (const l of LADOS) {
        const s = sostiene[l]
        if (!s) continue
        const j = s.cubo
        pinza(l, tmp)
        // Piso: mesa, base y cubos ya colocados (el sostenido es cinemático y empujaría la torre al tocarla).
        tmp.y = Math.max(tmp.y, alturaMinimaSostenido(tmp.x, tmp.z, colocados.length, lado, c.mesa.altura))
        j.sostenido.lerp(tmp, k)
        j.sostenido.y = Math.max(j.sostenido.y, alturaMinimaSostenido(j.sostenido.x, j.sostenido.z, colocados.length, lado, c.mesa.altura))
        s.rastro.push({ t, x: j.sostenido.x, y: j.sostenido.y, z: j.sostenido.z })
        while (s.rastro.length && s.rastro[0].t < t - 1000) s.rastro.shift()
        j.cuerpo.setNextKinematicTranslation({ x: j.sostenido.x, y: j.sostenido.y, z: j.sostenido.z })
      }
      // 3) Cubos soltados: esperar a que queden quietos 1 s (o un máximo) y decidir.
      for (const j of cubos) {
        const p = j.cuerpo.translation()
        if (p.y < Y_CAIDA) {
          if (j.estado === 'soltado') {
            c.registrar('soltar', { mano: j.mano, objeto: j.id, datos: { desvioCm: j.desvio, estabilidad: j.estab, aperturaCm: j.apertura, enCaja: false, motivo: 'cayo' } })
          }
          if (j.estado === 'colocado') colocados.splice(colocados.indexOf(j), 1)
          if (j.estado !== 'tomado') volverAlInicio(j)
          continue
        }
        if (j.estado === 'soltado') {
          const r = pasoReposo(j.quietoDesde, t, estaQuieto(j.cuerpo.linvel(), j.cuerpo.angvel()))
          j.quietoDesde = r.desde
          if (r.listo || t - j.soltadoT >= MS_MAX_ASENTAR) resolverSoltado(j)
        }
        sincronizar(j)
      }
      // 4) ¿Se cayó la torre? Se anota una vez y se rearma tras MS_REARMAR.
      if (caidaT == null && colocados.length) {
        const caida = torreCaida(
          colocados.map((j) => {
            const p = j.cuerpo.translation()
            return { x0: j.colocadoEn!.x, y0: j.colocadoEn!.y, z0: j.colocadoEn!.z, x: p.x, y: p.y, z: p.z, lado }
          }),
        )
        if (caida) {
          caidaT = t
          registro.caidas++
          c.registrar('caida', { datos: { alturaCubos: colocados.length, caidas: registro.caidas } })
          mostrarAviso('¡Se cayó la torre! La armamos de nuevo', MS_REARMAR + 1500)
        }
      }
      if (caidaT != null && t - caidaT >= MS_REARMAR) reconstruir('caida')
      // 5) Práctica libre (sin meta): al completar la torre se rearma sola; la sesión termina solo por tiempo.
      if (c.meta <= 0 && caidaT == null && colocados.length >= nivel.cubos) {
        completaT ??= t
        if (t - completaT >= MS_REARMAR) {
          mostrarAviso('¡Torre completa! La armamos de nuevo')
          reconstruir('completa')
        }
      }
    },

    hud() {
      const c = ctx
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const l of LADOS) if (c?.medidas(l) && sostiene[l]) manos[l] = { texto: 'Agarrando', tono: 'acento' }
      const sosteniendo = LADOS.some((l) => sostiene[l])
      const hayAviso = c != null && c.ahora() < avisoHasta
      return {
        contador: colocados.length,
        manos,
        pista: hayAviso ? aviso : sosteniendo ? 'Suéltalo sobre la silueta amarilla' : undefined,
        vivo: { desvio: vivoDesvio, apertura: vivoApertura, estabilidad: vivoEstab },
      }
    },

    reiniciar() {
      if (ctx) reconstruir('reinicio')
    },

    muestra() {
      return { agarrando: LADOS.some((l) => sostiene[l]) ? 1 : 0, altura: colocados.length }
    },

    resumen() {
      return resumenTorre(registro)
    },

    desmontar() {
      const c = ctx
      if (c) {
        for (const j of cubos) c.escena.remove(j.malla)
        for (const o of escenaExtra) c.escena.remove(o)
      }
      for (const g of geometrias) g.dispose()
      for (const m of materiales) m.dispose()
      if (typeof window !== 'undefined' && window.__manoviva?.juego) {
        const { juego: _quitar, ...resto } = window.__manoviva
        void _quitar
        window.__manoviva = resto
      }
      cubos.length = 0
      colocados.length = 0
      ctx = null
    },
  }
}
