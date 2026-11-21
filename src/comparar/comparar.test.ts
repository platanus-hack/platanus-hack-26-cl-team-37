import { describe, expect, it } from 'vitest'
import type { MetricasSesion, PoseClave, Sesion } from '../domain/types'
import { agarresDe, repsDeBanda } from './eventos'
import { decimalesKpi, difKpi, formatoKpi, kpisDe, listaKpis, serieDe } from './kpis'
import {
  LARGO_MODELO_MM,
  aEjes,
  distanciaPinzaCm,
  ejesDeMano,
  ejesDeMatriz,
  matrizNeutra,
  poseModelo,
  poseMunecaModelo,
  sParaApertura,
  tablaApertura,
  type V3,
} from './mano'
import { ajustarSeleccion, esValida, juegosComparables, poseDe, seleccionInicial, validasDe } from './sesiones'

const metricas = (extra: Partial<MetricasSesion> = {}): MetricasSesion => ({
  agarres: 5,
  agarresIzq: 2,
  agarresDer: 3,
  intentos: 6,
  precision: 0.83,
  tiempoMedioAgarreS: 3.2,
  aperturaMaxCm: 5.5,
  flexionMax: { pulgar: 50, indice: 120, medio: 118, anular: 110, menique: 100 },
  flexionIndiceMax: 120,
  suavidad: 70,
  calidadRegistro: 0.9,
  duracionS: 180,
  fpsMedio: 30,
  metaCumplida: true,
  ...extra,
})
let n = 0
const ses = (juego: string, dia: number, extra: Partial<Sesion> = {}, m: Partial<MetricasSesion> = {}): Sesion => ({
  id: `S${++n}`,
  pacienteId: 'p',
  planVersion: 1,
  juego,
  parametros: { mano: 'derecha', nivel: 1, duracionMin: 3, metaAgarres: 8, metaPinzaCm: 6, prescritoPor: null },
  inicio: new Date(Date.UTC(2026, 10, dia, 15)).toISOString(),
  fin: null,
  estado: 'cerrada',
  calibracion: null,
  metricas: metricas(m),
  muestras: null,
  dolorEVA: 2,
  esfuerzo: null,
  nota: null,
  dispositivo: null,
  versionApp: null,
  versionModelo: null,
  hash: null,
  ...extra,
})

describe('sesiones válidas y selección', () => {
  it('descarta abiertas, cortas, sin métricas y sin actividad', () => {
    expect(esValida(ses('caja-juguetes', 1))).toBe(true)
    expect(esValida(ses('caja-juguetes', 1, { estado: 'en curso' }))).toBe(false)
    expect(esValida(ses('caja-juguetes', 1, { metricas: null }))).toBe(false)
    expect(esValida(ses('caja-juguetes', 1, {}, { duracionS: 59 }))).toBe(false)
    expect(esValida(ses('caja-juguetes', 1, {}, { agarres: 0, contador: 0 }))).toBe(false)
    expect(esValida(ses('caja-juguetes', 1, {}, { duracionS: 0, agarres: 0 }))).toBe(false)
  })

  it('los juegos nuevos bastan con 20 s y cuentan métricas del juego o poses como actividad', () => {
    expect(esValida(ses('muneca-3d', 1, {}, { duracionS: 25, agarres: 0, juego: { flexionMax: 30 } }))).toBe(true)
    expect(esValida(ses('muneca-3d', 1, {}, { duracionS: 19, agarres: 0, juego: { flexionMax: 30 } }))).toBe(false)
    expect(esValida(ses('banda-elastica', 1, {}, { duracionS: 30, agarres: 0, juego: { repeticiones: 0 } }))).toBe(false)
    const poses: PoseClave[] = [{ etiqueta: 'pico', t: 1, lado: 'derecha', valor: null, puntos: Array.from({ length: 21 }, () => [0, 0, 0] as [number, number, number]) }]
    expect(esValida(ses('banda-elastica', 1, { muestras: { hz: 1, t: [], apertura: [], flexIndice: [], poses } }, { duracionS: 30, agarres: 0 }))).toBe(true)
  })

  it('agrupa por juego con al menos 2 válidas, de la más antigua a la más reciente', () => {
    const lista = [ses('caja-juguetes', 9), ses('caja-juguetes', 2), ses('movilidad-guiada', 3), ses('caja-juguetes', 5, {}, { duracionS: 5 })]
    const g = juegosComparables(lista)
    expect(g.map((x) => x.juego)).toEqual(['caja-juguetes'])
    expect(g[0]!.validas.map((s) => s.inicio)).toEqual([...g[0]!.validas.map((s) => s.inicio)].sort())
    expect(g[0]!.validas).toHaveLength(2)
    expect(validasDe(lista, 'movilidad-guiada')).toHaveLength(1)
  })

  it('por defecto compara la primera y la última; ajusta elecciones inválidas, iguales o invertidas', () => {
    const v = [ses('caja-juguetes', 1), ses('caja-juguetes', 2), ses('caja-juguetes', 3)]
    const [a, b, c] = v.map((s) => s.id) as [string, string, string]
    expect(seleccionInicial(v)).toEqual({ antes: a, despues: c })
    expect(seleccionInicial([v[0]!])).toBeNull()
    expect(ajustarSeleccion(v, null, null)).toEqual({ antes: a, despues: c })
    expect(ajustarSeleccion(v, b, null)).toEqual({ antes: b, despues: c })
    expect(ajustarSeleccion(v, c, a)).toEqual({ antes: a, despues: c }) // invertidas: se ordenan
    expect(ajustarSeleccion(v, b, b)!.antes).not.toBe(ajustarSeleccion(v, b, b)!.despues)
    expect(ajustarSeleccion(v, 'x', 'y')).toEqual({ antes: a, despues: c })
  })

  it('encuentra una pose clave por etiqueta y prefiere el lado pedido', () => {
    const p = (lado: 'izquierda' | 'derecha'): PoseClave => ({ etiqueta: 'pico', t: 1, lado, valor: null, puntos: Array.from({ length: 21 }, () => [0, 0, 0] as [number, number, number]) })
    const s = ses('banda-elastica', 1, { muestras: { hz: 1, t: [], apertura: [], flexIndice: [], poses: [p('izquierda'), p('derecha')] } })
    expect(poseDe(s, 'pico', 'derecha')!.lado).toBe('derecha')
    expect(poseDe(s, 'pico')!.lado).toBe('izquierda')
    expect(poseDe(s, 'reposo')).toBeNull()
  })
})

describe('indicadores y diferencias', () => {
  it('verde solo si va hacia lo mejor según `mejor`', () => {
    const mayor = { unidad: 'cm' as const, mejor: 'mayor' as const }
    const menor = { unidad: 's' as const, mejor: 'menor' as const }
    expect(difKpi(mayor, 4.1, 5.6)).toEqual({ texto: '+1,5 cm', direccion: 'sube', tono: 'mejor' })
    expect(difKpi(mayor, 5.6, 4.1)).toEqual({ texto: '−1,5 cm', direccion: 'baja', tono: 'otro' })
    expect(difKpi(menor, 3.2, 2.4)!.tono).toBe('mejor')
    expect(difKpi(menor, 2.4, 3.2)!.tono).toBe('otro')
    expect(difKpi({ unidad: '%' }, 80, 86)).toEqual({ texto: '+6 pts', direccion: 'sube', tono: 'neutro' })
    expect(difKpi(mayor, 5, 5.04)).toEqual({ texto: 'sin cambio', direccion: 'igual', tono: 'neutro' })
    expect(difKpi(mayor, null, 5)).toBeNull()
  })

  it('formatea con coma decimal y unidades', () => {
    expect(formatoKpi({ unidad: 'cm' }, 6.14)).toBe('6,1 cm')
    expect(formatoKpi({ unidad: '°' }, 67.6)).toBe('68°')
    expect(formatoKpi({ unidad: '%' }, 86)).toBe('86%')
    expect(formatoKpi({ unidad: 'kg' }, 2.44)).toBe('2,4 kg')
    expect(formatoKpi({ unidad: '' }, null)).toBe('—')
    expect(decimalesKpi({ unidad: 'kg' })).toBe(1)
  })

  it('Caja y Movilidad se leen de los agregados base (sesiones sin metricas.juego)', () => {
    const a = ses('caja-juguetes', 1, { dolorEVA: 4 }, { agarres: 6, aperturaMaxCm: 4.1, precision: 0.8, intentos: 7 })
    const d = ses('caja-juguetes', 9, { dolorEVA: 2 }, { agarres: 9, aperturaMaxCm: 5.6, precision: 0.9, intentos: 10, tiempoMedioAgarreS: 2.4 })
    const k = kpisDe(listaKpis('caja-juguetes', null, [a, d]), a, d)
    const por = (id: string) => k.find((x) => x.def.id === id)!
    expect(por('agarres').dif!.texto).toBe('+3')
    expect(por('apertura').dif).toMatchObject({ texto: '+1,5 cm', tono: 'mejor' })
    expect(por('tiempoAgarre').dif!.tono).toBe('mejor')
    expect(por('dolor').dif).toMatchObject({ direccion: 'baja', tono: 'mejor' })
    const mov = listaKpis('movilidad-guiada', null, [a, d]).map((x) => x.id)
    expect(mov).toEqual(expect.arrayContaining(['apertura', 'flexIndice', 'suavidad', 'ciclos']))
  })

  it('banda y muñeca leen metricas.juego y omiten lo que ninguna sesión trae', () => {
    const a = ses('banda-elastica', 1, {}, { juego: { estiramientoMaxCm: 20, cargaMaxKg: 3, repeticiones: 6 } })
    const d = ses('banda-elastica', 9, {}, { juego: { estiramientoMaxCm: 28, cargaMaxKg: 4.5, repeticiones: 8 } })
    const ids = listaKpis('banda-elastica', null, [a, d]).map((x) => x.id)
    expect(ids).toEqual(['estiramientoMaxCm', 'repeticiones', 'cargaMaxKg', 'dolor'])
    const m = listaKpis('banda-elastica', null, [a, d]).find((x) => x.id === 'cargaMaxKg')!
    expect(m.nombre).toMatch(/aprox/)
    expect(`${m.nombre}`).not.toMatch(/fuerza|presión/i)
    expect(serieDe(m, [a, d]).map((p) => p.v)).toEqual([3, 4.5])
  })
})

describe('eventos', () => {
  const ev = (seq: number, t: number, tipo: string, objeto: string | null, datos: Record<string, unknown> | null = null) => ({ sesionId: 's', seq, t, tipo: tipo as never, mano: null, objeto, datos })
  it('empareja agarre_inicio con su soltar y conserva apertura y destino', () => {
    const l = agarresDe([ev(1, 100, 'agarre_inicio', 'cubo', { aperturaCm: 4.2 }), ev(2, 900, 'soltar', 'cubo', { enCaja: true }), ev(3, 1000, 'agarre_inicio', 'esfera'), ev(4, 1800, 'soltar', 'esfera', { enCaja: false }), ev(5, 2000, 'agarre_inicio', 'cubo')])
    expect(l).toEqual([
      { objeto: 'cubo', t0: 100, t1: 900, aperturaCm: 4.2, enCaja: true },
      { objeto: 'esfera', t0: 1000, t1: 1800, aperturaCm: null, enCaja: false },
    ])
  })
  it('lee los picos de la banda por repetición', () => {
    const r = repsDeBanda([ev(1, 5, 'umbral_alcanzado', null, { estiramientoCm: 20, cargaKg: 3, rep: 2 }), ev(2, 1, 'umbral_alcanzado', null, { estiramientoCm: 18, cargaKg: 2.5, rep: 1 }), ev(3, 9, 'pausa', null)])
    expect(r.map((x) => x.rep)).toEqual([1, 2])
    expect(r[1]).toMatchObject({ estiramientoCm: 20, cargaKg: 3 })
  })
})

describe('mano modelo', () => {
  const flex = { pulgar: 50, indice: 120, medio: 118, anular: 110, menique: 100 }
  it('con s = 0 la mano está abierta y con s = 1 los dedos se doblan hacia la palma (+z)', () => {
    const abierta = poseModelo(flex, 0)
    const puno = poseModelo(flex, 1)
    expect(abierta[12]![1]).toBeGreaterThan(abierta[9]![1])
    expect(puno[12]![2]).toBeGreaterThan(abierta[12]![2] + 20)
    expect(puno[12]![1]).toBeLessThan(abierta[12]![1])
    expect(poseModelo(flex, 0.5, 2)[12]![1]).toBeGreaterThan(0)
  })
  it('la mano izquierda es el espejo en x', () => {
    const d = poseModelo(flex, 0.4)
    const i = poseModelo(flex, 0.4, 1, 'izquierda')
    d.forEach((p, k) => {
      expect(i[k]![0]).toBeCloseTo(-p[0], 6)
      expect(i[k]![1]).toBeCloseTo(p[1], 6)
    })
  })
  it('la escala multiplica las distancias', () => {
    expect(distanciaPinzaCm(poseModelo(flex, 0.3, 1.2))).toBeCloseTo(distanciaPinzaCm(poseModelo(flex, 0.3, 1)) * 1.2, 6)
    expect(LARGO_MODELO_MM).toBeGreaterThan(100)
  })
  it('invierte la apertura pulgar–índice: la s hallada reproduce la apertura pedida', () => {
    const tabla = tablaApertura(flex, 1, 100)
    for (const s0 of [0.05, 0.2, 0.45, 0.7, 0.95]) {
      const cm = distanciaPinzaCm(poseModelo(flex, s0))
      const s = sParaApertura(tabla, cm)
      expect(Math.abs(distanciaPinzaCm(poseModelo(flex, s)) - cm)).toBeLessThan(0.1)
    }
    // una apertura imposible (muy grande) se queda con la más cercana, dentro de 0..1
    const s = sParaApertura(tabla, 99)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(1)
    expect(Math.abs(distanciaPinzaCm(poseModelo(flex, s)) - Math.max(...tabla))).toBeLessThan(1e-6)
  })
})

describe('ejes de la mano y pose en ejes neutros', () => {
  // mano en ejes de cámara (x derecha, y abajo, z adelante): dedos hacia arriba de la imagen (−y)
  const aCamara = (p: V3[]): V3[] => p.map((q) => [q[0], -q[1], -q[2]] as V3)
  const neutro = aCamara(poseMunecaModelo(0, 0))

  it('y apunta de la muñeca al nudillo medio y los ejes son ortonormales', () => {
    const e = ejesDeMano(neutro, 'derecha')
    expect(e.y[1]).toBeLessThan(-0.95)
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    expect(dot(e.x, e.y)).toBeCloseTo(0, 6)
    expect(dot(e.x, e.z)).toBeCloseTo(0, 6)
    expect(dot(e.y, e.z)).toBeCloseTo(0, 6)
    expect(dot(e.z, e.z)).toBeCloseTo(1, 6)
    // la mano izquierda invierte z
    expect(ejesDeMano(neutro, 'izquierda').z[2]).toBeCloseTo(-e.z[2], 6)
  })

  it('la pose neutra expresada en sus propios ejes queda con los dedos en +y y la muñeca en el origen', () => {
    const p = aEjes(neutro, ejesDeMano(neutro, 'derecha'))
    expect(p[0]).toEqual([0, 0, 0])
    expect(p[9]![1]).toBeGreaterThan(80)
    expect(Math.abs(p[9]![0])).toBeLessThan(1e-6)
    expect(Math.abs(p[9]![2])).toBeLessThan(1e-6)
  })

  it('una flexión de 40° se mide como 40° respecto de los dedos neutros, aunque la mano esté girada en la imagen', () => {
    const ejes = ejesDeMano(neutro, 'derecha')
    const flexionada = aCamara(poseMunecaModelo(40, 0))
    // la misma mano girada 25° en el plano de la imagen (z de la cámara)
    const a = (25 * Math.PI) / 180
    const girar = (q: V3): V3 => [q[0] * Math.cos(a) - q[1] * Math.sin(a), q[0] * Math.sin(a) + q[1] * Math.cos(a), q[2]]
    const ejesGirados = ejesDeMano(neutro.map(girar), 'derecha')
    for (const [pts, e] of [
      [flexionada, ejes],
      [flexionada.map(girar), ejesGirados],
    ] as const) {
      const p = aEjes(pts, e)
      const ang = (Math.atan2(p[9]![2], p[9]![1]) * 180) / Math.PI
      expect(Math.abs(ang)).toBeCloseTo(40, 0)
    }
  })

  it('lee la matriz neutra r0_ij (columnas = ejes) y la rechaza si falta algún valor', () => {
    const j: Record<string, number | null> = {}
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    I.forEach((v, k) => (j[`r0_${Math.floor(k / 3)}${k % 3}`] = v))
    const m = matrizNeutra(j)!
    expect(ejesDeMatriz(m)).toEqual({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] })
    delete j.r0_21
    expect(matrizNeutra(j)).toBeNull()
    expect(matrizNeutra(undefined)).toBeNull()
  })

  it('la mano modelo de muñeca gira los dedos hacia la palma (flexión) y hacia el pulgar (radial)', () => {
    const f = poseMunecaModelo(45, 0)
    expect(f[9]![2]).toBeGreaterThan(40)
    const r = poseMunecaModelo(0, 20)
    expect(r[9]![0]).toBeGreaterThan(10)
    expect(poseMunecaModelo(0, 20, 1, 'izquierda')[9]![0]).toBeLessThan(-10)
  })
})
