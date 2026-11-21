import { describe, expect, it } from 'vitest'
import { canonico, hashSesion, idSesion, verificarSesion } from './integridad'
import type { EventoSesion, Sesion } from './types'

const base: Sesion = {
  id: 'S-20261121-02', pacienteId: 'p1', planVersion: 3, juego: 'caja-juguetes',
  parametros: { mano: 'ambas', nivel: 2, duracionMin: 6, metaAgarres: 12, metaPinzaCm: 7, prescritoPor: 'Klgo. Diego M.' },
  inicio: '2026-11-21T13:32:00.000Z', fin: '2026-11-21T13:38:00.000Z', estado: 'cerrada',
  calibracion: null, metricas: null, muestras: { hz: 10, t: [0, 100], apertura: [2.1, null], flexIndice: [10, 12.5] },
  dolorEVA: 2, esfuerzo: 'Moderado', nota: 'Molestia leve', dispositivo: { modelo: 'x', camara: 'frontal', fps: 30 },
  versionApp: '1.0.0', versionModelo: 'hand_landmarker float16 v1', hash: null,
}
const eventos: EventoSesion[] = [
  { sesionId: base.id, seq: 2, t: 900.5, tipo: 'soltar', mano: 'derecha', objeto: 'cubo', datos: { enCaja: true } },
  { sesionId: base.id, seq: 1, t: 100, tipo: 'agarre_inicio', mano: 'derecha', objeto: 'cubo', datos: null },
]

describe('integridad', () => {
  it('canónico ordena claves y es estable', () => {
    expect(canonico({ b: 1, a: [true, null, 'x'] })).toBe('{"a":[true,null,"x"],"b":1}')
    expect(canonico({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('el hash no cambia con el formato de fecha ni el orden de claves/eventos', async () => {
    const h1 = await hashSesion(base, eventos)
    const desdeBD: Sesion = { ...base, inicio: '2026-11-21T13:32:00+00:00', fin: '2026-11-21 13:38:00+00' }
    const h2 = await hashSesion(desdeBD, [...eventos].reverse())
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h2).toBe(h1)
  })

  it('detecta alteraciones', async () => {
    const hash = await hashSesion(base, eventos)
    expect(await verificarSesion({ ...base, hash }, eventos)).toBe('verificado')
    expect(await verificarSesion({ ...base, hash, dolorEVA: 1 }, eventos)).toBe('alterado')
    const ev2 = eventos.map((e) => (e.seq === 2 ? { ...e, datos: { enCaja: false } } : e))
    expect(await verificarSesion({ ...base, hash }, ev2)).toBe('alterado')
  })

  it('id legible S-AAAAMMDD-NN', () => {
    expect(idSesion(new Date(2026, 10, 21), 2)).toBe('S-20261121-02')
  })
})
