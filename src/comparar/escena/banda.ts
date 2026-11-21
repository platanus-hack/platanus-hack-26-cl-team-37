// F38 · Banda elástica: las dos manos y la banda entre ellas, coloreada por la carga aprox., con el largo en reposo
// marcado. Mano REAL (poses 'reposo' y 'pico' de cada mano, con `centro`) cuando existe; si no, manos modelo.
// «Carga aprox.»: estimación a partir de la banda y la cámara; nunca se muestra como fuerza ni presión.
import type { PoseClave, Sesion } from '../../domain/types'
import { fechaCorta, num } from '../../lib/formato'
import { camaraAEscena, poseModelo, type V3 } from '../mano'
import { crearMano } from './manoMesh'
import type { EscenaJuego, Lado, Motor } from './motor'

export interface DatosBanda {
  antes: Sesion
  despues: Sesion
  largoManoCm: number
}

const FILA = 520
const RAMPA = ['#38bdf8', '#a3e635', '#facc15', '#fb923c', '#ef4444']
const NUDILLOS = [5, 9, 13, 17]
/** Las manos se dibujan este tanto más grandes que en la realidad (las distancias entre ellas sí van a escala): si no, no se ven. */
const HS = 1.8
const PUNO = { pulgar: 50, indice: 110, medio: 115, anular: 110, menique: 105 }

const jv = (s: Sesion, id: string): number | null => {
  const v = s.metricas?.juego?.[id]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const media = (p: V3[], idx: number[]): V3 => idx.reduce<V3>((a, i) => [a[0] + p[i]![0] / idx.length, a[1] + p[i]![1] / idx.length, a[2] + p[i]![2] / idx.length], [0, 0, 0])

/** Manos de una pose clave: [izquierda de la imagen, derecha de la imagen] como puntos de escena, o null si no hay las dos. */
export function manosDePose(s: Sesion, etiqueta: string): V3[][] | null {
  const poses = (s.muestras?.poses ?? []).filter((p: PoseClave) => p.etiqueta === etiqueta && p.puntos?.length === 21)
  const izq = poses.find((p) => p.lado === 'izquierda')
  const der = poses.find((p) => p.lado === 'derecha')
  if (!izq || !der) return null
  // La mano derecha del sujeto sale a la izquierda de la imagen cruda; con `centro` se ordena por lo que se ve.
  const enImagen = (p: PoseClave) => p.centro?.[0] ?? (p.lado === 'derecha' ? 0.3 : 0.7)
  return [izq, der].sort((a, b) => enImagen(a) - enImagen(b)).map((p) => (p.puntos as V3[]).map(camaraAEscena))
}

export function montarBanda(m: Motor, d: DatosBanda): EscenaJuego {
  const { THREE, raiz, camara, controles } = m
  const esc = (d.largoManoCm * 10) / 184
  let modo = 'pico'
  let avance = 0
  const sesiones: Record<Lado, Sesion> = { antes: d.antes, despues: d.despues }
  const kgMax = Math.max(1, ...[d.antes, d.despues].flatMap((s) => [jv(s, 'kgBanda') ?? 0, jv(s, 'cargaMaxKg') ?? 0]))
  const rampa = RAMPA.map((c) => new THREE.Color(c))
  const colorCarga = (kg: number, out: import('three').Color) => {
    const x = Math.max(0, Math.min(0.999, kg / kgMax)) * (rampa.length - 1)
    const i = Math.floor(x)
    return out.copy(rampa[i]!).lerp(rampa[i + 1]!, x - i)
  }
  const tmp = new THREE.Color()

  const puestos = (['antes', 'despues'] as Lado[]).map((k) => {
    const s = sesiones[k]
    const raizS = new THREE.Group()
    raizS.position.y = k === 'antes' ? FILA / 2 : -FILA / 2
    raiz.add(raizS)
    const pico = manosDePose(s, 'pico')
    const reposoP = manosDePose(s, 'reposo')
    const modelo = [poseModelo(PUNO, 0.7, esc, 'derecha'), poseModelo(PUNO, 0.7, esc, 'izquierda')]
    const real = Boolean(pico)
    const manos = [crearMano(m.colores[k], { escala: esc * HS }), crearMano(m.colores[k], { escala: esc * HS })]
    manos.forEach((x) => raizS.add(x.g))
    const matBanda = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: 0.5, clearcoat: 0.3, emissive: 0x000000 })
    const tramos = [0, 1].map(() => {
      const t = new THREE.Mesh(new THREE.BufferGeometry(), matBanda)
      t.castShadow = true
      raizS.add(t)
      return t
    })
    const matReposo = new THREE.MeshBasicMaterial({ color: m.colores.gris, transparent: true, opacity: 0.35 })
    const barra = new THREE.Mesh(new THREE.BufferGeometry(), matReposo)
    const topes = [0, 1].map(() => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 60, 12), matReposo)
      raizS.add(t)
      return t
    })
    raizS.add(barra)
    const reposoCm = jv(s, 'reposoCm') ?? 60
    const estMax = jv(s, 'estiramientoMaxCm') ?? 0
    const canales = s.muestras?.canales
    return {
      k,
      s,
      real,
      raizS,
      pico: pico ?? modelo,
      reposoP: reposoP ?? pico ?? modelo,
      manos,
      matBanda,
      tramos,
      barra,
      topes,
      reposoCm,
      estMax,
      cargaMax: jv(s, 'cargaMaxKg') ?? 0,
      est: canales?.estiramientoCm ?? null,
      kgs: canales?.cargaKg ?? null,
      etq: m.etiqueta(),
      kg: 0,
      cm: 0,
      anclaY: 0,
    }
  })
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.25 }))
  piso.rotation.x = -Math.PI / 2
  piso.position.y = -FILA - 140
  piso.receiveShadow = true
  raiz.add(piso)
  camara.position.set(0, 60, 1750)
  controles.target.set(0, 0, 0)
  controles.minDistance = 400
  controles.maxDistance = 9000
  camara.far = 30000
  camara.updateProjectionMatrix()

  const sepMax = Math.max(...puestos.map((p) => (p.reposoCm + p.estMax) * 10), 400)

  function colocar(p: (typeof puestos)[number], sepMm: number, kg: number, f: number, estiramientoCm: number) {
    const anclas: V3[][] = []
    p.manos.forEach((mano, j) => {
      const a = p.reposoP[j]!
      const b = p.pico[j]!
      const pts = b.map((q, i) => [a[i]![0] + (q[0] - a[i]![0]) * f, a[i]![1] + (q[1] - a[i]![1]) * f, a[i]![2] + (q[2] - a[i]![2]) * f] as V3)
      const c = media(pts, NUDILLOS)
      const x = (j === 0 ? -1 : 1) * (sepMm / 2)
      const out = pts.map((q) => [(q[0] - c[0]) * HS + x, (q[1] - c[1]) * HS, (q[2] - c[2]) * HS] as V3)
      mano.poner(out)
      anclas.push([media(out, [5, 9]), media(out, [13, 17])])
    })
    const e = Math.max(0, estiramientoCm / Math.max(1, p.reposoCm))
    const radio = 9 / Math.sqrt(1 + e)
    ;[0, 1].forEach((t) => {
      const a = new THREE.Vector3(...anclas[0]![t]!)
      const b = new THREE.Vector3(...anclas[1]![t]!)
      const medio = a.clone().lerp(b, 0.5)
      medio.y += t === 0 ? 6 : -6
      medio.z -= 10
      p.tramos[t]!.geometry.dispose()
      p.tramos[t]!.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, medio, b), 48, radio, 12)
    })
    colorCarga(kg, tmp)
    p.matBanda.color.copy(tmp)
    p.matBanda.emissive.copy(tmp).multiplyScalar(0.25)
    const L = p.reposoCm * 10
    const y = Math.min(anclas[0]![1]![1], anclas[1]![1]![1]) - 60
    p.barra.geometry.dispose()
    p.barra.geometry = new THREE.CylinderGeometry(2, 2, L, 10).rotateZ(Math.PI / 2).translate(0, y, 0)
    p.topes[0]!.position.set(-L / 2, y, 0)
    p.topes[1]!.position.set(L / 2, y, 0)
    p.kg = kg
    p.cm = estiramientoCm
    p.anclaY = Math.max(anclas[0]![0]![1], anclas[1]![0]![1]) + 150
  }

  function actualizar(a: number) {
    avance = a
    for (const p of puestos) {
      if (modo === 'reposo') colocar(p, p.reposoCm * 10, 0, 0, 0)
      else if (modo === 'anim' && p.est) {
        const i = Math.min(p.est.length - 1, Math.floor(avance * p.est.length))
        const est = Math.max(0, p.est[i] ?? 0)
        const kg = p.kgs?.[i] ?? 0
        colocar(p, (p.reposoCm + est) * 10, kg ?? 0, p.estMax > 0 ? Math.min(1, est / p.estMax) : 0, est)
      } else colocar(p, (p.reposoCm + p.estMax) * 10, p.cargaMax, 1, p.estMax)
    }
  }
  actualizar(0)

  const v = new THREE.Vector3()
  const hz = Math.max(...puestos.map((p) => p.s.muestras?.hz ?? 1), 1)
  const n = Math.max(...puestos.map((p) => p.est?.length ?? 0), 0)

  function ajustarCamara(aspecto: number) {
    const fov = (camara.fov * Math.PI) / 180
    const ancho = sepMax + 360 * HS
    const alto = FILA + 720
    const porAncho = (ancho * camara.zoom) / (2 * Math.tan(fov / 2) * Math.max(0.3, aspecto))
    const porAlto = (alto * camara.zoom) / (2 * Math.tan(fov / 2))
    const dist = Math.max(900, Math.min(8000, Math.max(porAncho, porAlto)))
    const dir = camara.position.clone().sub(controles.target).normalize()
    camara.position.copy(controles.target).addScaledVector(dir, dist)
    controles.update()
  }

  return {
    modos: [
      { id: 'pico', texto: 'Pico de carga' },
      { id: 'reposo', texto: 'En reposo' },
      ...(n > 1 ? [{ id: 'anim', texto: 'Curva registrada', anima: true }] : []),
    ],
    capas: [{ id: 'reposo', texto: 'Largo en reposo', activa: true }],
    nota: 'Carga y estiramiento aprox. según la banda y la cámara. La barra gris es el largo de la banda en reposo. Las manos se dibujan más grandes que en la realidad; las distancias sí van a escala.',
    get fuente() {
      return { antes: puestos[0]!.real ? ('real' as const) : ('modelo' as const), despues: puestos[1]!.real ? ('real' as const) : ('modelo' as const) }
    },
    escalaKg: kgMax,
    duracionMs: n > 1 ? Math.max(4000, (n / hz) * 1000 / 4) : 0,
    titulo: () =>
      modo === 'reposo'
        ? { que: 'Banda en reposo', antes: `${num(puestos[0]!.reposoCm)} cm`, despues: `${num(puestos[1]!.reposoCm)} cm` }
        : modo === 'pico'
          ? { que: 'Pico de carga (aprox.)', antes: `${num(puestos[0]!.cargaMax)} kg`, despues: `${num(puestos[1]!.cargaMax)} kg` }
          : null,
    fijarModo(id) {
      modo = id
      actualizar(0)
    },
    fijarCapa(id, on) {
      if (id !== 'reposo') return
      puestos.forEach((p) => {
        p.barra.visible = on
        p.topes.forEach((t) => (t.visible = on))
      })
    },
    actualizar,
    etiquetas(w, h) {
      for (const p of puestos) {
        p.etq.poner({
          lado: p.k,
          nom: `${p.k === 'antes' ? 'Antes' : 'Después'} · ${fechaCorta(p.s.inicio ?? '')}`,
          val: `${num(p.kg)} kg aprox.`,
          det: `estira ${num(p.cm)} cm aprox.`,
        })
        m.proyectar(p.etq, v.set(0, p.anclaY, 0).add(p.raizS.position), w, h, 80)
      }
    },
    alAjustar: ajustarCamara,
  }
}
