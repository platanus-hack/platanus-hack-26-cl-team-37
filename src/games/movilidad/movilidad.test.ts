import { describe, expect, it } from 'vitest'
import { JUEGOS } from '../registry'
import { NIVELES_MOVILIDAD, cicloInicial, guiaEn, nivelMovilidad, pasoCiclo, periodoGuia, ritmoCpm, ritmoMedio, type CambioCiclo } from './logica'

describe('Movilidad guiada: reglas puras', () => {
  it('niveles: histéresis válida, más nivel = cerrar más (o igual) y el registro usa los mismos textos', () => {
    const mov = JUEGOS.find((j) => j.id === 'movilidad-guiada')!
    for (const n of [1, 2, 3, 4, 5] as const) {
      const v = NIVELES_MOVILIDAD[n]
      expect(v.cierre).toBeLessThan(v.apertura)
      expect(v.guiaCerrada).toBeLessThan(v.cierre) // la guía cierra más que el umbral: seguirla siempre cuenta
      expect(mov.niveles[n - 1].detalle).toBe(v.detalle)
      expect(mov.niveles[n - 1].nombre).toBe(v.nombre)
      if (n > 1) expect(v.cierre).toBeLessThanOrEqual(NIVELES_MOVILIDAD[(n - 1) as 1 | 2 | 3 | 4].cierre)
    }
    expect(periodoGuia(NIVELES_MOVILIDAD[4])).toBeGreaterThan(periodoGuia(NIVELES_MOVILIDAD[3]))
    expect(nivelMovilidad(0)).toBe(NIVELES_MOVILIDAD[1])
    expect(nivelMovilidad(9)).toBe(NIVELES_MOVILIDAD[5])
  })

  it('la guía recorre abierta → cerrando → cerrada → abriendo y se repite', () => {
    const n = NIVELES_MOVILIDAD[2]
    const p = periodoGuia(n)
    expect(guiaEn(0, n)).toMatchObject({ objetivo: 1, fase: 'abierta' })
    expect(guiaEn(n.abiertaMs + n.cerrarMs / 2, n).fase).toBe('cerrando')
    const medio = guiaEn(n.abiertaMs + n.cerrarMs / 2, n).objetivo
    expect(medio).toBeCloseTo((1 + n.guiaCerrada) / 2, 5)
    expect(guiaEn(n.abiertaMs + n.cerrarMs + 10, n)).toMatchObject({ objetivo: n.guiaCerrada, fase: 'cerrada' })
    expect(guiaEn(p - 10, n).fase).toBe('abriendo')
    expect(guiaEn(p + 5, n).objetivo).toBe(guiaEn(5, n).objetivo)
  })

  it('cuenta un ciclo por cerrar y volver a abrir, con histéresis (temblor cerca del umbral no cuenta)', () => {
    const n = NIVELES_MOVILIDAD[3]
    let s = cicloInicial()
    const cambios: CambioCiclo[] = []
    const serie = [1, 0.9, 0.5, 0.29, 0.31, 0.28, 0.1, 0.5, 0.79, 0.6, 0.81, 1, 0.5, 0.2, 0.9]
    serie.forEach((a, i) => {
      const r = pasoCiclo(s, a, i * 100, n)
      s = r.estado
      if (r.cambio) cambios.push(r.cambio)
    })
    expect(cambios.map((c) => c!.tipo)).toEqual(['cierre', 'ciclo', 'cierre', 'ciclo'])
    const primero = cambios[1] as { tipo: 'ciclo'; duracionMs: number; rango: number }
    expect(primero.duracionMs).toBe(700) // cierre en i=3, reapertura en i=10
    expect(primero.rango).toBeCloseTo(1 - 0.1, 5)
  })

  it('ritmo: ciclos/min con los últimos ciclos, baja si el paciente se detiene', () => {
    expect(ritmoCpm([], 1000)).toBeNull()
    expect(ritmoCpm([2000], 3000)).toBeNull()
    const t = [2000, 4000, 6000, 8000]
    expect(ritmoCpm(t, 8500)).toBeCloseTo(30)
    expect(ritmoCpm(t, 14000)).toBeCloseTo(10)
    expect(ritmoMedio(t)).toBeCloseTo(30)
    expect(ritmoMedio([1000])).toBeNull()
  })
})
