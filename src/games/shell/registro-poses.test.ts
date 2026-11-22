// F35 · Poses clave en las muestras: una por etiqueta y lado, gana la de mayor valor, tope por sesión, solo puntos.
import { describe, expect, it, vi } from 'vitest'
import { MAX_POSES, RegistroSesion } from './registro'

const repo = { agregarEventos: vi.fn(async () => undefined) }
const mano = (dx = 0) => Array.from({ length: 21 }, (_, i) => ({ x: 0.01 * i + dx, y: -0.002 * i, z: 0.0005 * i }))

describe('registro de poses clave', () => {
  it('guarda 21 puntos en mm con 1 decimal, con lado, t, valor y centro', () => {
    const r = new RegistroSesion('S-1', repo)
    expect(r.pose(1234.4, 'pico', 'derecha', mano(), 12.345, [0.41234, 0.5])).toBe(true)
    const [p] = r.muestras().poses!
    expect(p).toMatchObject({ etiqueta: 'pico', lado: 'derecha', t: 1234, valor: 12.3, centro: [0.412, 0.5] })
    expect(p.puntos).toHaveLength(21)
    expect(p.puntos[3]).toEqual([30, -6, 1.5])
  })

  it('una por etiqueta y lado: solo la reemplaza una de mayor valor', () => {
    const r = new RegistroSesion('S-1', repo)
    r.pose(0, 'flexion-max', 'derecha', mano(), 40)
    expect(r.pose(10, 'flexion-max', 'derecha', mano(0.1), 30)).toBe(false)
    expect(r.pose(20, 'flexion-max', 'derecha', mano(0.2), 55)).toBe(true)
    expect(r.pose(30, 'flexion-max', 'izquierda', mano(), 10)).toBe(true)
    const poses = r.muestras().poses!
    expect(poses).toHaveLength(2)
    expect(poses.find((p) => p.lado === 'derecha')).toMatchObject({ t: 20, valor: 55 })
  })

  it('sin valor gana la última', () => {
    const r = new RegistroSesion('S-1', repo)
    r.pose(0, 'neutro', 'derecha', mano())
    r.pose(50, 'neutro', 'derecha', mano(0.3))
    expect(r.muestras().poses).toHaveLength(1)
    expect(r.muestras().poses![0].t).toBe(50)
  })

  it(`tope de ${MAX_POSES} etiquetas por sesión y rechaza puntos incompletos o no finitos`, () => {
    const r = new RegistroSesion('S-1', repo)
    for (let i = 0; i < MAX_POSES + 5; i++) r.pose(i, `p${i}`, 'derecha', mano())
    expect(r.muestras().poses).toHaveLength(MAX_POSES)
    const r2 = new RegistroSesion('S-2', repo)
    expect(r2.pose(0, 'x', 'derecha', mano().slice(0, 20))).toBe(false)
    expect(r2.pose(0, 'x', 'derecha', [...mano().slice(0, 20), { x: NaN, y: 0, z: 0 }])).toBe(false)
    expect(r2.muestras().poses).toBeUndefined()
  })

  it('sin poses, las muestras quedan igual que antes (sesiones viejas)', () => {
    const r = new RegistroSesion('S-1', repo)
    r.muestra(0, 2, 10)
    expect(Object.keys(r.muestras())).toEqual(['hz', 't', 'apertura', 'flexIndice'])
  })
})
