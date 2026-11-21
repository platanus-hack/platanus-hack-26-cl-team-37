// Caja de juguetes (F10, Prompt 6; imagenes/06a_juego_agarre.png y 06b_juego_meta_cumplida.png).
//
// Juguetes de colores (cubos, esferas, cilindros, cápsulas, conos) sobre la mesa y una caja de madera abierta al
// centro. Física con Rapier: los juguetes son cuerpos dinámicos; la caja (piso + 4 paredes) es fija.
//
// Agarre por pinza con histéresis (src/metrics/agarre.ts, umbrales ajustados con la calibración): se cierra solo si
// el punto de pinza (punto medio de las puntas del pulgar e índice en la escena) está cerca de un juguete. Mientras
// se sostiene, el juguete pasa a cinemático y sigue al punto de pinza; al abrir vuelve a dinámico y cae. El agarre
// termina cuando el juguete queda quieto: cuenta si quedó dentro de la caja.
//
// Eventos (orden por juguete): agarre_inicio (cierra la pinza) → agarre_fin (abre la pinza, datos.duracionMs) →
// soltar (el juguete quedó quieto; datos.enCaja). Así contarAgarres (src/metrics/sesion.ts) da agarres, intentos,
// precisión y tiempo medio (inicio → agarre_fin). Los juguetes guardados quedan en la caja (no se pueden volver a
// tomar); cuando no queda ninguno en la mesa vuelven todos a su lugar. "Reiniciar objetos" hace lo mismo a mano.
// Un juguete que cae de la mesa vuelve a su lugar.
//
// Suavidad: SPARC de la trayectoria de la muñeca en cada traslado (desde que se toma hasta que se suelta),
// src/metrics/suavidad.ts; la sesión reporta el promedio (escala 0–100). En vivo se muestra el promedio hasta ahora.
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { NATURAL } from '../shell/colores'
import type { LadoMano } from '../../domain/types'
import { configDesdeCalibracion, pasoAgarre, type ConfigAgarre, type EstadoAgarre } from '../../metrics/agarre'
import { contarAgarres } from '../../metrics/sesion'
import { suavidadSesion, type PuntoTrayectoria } from '../../metrics/suavidad'
import { juegoPorId } from '../registry'
import type { ContextoJuego, CrearJuego, EstadoManoHud, NumeroNivel, ParametrosNivel } from '../shell/contrato'
import { ZONA_BASE, type ZonaManos } from '../shell/manos3d'
import {
  CAJA,
  COLORES,
  FORMAS,
  MS_MAX_ASENTAR,
  MS_QUIETO,
  TAM_BASE,
  cayoDeLaMesa,
  dentroDeCaja,
  distanciaToma,
  estaQuieto,
  medioAlto,
  posicionesJuguetes,
  type Forma,
} from './logica'

const LADOS: LadoMano[] = ['izquierda', 'derecha']

/** Zona de las manos virtuales para este juego: más abajo y un poco más ancha, para alcanzar la mesa. */
export const ZONA_CAJA: Partial<ZonaManos> = { x: [-2.35, 2.35], y: [0.15, 1.5] }

type EstadoJuguete = 'mesa' | 'tomado' | 'soltado' | 'guardado'

interface Juguete {
  id: string
  forma: Forma
  tam: number
  inicio: { x: number; y: number; z: number }
  rotInicio: THREE.Quaternion
  cuerpo: RAPIER_NS.RigidBody
  malla: THREE.Mesh
  estado: EstadoJuguete
  mano: LadoMano | null
  /** ms de juego al soltar y desde cuándo está quieto. */
  soltadoT: number
  quietoDesde: number | null
  /** Posición sostenida (suavizada). */
  sostenido: THREE.Vector3
}

interface Traslado {
  juguete: Juguete
  inicioT: number
  tray: PuntoTrayectoria[]
}

const niveles = Object.fromEntries(
  juegoPorId('caja-juguetes')!.niveles.map((n) => [
    n.nivel,
    { nombre: n.nombre, detalle: n.detalle, tamano: n.tamano, cantidad: n.cantidad, distanciaCaja: n.distanciaCaja },
  ]),
) as unknown as Record<NumeroNivel, ParametrosNivel>

const r1 = (x: number) => Math.round(x * 10) / 10

/** Estado legible para e2e y depuración (window.__manoviva.juego.estado()). */
export interface EstadoCajaDepuracion {
  contador: number
  objetos: { id: string; forma: Forma; tam: number; estado: EstadoJuguete; mano: LadoMano | null; x: number; y: number; z: number; inicio: { x: number; y: number; z: number } }[]
  caja: typeof CAJA
  zona: ZonaManos
  pinza: Partial<Record<LadoMano, { x: number; y: number; z: number }>>
  punta: Partial<Record<LadoMano, { x: number; y: number; z: number }>>
  agarrando: Partial<Record<LadoMano, boolean>>
  umbrales: ConfigAgarre
}

export const crearCaja: CrearJuego = () => {
  let ctx: ContextoJuego | null = null
  let R: typeof RAPIER_NS | null = null
  const juguetes: Juguete[] = []
  const mallasCaja: THREE.Mesh[] = []
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  let cfg: ConfigAgarre = configDesdeCalibracion(null)
  const agarre: Record<LadoMano, EstadoAgarre> = { izquierda: { agarrando: false }, derecha: { agarrando: false } }
  const traslados: Partial<Record<LadoMano, Traslado>> = {}
  const segmentos: PuntoTrayectoria[][] = []
  let contador = 0
  let llenaDesde: number | null = null
  let suavidadViva: number | null = null
  const tmp = new THREE.Vector3()

  const pinza = (lado: LadoMano, destino = new THREE.Vector3()) => destino.addVectors(ctx!.manos.punto(lado, 4), ctx!.manos.punto(lado, 8)).multiplyScalar(0.5)

  function crearJuguete(c: ContextoJuego, i: number, pos: { x: number; z: number }, tamano: number): Juguete {
    const { RAPIER, mundo } = c.fisica!
    const forma = FORMAS[i % FORMAS.length]
    const tam = TAM_BASE * tamano
    let geo: THREE.BufferGeometry
    let col: RAPIER_NS.ColliderDesc
    const rot = new THREE.Quaternion()
    switch (forma) {
      case 'cubo':
        geo = new THREE.BoxGeometry(tam, tam, tam)
        col = RAPIER.ColliderDesc.cuboid(tam / 2, tam / 2, tam / 2)
        rot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 0.7) % 1.2)
        break
      case 'esfera':
        geo = new THREE.SphereGeometry(tam / 2, 24, 16)
        col = RAPIER.ColliderDesc.ball(tam / 2)
        break
      case 'cilindro':
        geo = new THREE.CylinderGeometry(tam * 0.38, tam * 0.38, tam, 24)
        col = RAPIER.ColliderDesc.cylinder(tam / 2, tam * 0.38)
        break
      case 'capsula':
        geo = new THREE.CapsuleGeometry(tam * 0.22, tam * 0.7, 6, 16)
        col = RAPIER.ColliderDesc.capsule(tam * 0.35, tam * 0.22)
        // Acostada y girada sobre la mesa, como las de 06a.
        rot.setFromEuler(new THREE.Euler(0, 0.5 + i * 0.4, Math.PI / 2, 'YXZ'))
        break
      case 'cono':
        geo = new THREE.ConeGeometry(tam * 0.42, tam, 24)
        col = RAPIER.ColliderDesc.cone(tam / 2, tam * 0.42)
        break
    }
    const mat = new THREE.MeshStandardMaterial({ color: COLORES[i % COLORES.length], roughness: 0.45, metalness: 0.02 })
    geometrias.push(geo)
    materiales.push(mat)
    const malla = new THREE.Mesh(geo, mat)
    malla.castShadow = true
    malla.receiveShadow = true
    c.escena.add(malla)
    const inicio = { x: pos.x, y: c.mesa.altura + medioAlto(forma, tam) + 0.01, z: pos.z }
    const cuerpo = mundo.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(inicio.x, inicio.y, inicio.z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setLinearDamping(0.3)
        .setAngularDamping(1.2)
        .setCcdEnabled(true),
    )
    mundo.createCollider(col.setFriction(0.85).setRestitution(0.08).setDensity(1), cuerpo)
    const j: Juguete = {
      id: `${forma}-${i + 1}`,
      forma,
      tam,
      inicio,
      rotInicio: rot.clone(),
      cuerpo,
      malla,
      estado: 'mesa',
      mano: null,
      soltadoT: 0,
      quietoDesde: null,
      sostenido: new THREE.Vector3(),
    }
    sincronizar(j)
    return j
  }

  function crearCajaMadera(c: ContextoJuego) {
    const { RAPIER, mundo } = c.fisica!
    const k = CAJA
    const y0 = c.mesa.altura
    const madera = new THREE.MeshStandardMaterial({ color: NATURAL.maderaClara, roughness: 0.75 })
    const fondo = new THREE.MeshStandardMaterial({ color: NATURAL.maderaSombra, roughness: 0.85 })
    materiales.push(madera, fondo)
    const piezas: { w: number; h: number; d: number; x: number; y: number; z: number; mat: THREE.Material }[] = [
      { w: k.ancho, h: k.piso, d: k.fondo, x: 0, y: k.piso / 2, z: 0, mat: fondo },
      { w: k.ancho, h: k.alto, d: k.grosor, x: 0, y: k.alto / 2, z: k.fondo / 2 - k.grosor / 2, mat: madera },
      { w: k.ancho, h: k.alto, d: k.grosor, x: 0, y: k.alto / 2, z: -k.fondo / 2 + k.grosor / 2, mat: madera },
      { w: k.grosor, h: k.alto, d: k.fondo - 2 * k.grosor, x: k.ancho / 2 - k.grosor / 2, y: k.alto / 2, z: 0, mat: madera },
      { w: k.grosor, h: k.alto, d: k.fondo - 2 * k.grosor, x: -k.ancho / 2 + k.grosor / 2, y: k.alto / 2, z: 0, mat: madera },
    ]
    for (const p of piezas) {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d)
      geometrias.push(geo)
      const m = new THREE.Mesh(geo, p.mat)
      m.position.set(k.x + p.x, y0 + p.y, k.z + p.z)
      m.castShadow = true
      m.receiveShadow = true
      c.escena.add(m)
      mallasCaja.push(m)
      mundo.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2, p.d / 2)
          .setTranslation(k.x + p.x, y0 + p.y, k.z + p.z)
          .setFriction(0.9),
      )
    }
  }

  function sincronizar(j: Juguete) {
    if (j.estado === 'tomado') {
      j.malla.position.copy(j.sostenido)
    } else {
      const p = j.cuerpo.translation()
      j.malla.position.set(p.x, p.y, p.z)
    }
    const q = j.cuerpo.rotation()
    j.malla.quaternion.set(q.x, q.y, q.z, q.w)
  }

  function aDinamico(j: Juguete) {
    j.cuerpo.setBodyType(R!.RigidBodyType.Dynamic, true)
    j.cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true)
    j.cuerpo.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  function volverAlInicio(j: Juguete) {
    if (j.cuerpo.bodyType() !== R!.RigidBodyType.Dynamic) aDinamico(j)
    j.cuerpo.setTranslation(j.inicio, true)
    j.cuerpo.setRotation({ x: j.rotInicio.x, y: j.rotInicio.y, z: j.rotInicio.z, w: j.rotInicio.w }, true)
    j.cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true)
    j.cuerpo.setAngvel({ x: 0, y: 0, z: 0 }, true)
    j.estado = 'mesa'
    j.mano = null
    j.quietoDesde = null
    sincronizar(j)
  }

  function tomar(lado: LadoMano, j: Juguete) {
    const c = ctx!
    if (j.estado === 'soltado') {
      // Se volvió a tomar antes de quedar quieto: ese traslado termina sin caja.
      c.registrar('soltar', { mano: j.mano, objeto: j.id, datos: { enCaja: false, motivo: 'retomado' } })
    }
    j.estado = 'tomado'
    j.mano = lado
    j.quietoDesde = null
    const p = j.cuerpo.translation()
    j.sostenido.set(p.x, p.y, p.z)
    j.cuerpo.setBodyType(R!.RigidBodyType.KinematicPositionBased, true)
    const m = c.medidas(lado)
    traslados[lado] = { juguete: j, inicioT: c.ahora(), tray: m ? [{ t: c.ahora(), x: m.muneca.x, y: m.muneca.y }] : [] }
    c.registrar('agarre_inicio', { mano: lado, objeto: j.id, datos: { aperturaCm: m ? r1(m.aperturaPinzaCm) : null } })
  }

  function soltarDeMano(lado: LadoMano) {
    const c = ctx!
    const tr = traslados[lado]
    delete traslados[lado]
    if (!tr) return
    const j = tr.juguete
    if (tr.tray.length > 1) segmentos.push(tr.tray)
    suavidadViva = suavidadSesion(segmentos)
    c.registrar('agarre_fin', { mano: lado, objeto: j.id, datos: { duracionMs: Math.round(c.ahora() - tr.inicioT) } })
    aDinamico(j)
    j.cuerpo.setTranslation({ x: j.sostenido.x, y: j.sostenido.y, z: j.sostenido.z }, true)
    j.estado = 'soltado'
    j.soltadoT = c.ahora()
    j.quietoDesde = null
  }

  function terminarSoltado(j: Juguete, enCaja: boolean, motivo?: string) {
    ctx!.registrar('soltar', { mano: j.mano, objeto: j.id, datos: motivo ? { enCaja, motivo } : { enCaja } })
    if (enCaja) {
      contador++
      j.estado = 'guardado'
    } else j.estado = 'mesa'
    j.mano = null
    j.quietoDesde = null
  }

  /** Juguete libre más cercano al punto de pinza de esa mano (null si ninguno está cerca). */
  function cercano(lado: LadoMano): Juguete | null {
    const p = pinza(lado, tmp)
    let mejor: Juguete | null = null
    let dMejor = Infinity
    for (const j of juguetes) {
      if (j.estado === 'tomado' || j.estado === 'guardado') continue
      const d = distanciaToma(p, j.cuerpo.translation(), j.forma, j.tam)
      if (d != null && d < dMejor) {
        dMejor = d
        mejor = j
      }
    }
    return mejor
  }

  function reiniciarTodo(motivo: string) {
    for (const lado of LADOS) {
      if (traslados[lado]) soltarDeMano(lado)
    }
    for (const j of juguetes) {
      if (j.estado === 'soltado') terminarSoltado(j, false, motivo)
      volverAlInicio(j)
    }
    llenaDesde = null
  }

  function depuracion(): EstadoCajaDepuracion {
    const v = (p: { x: number; y: number; z: number }) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) })
    const pinzas: EstadoCajaDepuracion['pinza'] = {}
    const puntas: EstadoCajaDepuracion['punta'] = {}
    for (const l of LADOS) {
      if (ctx?.manos.visible(l)) {
        pinzas[l] = v(pinza(l))
        puntas[l] = v(ctx.manos.punto(l, 8))
      }
    }
    return {
      contador,
      objetos: juguetes.map((j) => ({ id: j.id, forma: j.forma, tam: j.tam, estado: j.estado, mano: j.mano, ...v(j.estado === 'tomado' ? j.sostenido : j.cuerpo.translation()), inicio: v(j.inicio) })),
      caja: CAJA,
      zona: { ...ZONA_BASE, ...ZONA_CAJA },
      pinza: pinzas,
      punta: puntas,
      agarrando: { izquierda: agarre.izquierda.agarrando, derecha: agarre.derecha.agarrando },
      umbrales: cfg,
    }
  }

  return {
    id: 'caja-juguetes',
    nombre: 'Caja de juguetes',
    gestos: ['Pinza', 'Agarre', 'Traslado'],
    miniatura: 'caja',
    niveles,
    meta: { etiqueta: 'Agarres', unidad: 'agarres', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['agarre_inicio', 'agarre_fin', 'soltar'],
    metricasVivo: [
      { id: 'pinza', nombre: 'Apertura de pinza', unidad: 'cm', formula: 'distancia 4–8 en worldLandmarks × escala de la calibración', aprox: true },
      { id: 'flexIndice', nombre: 'Flexión del índice', unidad: '°', formula: 'flexión MCP (0-5 / 5-6) + PIP (5-6 / 6-7) del índice, worldLandmarks', aprox: true },
      { id: 'suavidad', nombre: 'Suavidad', unidad: '%', formula: 'SPARC de la muñeca por traslado (tomar → soltar), escala 0–100 entre −6 y −1,6; promedio', mejor: 'mayor' },
    ],
    metricasResumen: [
      { id: 'agarres', nombre: 'Agarres en la caja', unidad: '', formula: "eventos 'soltar' con datos.enCaja", mejor: 'mayor' },
      { id: 'intentos', nombre: 'Intentos', unidad: '', formula: "eventos 'agarre_inicio'" },
      { id: 'precision', nombre: 'Precisión', unidad: '%', formula: 'agarres en la caja / intentos × 100', mejor: 'mayor' },
      { id: 'tiempoMedioAgarre', nombre: 'Tiempo medio por agarre', unidad: 's', formula: 'promedio de agarre_inicio → agarre_fin de los agarres que terminaron en la caja', mejor: 'menor', corto: 'Tiempo por agarre' },
      { id: 'aperturaMax', nombre: 'Apertura máxima de pinza', unidad: 'cm', formula: 'máximo de la distancia 4–8 (worldLandmarks × escala)', aprox: true, mejor: 'mayor', corto: 'Apertura de pinza máx.' },
      { id: 'flexionIndiceMax', nombre: 'Flexión máxima del índice', unidad: '°', formula: 'máximo de MCP + PIP del índice', aprox: true, mejor: 'mayor', corto: 'Flexión del índice' },
      { id: 'suavidad', nombre: 'Suavidad', unidad: '%', formula: 'SPARC de la muñeca por traslado, escala 0–100; promedio de la sesión', mejor: 'mayor', corto: 'Suavidad del movimiento' },
    ],
    usaFisica: true,
    pista: 'Guarda los juguetes en la caja',
    textoReiniciar: 'Reiniciar objetos',

    montar(c) {
      if (!c.fisica) throw new Error('Caja de juguetes necesita física')
      ctx = c
      R = c.fisica.RAPIER
      cfg = configDesdeCalibracion(c.calibracion?.aperturaPinzaMaxCm)
      c.configurarManos(ZONA_CAJA)
      crearCajaMadera(c)
      const n = c.nivel
      posicionesJuguetes(Number(n.cantidad ?? 6), Number(n.distanciaCaja ?? 1.1)).forEach((pos, i) => juguetes.push(crearJuguete(c, i, pos, Number(n.tamano ?? 1))))
      if (c.fuente.tipo !== 'camara' && typeof window !== 'undefined') window.__manoviva = { ...window.__manoviva, juego: { estado: depuracion } }
    },

    actualizar(_manos, dt) {
      const c = ctx
      if (!c) return
      const t = c.ahora()
      // 1) Pinza de cada mano con histéresis.
      for (const lado of LADOS) {
        const m = c.medidas(lado)
        const candidato = m && !agarre[lado].agarrando ? cercano(lado) : null
        const r = pasoAgarre(agarre[lado], m ? m.aperturaPinzaCm : null, !!candidato, cfg)
        agarre[lado] = r.estado
        if (r.cambio === 'inicio' && candidato) tomar(lado, candidato)
        else if (r.cambio === 'fin') soltarDeMano(lado)
        const tr = traslados[lado]
        if (tr && m) {
          const ultimo = tr.tray[tr.tray.length - 1]
          if (!ultimo || t > ultimo.t) tr.tray.push({ t, x: m.muneca.x, y: m.muneca.y })
        }
      }
      // 2) Juguetes sostenidos siguen al punto de pinza (sin hundirse en la mesa).
      const k = Math.min(1, dt * 25)
      for (const lado of LADOS) {
        const tr = traslados[lado]
        if (!tr) continue
        const j = tr.juguete
        pinza(lado, tmp)
        tmp.y = Math.max(tmp.y, c.mesa.altura + medioAlto(j.forma, j.tam) + 0.02)
        j.sostenido.lerp(tmp, k)
        j.cuerpo.setNextKinematicTranslation({ x: j.sostenido.x, y: j.sostenido.y, z: j.sostenido.z })
      }
      // 3) Soltados: esperar a que queden quietos (o un máximo) y decidir si quedaron en la caja.
      for (const j of juguetes) {
        const p = j.cuerpo.translation()
        if (cayoDeLaMesa(p)) {
          if (j.estado === 'soltado') terminarSoltado(j, false, 'cayo')
          if (j.estado !== 'tomado') volverAlInicio(j)
          continue
        }
        if (j.estado === 'soltado') {
          if (estaQuieto(j.cuerpo.linvel(), j.cuerpo.angvel())) j.quietoDesde ??= t
          else j.quietoDesde = null
          if ((j.quietoDesde != null && t - j.quietoDesde >= MS_QUIETO) || t - j.soltadoT >= MS_MAX_ASENTAR) terminarSoltado(j, dentroDeCaja(p, CAJA, c.mesa.altura))
        }
        sincronizar(j)
      }
      // 4) Sin juguetes en la mesa: vuelven todos a su lugar (para seguir hasta la meta).
      const quedan = juguetes.some((j) => j.estado !== 'guardado')
      if (!quedan && juguetes.length) {
        llenaDesde ??= t
        if (t - llenaDesde > 1200) reiniciarTodo('caja-llena')
      } else llenaDesde = null
    },

    hud() {
      const c = ctx
      const principal = c?.manoPrincipal() ?? null
      const m = principal ? c!.medidas(principal) : null
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const lado of LADOS) if (c?.medidas(lado) && traslados[lado]) manos[lado] = { texto: 'Agarrando', tono: 'acento' }
      const sosteniendo = LADOS.some((l) => traslados[l])
      return {
        contador,
        manos,
        pista: llenaDesde != null ? '¡Caja llena! Los juguetes vuelven a la mesa' : sosteniendo ? 'Llévalo a la caja y abre los dedos' : undefined,
        vivo: {
          pinza: m ? m.aperturaPinzaCm : null,
          flexIndice: m ? m.flexion.indice : null,
          suavidad: suavidadViva,
        },
      }
    },

    reiniciar() {
      if (ctx) reiniciarTodo('reinicio')
    },

    muestra() {
      return { agarrando: LADOS.some((l) => traslados[l]) ? 1 : 0 }
    },

    resumen(base) {
      const c = contarAgarres(base.eventos)
      return {
        agarres: c.exitosos,
        intentos: c.intentos,
        precision: c.intentos ? Math.round((c.exitosos / c.intentos) * 100) : null,
        tiempoMedioAgarre: c.tiempoMedio == null ? null : r1(c.tiempoMedio),
        aperturaMax: r1(base.aperturaMaxCm),
        flexionIndiceMax: Math.round(base.flexionMax.indice),
        suavidad: suavidadSesion(segmentos),
      }
    },

    desmontar() {
      const c = ctx
      if (c) {
        for (const j of juguetes) c.escena.remove(j.malla)
        for (const m of mallasCaja) c.escena.remove(m)
      }
      for (const g of geometrias) g.dispose()
      for (const m of materiales) m.dispose()
      if (typeof window !== 'undefined' && window.__manoviva?.juego) {
        const { juego: _quitar, ...resto } = window.__manoviva
        void _quitar
        window.__manoviva = resto
      }
      juguetes.length = 0
      ctx = null
    },
  }
}
