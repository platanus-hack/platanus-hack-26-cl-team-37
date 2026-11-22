import { describe, expect, it } from 'vitest'
import type { MetricasSesion, Plan, PlanItem, Sesion } from '../../domain/types'
import {
  META_JUEGO_MAX,
  ajustarMeta,
  borradorDe,
  cambiado,
  cambios,
  datosDeEnvio,
  hayCambios,
  itemsNuevos,
  metaPinzaDe,
  tendenciaPinza,
  validar,
} from './edicionPlan'

const HOY = new Date(2026, 10, 21, 12, 0)
const dia = (atras: number) => new Date(2026, 10, 21 - atras, 10, 0).toISOString()

const item = (juego: string, nivel: number, meta = 7, extra: Partial<PlanItem> = {}): PlanItem => ({ juego, nivel, duracionMin: 6, mano: 'derecha', metaAgarres: 10, metaPinzaCm: meta, ...extra })
const METAS = { 'movilidad-guiada': 10, 'caja-juguetes': 10 }
const plan = (items: PlanItem[] = [item('movilidad-guiada', 1), item('caja-juguetes', 2)], x: Partial<Plan> = {}): Plan => ({
  id: 'pl', pacienteId: 'p', version: 2, vigenteDesde: dia(3), creadoPor: null, sesionesPorSemana: 5, umbralDolor: 5, mensaje: 'viejo', items, ...x,
})

const metricas = (cm: number, calidad = 0.9): MetricasSesion => ({
  agarres: 10, agarresIzq: 5, agarresDer: 5, intentos: 11, precision: 0.9, tiempoMedioAgarreS: 4, aperturaMaxCm: cm, flexionMax: { pulgar: 40, indice: 60, medio: 70, anular: 55, menique: 45 },
  flexionIndiceMax: 60, suavidad: 80, calidadRegistro: calidad, duracionS: 360, fpsMedio: 30, metaCumplida: true,
})
let n = 0
const sesion = (atras: number, cm: number, calidad = 0.9): Sesion => ({
  id: `S-${++n}`, pacienteId: 'p', planVersion: 1, juego: 'caja-juguetes', parametros: { mano: 'ambas', nivel: 1, duracionMin: 6, metaAgarres: 10, metaPinzaCm: 7, prescritoPor: null },
  inicio: dia(atras), fin: null, estado: 'cerrada', calibracion: null, metricas: metricas(cm, calidad), muestras: null, dolorEVA: 2, esfuerzo: null, nota: null,
  dispositivo: null, versionApp: null, versionModelo: null, hash: 'h',
})

describe('borrador', () => {
  it('parte del plan vigente, con el mensaje vacío y un nivel y una meta por juego', () => {
    const b = borradorDe(plan())
    expect(b).toEqual({ niveles: { 'movilidad-guiada': 1, 'caja-juguetes': 2 }, metas: METAS, sesionesPorSemana: 5, metaPinzaCm: 7, umbralDolor: 5, mensaje: '' })
    expect(hayCambios(plan(), b)).toBe(false)
    expect(cambios(plan(), b)).toEqual([])
  })

  it('meta de pinza = la mayor de los ítems, ajustada a 0,5', () => {
    expect(metaPinzaDe([item('a', 1, 6), item('b', 1, 7.5)])).toBe(7.5)
    expect(metaPinzaDe([item('a', 1, 0)])).toBe(0)
    expect(ajustarMeta(7.26)).toBe(7.5)
    expect(ajustarMeta(99)).toBe(15)
    expect(ajustarMeta(0)).toBe(1)
  })

  it('dos ítems del mismo juego: nivel y meta mayores; valores fuera de rango se acotan sin contar como cambio', () => {
    const p = plan([item('caja-juguetes', 2, 7, { metaAgarres: 8 }), item('caja-juguetes', 4, 7, { metaAgarres: 200 }), item('torre-cubos', 9, 7, { metaAgarres: 0 })])
    const b = borradorDe(p)
    expect(b.niveles).toEqual({ 'caja-juguetes': 4, 'torre-cubos': 5 })
    expect(b.metas).toEqual({ 'caja-juguetes': META_JUEGO_MAX, 'torre-cubos': 0 })
    expect(hayCambios(p, b)).toBe(false)
    expect(itemsNuevos(p, b)).toEqual(p.items) // sin editar, la versión nueva no reescribe nada
  })
})

describe('cambios antes → después', () => {
  it('detecta cada campo y formatea con coma decimal', () => {
    const p = plan()
    const b = { ...borradorDe(p), niveles: { 'movilidad-guiada': 1, 'caja-juguetes': 3 }, metas: { 'movilidad-guiada': 0, 'caja-juguetes': 10 }, sesionesPorSemana: 6, metaPinzaCm: 7.5, umbralDolor: 4, mensaje: ' ¡Buen avance! ' }
    expect(cambios(p, b).map((c) => [c.campo, c.etiqueta, c.antes, c.despues])).toEqual([
      ['meta', 'Movilidad guiada · meta por sesión', '10', 'Libre'],
      ['nivel', 'Caja de juguetes · nivel de dificultad', '2', '3'],
      ['sesiones', 'Sesiones por semana', '5', '6'],
      ['metaPinza', 'Meta de pinza', '7,0 cm', '7,5 cm'],
      ['umbral', 'Aviso por dolor', 'EVA ≥ 5', 'EVA ≥ 4'],
      ['mensaje', 'Mensaje para el paciente', '—', '¡Buen avance!'],
    ])
    expect(cambiado(p, b, 'nivel', 'caja-juguetes')).toBe(true)
    expect(cambiado(p, b, 'nivel', 'movilidad-guiada')).toBe(false)
    expect(cambiado(p, b, 'meta', 'movilidad-guiada')).toBe(true)
    expect(cambiado(p, b, 'meta', 'caja-juguetes')).toBe(false)
  })

  it('volver al valor original quita el cambio; un mensaje en blanco no cuenta', () => {
    const p = plan()
    const b = { ...borradorDe(p), sesionesPorSemana: 6 }
    expect(hayCambios(p, b)).toBe(true)
    expect(hayCambios(p, { ...b, sesionesPorSemana: 5, mensaje: '   ' })).toBe(false)
  })
})

describe('validar', () => {
  const p = plan()
  it('acepta el borrador del plan', () => expect(validar(p, borradorDe(p))).toBeNull())
  it('rechaza valores fuera de rango o con paso inválido', () => {
    const b = borradorDe(p)
    expect(validar(p, { ...b, niveles: { ...b.niveles, 'caja-juguetes': 6 } })).toMatch(/nivel de Caja de juguetes/)
    expect(validar(p, { ...b, sesionesPorSemana: 0 })).toMatch(/sesiones por semana/)
    expect(validar(p, { ...b, sesionesPorSemana: 8 })).toMatch(/sesiones por semana/)
    expect(validar(p, { ...b, metas: { ...b.metas, 'caja-juguetes': -1 } })).toMatch(/meta de Caja de juguetes/)
    expect(validar(p, { ...b, metas: { ...b.metas, 'caja-juguetes': 2.5 } })).toMatch(/meta de Caja de juguetes/)
    expect(validar(p, { ...b, metaPinzaCm: 7.3 })).toMatch(/0,5 en 0,5/)
    expect(validar(p, { ...b, umbralDolor: 11 })).toMatch(/dolor/)
  })
  it('el mensaje admite hasta 280 caracteres', () => {
    const b = borradorDe(p)
    expect(validar(p, { ...b, mensaje: 'a'.repeat(280) })).toBeNull()
    expect(validar(p, { ...b, mensaje: 'a'.repeat(281) })).toMatch(/280/)
  })
})

describe('versión nueva', () => {
  it('conserva el resto de cada ítem y no toca el plan original', () => {
    const items = [item('movilidad-guiada', 1, 6, { metaRangoGrados: { indice: 80 } }), item('caja-juguetes', 2, 7)]
    const p = plan(items)
    const copia = JSON.parse(JSON.stringify(p))
    const b = { ...borradorDe(p), niveles: { 'movilidad-guiada': 1, 'caja-juguetes': 3 } }
    const nuevos = itemsNuevos(p, b)
    expect(nuevos[0]).toEqual(items[0]) // sin cambios, incluida su meta de pinza propia (6)
    expect(nuevos[1]).toEqual({ ...items[1], nivel: 3 })
    expect(p).toEqual(copia)
  })

  it('la meta de pinza modificada se escribe en todos los ítems', () => {
    const p = plan([item('movilidad-guiada', 1, 6), item('caja-juguetes', 2, 7)])
    const b = { ...borradorDe(p), metaPinzaCm: 8 }
    expect(itemsNuevos(p, b).map((i) => i.metaPinzaCm)).toEqual([8, 8])
  })

  it('la meta de un juego solo cambia en ese juego', () => {
    const p = plan()
    const b = { ...borradorDe(p), metas: { ...METAS, 'caja-juguetes': 14 } }
    expect(itemsNuevos(p, b).map((i) => [i.juego, i.metaAgarres])).toEqual([['movilidad-guiada', 10], ['caja-juguetes', 14]])
  })

  it('datos de envío: mensaje recortado, sesiones y umbral', () => {
    const p = plan()
    const b = { ...borradorDe(p), sesionesPorSemana: 4, umbralDolor: 6, mensaje: '  hola  ' }
    expect(datosDeEnvio(p, b)).toMatchObject({ sesionesPorSemana: 4, umbralDolor: 6, mensaje: 'hola' })
    expect(datosDeEnvio(p, b).items).toEqual(p.items)
  })
})

describe('tendenciaPinza', () => {
  it('primero → último de las últimas 4 semanas, sin sesiones de baja calidad', () => {
    const t = tendenciaPinza([sesion(40, 3), sesion(23, 4.2), sesion(16, 9, 0.5), sesion(10, 5), sesion(1, 6.1)], plan(), HOY)
    expect(t.valores).toEqual([4.2, 5, 6.1])
    expect(t.primero).toBe(4.2)
    expect(t.ultimo).toBe(6.1)
    expect(t.pct).toBeCloseTo(45.2, 1)
  })
  it('sin sesiones suficientes no hay tendencia', () => {
    const t = tendenciaPinza([sesion(2, 5)], plan(), HOY)
    expect(t.valores).toEqual([5])
    expect(t.primero).toBe(5)
    expect(t.pct).toBeNull()
    expect(tendenciaPinza([], null, HOY).primero).toBeNull()
  })
})
