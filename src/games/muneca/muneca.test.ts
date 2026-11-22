import { describe, expect, it } from 'vitest'
import { JUEGOS } from '../registry'
import { guionPreset, manoSintetica, manosEnGuion } from '../../tracking/sintetica'
import {
  AVISO_ANTEBRAZO,
  AgregadoMuneca,
  CapturaNeutro,
  IDENTIDAD,
  NIVELES_MUNECA,
  ORDEN_FASES,
  SuavizadorAngulos,
  angulos,
  avisoAntebrazo,
  distanciaAngular,
  estadoMunecaInicial,
  marcoMano,
  maximoRobusto,
  mult,
  nivelMuneca,
  pasoMuneca,
  percentil,
  promediarMarcos,
  r0Desde,
  r0Plano,
  valorFase,
  type EstadoMuneca,
  type Mat3,
} from './logica'
import { crearMuneca } from './modulo'

const RAD = Math.PI / 180
const rotX = (g: number): Mat3 => [[1, 0, 0], [0, Math.cos(g * RAD), -Math.sin(g * RAD)], [0, Math.sin(g * RAD), Math.cos(g * RAD)]]
const rotY = (g: number): Mat3 => [[Math.cos(g * RAD), 0, Math.sin(g * RAD)], [0, 1, 0], [-Math.sin(g * RAD), 0, Math.cos(g * RAD)]]
const rotZ = (g: number): Mat3 => [[Math.cos(g * RAD), -Math.sin(g * RAD), 0], [Math.sin(g * RAD), Math.cos(g * RAD), 0], [0, 0, 1]]
/** Marco girado `g` grados alrededor de un eje de la mano neutra (R = R0 · Rot). */
const girado = (R0: Mat3, rot: Mat3): Mat3 => mult(R0, rot)

/** Marco de la mano sintética con esas rotaciones (inclinacionDeg = flexión, giroDeg = desviación, pronacionDeg = giro). */
const marcoSint = (pose: object, lado: 'derecha' | 'izquierda' = 'derecha') => marcoMano(manoSintetica({ ...pose, lado }).worldLandmarks, lado)!
const R0der = marcoSint({})

describe('ángulos de la muñeca (port de angulos3d.py)', () => {
  it('identidad: 0° en todo', () => {
    const a = angulos(IDENTIDAD, IDENTIDAD)
    expect(a.flexExt).toBeCloseTo(0, 6)
    expect(a.desviacion).toBeCloseTo(0, 6)
    expect(a.giro).toBeCloseTo(0, 6)
    expect(a.cono).toBeCloseTo(0, 4)
    expect(a.dir).toEqual([0, 1, 0])
  })

  it('rotaciones puras alrededor de cada eje de la mano: solo ese ángulo (±1°)', () => {
    for (const g of [-60, -30, -10, 10, 30, 60]) {
      // eje x (radial) = flexión/extensión; el signo: + = dedos hacia la palma (z)
      const f = angulos(IDENTIDAD, rotX(g))
      expect(Math.abs(Math.abs(f.flexExt) - Math.abs(g))).toBeLessThan(1)
      expect(Math.abs(f.desviacion)).toBeLessThan(1)
      expect(Math.abs(f.giro)).toBeLessThan(1)
      // eje z (palma) = desviación radial/cubital
      const d = angulos(IDENTIDAD, rotZ(g))
      expect(Math.abs(Math.abs(d.desviacion) - Math.abs(g))).toBeLessThan(1)
      expect(Math.abs(d.flexExt)).toBeLessThan(1)
      expect(Math.abs(d.giro)).toBeLessThan(1)
      // eje y (largo) = giro
      const r = angulos(IDENTIDAD, rotY(g))
      expect(Math.abs(Math.abs(r.giro) - Math.abs(g))).toBeLessThan(1)
      expect(Math.abs(r.flexExt)).toBeLessThan(1)
      expect(Math.abs(r.desviacion)).toBeLessThan(1)
    }
    // signos: rotX(+) lleva y hacia −z con esta matriz, así que flexión positiva es rotX(−g); lo importante es que sean opuestos
    expect(angulos(IDENTIDAD, rotX(30)).flexExt).toBeCloseTo(-angulos(IDENTIDAD, rotX(-30)).flexExt, 6)
    expect(angulos(IDENTIDAD, rotZ(30)).desviacion).toBeCloseTo(-angulos(IDENTIDAD, rotZ(-30)).desviacion, 6)
    expect(angulos(IDENTIDAD, rotY(30)).giro).toBeCloseTo(-angulos(IDENTIDAD, rotY(-30)).giro, 6)
  })

  it('relativo a un neutro cualquiera (no al de la cámara)', () => {
    const R0 = mult(rotZ(25), rotX(-20))
    const a = angulos(R0, girado(R0, rotX(-35)))
    expect(Math.abs(a.flexExt)).toBeCloseTo(35, 3)
    expect(a.desviacion).toBeCloseTo(0, 3)
    expect(a.giro).toBeCloseTo(0, 3)
  })

  it('manos sintéticas: neutro 0°, flexión y extensión opuestas, radial y cubital opuestas, giro', () => {
    const n = angulos(R0der, R0der)
    expect(Math.abs(n.flexExt) + Math.abs(n.desviacion) + Math.abs(n.giro)).toBeLessThan(1e-6)
    const flex = angulos(R0der, marcoSint({ inclinacionDeg: 40 }))
    const ext = angulos(R0der, marcoSint({ inclinacionDeg: -40 }))
    expect(flex.flexExt).toBeGreaterThan(38)
    expect(flex.flexExt).toBeLessThan(42)
    expect(ext.flexExt).toBeLessThan(-38)
    // la mano sintética no está exactamente alineada con los ejes de la cámara (el medio 9 se inclina ~3°): queda una fuga pequeña
    expect(Math.abs(flex.desviacion) + Math.abs(flex.giro)).toBeLessThan(4)
    const rad = angulos(R0der, marcoSint({ giroDeg: 25 }))
    const cub = angulos(R0der, marcoSint({ giroDeg: -25 }))
    expect(rad.desviacion).toBeGreaterThan(23)
    expect(rad.desviacion).toBeLessThan(27)
    expect(cub.desviacion).toBeLessThan(-23)
    expect(Math.abs(rad.flexExt) + Math.abs(rad.giro)).toBeLessThan(4)
    const gi = angulos(R0der, marcoSint({ pronacionDeg: 30 }))
    expect(Math.abs(gi.giro)).toBeGreaterThan(28)
    expect(Math.abs(gi.giro)).toBeLessThan(32)
    expect(Math.abs(gi.flexExt) + Math.abs(gi.desviacion)).toBeLessThan(4)
  })

  it('mano izquierda: es el espejo de la derecha, mismos ángulos con los mismos signos', () => {
    const R0izq = marcoSint({}, 'izquierda')
    for (const pose of [{ inclinacionDeg: 35 }, { inclinacionDeg: -20 }, { giroDeg: 22 }, { giroDeg: -15 }, { pronacionDeg: 25 }, { inclinacionDeg: 20, giroDeg: 10 }]) {
      const d = angulos(R0der, marcoSint(pose))
      const i = angulos(R0izq, marcoSint(pose, 'izquierda'))
      expect(i.flexExt).toBeCloseTo(d.flexExt, 3)
      expect(i.desviacion).toBeCloseTo(d.desviacion, 3)
      expect(i.giro).toBeCloseTo(d.giro, 3)
    }
    // el marco de la izquierda es impropio (z sigue siendo el lado de la palma)
    expect(marcoMano(manoSintetica({ lado: 'izquierda' }).worldLandmarks, 'izquierda')![2][2]).toBeLessThan(-0.9)
  })

  it('marco: mano degenerada → null', () => {
    const m = manoSintetica({})
    expect(marcoMano(m.worldLandmarks.slice(0, 5), 'derecha')).toBeNull()
    expect(marcoMano(m.worldLandmarks.map(() => ({ x: 0, y: 0, z: 0 })), 'derecha')).toBeNull()
  })

  it('dirección de los dedos y cono', () => {
    const a = angulos(R0der, marcoSint({ inclinacionDeg: 40 }))
    expect(a.cono).toBeGreaterThan(38)
    expect(a.cono).toBeLessThan(42)
    expect(Math.hypot(...a.dir)).toBeCloseTo(1, 6)
    expect(a.dir[2]).toBeGreaterThan(0.6) // hacia la palma
  })
})

describe('neutro: promedio y ventana quieta', () => {
  it('promediar marcos con ruido devuelve una rotación cercana a la media', () => {
    const base = mult(rotZ(10), rotX(-15))
    const marcos = [-3, 3, -2, 2, 0].map((g) => girado(base, rotX(g)))
    const m = promediarMarcos(marcos)
    expect(distanciaAngular(m, base)).toBeLessThan(0.5)
    // ortogonal: mᵀm = I
    const mm = mult([[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]], m)
    expect(mm[0][0]).toBeCloseTo(1, 6)
    expect(mm[0][1]).toBeCloseTo(0, 6)
  })

  it('promedia también marcos impropios (mano izquierda)', () => {
    const marcos = [-2, 0, 2].map((g) => marcoSint({ inclinacionDeg: g }, 'izquierda'))
    const m = promediarMarcos(marcos)
    expect(distanciaAngular(m, marcoSint({}, 'izquierda'))).toBeLessThan(1)
  })

  it('se toma tras 2 s quieta y se reinicia si la mano se mueve', () => {
    const c = new CapturaNeutro()
    let t = 0
    let r = c.paso(R0der, t)
    for (; t < 1900; t += 33) r = c.paso(girado(R0der, rotX(((t / 33) % 2) - 1)), t)
    expect(r.neutro).toBeNull()
    expect(r.progreso).toBeGreaterThan(0.9)
    // un movimiento grande sostenido reinicia
    for (let k = 0; k < 4; k++) r = c.paso(girado(R0der, rotX(40)), (t += 33))
    expect(r.progreso).toBeLessThan(0.1)
    // quieta otra vez 2 s → neutro
    for (let k = 0; k < 80 && !r.neutro; k++) r = c.paso(R0der, (t += 33))
    expect(r.neutro).not.toBeNull()
    expect(distanciaAngular(r.neutro!, R0der)).toBeLessThan(1)
  })

  it('un cuadro suelto fuera de rango no reinicia; perder la mano sí', () => {
    const c = new CapturaNeutro()
    let t = 0
    let r = c.paso(R0der, 0)
    for (let k = 0; k < 30; k++) r = c.paso(R0der, (t += 33))
    const antes = r.progreso
    r = c.paso(girado(R0der, rotX(50)), (t += 33))
    expect(r.progreso).toBeGreaterThanOrEqual(antes)
    r = c.paso(R0der, (t += 33))
    expect(r.progreso).toBeGreaterThanOrEqual(antes)
    r = c.paso(null, (t += 33))
    expect(r.progreso).toBe(0)
  })

  it('R0 va y viene como nueve números r0_ij', () => {
    const plano = r0Plano(R0der)
    expect(Object.keys(plano)).toEqual(['r0_00', 'r0_01', 'r0_02', 'r0_10', 'r0_11', 'r0_12', 'r0_20', 'r0_21', 'r0_22'])
    const R = r0Desde(plano)!
    expect(distanciaAngular(R, R0der)).toBeLessThan(0.1)
    expect(r0Desde({ r0_00: 1 })).toBeNull()
  })
})

describe('máximos robustos', () => {
  it('percentil por rango inferior', () => {
    expect(percentil([], 98)).toBeNull()
    expect(percentil([1, 2, 3, 4, 5], 0)).toBe(1)
    expect(percentil(Array.from({ length: 101 }, (_, i) => i), 98)).toBe(98)
  })

  it('un pico de un solo cuadro no cambia el máximo', () => {
    const serie = [...Array.from({ length: 200 }, (_, i) => 30 + (i % 5)), 90]
    const m = maximoRobusto(serie)!
    expect(m).toBeGreaterThanOrEqual(33)
    expect(m).toBeLessThanOrEqual(34)
  })

  it('sin movimiento (temblor < 5°) da el percentil de lo positivo; sin positivos, 0; sin datos, null', () => {
    expect(maximoRobusto([1, 2, 3, 2, 1])).toBeLessThanOrEqual(3)
    expect(maximoRobusto([-3, -2, -1])).toBe(0)
    expect(maximoRobusto([])).toBeNull()
  })

  it('AgregadoMuneca: maxima por lado y excluye el aviso de antebrazo (menos el giro)', () => {
    const ag = new AgregadoMuneca()
    let t = 0
    const dato = (flexExt: number, desviacion: number, giro: number) => ({ flexExt, desviacion, giro, dir: [0, 1, 0] as [number, number, number], cono: Math.hypot(flexExt, desviacion) })
    for (let i = 0; i < 100; i++) ag.muestra(dato(40, 0, 0), false, (t += 60))
    for (let i = 0; i < 100; i++) ag.muestra(dato(-30, 0, 0), false, (t += 60))
    for (let i = 0; i < 100; i++) ag.muestra(dato(0, 20, 0), false, (t += 60))
    for (let i = 0; i < 100; i++) ag.muestra(dato(0, -25, 0), false, (t += 60))
    for (let i = 0; i < 100; i++) ag.muestra(dato(70, 50, 60), true, (t += 60)) // antebrazo: no cuenta (salvo el giro)
    ag.movimientos = 4
    const r = ag.resumen(R0der)
    expect(r).toMatchObject({ flexionMax: 40, extensionMax: 30, radialMax: 20, cubitalMax: 25, giroPosMax: 60, giroNegMax: 0, movimientos: 4 })
    expect(r.conoMax).toBe(40)
    expect(r.r0_11).not.toBeNull()
    expect(new AgregadoMuneca().resumen(null)).toMatchObject({ flexionMax: null, giroPosMax: null, movimientos: 0 })
    expect(Object.keys(new AgregadoMuneca().resumen(null)).some((k) => k.startsWith('r0_'))).toBe(false)
  })

  it('muestrea a ~20 Hz como máximo', () => {
    const ag = new AgregadoMuneca()
    const a = { flexExt: 1, desviacion: 0, giro: 0, dir: [0, 1, 0] as [number, number, number], cono: 1 }
    for (let t = 0; t < 1000; t += 10) ag.muestra(a, false, t)
    expect(ag.muestras).toBe(20)
  })
})

describe('suavizado y aviso de antebrazo', () => {
  it('la mediana de 5 quita un pico de un cuadro', () => {
    const s = new SuavizadorAngulos()
    const dato = (v: number) => ({ flexExt: v, desviacion: 0, giro: 0, dir: [0, 1, 0] as [number, number, number], cono: 0 })
    let ultimo = dato(0)
    for (const v of [10, 10, 80, 10, 10]) ultimo = s.filtrar(dato(v))
    expect(ultimo.flexExt).toBe(10)
  })

  it('aviso: giro > 45°, o desviación > 35° pidiendo flexión/extensión', () => {
    expect(avisoAntebrazo('flexion', { desviacion: 10, giro: 20 })).toBe(false)
    expect(avisoAntebrazo('flexion', { desviacion: 10, giro: 46 })).toBe(true)
    expect(avisoAntebrazo('extension', { desviacion: -36, giro: 0 })).toBe(true)
    expect(avisoAntebrazo('flexion', { desviacion: 35, giro: 0 })).toBe(false)
    expect(avisoAntebrazo('radial', { desviacion: 40, giro: 0 })).toBe(false) // la desviación es lo pedido
    expect(avisoAntebrazo('cubital', { desviacion: -40, giro: -50 })).toBe(true)
    expect(avisoAntebrazo(null, { desviacion: 50, giro: 0 })).toBe(false)
    expect(AVISO_ANTEBRAZO).toBe('Puede ser el antebrazo: mantenlo quieto')
  })
})

describe('fases guiadas', () => {
  const n = nivelMuneca(1) // 30 / 25 / 10 / 15, sostener 1 s, 12 s para alcanzar
  const cero = { flexExt: 0, desviacion: 0 }
  const correr = (e: EstadoMuneca, a: { flexExt: number; desviacion: number } | null, ms: number, ante = false) => {
    let s = e
    const evs: ReturnType<typeof pasoMuneca>['eventos'] = []
    for (let t = 0; t < ms; t += 50) {
      const r = pasoMuneca(s, a, ante, 50, n)
      s = r.estado
      evs.push(...r.eventos)
    }
    return { s, evs }
  }

  it('niveles 1..5 crecen', () => {
    for (const f of ORDEN_FASES) for (let k = 1; k < 5; k++) expect(NIVELES_MUNECA[(k + 1) as 2][f]).toBeGreaterThanOrEqual(NIVELES_MUNECA[k as 1][f])
    expect(NIVELES_MUNECA[1]).toMatchObject({ flexion: 30, extension: 25, radial: 10, cubital: 15 })
    expect(NIVELES_MUNECA[5]).toMatchObject({ flexion: 70, extension: 60, radial: 20, cubital: 35 })
    expect(NIVELES_MUNECA[5].sostenerMs).toBeGreaterThan(NIVELES_MUNECA[1].sostenerMs)
    expect(nivelMuneca(0)).toBe(NIVELES_MUNECA[1])
    expect(nivelMuneca(9)).toBe(NIVELES_MUNECA[5])
  })

  it('valorFase: signos por fase', () => {
    expect(valorFase('flexion', { flexExt: 20, desviacion: 5 })).toBe(20)
    expect(valorFase('extension', { flexExt: -20, desviacion: 5 })).toBe(20)
    expect(valorFase('radial', { flexExt: 1, desviacion: 12 })).toBe(12)
    expect(valorFase('cubital', { flexExt: 1, desviacion: -12 })).toBe(12)
  })

  it('muestra el objetivo, exige sostenerlo, acierta, vuelve al neutro y pasa a la siguiente fase', () => {
    let r = correr(estadoMunecaInicial(), cero, 100)
    expect(r.evs).toEqual([{ tipo: 'objetivo_mostrado', fase: 'flexion', objetivoGrados: 30 }])
    // sobre el objetivo 0,5 s: aún no
    r = correr(r.s, { flexExt: 35, desviacion: 0 }, 500)
    expect(r.evs).toEqual([])
    // se baja del todo: el sostén se reinicia
    r = correr(r.s, { flexExt: 10, desviacion: 0 }, 200)
    expect(r.s.sostenidoMs).toBe(0)
    r = correr(r.s, { flexExt: 36, desviacion: 0 }, 1100)
    expect(r.evs).toEqual([{ tipo: 'acierto', fase: 'flexion', grados: 36 }])
    expect(r.s.etapa).toBe('volver')
    // en 'volver' no se acepta otro objetivo hasta pasar por el neutro
    r = correr(r.s, { flexExt: 36, desviacion: 0 }, 1000)
    expect(r.evs).toEqual([])
    expect(r.s.indice).toBe(0)
    r = correr(r.s, cero, 600)
    expect(r.s).toMatchObject({ indice: 1, etapa: 'ir', anunciado: true })
    expect(r.evs).toEqual([{ tipo: 'objetivo_mostrado', fase: 'extension', objetivoGrados: 25 }])
  })

  it('el margen de 4° bajo el objetivo no reinicia el sostén', () => {
    let r = correr(estadoMunecaInicial(), { flexExt: 31, desviacion: 0 }, 400)
    r = correr(r.s, { flexExt: 27, desviacion: 0 }, 200)
    expect(r.s.sostenidoMs).toBeGreaterThan(500)
    r = correr(r.s, { flexExt: 24, desviacion: 0 }, 100)
    expect(r.s.sostenidoMs).toBe(0)
  })

  it('no_alcanzado tras 12 s sin llegar, con el máximo logrado', () => {
    let r = correr(estadoMunecaInicial(), { flexExt: 18, desviacion: 0 }, 11_000)
    expect(r.evs.map((e) => e.tipo)).toEqual(['objetivo_mostrado'])
    r = correr(r.s, { flexExt: 18, desviacion: 0 }, 1_500)
    expect(r.evs).toEqual([{ tipo: 'no_alcanzado', fase: 'flexion', maxGrados: 18 }])
    expect(r.s.etapa).toBe('volver')
  })

  it('con aviso de antebrazo no suma sostén ni cuenta el máximo', () => {
    const r = correr(estadoMunecaInicial(), { flexExt: 50, desviacion: 40 }, 3000, true)
    expect(r.evs.map((e) => e.tipo)).toEqual(['objetivo_mostrado'])
    expect(r.s.sostenidoMs).toBe(0)
    expect(r.s.maxFase).toBe(0)
  })

  it('sin mano no avanza nada', () => {
    const r = correr(estadoMunecaInicial(), null, 20_000)
    expect(r.evs.map((e) => e.tipo)).toEqual(['objetivo_mostrado'])
    expect(r.s.esperaMs).toBe(0)
  })

  it('las cuatro fases se repiten en orden', () => {
    let e = estadoMunecaInicial()
    const vistas: string[] = []
    const a = [{ flexExt: 40, desviacion: 0 }, { flexExt: -40, desviacion: 0 }, { flexExt: 0, desviacion: 20 }, { flexExt: 0, desviacion: -25 }]
    for (let i = 0; i < 8; i++) {
      let r = correr(e, a[i % 4], 1300)
      vistas.push(...r.evs.filter((x) => x.tipo === 'acierto').map((x) => x.fase))
      r = correr(r.s, cero, 600)
      e = r.s
    }
    expect(vistas).toEqual([...ORDEN_FASES, ...ORDEN_FASES])
  })
})

describe('guion sintético "muneca"', () => {
  it('flexión, extensión, radial y cubital con los ángulos conocidos', () => {
    for (const lado of ['derecha', 'izquierda'] as const) {
      const g = guionPreset('muneca', lado)
      const marco = (t: number) => marcoMano(manosEnGuion({ ...g, bucle: false }, t).manos[0].worldLandmarks, lado)!
      const R0 = marco(1500)
      expect(Math.abs(angulos(R0, marco(2400)).flexExt)).toBeLessThan(1)
      // inicio de cada sostén: 2500 + k·4400 + 700 + 1000
      const a = (k: number) => angulos(R0, marco(2500 + k * 4400 + 700 + 1000))
      expect(a(0).flexExt).toBeGreaterThan(43)
      expect(a(0).flexExt).toBeLessThan(47)
      expect(a(1).flexExt).toBeLessThan(-36)
      expect(a(1).flexExt).toBeGreaterThan(-40)
      expect(a(2).desviacion).toBeGreaterThan(20)
      expect(a(2).desviacion).toBeLessThan(24)
      expect(a(3).desviacion).toBeLessThan(-26)
      expect(a(3).desviacion).toBeGreaterThan(-30)
    }
  })
})

describe('módulo y registro', () => {
  it('juego declarado en el registro', () => {
    const j = JUEGOS.find((x) => x.id === 'muneca-3d')!
    expect(j).toBeTruthy()
    expect(j.disponible).toBe(true)
    expect(j.niveles).toHaveLength(5)
    expect(j.nombre).toBe('Muñeca 3D')
  })

  it('ids de resumen y tipos de evento del contrato con la vista de comparación (F38)', () => {
    const m = crearMuneca()
    expect(m.id).toBe('muneca-3d')
    expect(m.metricasResumen.map((d) => d.id)).toEqual(['flexionMax', 'extensionMax', 'radialMax', 'cubitalMax', 'giroPosMax', 'giroNegMax', 'conoMax', 'movimientos'])
    for (const d of m.metricasResumen.filter((x) => x.id !== 'movimientos')) expect(d).toMatchObject({ unidad: '°', aprox: true, mejor: 'mayor' })
    expect(m.metricasResumen.find((d) => d.id === 'movimientos')!.unidad).toBe('')
    expect([...m.tiposEvento].sort()).toEqual(['acierto', 'no_alcanzado', 'objetivo_mostrado'])
    expect(m.metricasVivo.length).toBeLessThanOrEqual(3)
    expect(m.meta.desdePlan({ nivel: 2, duracionMin: 5, metaAgarres: 12, metaPinzaCm: 0 })).toBe(12)
    expect(m.muestra?.()).toEqual({ flexExt: null, desviacion: null, giro: null, dirX: null, dirY: null, dirZ: null })
  })
})
