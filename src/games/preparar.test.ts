import { describe, expect, it } from 'vitest'
import type { PlanItem, Sesion } from '../domain/types'
import { sesionPreparada, valoresPorDefecto } from './preparar'

const item = (juego: string, nivel: number, duracionMin: number, mano: PlanItem['mano'], metaAgarres: number, metaPinzaCm: number): PlanItem => ({
  juego, nivel, duracionMin, mano, metaAgarres, metaPinzaCm,
})
const plan = { version: 2, creadoPorNombre: 'Klgo. Diego M.', items: [item('movilidad-guiada', 1, 3, 'ambas', 10, 7), item('caja-juguetes', 2, 6, 'izquierda', 12, 7.5)] }
const cerrada = (juego: string, nivel: number, inicio: string) =>
  ({ juego, estado: 'cerrada', inicio, parametros: { nivel } }) as Pick<Sesion, 'juego' | 'estado' | 'inicio' | 'parametros'>

describe('valoresPorDefecto', () => {
  it('toma mano, nivel, duración, meta, autor y versión del ítem del plan', () => {
    expect(valoresPorDefecto('caja-juguetes', plan, 'derecha', [])).toEqual({
      mano: 'izquierda',
      nivel: 2,
      duracionMin: 6,
      meta: { agarres: 12, pinzaCm: 7.5, autor: 'Klgo. Diego M.' },
      planVersion: 2,
    })
  })

  it('acota nivel 1–5 y duración 2–10', () => {
    const p = { ...plan, items: [item('caja-juguetes', 9, 30, 'ambas', 10, 7)] }
    const v = valoresPorDefecto('caja-juguetes', p, 'ambas', [])
    expect(v.nivel).toBe(5)
    expect(v.duracionMin).toBe(10)
    expect(valoresPorDefecto('caja-juguetes', { ...plan, items: [item('caja-juguetes', 0, 1, 'ambas', 10, 7)] }, 'ambas', []).duracionMin).toBe(2)
  })

  it('juego fuera del plan: mano afectada, nivel de la última sesión cerrada, 5 min y sin meta', () => {
    const v = valoresPorDefecto('torre-cubos', plan, 'derecha', [cerrada('torre-cubos', 2, '2026-11-01T10:00:00Z'), cerrada('torre-cubos', 3, '2026-11-10T10:00:00Z')])
    expect(v).toEqual({ mano: 'derecha', nivel: 3, duracionMin: 5, meta: null, planVersion: 2 })
  })

  it('sin plan: versión null y nivel 1', () => {
    expect(valoresPorDefecto('caja-juguetes', null, 'izquierda', [])).toEqual({ mano: 'izquierda', nivel: 1, duracionMin: 5, meta: null, planVersion: null })
  })
})

describe('sesionPreparada', () => {
  it('congela los parámetros elegidos y la versión del plan, en estado preparada', () => {
    const v = valoresPorDefecto('caja-juguetes', plan, 'derecha', [])
    const s = sesionPreparada('p1', 'caja-juguetes', { ...v, mano: 'ambas', nivel: 3, duracionMin: 8 })
    expect(s.estado).toBe('preparada')
    expect(s.planVersion).toBe(2)
    expect(s.juego).toBe('caja-juguetes')
    expect(s.parametros).toEqual({ mano: 'ambas', nivel: 3, duracionMin: 8, metaAgarres: 12, metaPinzaCm: 7.5, prescritoPor: 'Klgo. Diego M.' })
    expect(s.inicio).toBeNull()
    expect(s.hash).toBeNull()
  })

  it('sin meta del plan guarda meta 0 y sin autor', () => {
    const s = sesionPreparada('p1', 'torre-cubos', valoresPorDefecto('torre-cubos', null, 'derecha', []))
    expect(s.parametros).toMatchObject({ metaAgarres: 0, metaPinzaCm: 0, prescritoPor: null })
  })
})
