// F38 · Muñeca 3D: la mano de cada sesión en su pose máxima (flexión, extensión, desviación radial/cubital) expresada en
// los ejes de la mano neutra, con una cuña de color desde la dirección neutra y la mano neutra como fantasma.
// Mano REAL (puntos registrados en `muestras.poses`) cuando existe; si no, mano MODELO girada con los ángulos guardados.
import type { PoseClave, Sesion } from '../../domain/types'
import { fechaCorta, num } from '../../lib/formato'
import { aEjes, camaraAEscena, direccionDedos, ejesDeMano, ejesDeMatriz, matrizNeutra, poseMunecaModelo, type Ejes, type V3 } from '../mano'
import { ladoDeSesion, poseDe } from '../sesiones'
import { crearMano } from './manoMesh'
import type { EscenaJuego, Lado, Motor } from './motor'

export interface DatosMuneca {
  antes: Sesion
  despues: Sesion
  largoManoCm: number
}

interface PoseDef {
  id: string
  texto: string
  titulo: string
  /** clave en metricas.juego (°). */
  clave: string
  /** Para la mano modelo: flexión(+)/extensión(−) o radial(+)/cubital(−). */
  eje: 'fe' | 'dv'
  signo: 1 | -1
}
const POSES: PoseDef[] = [
  { id: 'flexion-max', texto: 'Máx. flexión', titulo: 'Máxima flexión', clave: 'flexionMax', eje: 'fe', signo: 1 },
  { id: 'extension-max', texto: 'Máx. extensión', titulo: 'Máxima extensión', clave: 'extensionMax', eje: 'fe', signo: -1 },
  { id: 'radial-max', texto: 'Máx. radial', titulo: 'Máxima desviación radial', clave: 'radialMax', eje: 'dv', signo: 1 },
  { id: 'cubital-max', texto: 'Máx. cubital', titulo: 'Máxima desviación cubital', clave: 'cubitalMax', eje: 'dv', signo: -1 },
]
const RAD = 120
const SEP = 175

export function montarMuneca(m: Motor, d: DatosMuneca): EscenaJuego {
  const { THREE, raiz, camara, controles } = m
  const esc = (d.largoManoCm * 10) / 184
  let pose = POSES[0]!
  let superpuestas = m.aspecto() < 1
  let elegidaDisp = false
  const sesiones: Record<Lado, Sesion> = { antes: d.antes, despues: d.despues }

  /** Puntos de una pose (o null) ya en la escena, con la muñeca en el origen, y si vienen de la mano neutra. */
  function puntosDe(ejes: Ejes | null, p: PoseClave): { pts: V3[]; neutros: boolean } {
    const base = p.puntos as V3[]
    return ejes ? { pts: aEjes(base, ejes), neutros: true } : { pts: aEjes(base, { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }).map(camaraAEscena), neutros: false }
  }

  const puestos = (['antes', 'despues'] as Lado[]).map((k) => {
    const s = sesiones[k]
    const lado = ladoDeSesion(s)
    const neutro = poseDe(s, 'neutro', lado)
    const r0 = matrizNeutra(s.metricas?.juego)
    const ejes: Ejes | null = neutro ? ejesDeMano(neutro.puntos as V3[], neutro.lado) : r0 ? ejesDeMatriz(r0) : null
    const g = new THREE.Group()
    raiz.add(g)
    // Sin antebrazo: el del modelo sigue la dirección de la mano y taparía el ángulo de la muñeca que se compara.
    const mano = crearMano(m.colores[k], { escala: esc, antebrazo: false })
    const fantasma = crearMano(m.colores.gris, { escala: esc, fantasma: true })
    const cuna = crearCuna(THREE, m.colores[k])
    g.add(mano.g, fantasma.g, cuna.g)
    const modeloNeutro = poseMunecaModelo(0, 0, esc, lado)
    const neutroPts = neutro && ejes ? puntosDe(ejes, neutro).pts : modeloNeutro
    fantasma.poner(neutroPts)
    const anillo = new THREE.Mesh(new THREE.RingGeometry(70, 74, 64), new THREE.MeshBasicMaterial({ color: m.colores[k], transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
    anillo.rotation.x = -Math.PI / 2
    anillo.position.y = -70 + 0.5
    raiz.add(anillo)
    return { k, s, lado, ejes, g, mano, fantasma, cuna, anillo, etq: m.etiqueta(), x: 0, xObj: 0, pts: [] as V3[], real: false, conCuna: true }
  })
  const piso = new THREE.Mesh(new THREE.CircleGeometry(700, 64), new THREE.ShadowMaterial({ opacity: 0.28 }))
  piso.rotation.x = -Math.PI / 2
  piso.position.y = -70
  piso.receiveShadow = true
  raiz.add(piso)
  camara.position.set(360, 260, 720)
  controles.target.set(0, 70, 0)
  controles.maxPolarAngle = Math.PI * 0.62

  const valorDe = (s: Sesion, def: PoseDef): number | null => {
    const p = poseDe(s, def.id, ladoDeSesion(s))
    if (p?.valor != null) return p.valor
    const v = s.metricas?.juego?.[def.clave]
    return typeof v === 'number' ? v : null
  }

  function actualizar() {
    for (const p of puestos) {
      const real = poseDe(p.s, pose.id, p.lado)
      let pts: V3[]
      if (real) {
        const r = puntosDe(p.ejes, real)
        pts = r.pts
        p.conCuna = r.neutros
        p.real = true
      } else {
        const v = valorDe(p.s, pose) ?? 0
        pts = poseMunecaModelo(pose.eje === 'fe' ? pose.signo * v : 0, pose.eje === 'dv' ? pose.signo * v : 0, esc, p.lado)
        p.conCuna = true
        p.real = false
      }
      p.pts = pts
      p.mano.poner(pts)
      p.cuna.g.visible = p.conCuna
      if (p.conCuna) p.cuna.poner(direccionDedos(pts), RAD)
    }
  }
  actualizar()

  function aplicarDisposicion() {
    puestos[0]!.xObj = superpuestas ? 0 : -SEP
    puestos[1]!.xObj = superpuestas ? 0 : SEP
    puestos[0]!.mano.opacidad(superpuestas ? 0.45 : 1)
  }
  aplicarDisposicion()
  for (const p of puestos) p.x = p.xObj

  const v = new THREE.Vector3()
  const valor = (s: Sesion) => {
    const x = valorDe(s, pose)
    return x == null ? '—' : `${num(x, 0)}°`
  }

  return {
    modos: POSES.map((p) => ({ id: p.id, texto: p.texto })),
    capas: [
      { id: 'sobre', texto: 'Superpuestas', activa: superpuestas },
      { id: 'neutro', texto: 'Neutro', activa: true },
    ],
    nota: 'Los ángulos se miden respecto de la mano neutra de cada sesión. Estimación con cámara, no es un goniómetro.',
    get fuente() {
      const f = (k: Lado) => (puestos.find((p) => p.k === k)!.real ? ('real' as const) : ('modelo' as const))
      return { antes: f('antes'), despues: f('despues') }
    },
    duracionMs: 0,
    titulo: () => ({ que: pose.titulo, antes: valor(d.antes), despues: valor(d.despues) }),
    fijarModo(id) {
      pose = POSES.find((p) => p.id === id) ?? pose
      actualizar()
    },
    fijarCapa(id, on) {
      if (id === 'neutro') puestos.forEach((p) => (p.fantasma.g.visible = on))
      if (id === 'sobre') {
        superpuestas = on
        elegidaDisp = true
        aplicarDisposicion()
      }
    },
    actualizar() {
      actualizar()
    },
    etiquetas(w, h) {
      for (const p of puestos) {
        p.x += (p.xObj - p.x) * 0.2
        p.g.position.x = p.x
        p.anillo.position.x = p.x
        let ymax = -Infinity
        for (const q of p.pts) ymax = Math.max(ymax, q[1])
        p.etq.poner({ lado: p.k, nom: `${p.k === 'antes' ? 'Antes' : 'Después'} · ${fechaCorta(p.s.inicio ?? '')}`, val: valor(p.s), det: p.real ? 'mano real' : 'mano modelo' })
        const solapa = superpuestas ? (p.k === 'antes' ? -70 : 70) : 0
        m.proyectar(p.etq, v.set(p.x, Math.max(ymax, RAD) + 26, 0), w, h, 70)
        if (solapa && p.etq.el.style.left) p.etq.el.style.left = `${parseFloat(p.etq.el.style.left) + solapa}px`
      }
    },
    alAjustar(aspecto) {
      if (!elegidaDisp && superpuestas !== aspecto < 1) {
        superpuestas = aspecto < 1
        aplicarDisposicion()
      }
    },
  }
}

/** Cuña: sector entre la dirección neutra (+Y) y la dirección actual de los dedos. */
function crearCuna(THREE: Motor['THREE'], color: import('three').Color) {
  const N = 40
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 9), 3))
  const relleno = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))
  const bordeGeo = new THREE.BufferGeometry()
  bordeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 3) * 3), 3))
  const borde = new THREE.Line(bordeGeo, new THREE.LineBasicMaterial({ color }))
  const g = new THREE.Group()
  g.add(relleno, borde)
  const n = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  return {
    g,
    poner(dir: V3, radio: number) {
      const dv = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
      const qFull = new THREE.Quaternion().setFromUnitVectors(n, dv)
      const pos = geo.attributes.position as import('three').BufferAttribute
      const bp = bordeGeo.attributes.position as import('three').BufferAttribute
      bp.setXYZ(0, 0, 0, 0)
      for (let i = 0; i <= N; i++) {
        q.identity().slerp(qFull, i / N)
        a.copy(n).applyQuaternion(q).multiplyScalar(radio)
        bp.setXYZ(i + 1, a.x, a.y, a.z)
        if (i < N) {
          q.identity().slerp(qFull, (i + 1) / N)
          b.copy(n).applyQuaternion(q).multiplyScalar(radio)
          pos.setXYZ(i * 3, 0, 0, 0)
          pos.setXYZ(i * 3 + 1, a.x, a.y, a.z)
          pos.setXYZ(i * 3 + 2, b.x, b.y, b.z)
        }
      }
      bp.setXYZ(N + 2, 0, 0, 0)
      pos.needsUpdate = true
      bp.needsUpdate = true
      geo.computeBoundingSphere()
      bordeGeo.computeBoundingSphere()
    },
  }
}
