import { describe, expect, it } from 'vitest'
import { catalogo, nivelActual } from './catalogo'
import { JUEGOS } from './registry'

const ses = (juego: string, inicio: string | null, nivel: number, estado: 'cerrada' | 'preparada' = 'cerrada') => ({
  juego,
  inicio,
  estado,
  parametros: { mano: 'ambas' as const, nivel, duracionMin: 5, metaAgarres: 10, metaPinzaCm: 3, prescritoPor: null },
})

describe('catálogo de ejercicios', () => {
  const items = [
    { juego: 'caja-juguetes', nivel: 2 },
    { juego: 'movilidad-guiada', nivel: 1 },
  ]

  it('Todos muestra el registro completo en su orden', () => {
    const c = catalogo(JUEGOS, items, [], null)
    expect(c.map((e) => e.juego.id)).toEqual(JUEGOS.map((j) => j.id))
  })

  it('cada filtro deja solo los juegos que lo declaran', () => {
    for (const f of ['Pinza', 'Agarre', 'Alcance'] as const) {
      const c = catalogo(JUEGOS, items, [], f)
      expect(c.length).toBeGreaterThan(0)
      expect(c.every((e) => e.juego.filtros.includes(f))).toBe(true)
    }
    expect(catalogo(JUEGOS, items, [], 'Alcance').map((e) => e.juego.id)).toContain('atrapa-burbujas')
    expect(catalogo(JUEGOS, items, [], 'Pinza').map((e) => e.juego.id)).not.toContain('atrapa-burbujas')
  })

  it('Asignado = está en el plan vigente', () => {
    const c = catalogo(JUEGOS, items, [], null)
    const asignados = c.filter((e) => e.asignado).map((e) => e.juego.id)
    expect(asignados).toEqual(['caja-juguetes', 'movilidad-guiada'])
    expect(catalogo(JUEGOS, [], [], null).some((e) => e.asignado)).toBe(false)
  })

  it('nivel: plan > última sesión cerrada > 1', () => {
    const s = [ses('torre-cubos', '2026-11-01T10:00:00Z', 2), ses('torre-cubos', '2026-11-10T10:00:00Z', 3), ses('pinza-fina', '2026-11-12T10:00:00Z', 4, 'preparada')]
    expect(nivelActual('caja-juguetes', items, s)).toBe(2)
    expect(nivelActual('torre-cubos', items, s)).toBe(3)
    expect(nivelActual('pinza-fina', items, s)).toBe(1)
    expect(nivelActual('caja-juguetes', [{ juego: 'caja-juguetes', nivel: 9 }], [])).toBe(5)
    expect(nivelActual('caja-juguetes', [{ juego: 'caja-juguetes', nivel: 0 }], [])).toBe(1)
  })
})
