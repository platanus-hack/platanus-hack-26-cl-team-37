import { describe, expect, it } from 'vitest'
import { JUEGOS } from '../registry'
import { CAJA, ZONA_JUGUETES, cayoDeLaMesa, dentroDeCaja, distanciaToma, estaQuieto, interiorCaja, posicionesJuguetes, radioPlano, TAM_BASE } from './logica'

const caja = JUEGOS.find((j) => j.id === 'caja-juguetes')!

describe('Caja de juguetes: reglas puras', () => {
  it('reparte la cantidad de juguetes de cada nivel, sin tocar la caja ni entre sí, dentro de la zona alcanzable', () => {
    for (const n of caja.niveles) {
      const pos = posicionesJuguetes(n.cantidad, n.distanciaCaja)
      expect(pos).toHaveLength(n.cantidad)
      const tam = TAM_BASE * n.tamano
      for (const p of pos) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(ZONA_JUGUETES.xMax)
        expect(p.z).toBeGreaterThanOrEqual(ZONA_JUGUETES.zMin - 1e-9)
        expect(p.z).toBeLessThanOrEqual(ZONA_JUGUETES.zMax + 1e-9)
        // fuera de la caja (con su radio)
        expect(Math.abs(p.x - CAJA.x)).toBeGreaterThan(CAJA.ancho / 2 + radioPlano('capsula', tam) * 0.5)
      }
      for (let i = 0; i < pos.length; i++)
        for (let k = i + 1; k < pos.length; k++) expect(Math.hypot(pos[i].x - pos[k].x, pos[i].z - pos[k].z)).toBeGreaterThan(tam)
    }
  })

  it('más nivel = caja más lejos', () => {
    const lejania = caja.niveles.map((n) => Math.min(...posicionesJuguetes(n.cantidad, n.distanciaCaja).map((p) => Math.abs(p.x - CAJA.x))))
    for (let i = 1; i < lejania.length; i++) expect(lejania[i]).toBeGreaterThanOrEqual(lejania[i - 1])
  })

  it('alterna izquierda y derecha de la caja', () => {
    const pos = posicionesJuguetes(4, 0.9)
    expect(pos.map((p) => Math.sign(p.x))).toEqual([-1, 1, -1, 1])
  })

  it('toma solo con la pinza cerca del juguete', () => {
    const centro = { x: 1, y: 0.15, z: 0 }
    expect(distanciaToma({ x: 1.1, y: 0.6, z: 0.05 }, centro, 'cubo', 0.3)).not.toBeNull()
    expect(distanciaToma({ x: 1, y: 0.3, z: 0 }, centro, 'cubo', 0.3)).toBeCloseTo(0)
    expect(distanciaToma({ x: 1.6, y: 0.3, z: 0 }, centro, 'cubo', 0.3)).toBeNull() // lejos en la mesa
    expect(distanciaToma({ x: 1, y: 1.2, z: 0 }, centro, 'cubo', 0.3)).toBeNull() // muy arriba
    const a = distanciaToma({ x: 1.05, y: 0.3, z: 0 }, centro, 'cubo', 0.3)!
    const b = distanciaToma({ x: 1.25, y: 0.3, z: 0 }, centro, 'cubo', 0.3)!
    expect(a).toBeLessThan(b)
  })

  it('dentro de la caja: interior y bajo el borde', () => {
    const { mx, mz } = interiorCaja()
    expect(dentroDeCaja({ x: CAJA.x, y: 0.2, z: CAJA.z })).toBe(true)
    expect(dentroDeCaja({ x: CAJA.x + mx - 0.01, y: 0.2, z: CAJA.z + mz - 0.01 })).toBe(true)
    expect(dentroDeCaja({ x: CAJA.x + mx + 0.05, y: 0.2, z: CAJA.z })).toBe(false)
    expect(dentroDeCaja({ x: CAJA.x, y: 0.2, z: CAJA.z + mz + 0.05 })).toBe(false)
    expect(dentroDeCaja({ x: CAJA.x, y: CAJA.alto + 0.3, z: CAJA.z })).toBe(true) // apilado sobre otros juguetes
    expect(dentroDeCaja({ x: CAJA.x, y: CAJA.alto + 0.8, z: CAJA.z })).toBe(false) // muy por encima
  })

  it('cae de la mesa y quietud', () => {
    expect(cayoDeLaMesa({ x: 0, y: -1.2, z: 0 })).toBe(true)
    expect(cayoDeLaMesa({ x: 0, y: 0.1, z: 0 })).toBe(false)
    expect(estaQuieto({ x: 0.01, y: 0, z: 0 }, { x: 0, y: 0.1, z: 0 })).toBe(true)
    expect(estaQuieto({ x: 0.5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(false)
  })
})
