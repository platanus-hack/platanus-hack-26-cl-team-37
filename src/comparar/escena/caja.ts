// F38 · Caja de juguetes: mesa, caja y repetición de los agarres reales de cada sesión (orden, apertura al tomar cada
// objeto, si entró a la caja). La ubicación de los objetos sobre la mesa es ILUSTRATIVA: la app no guarda dónde estaban.
// La mano es el modelo (ángulos guardados), no los puntos registrados.
import type { EventoSesion, FlexionDedos, Sesion } from '../../domain/types'
import { fechaCorta, num } from '../../lib/formato'
import { agarresDe, type Agarre } from '../eventos'
import { LARGO_MODELO_MM, poseModelo, sParaApertura, tablaApertura, type V3 } from '../mano'
import { ladoDeSesion } from '../sesiones'
import { crearMano } from './manoMesh'
import type { EscenaJuego, Lado, Motor } from './motor'

export interface DatosCaja {
  antes: Sesion
  despues: Sesion
  eventosAntes: EventoSesion[]
  eventosDespues: EventoSesion[]
  largoManoCm: number
}

const COLORES_OBJ: Record<string, number> = { rojo: 0xef4444, azul: 0x3b82f6, verde: 0x22c55e, amarillo: 0xfacc15, naranja: 0xfb923c, morado: 0xa855f7, rosado: 0xec4899 }
const PALETA = [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0xfb923c, 0x14b8a6, 0xec4899]
const SLOT = 1.6 // s por agarre en la repetición (los tiempos reales van en las etiquetas)
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)

export function montarCaja(m: Motor, d: DatosCaja): EscenaJuego {
  const { THREE, raiz, camara, controles } = m
  const esc = (d.largoManoCm * 10) / LARGO_MODELO_MM
  const qMano = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
  let modo = 'repetir'
  const datos: Record<Lado, { s: Sesion; ev: EventoSesion[] }> = { antes: { s: d.antes, ev: d.eventosAntes }, despues: { s: d.despues, ev: d.eventosDespues } }

  const puestos = (['antes', 'despues'] as Lado[]).map((k) => {
    const { s, ev } = datos[k]
    const g = new THREE.Group()
    raiz.add(g)
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(560, 24, 340), new THREE.MeshStandardMaterial({ color: 0xc8a27a, roughness: 0.7 }))
    mesa.position.y = -12
    mesa.receiveShadow = true
    g.add(mesa)
    const matCaja = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.6 })
    const caja = new THREE.Group()
    caja.position.set(170, 0, 0)
    ;[
      [180, 8, 150, 0, 4, 0],
      [8, 90, 150, -90, 45, 0],
      [8, 90, 150, 90, 45, 0],
      [180, 90, 8, 0, 45, -75],
      [180, 90, 8, 0, 45, 75],
    ].forEach(([w, h, p, x, y, z]) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, p), matCaja)
      t.position.set(x!, y!, z!)
      t.castShadow = t.receiveShadow = true
      caja.add(t)
    })
    g.add(caja)

    const agarres = agarresDe(ev)
    const nombres = [...new Set(agarres.map((a) => a.objeto))]
    const objetos = new Map<string, import('three').Mesh>()
    const inicio = new Map<string, import('three').Vector3>()
    nombres.forEach((n, j) => {
      const color = Object.entries(COLORES_OBJ).find(([c]) => n.includes(c))?.[1] ?? PALETA[j % PALETA.length]!
      const geo = n.startsWith('esfera') ? new THREE.SphereGeometry(22, 24, 16) : n.startsWith('cilindro') ? new THREE.CylinderGeometry(19, 19, 44, 24) : new THREE.BoxGeometry(40, 40, 40)
      const o = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.5 }))
      o.castShadow = true
      const col = j % 3
      const fila = Math.floor(j / 3)
      const p0 = new THREE.Vector3(-220 + col * 75, 22, -100 + fila * 75 + (col % 2) * 20)
      o.position.copy(p0)
      g.add(o)
      objetos.set(n, o)
      inicio.set(n, p0)
    })
    const lado = ladoDeSesion(s)
    const flex: Partial<FlexionDedos> = s.metricas?.flexionMax ?? {}
    const tabla = tablaApertura(flex, esc, 100)
    const mano = crearMano(m.colores[k], { escala: esc })
    mano.g.quaternion.copy(qMano)
    g.add(mano.g)

    // destinos: dentro de la caja (apilados en grilla) o fuera (borde de la mesa)
    let dentro = 0
    let fuera = 0
    const destinos = agarres.map((a) => {
      if (a.enCaja) {
        const j = dentro++
        return new THREE.Vector3(170 - 50 + (j % 3) * 50, 24 + Math.floor(j / 9) * 42, -40 + (Math.floor(j / 3) % 3) * 40)
      }
      const j = fuera++
      return new THREE.Vector3(-30 + j * 46, 22, 150)
    })
    const sDe = agarres.map((a) => (a.aperturaCm == null ? 0.7 : sParaApertura(tabla, a.aperturaCm)))
    return { k, s, g, mano, objetos, inicio, agarres, destinos, sDe, flex, lado, etq: m.etiqueta(), hechos: 0, dentro: 0 }
  })

  const piso = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.22 }))
  piso.rotation.x = -Math.PI / 2
  piso.position.y = -24.5
  piso.receiveShadow = true
  raiz.add(piso)
  camara.position.set(0, 980, 1650)
  controles.target.set(0, 20, 30)

  const nMax = Math.max(...puestos.map((p) => p.agarres.length), 1)
  const duracion = nMax * SLOT + 1.5
  const pinzaLocal = (pose: V3[]) => new THREE.Vector3((pose[4]![0] + pose[8]![0]) / 2, (pose[4]![1] + pose[8]![1]) / 2, (pose[4]![2] + pose[8]![2]) / 2)

  function ponerManoEn(p: (typeof puestos)[number], punto: import('three').Vector3, s: number) {
    const pose = poseModelo(p.flex, s, esc, p.lado)
    p.mano.poner(pose)
    const off = pinzaLocal(pose).applyQuaternion(p.mano.g.quaternion)
    p.mano.g.position.copy(punto).sub(off)
  }

  function actualizar(avance: number) {
    const tiempo = modo === 'final' ? Infinity : avance * duracion
    for (const p of puestos) {
      const reposo = new THREE.Vector3(-40, 180, 40)
      p.objetos.forEach((o, n) => {
        o.position.copy(p.inicio.get(n)!)
        o.visible = true
      })
      let punto = reposo
      let s = 0.15
      let hechos = 0
      let dentro = 0
      p.agarres.forEach((a: Agarre, j) => {
        const o = p.objetos.get(a.objeto)!
        const ini = p.inicio.get(a.objeto)!
        const dest = p.destinos[j]!
        const sAg = p.sDe[j]!
        const t = tiempo - j * SLOT
        if (t >= SLOT) {
          o.position.copy(dest)
          hechos++
          if (a.enCaja) dentro++
          return
        }
        if (t < 0) return
        const encima = ini.clone().add(new THREE.Vector3(0, 120, 0))
        const sobreDest = dest.clone().add(new THREE.Vector3(0, 140, 0))
        if (t < 0.35) {
          punto = (j ? p.destinos[j - 1]!.clone().add(new THREE.Vector3(0, 160, 0)) : reposo).lerp(encima, ease(t / 0.35))
          s = 0.15
        } else if (t < 0.55) {
          const x = (t - 0.35) / 0.2
          punto = encima.clone().lerp(ini, ease(x))
          s = 0.15 + (sAg - 0.15) * x
        } else if (t < 1.15) {
          const x = ease((t - 0.55) / 0.6)
          punto = ini.clone().lerp(sobreDest, x)
          punto.y += Math.sin(x * Math.PI) * 120
          s = sAg
          o.position.copy(punto)
        } else if (t < 1.35) {
          const x = (t - 1.15) / 0.2
          punto = sobreDest
          s = sAg + (0.15 - sAg) * x
          o.position.copy(sobreDest.clone().lerp(dest, ease(x)))
        } else {
          punto = sobreDest.clone().add(new THREE.Vector3(0, (20 * (t - 1.35)) / 0.25, 0))
          s = 0.15
          o.position.copy(dest)
          hechos++
          if (a.enCaja) dentro++
        }
      })
      if (modo === 'final') {
        punto = reposo
        s = 0.15
      }
      ponerManoEn(p, punto, s)
      p.hechos = hechos
      p.dentro = dentro
    }
  }

  const v = new THREE.Vector3()
  /** Mesas lado a lado en pantallas anchas; una sobre otra en las angostas. */
  function disponer(aspecto: number) {
    const vertical = aspecto < 1
    puestos[0]!.g.position.set(vertical ? 0 : -330, 0, vertical ? -290 : 0)
    puestos[1]!.g.position.set(vertical ? 0 : 330, 0, vertical ? 290 : 0)
    if (vertical) {
      camara.position.set(0, 1700, 1150)
      controles.target.set(0, 0, 0)
    } else {
      camara.position.set(0, 980, 1650)
      controles.target.set(0, 20, 30)
    }
    controles.update()
  }
  let aspectoPrevio = 0

  return {
    modos: [
      { id: 'repetir', texto: 'Repetir los agarres', anima: true },
      { id: 'final', texto: 'Resultado final' },
    ],
    capas: [],
    nota: 'Agarres reales en orden (si entró a la caja y la apertura al tomar cada objeto). La ubicación de los objetos sobre la mesa es ilustrativa.',
    fuente: { antes: 'modelo', despues: 'modelo' },
    duracionMs: duracion * 1000,
    fijarModo(id) {
      modo = id
      actualizar(0)
    },
    fijarCapa() {},
    actualizar,
    etiquetas(w, h) {
      for (const p of puestos) {
        const m1 = p.s.metricas
        p.etq.poner({
          lado: p.k,
          nom: `${p.k === 'antes' ? 'Antes' : 'Después'} · ${fechaCorta(p.s.inicio ?? '')}`,
          val: `${p.dentro} de ${p.agarres.length} agarres ${p.dentro === 1 ? 'llegó' : 'llegaron'} a la caja`,
          det: `${num(m1?.tiempoMedioAgarreS)} s por agarre · apertura máx. ${num(m1?.aperturaMaxCm)} cm aprox.`,
        })
        m.proyectar(p.etq, v.set(p.g.position.x, 0, p.g.position.z - 175), w, h, 90)
      }
    },
    alAjustar(aspecto) {
      const vertical = aspecto < 1
      if (aspectoPrevio === 0 || vertical !== aspectoPrevio < 1) disponer(aspecto)
      aspectoPrevio = aspecto
    },
  }
}
