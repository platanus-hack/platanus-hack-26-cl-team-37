import { describe, expect, it } from 'vitest'
import { aperturaMano, aperturaPinza, largoMano } from '../metrics/geometria'
import { esTelemetriaMediapipe, manosDesdeResultado, ladoDesdeEtiqueta } from './camara'
import {
  EstimadorDistancia,
  estimarDistanciaCm,
  focalDesdeDistanciaConocida,
  escalaPerspectivaDebil,
} from './distancia'
import { MS_PERDIDA, MedidorFps, siguienteEstado } from './fuenteBase'
import { FuenteGrabacion, FuenteSintetica, relojManual } from './fuenteSimulada'
import { configDesdeUrl } from './fuentes'
import { GrabadorLandmarks, cuadroEnGrabacion, leerGrabacion, serializarGrabacion } from './grabacion'
import {
  GUIONES_PRESET,
  LARGO_MODELO_CM,
  guionPreset,
  manoSintetica,
  manosEnGuion,
  poseEn,
  secuencia,
  type PoseMano,
} from './sintetica'
import type { CuadroManos, ManoSeguida } from './tipos'

const W = 640
const H = 480
const errorRel = (est: number, real: number) => Math.abs(est - real) / real

describe('mano sintética: forma igual a MediaPipe', () => {
  it('21 puntos image + world, lado y confianza', () => {
    for (const lado of ['derecha', 'izquierda'] as const) {
      const m = manoSintetica({ lado })
      expect(m.lado).toBe(lado)
      expect(m.landmarks).toHaveLength(21)
      expect(m.worldLandmarks).toHaveLength(21)
      expect(m.confianza).toBeGreaterThan(0.5)
      for (const p of [...m.landmarks, ...m.worldLandmarks]) {
        expect(Object.keys(p).sort()).toEqual(['x', 'y', 'z'])
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true)
      }
      // image normalizada dentro del cuadro; z relativa a la muñeca
      for (const p of m.landmarks) {
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(1)
        expect(p.y).toBeGreaterThan(0)
        expect(p.y).toBeLessThan(1)
      }
      expect(m.landmarks[0].z).toBeCloseTo(0, 9)
    }
  })

  it('largo de mano en metros constante (~18 cm) al abrir, cerrar y girar', () => {
    expect(LARGO_MODELO_CM).toBeGreaterThan(17)
    expect(LARGO_MODELO_CM).toBeLessThan(20)
    for (const apertura of [0, 0.5, 1]) {
      for (const giroDeg of [0, 35]) {
        const m = manoSintetica({ apertura, giroDeg, pronacionDeg: 60 })
        expect(largoMano(m.worldLandmarks) * 100).toBeCloseTo(LARGO_MODELO_CM, 6)
      }
    }
  })

  it('abierta vs puño y pinza', () => {
    const abierta = manoSintetica({ apertura: 1 })
    const puno = manoSintetica({ apertura: 0 })
    expect(aperturaMano(abierta.worldLandmarks)).toBeGreaterThan(0.8)
    expect(aperturaMano(puno.worldLandmarks)).toBeLessThan(0.3)
    expect(aperturaPinza(abierta.worldLandmarks) * 100).toBeGreaterThan(7)
    for (const cm of [0.5, 2, 4]) {
      const pinza = manoSintetica({ apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: cm })
      expect(aperturaPinza(pinza.worldLandmarks) * 100).toBeCloseTo(cm, 1)
    }
  })

  it('lateralidad: derecha a la izquierda de la imagen cruda con pulgar hacia +x; izquierda es su espejo', () => {
    const d = manoSintetica({ lado: 'derecha' })
    const i = manoSintetica({ lado: 'izquierda' })
    expect(d.worldLandmarks[4].x).toBeGreaterThan(d.worldLandmarks[20].x)
    d.worldLandmarks.forEach((p, k) => {
      expect(i.worldLandmarks[k].x).toBeCloseTo(-p.x, 9)
      expect(i.worldLandmarks[k].y).toBeCloseTo(p.y, 9)
    })
    const ambas = manosEnGuion(guionPreset('ambas'), 0).manos
    const xd = ambas.find((m) => m.lado === 'derecha')!.landmarks[0].x
    const xi = ambas.find((m) => m.lado === 'izquierda')!.landmarks[0].x
    expect(xd).toBeLessThan(0.5)
    expect(xi).toBeGreaterThan(0.5)
    expect(manosEnGuion(guionPreset('quieta', 'derecha'), 0).manos[0].landmarks[0].x).toBeLessThan(0.5)
  })

  it('dedos hacia arriba en la imagen y más grande al acercarse', () => {
    const lejos = manoSintetica({ distanciaCm: 60 })
    const cerca = manoSintetica({ distanciaCm: 40 })
    expect(lejos.landmarks[12].y).toBeLessThan(lejos.landmarks[0].y)
    const alto = (m: ManoSeguida) => (m.landmarks[0].y - m.landmarks[12].y) * H
    expect(alto(cerca) / alto(lejos)).toBeCloseTo(60 / 40, 1)
  })
})

describe('distancia por perspectiva débil (spec §6)', () => {
  const poses: [string, Partial<PoseMano>][] = [
    ['abierta al centro', {}],
    ['puño', { apertura: 0 }],
    ['pinza', { apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: 1 }],
    ['en una esquina', { x: 0.25, y: 0.3 }],
    ['girada e inclinada', { giroDeg: 30, pronacionDeg: 40, inclinacionDeg: 15 }],
  ]
  for (const cm of [40, 50, 60]) {
    for (const [nombre, pose] of poses) {
      it(`${cm} cm · ${nombre}: error < 5 %`, () => {
        const m = manoSintetica({ ...pose, distanciaCm: cm })
        const e = estimarDistanciaCm(m, W, H)!
        expect(e.metodo).toBe('perspectiva')
        expect(errorRel(e.cm, cm)).toBeLessThan(0.05)
      })
    }
  }

  it('también con la imagen en espejo (x → 1 − x)', () => {
    const m = manoSintetica({ distanciaCm: 45, giroDeg: 20 })
    const espejo = { ...m, landmarks: m.landmarks.map((p) => ({ ...p, x: 1 - p.x })) }
    expect(errorRel(estimarDistanciaCm(espejo, W, H)!.cm, 45)).toBeLessThan(0.05)
  })

  it('fórmula del spec cuando imagen y mundo están alineados: s ≈ f / Z', () => {
    const m = manoSintetica({ distanciaCm: 50 })
    const s = escalaPerspectivaDebil(m.landmarks, m.worldLandmarks, W, H, [0, 5, 9, 13, 17])!
    expect(errorRel(s, (0.8 * W) / 0.5)).toBeLessThan(0.01)
  })

  it('la regla corrige una mano más chica que el promedio', () => {
    const camara = { largoManoRealCm: 16 }
    for (const cm of [40, 50, 60]) {
      const m = manoSintetica({ distanciaCm: cm }, camara)
      const sinRegla = estimarDistanciaCm(m, W, H)!.cm
      const conRegla = estimarDistanciaCm(m, W, H, { largoReglaCm: 16 })!.cm
      expect(errorRel(sinRegla, cm)).toBeGreaterThan(0.08) // sin regla sobreestima (~14 %)
      expect(errorRel(conRegla, cm)).toBeLessThan(0.05)
    }
  })

  it('otra focal del teléfono: calibrarla con una distancia medida', () => {
    const camara = { factorFocal: 0.95 }
    const m = manoSintetica({ distanciaCm: 50 }, camara)
    const f = focalDesdeDistanciaConocida(m, W, H, 50)!
    expect(errorRel(f, 0.95 * W)).toBeLessThan(0.03)
    const otra = manoSintetica({ distanciaCm: 35 }, camara)
    expect(errorRel(estimarDistanciaCm(otra, W, H, { focalPx: f })!.cm, 35)).toBeLessThan(0.05)
  })

  it('respaldo pinhole sin worldLandmarks', () => {
    const m = manoSintetica({ distanciaCm: 50 })
    const e = estimarDistanciaCm({ landmarks: m.landmarks, worldLandmarks: [] }, W, H)!
    expect(e.metodo).toBe('pinhole')
    expect(errorRel(e.cm, 50)).toBeLessThan(0.05)
    expect(estimarDistanciaCm({ landmarks: [], worldLandmarks: [] }, W, H)).toBeNull()
  })

  it('EstimadorDistancia suaviza y converge', () => {
    const est = new EstimadorDistancia()
    const m = manoSintetica({ distanciaCm: 50 })
    const lejos = manoSintetica({ distanciaCm: 60 })
    let v = est.estimar(m, W, H, 0)!.cm
    expect(errorRel(v, 50)).toBeLessThan(0.05)
    const primerSalto = est.estimar(lejos, W, H, 33)!.cm
    expect(primerSalto).toBeLessThan(59) // no salta de golpe
    for (let t = 66; t < 3000; t += 33) v = est.estimar(lejos, W, H, t)!.cm
    expect(errorRel(v, 60)).toBeLessThan(0.05)
  })
})

describe('guiones sintéticos', () => {
  it('interpola, hereda campos y repite con bucle', () => {
    const poses = secuencia([[0, { apertura: 1, x: 0.3 }], [1000, { apertura: 0 }], [1000, { x: 0.7 }]])
    expect(poses.map((p) => p.t)).toEqual([0, 1000, 2000])
    expect(poseEn(poses, 500).apertura).toBeCloseTo(0.5)
    expect(poseEn(poses, 500).x).toBeCloseTo(0.3) // x heredado en la clave 2
    expect(poseEn(poses, 1500).x).toBeCloseTo(0.5)
    expect(poseEn(poses, 1500).apertura).toBeCloseTo(0)
    expect(poseEn(poses, 2500).x).toBeCloseTo(poseEn(poses, 500).x) // bucle
    expect(poseEn(poses, 2500, false).x).toBeCloseTo(0.7)
  })

  it('visible cambia en la clave y la pinza se suelta con null', () => {
    const poses = secuencia([[0, {}], [500, { visible: false }], [500, { visible: true, pinzaCm: 1 }], [500, { pinzaCm: null }]])
    expect(poseEn(poses, 400, false).visible).toBe(true)
    expect(poseEn(poses, 600, false).visible).toBe(false)
    expect(poseEn(poses, 1000, false).pinzaCm).toBe(1)
    expect(poseEn(poses, 1500, false).pinzaCm).toBeNull()
    expect(manosEnGuion({ manos: [{ lado: 'derecha', poses }], bucle: false }, 600).manos).toHaveLength(0)
  })

  it('todos los presets generan manos válidas', () => {
    for (const nombre of GUIONES_PRESET) {
      const g = guionPreset(nombre, 'izquierda')
      for (let t = 0; t < 12000; t += 250) {
        for (const m of manosEnGuion(g, t).manos) {
          expect(m.landmarks).toHaveLength(21)
          expect(m.worldLandmarks.every((p) => Number.isFinite(p.x + p.y + p.z))).toBe(true)
        }
      }
    }
    expect(manosEnGuion(guionPreset('sin-mano'), 0).manos).toHaveLength(0)
    expect(manosEnGuion(guionPreset('ambas'), 0).manos).toHaveLength(2)
  })

  it('calibracion: abierta al inicio, 3 cierres y una pinza', () => {
    const g = guionPreset('calibracion')
    const abiertas: number[] = []
    let cierres = 0
    let cerrada = false
    let pinzaMin = Infinity
    for (let t = 0; t < 10_000; t += 33) {
      const m = manosEnGuion(g, t).manos[0]
      const a = aperturaMano(m.worldLandmarks)
      if (t < 2400) abiertas.push(a)
      if (!cerrada && a < 0.3) {
        cerrada = true
        cierres++
      } else if (cerrada && a > 0.8) cerrada = false
      pinzaMin = Math.min(pinzaMin, aperturaPinza(m.worldLandmarks) * 100)
    }
    expect(Math.min(...abiertas)).toBeGreaterThan(0.8)
    expect(cierres).toBe(3)
    expect(pinzaMin).toBeLessThan(1)
  })
})

describe('fuentes simuladas y estado', () => {
  it('estado: buscando → detectada → perdida (tras MS_PERDIDA)', () => {
    expect(siguienteEstado('buscando', false, 0, null)).toBe('buscando')
    expect(siguienteEstado('buscando', true, 10, null)).toBe('detectada')
    expect(siguienteEstado('detectada', false, 10 + MS_PERDIDA - 1, 10)).toBe('detectada')
    expect(siguienteEstado('detectada', false, 10 + MS_PERDIDA, 10)).toBe('perdida')
    expect(siguienteEstado('perdida', true, 900, 10)).toBe('detectada')
  })

  it('MedidorFps mide ~30 fps', () => {
    const m = new MedidorFps()
    for (let t = 0; t < 2000; t += 1000 / 30) m.marcar(t)
    expect(m.fps).toBeCloseTo(30, 0)
  })

  it('FuenteSintetica con reloj manual: estados, control en vivo y luz', async () => {
    const reloj = relojManual()
    const f = new FuenteSintetica(guionPreset('sin-mano'), reloj)
    const estados: string[] = []
    f.alEstado((e) => estados.push(e))
    let cuadros = 0
    f.alCuadro(() => cuadros++)
    await f.iniciar()
    expect(f.estado).toBe('buscando')
    reloj.t = 100
    f.fijarPose({ apertura: 0.5 })
    expect(f.estado).toBe('detectada')
    expect(f.ultimo!.manos[0].lado).toBe('derecha')
    expect(f.ultimo!.ancho).toBe(640)
    reloj.t = 200
    f.ocultar()
    expect(f.estado).toBe('detectada')
    reloj.t = 200 + MS_PERDIDA
    f.paso()
    expect(f.estado).toBe('perdida')
    expect(estados).toEqual(['buscando', 'detectada', 'perdida'])
    expect(cuadros).toBe(4)
    expect(f.ultimo!.t).toBe(500) // t monótono aunque el guion se reinició
    expect(f.ultimaDeteccion).toBe(100)
    f.fijarLuz(30)
    f.paso()
    expect(f.luminancia).toBe(30)
    f.detener()
  })
})

describe('grabación JSON de landmarks', () => {
  function grabarSintetica(): { json: string; originales: CuadroManos[] } {
    const reloj = relojManual()
    const f = new FuenteSintetica(guionPreset('calibracion'), reloj)
    const g = new GrabadorLandmarks('sintetica')
    const originales: CuadroManos[] = []
    f.alCuadro((c) => {
      g.agregar(c)
      originales.push(c)
    })
    void f.iniciar()
    for (let t = 1000; t <= 4000; t += 33) {
      reloj.t = t
      f.paso()
    }
    return { json: g.json('2026-11-21T00:00:00.000Z'), originales }
  }

  it('se reproduce de forma determinista', () => {
    const { json } = grabarSintetica()
    const tiempos = Array.from({ length: 300 }, (_, i) => i * 17.3)
    const corrida = (texto: string) => {
      const reloj = relojManual()
      const f = new FuenteGrabacion(leerGrabacion(texto), reloj)
      const out: CuadroManos[] = []
      f.alCuadro((c) => out.push(c))
      void f.iniciar()
      for (const t of tiempos) {
        reloj.t = t
        f.paso()
      }
      return out
    }
    const a = corrida(json)
    const b = corrida(json)
    expect(a.length).toBeGreaterThan(300)
    expect(b).toEqual(a)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('ida y vuelta: lo reproducido es lo grabado (redondeo 1e-5)', () => {
    const { json, originales } = grabarSintetica()
    const g = leerGrabacion(json)
    expect(g.cuadros).toHaveLength(originales.length)
    expect(g.cuadros[0].t).toBe(0)
    originales.forEach((o, i) => {
      const c = cuadroEnGrabacion(g, o.t - originales[0].t, false)!
      expect(c).toBe(g.cuadros[i])
      o.manos.forEach((m, k) => {
        expect(c.manos[k].lado).toBe(m.lado)
        m.landmarks.forEach((p, j) => expect(c.manos[k].landmarks[j].x).toBeCloseTo(p.x, 4))
        m.worldLandmarks.forEach((p, j) => expect(c.manos[k].worldLandmarks[j].z).toBeCloseTo(p.z, 4))
      })
    })
    // re-serializar da el mismo texto
    expect(serializarGrabacion(g)).toBe(json)
  })

  it('solo guarda números de landmarks (nada de video ni campos extra)', () => {
    const g = new GrabadorLandmarks()
    const mano = manoSintetica({}) as ManoSeguida & { imagen?: string }
    mano.imagen = 'data:image/png;base64,AAAA'
    g.agregar({ t: 5, manos: [mano], ancho: W, alto: H, video: 'x' } as CuadroManos)
    const texto = g.json('2026-11-21T00:00:00.000Z')
    expect(texto).not.toContain('data:')
    expect(texto).not.toContain('imagen')
    expect(texto).not.toContain('video')
    const crudo = JSON.parse(texto)
    expect(Object.keys(crudo.cuadros[0]).sort()).toEqual(['m', 't'])
    expect(Object.keys(crudo.cuadros[0].m[0]).sort()).toEqual(['c', 'l', 'p', 'w'])
    expect(crudo.cuadros[0].m[0].p).toHaveLength(63)
  })

  it('rechaza archivos que no son grabaciones', () => {
    expect(() => leerGrabacion('{"hola":1}')).toThrow()
    expect(() => leerGrabacion({ formato: 'manoviva-landmarks', version: 1, cuadros: [{ t: 0, m: [{ l: 'd', c: 1, p: [1], w: [] }] }] })).toThrow()
  })
})

describe('cámara (lógica pura) y configuración', () => {
  it('resultado de MediaPipe → manos, una por lado', () => {
    const m = manoSintetica({})
    const lm = m.landmarks.map((p) => ({ ...p, visibility: 0 }))
    const wl = m.worldLandmarks.map((p) => ({ ...p, visibility: 0 }))
    const cat = (categoryName: string, score: number) => [{ categoryName, score, index: 0, displayName: '' }]
    const r = {
      landmarks: [lm, lm, lm],
      worldLandmarks: [wl, wl, wl],
      handedness: [cat('Right', 0.7), cat('Left', 0.9), cat('Right', 0.95)],
      handednesses: [],
    }
    const manos = manosDesdeResultado(r)
    expect(manos.map((x) => x.lado).sort()).toEqual(['derecha', 'izquierda'])
    expect(manos.find((x) => x.lado === 'derecha')!.confianza).toBe(0.95)
    expect(Object.keys(manos[0].landmarks[0]).sort()).toEqual(['x', 'y', 'z'])
    expect(ladoDesdeEtiqueta('Right', true)).toBe('izquierda')
  })

  it('si MediaPipe pone el mismo lado a las dos manos, no pierde ninguna', () => {
    const cat = (categoryName: string, score: number) => [{ categoryName, score, index: 0, displayName: '' }]
    const en = (x: number) => manoSintetica({ x }).landmarks.map((p) => ({ ...p, visibility: 0 }))
    const wl = manoSintetica({}).worldLandmarks.map((p) => ({ ...p, visibility: 0 }))
    const r = { landmarks: [en(0.3), en(0.7)], worldLandmarks: [wl, wl], handedness: [cat('Right', 0.8), cat('Right', 0.9)], handednesses: [] }
    // Sin cuadro anterior: la más confiable conserva su etiqueta y la otra toma el lado libre.
    const solas = manosDesdeResultado(r)
    expect(solas).toHaveLength(2)
    expect(solas.find((m) => m.lado === 'derecha')!.confianza).toBe(0.9)
    expect(solas.find((m) => m.lado === 'izquierda')!.landmarks[0].x).toBeCloseTo(en(0.3)[0].x)
    // Con cuadro anterior: cada lado sigue siendo la mano que estaba más cerca.
    const previas = [
      { lado: 'derecha' as const, confianza: 1, landmarks: en(0.31), worldLandmarks: [] },
      { lado: 'izquierda' as const, confianza: 1, landmarks: en(0.69), worldLandmarks: [] },
    ]
    const seguidas = manosDesdeResultado(r, false, previas)
    expect(seguidas.find((m) => m.lado === 'derecha')!.landmarks[0].x).toBeCloseTo(en(0.3)[0].x)
    expect(seguidas.find((m) => m.lado === 'izquierda')!.landmarks[0].x).toBeCloseTo(en(0.7)[0].x)
    // Con etiquetas distintas no se toca nada, aunque el cuadro anterior diga otra cosa.
    const normales = manosDesdeResultado({ ...r, handedness: [cat('Left', 0.8), cat('Right', 0.9)] }, false, previas)
    expect(normales.find((m) => m.lado === 'izquierda')!.landmarks[0].x).toBeCloseTo(en(0.3)[0].x)
  })

  it('reconoce la telemetría de MediaPipe (se corta) sin tocar lo demás', () => {
    expect(esTelemetriaMediapipe('https://odml.pa.googleapis.com/v1/log')).toBe(true)
    expect(esTelemetriaMediapipe('/mediapipe/hand_landmarker.task')).toBe(false)
    expect(esTelemetriaMediapipe('https://iniposctftmzxkqasikh.supabase.co/rest/v1/sesiones')).toBe(false)
  })

  it('?fuente= y parámetros', () => {
    expect(configDesdeUrl('').tipo).toBe('camara')
    expect(configDesdeUrl('?fuente=otra').tipo).toBe('camara')
    const c = configDesdeUrl('?fuente=sintetica&guion=pinza&lado=izquierda')
    expect(c).toMatchObject({ tipo: 'sintetica', guion: 'pinza', lado: 'izquierda' })
    expect(configDesdeUrl('?fuente=sintetica&guion=nada').guion).toBe('calibracion')
    expect(configDesdeUrl('?fuente=grabacion&grabacion=/x.json').grabacion).toBe('/x.json')
    expect(configDesdeUrl('?lateralidad=invertida').invertirLateralidad).toBe(true)
    expect(configDesdeUrl('?delegado=cpu').delegado).toBe('CPU')
    expect(configDesdeUrl('').delegado).toBeNull()
  })
})
