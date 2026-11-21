import { describe, expect, it } from 'vitest'
import type { MetricasSesion, Plan, Sesion } from '../domain/types'
import { calcularProgreso, desdeRango, marcasFechas, planificadasEnRango, tiempoPorAgarre } from './progreso'

const HOY = new Date(2026, 10, 21, 12, 0) // 21 nov 2026, local

const dia = (atras: number, h = 10) => new Date(2026, 10, 21 - atras, h, 0).toISOString()

const metricas = (x: Partial<MetricasSesion> = {}): MetricasSesion => ({
  agarres: 10, agarresIzq: 5, agarresDer: 5, intentos: 11, precision: 0.9, tiempoMedioAgarreS: 4, aperturaMaxCm: 5, flexionMax: { pulgar: 40, indice: 60, medio: 70, anular: 55, menique: 45 },
  flexionIndiceMax: 60, suavidad: 80, calidadRegistro: 0.9, duracionS: 360, fpsMedio: 30, metaCumplida: true, ...x,
})

let n = 0
const sesion = (atras: number, m: Partial<MetricasSesion> = {}, x: Partial<Sesion> = {}): Sesion => ({
  id: `S-${++n}`, pacienteId: 'p', planVersion: 1, juego: 'caja-juguetes', parametros: { mano: 'ambas', nivel: 1, duracionMin: 6, metaAgarres: 10, metaPinzaCm: 7, prescritoPor: null },
  inicio: dia(atras), fin: null, estado: 'cerrada', calibracion: null, metricas: metricas(m), muestras: null, dolorEVA: 2, esfuerzo: null, nota: null,
  dispositivo: null, versionApp: null, versionModelo: null, hash: 'h', ...x,
})

const plan = (items: Plan['items'] = [{ juego: 'caja-juguetes', nivel: 1, duracionMin: 6, mano: 'ambas', metaAgarres: 10, metaPinzaCm: 7 }], spw = 5): Plan => ({
  id: 'pl', pacienteId: 'p', version: 1, vigenteDesde: dia(30), creadoPor: null, sesionesPorSemana: spw, umbralDolor: 5, mensaje: null, items,
})

describe('desdeRango', () => {
  it('7 días y 4 semanas cuentan hoy; Todo no tiene límite', () => {
    expect(desdeRango('7d', HOY)).toEqual(new Date(2026, 10, 15))
    expect(desdeRango('4s', HOY)).toEqual(new Date(2026, 9, 25))
    expect(desdeRango('todo', HOY)).toBeNull()
  })
})

describe('calcularProgreso', () => {
  const sesiones = [sesion(23, { aperturaMaxCm: 4.2 }), sesion(16, { aperturaMaxCm: 9, calidadRegistro: 0.62 }), sesion(10, { aperturaMaxCm: 5 }), sesion(1, { aperturaMaxCm: 6.1 })]

  it('línea: orden por fecha, excluye calidad < 70 %, variación primero → último', () => {
    const p = calcularProgreso(sesiones, plan(), null, '4s', HOY)
    expect(p.puntos.map((x) => x.cm)).toEqual([4.2, 5, 6.1])
    expect(p.hechas).toBe(4)
    expect(p.excluidas).toBe(1)
    expect(p.validas).toBe(3)
    expect(p.variacionPct).toBeCloseTo(45.2, 1)
    expect(p.metaPinzaCm).toBe(7)
    expect(p.vacio).toBe(false)
  })

  it('el rango recorta las sesiones', () => {
    const p = calcularProgreso(sesiones, plan(), null, '7d', HOY)
    expect(p.puntos.map((x) => x.cm)).toEqual([6.1])
    expect(p.vacio).toBe(true) // < 2 sesiones
    expect(p.variacionPct).toBeNull()
    const t = calcularProgreso(sesiones, plan(), null, 'todo', HOY)
    expect(t.hechas).toBe(4)
  })

  it('ignora sesiones no cerradas y futuras', () => {
    const p = calcularProgreso([...sesiones, sesion(0, {}, { estado: 'en curso' }), sesion(-3)], plan(), null, 'todo', HOY)
    expect(p.hechas).toBe(4)
  })

  it('menos de 2 sesiones válidas = vacío aunque haya hechas', () => {
    const p = calcularProgreso([sesion(2), sesion(1, { calidadRegistro: 0.5 })], plan(), null, '4s', HOY)
    expect(p.hechas).toBe(2)
    expect(p.validas).toBe(1)
    expect(p.excluidas).toBe(1)
    expect(p.vacio).toBe(true)
  })

  it('sin meta de rango: grados (máximo del período) y sin porcentaje', () => {
    const p = calcularProgreso([sesion(3, { flexionMax: { pulgar: 30, indice: 50, medio: 60, anular: 50, menique: 40 } }), sesion(1)], plan(), null, '4s', HOY)
    expect(p.dedosEnPct).toBe(false)
    expect(p.dedos.map((d) => d.grados)).toEqual([40, 60, 70, 55, 45])
    expect(p.dedos.every((d) => d.pct === null)).toBe(true)
  })

  it('con meta de rango: % de la meta (puede pasar de 100)', () => {
    const items: Plan['items'] = [{ juego: 'caja-juguetes', nivel: 1, duracionMin: 6, mano: 'ambas', metaAgarres: 10, metaPinzaCm: 7, metaRangoGrados: { pulgar: 80, indice: 60, medio: 70, anular: 70, menique: 70 } }]
    const p = calcularProgreso([sesion(3), sesion(1)], plan(items), null, '4s', HOY)
    expect(p.dedosEnPct).toBe(true)
    expect(p.dedos.map((d) => Math.round(d.pct!))).toEqual([50, 100, 100, 79, 64])
  })

  it('con metas parciales no declara % para todos', () => {
    const items: Plan['items'] = [{ juego: 'caja-juguetes', nivel: 1, duracionMin: 6, mano: 'ambas', metaAgarres: 10, metaPinzaCm: 7, metaRangoGrados: { pulgar: 80 } }]
    const p = calcularProgreso([sesion(3), sesion(1)], plan(items), null, '4s', HOY)
    expect(p.dedosEnPct).toBe(false)
    expect(p.dedos[0]!.pct).toBe(50)
  })

  it('sin plan: sin meta ni planificadas', () => {
    const p = calcularProgreso(sesiones, null, null, '4s', HOY)
    expect(p.metaPinzaCm).toBeNull()
    expect(p.planificadas).toBeNull()
  })
})

describe('tiempoPorAgarre', () => {
  it('primera vs última del juego con más sesiones; no mezcla juegos', () => {
    const l = [
      sesion(9, { tiempoMedioAgarreS: 5.9 }),
      sesion(8, { tiempoMedioAgarreS: 2 }, { juego: 'movilidad-guiada' }),
      sesion(5, { tiempoMedioAgarreS: 5 }),
      sesion(2, { tiempoMedioAgarreS: 3.8 }),
      sesion(1, { tiempoMedioAgarreS: 2 }, { juego: 'movilidad-guiada' }),
    ]
    expect(tiempoPorAgarre(l)).toEqual({ juego: 'caja-juguetes', primero: 5.9, ultimo: 3.8 })
  })
  it('null con menos de 2 sesiones con tiempo en un mismo juego', () => {
    expect(tiempoPorAgarre([sesion(3, { tiempoMedioAgarreS: 5 }), sesion(1, { tiempoMedioAgarreS: null })])).toBeNull()
    expect(tiempoPorAgarre([sesion(3, { tiempoMedioAgarreS: 5 }), sesion(1, { tiempoMedioAgarreS: 2 }, { juego: 'movilidad-guiada' })])).toBeNull()
  })
})

describe('planificadasEnRango', () => {
  it('días de práctica × ejercicios por semana, prorrateado', () => {
    const p = plan([{ juego: 'a', nivel: 1, duracionMin: 1, mano: 'ambas', metaAgarres: 1, metaPinzaCm: 7 }, { juego: 'b', nivel: 1, duracionMin: 1, mano: 'ambas', metaAgarres: 1, metaPinzaCm: 7 }], 5)
    expect(planificadasEnRango(p, null, desdeRango('7d', HOY), HOY)).toBe(10)
    expect(planificadasEnRango(p, null, desdeRango('4s', HOY), HOY)).toBe(40)
  })
  it('no cuenta días anteriores al inicio del plan', () => {
    const p = plan(undefined, 7)
    expect(planificadasEnRango(p, new Date(2026, 10, 15), desdeRango('4s', HOY), HOY)).toBe(7)
  })
  it('sin plan = null', () => expect(planificadasEnRango(null, null, null, HOY)).toBeNull())
})

describe('marcasFechas', () => {
  it('reparte n marcas entre los extremos', () => {
    expect(marcasFechas(0, 400, 5)).toEqual([0, 100, 200, 300, 400])
    expect(marcasFechas(10, 10)).toEqual([10])
  })
})
