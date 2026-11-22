import { describe, expect, it } from 'vitest'
import { CONFIG_AGARRE, GRACIA_SIN_MANO_MS, pasoAgarre, pasoAgarreTolerante, type EstadoAgarre } from '../../metrics/agarre'
import { JUEGOS } from '../registry'
import { CAJA, ZONA_JUGUETES, cayoDeLaMesa, dentroDeCaja, distanciaToma, estaQuieto, interiorCaja, posicionesJuguetes, radioPlano, resultadoSoltar, TAM_BASE } from './logica'

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

describe('Caja de juguetes: perder la mano no se le cobra al paciente', () => {
  /** Corre cuadros de 16 ms con esa apertura (null = no se ve la mano) y junta los cambios. */
  function correr(e0: EstadoAgarre, apertura: number | null, ms: number, cerca = true) {
    let e = e0
    const cambios: { cambio: string; perdida: boolean; t: number }[] = []
    for (let t = 16; t <= ms; t += 16) {
      const r = pasoAgarreTolerante(e, apertura, cerca, 16)
      e = r.estado
      if (r.cambio) cambios.push({ cambio: r.cambio, perdida: r.perdida, t })
    }
    return { e, cambios }
  }
  const agarrando = () => correr({ agarrando: false }, 2.0, 16).e

  it('un cuadro (o un hueco corto) sin mano NO suelta el juguete; antes un solo cuadro lo soltaba', () => {
    expect(agarrando().agarrando).toBe(true)
    expect(pasoAgarre(agarrando(), null, true).cambio).toBe('fin') // el comportamiento que se le cobraba al paciente
    const unCuadro = correr(agarrando(), null, 16)
    expect(unCuadro.cambios).toEqual([])
    expect(unCuadro.e.agarrando).toBe(true)
    const hueco = correr(agarrando(), null, GRACIA_SIN_MANO_MS - 32)
    expect(hueco.cambios).toEqual([])
    // Vuelve la mano con la pinza cerrada: sigue el mismo agarre, y el hueco no se acumula para el siguiente.
    const vuelve = correr(hueco.e, 2.0, 160)
    expect(vuelve.cambios).toEqual([])
    expect(vuelve.e).toEqual({ agarrando: true })
    expect(correr(vuelve.e, null, GRACIA_SIN_MANO_MS - 32).cambios).toEqual([])
  })

  it('pasada la gracia el agarre termina marcado como pérdida (no como un soltar del paciente)', () => {
    const r = correr(agarrando(), null, 2000)
    expect(r.cambios).toHaveLength(1)
    expect(r.cambios[0]).toMatchObject({ cambio: 'fin', perdida: true })
    expect(r.cambios[0].t).toBeGreaterThanOrEqual(GRACIA_SIN_MANO_MS)
    expect(r.cambios[0].t).toBeLessThan(GRACIA_SIN_MANO_MS + 32)
    expect(r.e.agarrando).toBe(false)
    expect(GRACIA_SIN_MANO_MS).toBeGreaterThanOrEqual(300)
    expect(GRACIA_SIN_MANO_MS).toBeLessThanOrEqual(400)
  })

  it('con la mano a la vista se comporta igual que pasoAgarre: abrir la pinza suelta de inmediato y no es pérdida', () => {
    const abre = pasoAgarreTolerante(agarrando(), CONFIG_AGARRE.umbralAperturaCm + 0.5, true, 16)
    expect(abre).toMatchObject({ cambio: 'fin', perdida: false, estado: { agarrando: false } })
    expect(pasoAgarreTolerante({ agarrando: false }, 2.0, true, 16)).toMatchObject({ cambio: 'inicio', perdida: false })
    expect(pasoAgarreTolerante({ agarrando: false }, 2.0, false, 16).cambio).toBeNull() // sin juguete cerca no toma
    expect(pasoAgarreTolerante({ agarrando: false }, null, true, 16)).toMatchObject({ cambio: null, perdida: false })
  })

  it('un juguete soltado por pérdida nunca cuenta como guardado; si cayó en la caja vuelve a su lugar', () => {
    expect(resultadoSoltar(true, false)).toEqual({ enCaja: true, vuelve: false }) // lo soltó el paciente dentro: cuenta
    expect(resultadoSoltar(false, false)).toEqual({ enCaja: false, vuelve: false })
    expect(resultadoSoltar(true, true)).toEqual({ enCaja: false, vuelve: true }) // cayó dentro sin mano: no cuenta
    expect(resultadoSoltar(false, true)).toEqual({ enCaja: false, vuelve: false })
  })
})
