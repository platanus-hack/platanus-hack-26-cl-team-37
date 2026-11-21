import { describe, expect, it } from 'vitest'
import { manoSintetica, poseEn, secuencia } from '../../tracking/sintetica'
import { JUEGOS } from '../registry'
import {
  AgregadoPinza,
  DEDOS_PINZA,
  ERROR_MS,
  HOLD_MS,
  LARGO_SECUENCIA,
  NIVELES_PINZA,
  distanciasPulgar,
  estadoPinzaInicial,
  fijarObjetivo,
  generarSecuencia,
  masCercano,
  nivelPinza,
  pasoPinza,
  umbralesToque,
  type ConfigPinza,
  type DedoPinza,
  type Distancias,
  type EstadoPinza,
  type EventoPinza,
} from './logica'

const U = umbralesToque(18.2)
const cfg = (limiteMs = 0): ConfigPinza => ({ ...U, limiteMs })
const lejos: Distancias = { indice: 8, medio: 9, anular: 10, menique: 11 }
const con = (d: DedoPinza, cm: number): Distancias => ({ ...lejos, [d]: cm })

/** Corre una serie de (ms, distancias) con cuadros de 50 ms; devuelve el estado final y todos los eventos. */
function correr(e0: EstadoPinza, tramos: [number, Distancias][], c: ConfigPinza, t0 = 0) {
  let e = e0
  let t = t0
  const eventos: (EventoPinza & { t: number })[] = []
  for (const [dur, d] of tramos) {
    for (let k = 0; k < dur / 50; k++) {
      t += 50
      const r = pasoPinza(e, d, t, c)
      e = r.estado
      for (const ev of r.eventos) eventos.push({ ...ev, t })
    }
  }
  return { e, t, eventos }
}

describe('Pinza fina: umbrales y distancias', () => {
  it('los umbrales son proporcionales al largo de mano y el de soltar es mayor (histéresis)', () => {
    const a = umbralesToque(18.2)
    const b = umbralesToque(14)
    expect(a.toqueCm).toBeCloseTo(1.82, 2)
    expect(a.sueltaCm).toBeGreaterThan(a.toqueCm)
    expect(b.toqueCm).toBeLessThan(a.toqueCm)
    expect(b.sueltaCm).toBeLessThan(a.sueltaCm)
    expect(umbralesToque(null).toqueCm).toBeGreaterThan(1)
    expect(umbralesToque(2).toqueCm).toBeGreaterThan(1) // largo absurdo → valor por defecto
  })

  it('la fuente sintética toca cada dedo y la distancia da ≈ la pinza pedida', () => {
    for (const d of DEDOS_PINZA) {
      const m = manoSintetica({ apertura: 1, dedos: { [d]: 0.6 }, pinzaCm: 0.6, pinzaDedo: d })
      const dist = distanciasPulgar(m.worldLandmarks, 100)
      expect(masCercano(dist).dedo).toBe(d)
      expect(dist[d]).toBeCloseTo(0.6, 1)
      expect(dist[d]).toBeLessThan(U.toqueCm)
      for (const o of DEDOS_PINZA.filter((x) => x !== d)) expect(dist[o]).toBeGreaterThan(U.sueltaCm)
    }
    // Mano libre: nada toca.
    const libre = distanciasPulgar(manoSintetica({ apertura: 1 }).worldLandmarks, 100)
    expect(masCercano(libre).cm).toBeGreaterThan(U.sueltaCm)
  })

  it('la pinza cambia de dedo a mitad del tramo y pasa por el pulgar libre', () => {
    const poses = secuencia([[0, { apertura: 1, dedos: { indice: 0.5 }, pinzaCm: 0.5, pinzaDedo: 'indice' }], [400, { dedos: {}, pinzaCm: null }], [400, { dedos: { menique: 0.5 }, pinzaCm: 0.5, pinzaDedo: 'menique' }]])
    expect(poseEn(poses, 0, false).pinzaDedo).toBe('indice')
    expect(poseEn(poses, 800, false).pinzaDedo).toBe('menique')
    const medio = manoSintetica(poseEn(poses, 600, false))
    expect(masCercano(distanciasPulgar(medio.worldLandmarks, 100)).cm).toBeGreaterThan(U.toqueCm) // a mitad de camino no toca
  })
})

describe('Pinza fina: secuencias', () => {
  const rngFijo = (xs: number[]) => {
    let i = 0
    return () => xs[i++ % xs.length]
  }
  it('niveles 1 y 2: siempre índice, medio, anular, meñique', () => {
    expect(generarSecuencia(NIVELES_PINZA[1], Math.random)).toEqual(['indice', 'medio', 'anular', 'menique'])
    expect(generarSecuencia(NIVELES_PINZA[2], Math.random)).toEqual(DEDOS_PINZA)
  })

  it('niveles 3–5: al azar, con los 4 dedos, distinta del orden fijo y de la anterior', () => {
    expect(NIVELES_PINZA[3].aleatoria && NIVELES_PINZA[4].aleatoria && NIVELES_PINZA[5].aleatoria).toBe(true)
    let previa: DedoPinza[] | undefined
    for (let i = 0; i < 40; i++) {
      const s = generarSecuencia(NIVELES_PINZA[3], Math.random, previa)
      expect(s).toHaveLength(LARGO_SECUENCIA)
      expect([...s].sort()).toEqual([...DEDOS_PINZA].sort())
      expect(s).not.toEqual(DEDOS_PINZA)
      if (previa) expect(s).not.toEqual(previa)
      previa = s
    }
    // Determinista con un rng dado y reintenta si saliera el orden fijo.
    const fijo = generarSecuencia(NIVELES_PINZA[3], rngFijo([0.99, 0.99, 0.99, 0.0, 0.0, 0.0]))
    expect(fijo).not.toEqual(DEDOS_PINZA)
  })

  it('niveles: tiempo por toque 4 s (3) y 2 s (5, memoria); 1 sin límite; el registro usa los mismos textos', () => {
    expect(NIVELES_PINZA[1].limiteMs).toBe(0)
    expect(NIVELES_PINZA[3].limiteMs).toBe(4000)
    expect(NIVELES_PINZA[5].limiteMs).toBe(2000)
    expect(NIVELES_PINZA[5].memoria).toBe(true)
    expect([1, 2, 3, 4].some((n) => NIVELES_PINZA[n as 1].memoria)).toBe(false)
    for (let n = 2; n <= 5; n++) {
      const a = NIVELES_PINZA[(n - 1) as 1]
      const b = NIVELES_PINZA[n as 1]
      if (a.limiteMs > 0) expect(b.limiteMs).toBeLessThanOrEqual(a.limiteMs) // más nivel = igual o menos tiempo
    }
    const pinza = JUEGOS.find((j) => j.id === 'pinza-fina')!
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(pinza.niveles[n - 1].detalle).toBe(NIVELES_PINZA[n].detalle)
      expect(pinza.niveles[n - 1].nombre).toBe(NIVELES_PINZA[n].nombre)
    }
    expect(nivelPinza(0)).toBe(NIVELES_PINZA[1])
    expect(nivelPinza(9)).toBe(NIVELES_PINZA[5])
  })
})

describe('Pinza fina: detección de toques', () => {
  const e0 = () => fijarObjetivo(estadoPinzaInicial(), 'indice', 0)

  it('toque = cerca del dedo pedido durante 0,3 s; el tiempo cuenta desde que se mostró', () => {
    const r = correr(e0(), [[500, lejos], [HOLD_MS + 50, con('indice', 0.5)]], cfg())
    expect(r.eventos).toHaveLength(1)
    const ev = r.eventos[0]
    expect(ev).toMatchObject({ tipo: 'toque', dedo: 'indice' })
    // contacto desde 550, confirmado a 850 (0,3 s después)
    expect(ev.t).toBe(500 + 50 + HOLD_MS)
    expect((ev as { tiempoMs: number }).tiempoMs).toBe(ev.t)
    expect((ev as { distMinCm: number }).distMinCm).toBeCloseTo(0.5)
  })

  it('un contacto más corto que 0,3 s no cuenta', () => {
    const r = correr(e0(), [[200, lejos], [200, con('indice', 0.5)], [500, lejos]], cfg())
    expect(r.eventos).toEqual([])
  })

  it('histéresis: entre el umbral de toque y el de soltar el contacto se mantiene; sobre el de soltar se pierde', () => {
    const medio = (U.toqueCm + U.sueltaCm) / 2
    // entra bajo el umbral, se queda en la banda (no se pierde) y completa el hold
    let r = correr(e0(), [[100, con('indice', 1)], [150, con('indice', medio)], [100, con('indice', 1)]], cfg())
    expect(r.eventos.map((x) => x.tipo)).toEqual(['toque'])
    // entra directo en la banda: no es contacto
    r = correr(e0(), [[1000, con('indice', medio)]], cfg())
    expect(r.eventos).toEqual([])
    // sale de la banda por arriba: reinicia el hold
    r = correr(e0(), [[150, con('indice', 1)], [50, con('indice', U.sueltaCm + 0.5)], [150, con('indice', 1)]], cfg())
    expect(r.eventos).toEqual([])
  })

  it('después de un toque hay que separar antes de contar otro (aunque el dedo pedido sea el mismo)', () => {
    let r = correr(e0(), [[400, con('indice', 0.5)]], cfg())
    expect(r.eventos).toHaveLength(1)
    const e = fijarObjetivo(r.e, 'indice', r.t)
    r = correr(e, [[800, con('indice', 0.5)]], cfg(), r.t)
    expect(r.eventos).toEqual([]) // sigue pegado: no cuenta un segundo toque
    r = correr(r.e, [[200, lejos], [400, con('indice', 0.5)]], cfg(), r.t)
    expect(r.eventos.map((x) => x.tipo)).toEqual(['toque'])
  })

  it('dedo equivocado = un error por contacto, sin bloquear; luego el dedo correcto sí cuenta', () => {
    const r = correr(e0(), [[100, lejos], [ERROR_MS + 400, con('medio', 0.5)], [200, lejos], [400, con('indice', 0.5)]], cfg())
    expect(r.eventos.map((x) => x.tipo)).toEqual(['error', 'toque'])
    expect(r.eventos[0]).toMatchObject({ tipo: 'error', dedo: 'medio' })
    // un roce corto no es error
    const roce = correr(e0(), [[100, con('medio', 0.5)], [300, lejos]], cfg())
    expect(roce.eventos).toEqual([])
  })

  it('con dos dedos cerca gana el más cercano', () => {
    const d: Distancias = { indice: 1.5, medio: 0.6, anular: 9, menique: 10 }
    const r = correr(e0(), [[800, d]], cfg())
    expect(r.eventos.map((x) => x.tipo)).toEqual(['error']) // índice pedido, tocó el medio
  })

  it('al vencer el tiempo avanza con no_alcanzado y la distancia mínima; sin límite nunca vence', () => {
    const r = correr(e0(), [[500, con('indice', 4.2)], [500, con('indice', 3.1)], [3000, con('indice', 5)]], cfg(4000))
    expect(r.eventos).toHaveLength(1)
    expect(r.eventos[0]).toMatchObject({ tipo: 'no_alcanzado', dedo: 'indice', t: 4000 })
    expect((r.eventos[0] as { distMinCm: number }).distMinCm).toBeCloseTo(3.1)
    // nivel 1: sin límite
    expect(correr(e0(), [[60_000, con('indice', 4)]], cfg(0)).eventos).toEqual([])
  })

  it('si está tocando justo al vencer el tiempo, se le deja completar el hold', () => {
    const r = correr(e0(), [[3850, con('indice', 4)], [400, con('indice', 0.5)]], cfg(4000))
    expect(r.eventos.map((x) => x.tipo)).toEqual(['toque'])
  })

  it('sin mano no avanza nada ni se pierde el objetivo', () => {
    const e = correr(e0(), [[100, con('indice', 0.5)]], cfg()).e
    const sin = pasoPinza(e, null, 5000, cfg(1000))
    expect(sin.eventos).toEqual([])
    expect(sin.estado.objetivo).toBe('indice')
  })
})

describe('Pinza fina: agregados', () => {
  it('tiempo medio, distancia mínima por dedo, errores y dedos no alcanzados', () => {
    const a = new AgregadoPinza()
    a.evento({ tipo: 'toque', dedo: 'indice', tiempoMs: 1000, distMinCm: 0.4 })
    a.evento({ tipo: 'toque', dedo: 'medio', tiempoMs: 2000, distMinCm: 0.8 })
    a.evento({ tipo: 'error', dedo: 'anular' })
    a.evento({ tipo: 'no_alcanzado', dedo: 'menique', distMinCm: 3.44, tiempoMs: 4000 })
    a.evento({ tipo: 'no_alcanzado', dedo: 'menique', distMinCm: 2.96, tiempoMs: 4000 })
    const r = a.resumen()
    expect(r).toMatchObject({ toques: 2, errores: 1, noAlcanzados: 2, dedosNoAlcanzados: 1, precision: 40, tiempoMedioToque: 1.5 })
    expect(r.distMinIndice).toBe(0.4)
    expect(r.distMinMenique).toBe(3) // la mejor de las dos, 1 decimal
    expect(r.distMinAnular).toBeNull() // nunca fue objetivo
    expect(r.noAlcanzaMenique).toBe(2)
    expect(a.dedosNoAlcanzados()).toEqual(['menique'])
    expect(new AgregadoPinza().resumen()).toMatchObject({ toques: 0, precision: null, tiempoMedioToque: null })
  })
})
