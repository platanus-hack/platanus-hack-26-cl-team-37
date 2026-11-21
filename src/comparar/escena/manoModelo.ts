// F38 · Movilidad guiada y juegos genéricos: dos manos MODELO (no son los puntos registrados) que se doblan con los
// ángulos guardados de cada sesión (flexión máxima por dedo y apertura pulgar–índice).
//  - «Más abierta»: la apertura máxima registrada.   - «Máxima flexión»: todos los dedos en su máximo.
//  - «Curva real de apertura» (solo Movilidad): la mano sigue la apertura registrada cada segundo.
import type { FlexionDedos, Sesion } from '../../domain/types'
import { fechaCorta, num } from '../../lib/formato'
import { DEDOS_ORDEN, LARGO_MODELO_MM, PUNTA, distanciaPinzaCm, poseModelo, sParaApertura, tablaApertura, type V3 } from '../mano'
import { ladoDeSesion } from '../sesiones'
import { crearMano } from './manoMesh'
import type { EscenaJuego, Etiqueta, Lado, Motor } from './motor'

export interface DatosModelo {
  antes: Sesion
  despues: Sesion
  /** Largo de la mano del paciente (cm); escala el modelo. */
  largoManoCm: number
  /** Agrega el modo con la curva real de apertura (necesita muestras.apertura). */
  animacion: boolean
}

const LADOS: Lado[] = ['antes', 'despues']

export function montarManoModelo(m: Motor, d: DatosModelo): EscenaJuego {
  const { THREE, raiz, camara, controles } = m
  const esc = (d.largoManoCm * 10) / LARGO_MODELO_MM
  let modo = 'abierta'
  let avance = 0
  const sesiones: Record<Lado, Sesion> = { antes: d.antes, despues: d.despues }

  const puestos = LADOS.map((k, i) => {
    const s = sesiones[k]
    const flex: Partial<FlexionDedos> = s.metricas?.flexionMax ?? {}
    const mano = crearMano(m.colores[k], { escala: esc })
    const g = new THREE.Group()
    g.position.x = (i ? 1 : -1) * 150
    g.add(mano.g)
    raiz.add(g)
    const calibre = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: m.colores[k], dashSize: 5, gapSize: 4 }))
    g.add(calibre)
    const lado = ladoDeSesion(s)
    const tabla = tablaApertura(flex, esc, 100)
    return {
      k,
      s,
      flex,
      lado,
      mano,
      g,
      calibre,
      tabla,
      etq: m.etiqueta(),
      etqCal: m.etiquetaChica(),
      etqDedos: DEDOS_ORDEN.map(() => m.etiquetaChica()),
      pose: [] as V3[],
      cm: 0,
    }
  })

  const piso = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.ShadowMaterial({ opacity: 0.25 }))
  piso.rotation.x = -Math.PI / 2
  piso.position.y = -40
  piso.receiveShadow = true
  raiz.add(piso)
  camara.position.set(120, 170, 640)
  controles.target.set(0, 95, 0)

  const largoMax = Math.max(...puestos.map((p) => p.s.muestras?.apertura?.length ?? 0), 1)
  const hz = Math.max(...puestos.map((p) => p.s.muestras?.hz ?? 1), 1)

  function actualizar(a: number) {
    avance = a
    for (const p of puestos) {
      const mx = p.s.metricas?.aperturaMaxCm ?? 0
      let s = 0
      let cm = mx
      if (modo === 'abierta') s = sParaApertura(p.tabla, mx)
      else if (modo === 'puno') s = 1
      else {
        const ap = p.s.muestras?.apertura ?? []
        const i = Math.min(ap.length - 1, Math.floor(avance * ap.length))
        cm = ap[i] ?? mx
        s = sParaApertura(p.tabla, cm)
      }
      const pose = poseModelo(p.flex, s, esc, p.lado)
      p.mano.poner(pose)
      p.pose = pose
      p.cm = modo === 'puno' ? distanciaPinzaCm(pose) : cm
      p.calibre.geometry.setFromPoints([new THREE.Vector3(...pose[4]!), new THREE.Vector3(...pose[8]!)])
      p.calibre.computeLineDistances()
      p.calibre.visible = modo !== 'puno'
    }
  }
  actualizar(0)

  const v = new THREE.Vector3()
  const ubicar = (e: Etiqueta, pos: V3, p: (typeof puestos)[number], dz: number, w: number, h: number) =>
    m.proyectar(e, v.set(pos[0] + p.g.position.x, pos[1], pos[2] + dz), w, h)

  return {
    modos: [
      { id: 'abierta', texto: 'Más abierta' },
      { id: 'puno', texto: 'Máx. flexión' },
      ...(d.animacion ? [{ id: 'anim', texto: 'Curva real', anima: true }] : []),
    ],
    capas: [],
    nota: 'La mano se dobla con la flexión y la apertura guardadas de cada sesión; no son los puntos registrados. Arrastra para rotar.',
    fuente: { antes: 'modelo', despues: 'modelo' },
    duracionMs: d.animacion ? (largoMax / hz) * 1000 / 6 : 0,
    fijarModo(id) {
      modo = id
      actualizar(modo === 'anim' ? avance : 0)
    },
    fijarCapa() {},
    actualizar,
    etiquetas(w, h) {
      for (const p of puestos) {
        const sufijo = p.k === 'antes' ? 'Antes' : 'Después'
        const val = modo === 'puno' ? `${num(p.s.metricas?.flexionIndiceMax, 0)}° índice` : `${num(p.cm)} cm aprox.`
        p.etq.poner({
          lado: p.k,
          nom: `${sufijo} · ${fechaCorta(p.s.inicio ?? '')}`,
          val,
          det: modo === 'puno' ? 'flexión MCP + PIP aprox.' : 'apertura pulgar–índice aprox.',
        })
        m.proyectar(p.etq, v.set(p.g.position.x, 185 * esc, 0), w, h, 70)
        DEDOS_ORDEN.forEach((dedo, j) => {
          const e = p.etqDedos[j]!
          if (modo !== 'puno') return e.ocultar()
          e.ponerChica(p.k, `${num(p.flex[dedo] ?? 0, 0)}°`)
          ubicar(e, p.pose[PUNTA[dedo]]!, p, 18, w, h)
        })
        if (modo === 'puno') p.etqCal.ocultar()
        else {
          p.etqCal.ponerChica(p.k, `${num(p.cm)} cm`)
          const a = p.pose[4]!
          const b = p.pose[8]!
          ubicar(p.etqCal, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], p, 25, w, h)
        }
      }
    },
    alAjustar(aspecto) {
      // en pantallas angostas las manos quedan más juntas para que quepan
      const sep = aspecto < 0.9 ? 100 : 150
      puestos[0]!.g.position.x = -sep
      puestos[1]!.g.position.x = sep
    },
  }
}
