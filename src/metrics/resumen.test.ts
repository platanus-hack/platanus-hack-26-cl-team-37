import { describe, expect, it } from 'vitest'
import type { DefMetrica } from '../games/shell/contrato'
import type { MetricasSesion, Sesion } from '../domain/types'
import { avanceMeta, bandaDolor, diferencia, duracionTexto, sesionAnterior, tarjetasResumen, valorMetrica } from './resumen'

const def = (id: string, unidad: DefMetrica['unidad'], extra: Partial<DefMetrica> = {}): DefMetrica => ({ id, nombre: id, unidad, formula: '', ...extra })

const CAJA: DefMetrica[] = [
  def('agarres', '', { mejor: 'mayor' }),
  def('intentos', ''),
  def('precision', '%', { mejor: 'mayor' }),
  def('tiempoMedioAgarre', 's', { mejor: 'menor' }),
  def('aperturaMax', 'cm', { aprox: true, mejor: 'mayor' }),
  def('flexionIndiceMax', '°', { aprox: true, mejor: 'mayor' }),
  def('suavidad', '%', { mejor: 'mayor' }),
]

const metricas = (x: Partial<MetricasSesion> = {}): MetricasSesion => ({
  agarres: 11, agarresIzq: 5, agarresDer: 6, intentos: 12, precision: 0.917, tiempoMedioAgarreS: 3.8, aperturaMaxCm: 6.1,
  flexionMax: { pulgar: 40, indice: 68, medio: 70, anular: 60, menique: 50 }, flexionIndiceMax: 68, suavidad: 86, calidadRegistro: 0.95,
  duracionS: 360, fpsMedio: 30, metaCumplida: false, ...x,
})

const sesion = (id: string, inicio: string, x: Partial<Sesion> = {}): Sesion => ({
  id, pacienteId: 'p', planVersion: 1, juego: 'caja-juguetes', parametros: { mano: 'derecha', nivel: 2, duracionMin: 6, metaAgarres: 12, metaPinzaCm: 7, prescritoPor: null },
  inicio, fin: null, estado: 'cerrada', calibracion: null, metricas: metricas(), muestras: null, dolorEVA: 2, esfuerzo: null, nota: null,
  dispositivo: null, versionApp: null, versionModelo: null, hash: 'h', ...x,
})

describe('tarjetasResumen', () => {
  it('Caja: las 5 métricas con unidad (los conteos van en el anillo)', () => {
    expect(tarjetasResumen(CAJA).map((d) => d.id)).toEqual(['precision', 'tiempoMedioAgarre', 'aperturaMax', 'flexionIndiceMax', 'suavidad'])
  })
  it('respeta tarjeta explícita y corta en 5', () => {
    const defs = [def('a', '', { tarjeta: true }), def('b', '%', { tarjeta: false }), ...['c', 'd', 'e', 'f', 'g'].map((x) => def(x, 's'))]
    expect(tarjetasResumen(defs).map((d) => d.id)).toEqual(['a', 'c', 'd', 'e', 'f'])
  })
})

describe('valorMetrica', () => {
  it('lee metricas.juego si está', () => {
    expect(valorMetrica(def('precision', '%'), metricas({ juego: { precision: 92 } }))).toBe(92)
    expect(valorMetrica(def('tiempoMedioAgarre', 's'), metricas({ juego: { tiempoMedioAgarre: null } }))).toBeNull()
  })
  it('sesiones sin metricas.juego (seed): agregados base con la misma unidad', () => {
    expect(valorMetrica(def('precision', '%'), metricas())).toBeCloseTo(91.7)
    expect(valorMetrica(def('aperturaMax', 'cm'), metricas())).toBe(6.1)
    expect(valorMetrica(def('flexionIndiceMax', '°'), metricas())).toBe(68)
    // Movilidad mide aperturaMax en %: no se mezcla con los cm de la base.
    expect(valorMetrica(def('aperturaMax', '%'), metricas())).toBeNull()
    expect(valorMetrica(def('ritmo', ''), metricas())).toBeNull()
    expect(valorMetrica(def('precision', '%'), null)).toBeNull()
  })
})

describe('sesionAnterior', () => {
  const actual = sesion('S-3', '2026-11-21T10:00:00Z', { estado: 'en curso' })
  it('la última cerrada del mismo juego y nivel antes de esta', () => {
    const lista = [
      sesion('S-1', '2026-11-18T10:00:00Z'),
      sesion('S-2', '2026-11-20T10:00:00Z'),
      sesion('S-4', '2026-11-22T10:00:00Z'), // posterior
      sesion('S-5', '2026-11-20T12:00:00Z', { juego: 'movilidad-guiada' }),
      sesion('S-6', '2026-11-20T13:00:00Z', { parametros: { ...actual.parametros, nivel: 3 } }),
      sesion('S-7', '2026-11-20T14:00:00Z', { estado: 'en curso' }),
      actual,
    ]
    expect(sesionAnterior(actual, lista)?.id).toBe('S-2')
  })
  it('sin sesión anterior → null', () => {
    expect(sesionAnterior(actual, [actual, sesion('S-9', '2026-11-20T10:00:00Z', { juego: 'otro' })])).toBeNull()
  })
})

describe('diferencia', () => {
  const pct = def('precision', '%', { mejor: 'mayor' })
  it('porcentaje en puntos, ▲ y mejor', () => {
    expect(diferencia(pct, 92, 88)).toEqual({ direccion: 'sube', texto: '4 pts', tono: 'mejor' })
  })
  it('menos tiempo es mejor', () => {
    expect(diferencia(def('t', 's', { mejor: 'menor' }), 3.8, 4.4)).toEqual({ direccion: 'baja', texto: '0,6 s', tono: 'mejor' })
    expect(diferencia(def('t', 's', { mejor: 'menor' }), 4.4, 3.8)).toEqual({ direccion: 'sube', texto: '0,6 s', tono: 'otro' })
  })
  it('grados y cm con su unidad', () => {
    expect(diferencia(def('f', '°', { mejor: 'mayor' }), 68, 65)?.texto).toBe('3°')
    expect(diferencia(def('a', 'cm', { mejor: 'mayor' }), 6.1, 5.7)?.texto).toBe('0,4 cm')
  })
  it('igual al redondear a lo mostrado', () => {
    expect(diferencia(pct, 86.2, 85.9)).toEqual({ direccion: 'igual', texto: 'igual', tono: 'neutro' })
  })
  it('sin valor de alguna → null; sin mejor → neutro', () => {
    expect(diferencia(pct, null, 3)).toBeNull()
    expect(diferencia(pct, 3, null)).toBeNull()
    expect(diferencia(def('x', 's'), 2, 1)?.tono).toBe('neutro')
  })
})

describe('textos', () => {
  it('banda EVA', () => {
    expect([0, 2, 5, 8, null].map(bandaDolor)).toEqual(['Sin dolor', 'Leve', 'Moderado', 'Intenso', 'Sin registro'])
  })
  it('duración m:ss', () => {
    expect(duracionTexto(360)).toBe('6:00 min')
    expect(duracionTexto(65.4)).toBe('1:05 min')
    expect(duracionTexto(null)).toBe('0:00 min')
  })
  it('avance del anillo', () => {
    expect(avanceMeta(6, 12)).toBe(0.5)
    expect(avanceMeta(14, 12)).toBe(1)
    expect(avanceMeta(0, 0)).toBe(0)
    expect(avanceMeta(3, 0)).toBe(1)
  })
})
