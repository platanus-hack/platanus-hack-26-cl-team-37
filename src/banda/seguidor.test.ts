import { describe, expect, it } from 'vitest'
import { CORENGTH_5KG } from './curva'
import { SeguidorBanda, type PasoSeguidor } from './seguidor'

const curva = CORENGTH_5KG
const CPS = 30

/** Pasa por el seguidor un tramo de `ms` que va de `desde` a `hasta` cm en línea recta. Devuelve los pasos. */
function tramo(s: SeguidorBanda, reloj: { t: number }, ms: number, desde: number, hasta = desde): PasoSeguidor[] {
  const n = Math.round((ms / 1000) * CPS)
  const pasos: PasoSeguidor[] = []
  for (let i = 0; i < n; i++) {
    reloj.t += 1000 / CPS
    pasos.push(s.paso(reloj.t, desde + ((hasta - desde) * (i + 1)) / n, curva))
  }
  return pasos
}

const ultimo = (p: PasoSeguidor[]) => p[p.length - 1]

describe('seguidor de la banda', () => {
  it('marca el reposo solo con la banda quieta', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    const p = tramo(s, r, 3000, 20)
    expect(p.some((x) => x.evento === 'marcado')).toBe(true)
    expect(s.reposoCm).toBeCloseTo(20, 0)
    expect(ultimo(p).kg).toBe(0)
  })

  it('si tras una repetición vuelve un poco más larga y queda quieta, ese es el nuevo reposo (prueba real)', () => {
    // Como la grabación real del 21-nov-2026: el reposo entre repeticiones crece de 20 a 23,5 cm.
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 20)
    tramo(s, r, 1200, 20, 30)
    tramo(s, r, 800, 30, 21.5)
    const quieta1 = tramo(s, r, 3500, 21.5)
    expect(quieta1.some((x) => x.evento === 'seguido')).toBe(true)
    expect(s.reposoCm).toBeCloseTo(21.5, 0)
    expect(ultimo(quieta1).kg).toBe(0)
    expect(s.contador.repeticiones).toHaveLength(1)

    tramo(s, r, 1200, 21.5, 32)
    tramo(s, r, 800, 32, 23.4)
    const quieta2 = tramo(s, r, 3500, 23.4)
    expect(s.reposoCm).toBeCloseTo(23.4, 0)
    expect(ultimo(quieta2).kg).toBe(0)
    expect(s.contador.repeticiones).toHaveLength(2)
    // Antes de seguir el reposo, quieta en 23,4 cm con cero en 20 cm se leían kilos sin fuerza.
    expect(s.contador.repeticiones[1].picoKg).toBeGreaterThan(3)
  })

  it('un estiramiento sostenido a propósito no se toma como reposo', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 20)
    tramo(s, r, 1000, 20, 26)
    const sostenido = tramo(s, r, 7000, 26)
    expect(sostenido.some((x) => x.evento)).toBe(false)
    expect(ultimo(sostenido).kg).toBeGreaterThan(2)
    // Pasados 6 s quieta y estirada se pregunta si está en reposo, sin corregir nada.
    expect(ultimo(sostenido).sospecha).toBe(true)
    tramo(s, r, 1000, 26, 20)
    tramo(s, r, 600, 20)
    expect(s.contador.repeticiones).toHaveLength(1)
    expect(s.reposoCm).toBeCloseTo(20, 0)
  })

  it('un estiramiento a medio camino sostenido tampoco se toma como reposo', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 20)
    tramo(s, r, 1000, 20, 30)
    // Vuelve solo hasta 27 (cayó 30 % del recorrido, menos de la mitad) y queda ahí.
    tramo(s, r, 500, 30, 27)
    const medio = tramo(s, r, 4000, 27)
    expect(medio.some((x) => x.evento === 'seguido')).toBe(false)
    expect(s.reposoCm).toBeCloseTo(20, 0)
  })

  it('«Poner en cero» fija el reposo casi al instante y no borra las repeticiones', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 20)
    tramo(s, r, 1000, 20, 28)
    tramo(s, r, 1000, 28, 20)
    tramo(s, r, 300, 20)
    expect(s.contador.repeticiones).toHaveLength(1)
    s.pedirCero()
    expect(s.capturando).toBe(true)
    // El suavizado tarda unos 0,4 s en asentarse tras el salto a 22 cm; luego bastan 0,4 s quieta.
    const p = tramo(s, r, 1200, 22)
    expect(p.some((x) => x.evento === 'pedido')).toBe(true)
    expect(s.reposoCm).toBeCloseTo(22, 0)
    expect(s.contador.repeticiones).toHaveLength(1)
  })

  it('baja el reposo si queda quieta más corta (se había marcado estirada)', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 24)
    const p = tramo(s, r, 3500, 20)
    expect(p.some((x) => x.evento === 'bajado')).toBe(true)
    expect(s.reposoCm).toBeCloseTo(20, 0)
  })

  it('un hueco breve sin medida se ignora y uno largo corta', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 20)
    tramo(s, r, 500, 20, 26)
    r.t += 200
    expect(s.paso(r.t, null, curva).estado).toBe('hueco')
    expect(s.contador.estirando).toBe(true)
    r.t += 600
    expect(s.paso(r.t, null, curva).estado).toBe('perdida')
    // Perdida, pero la repetición espera hasta 2 s a que vuelva la mano.
    expect(s.contador.estirando).toBe(true)
    r.t += 1500
    s.paso(r.t, null, curva)
    expect(s.contador.repeticiones).toHaveLength(1)
  })

  it('si la mano vuelve antes de 2 s, la repetición sigue siendo una sola', () => {
    const s = new SeguidorBanda()
    const r = { t: 0 }
    tramo(s, r, 3000, 20)
    tramo(s, r, 600, 20, 25)
    for (let i = 0; i < 30; i++) {
      r.t += 1000 / CPS
      s.paso(r.t, null, curva)
    }
    tramo(s, r, 600, 27, 30)
    tramo(s, r, 1000, 30, 20)
    tramo(s, r, 500, 20)
    expect(s.contador.repeticiones).toHaveLength(1)
    expect(s.contador.repeticiones[0].picoKg).toBeGreaterThan(3)
  })
})
