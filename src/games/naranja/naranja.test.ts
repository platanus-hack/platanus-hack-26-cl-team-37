import { describe, expect, it } from 'vitest'
import { JUEGOS } from '../registry'
import {
  AgregadoNaranja,
  HISTERESIS_PCT,
  INICIO_CIERRE_PCT,
  NARANJA_MS,
  NIVELES_NARANJA,
  cierreDeApertura,
  estadoNaranjaInicial,
  nivelNaranja,
  pasoNaranja,
  progresoSostener,
  ritmoRepeticiones,
  type EstadoNaranja,
  type EventoNaranja,
} from './logica'

// Las dos palabras que la cámara no puede respaldar, armadas por partes para que este archivo no las contenga.
const PROHIBIDAS = new RegExp(`${'fuer'}za|${'pre'}si[oó]n`, 'i')

const N1 = NIVELES_NARANJA[1] // 60 %, 1 s, abierta ≤ 25 %
const N3 = NIVELES_NARANJA[3] // 75 %, 3 s

/** Corre una lista de [cierre %, ms] a pasos de 50 ms y junta los eventos. */
function correr(n = N1, tramos: [number | null, number][], inicio: EstadoNaranja = estadoNaranjaInicial()) {
  let estado = inicio
  const eventos: EventoNaranja[] = []
  for (const [c, ms] of tramos) {
    for (let t = 0; t < ms; t += 50) {
      const r = pasoNaranja(estado, c, 50, n)
      estado = r.estado
      eventos.push(...r.eventos)
    }
  }
  return { estado, eventos, tipos: eventos.map((e) => e.tipo) }
}

describe('niveles', () => {
  it('1, 3 y 5 siguen el prompt J4 (60 %/1 s, 75 %/3 s, 90 %/5 s) y el 2 y el 4 quedan entre medio', () => {
    expect([1, 3, 5].map((k) => [NIVELES_NARANJA[k as 1].umbral, NIVELES_NARANJA[k as 1].sostenerMs])).toEqual([[60, 1000], [75, 3000], [90, 5000]])
    for (let k = 1; k < 5; k++) {
      expect(NIVELES_NARANJA[(k + 1) as 2].umbral).toBeGreaterThan(NIVELES_NARANJA[k as 1].umbral)
      expect(NIVELES_NARANJA[(k + 1) as 2].sostenerMs).toBeGreaterThan(NIVELES_NARANJA[k as 1].sostenerMs)
    }
    expect(NIVELES_NARANJA[2].umbral).toBeGreaterThan(60)
    expect(NIVELES_NARANJA[2].umbral).toBeLessThan(75)
    expect(NIVELES_NARANJA[4].umbral).toBeGreaterThan(75)
    expect(NIVELES_NARANJA[4].umbral).toBeLessThan(90)
  })
  it('nivelNaranja acota y redondea', () => {
    expect(nivelNaranja(0)).toBe(NIVELES_NARANJA[1])
    expect(nivelNaranja(9)).toBe(NIVELES_NARANJA[5])
    expect(nivelNaranja(3.2)).toBe(NIVELES_NARANJA[3])
  })
  it('el umbral siempre queda sobre el inicio del cierre y sobre la zona "abierta"', () => {
    for (const n of Object.values(NIVELES_NARANJA)) {
      expect(n.umbral - HISTERESIS_PCT).toBeGreaterThan(INICIO_CIERRE_PCT)
      expect(n.abiertaPct).toBeLessThan(INICIO_CIERRE_PCT)
    }
  })
  it('ningún texto del juego dice lo que la cámara no mide', () => {
    const textos = JSON.stringify(NIVELES_NARANJA)
    expect(textos).not.toMatch(PROHIBIDAS)
  })
})

describe('cierre de puño', () => {
  it('0 % con la mano abierta de la calibración y 100 % con su puño', () => {
    expect(cierreDeApertura(1)).toBe(0)
    expect(cierreDeApertura(0)).toBe(100)
    expect(cierreDeApertura(0.4)).toBeCloseTo(60, 6)
    expect(cierreDeApertura(1.3)).toBe(0)
    expect(cierreDeApertura(-0.2)).toBe(100)
  })
})

describe('repetición de cuatro pasos', () => {
  it('abrir → naranja; cerrar y sostener; abrir por completo: una repetición válida con sus eventos en orden', () => {
    const r = correr(N1, [
      [0, 400],
      [50, 200],
      [100, 1200],
      [0, 300],
    ])
    expect(r.tipos).toEqual(['naranja', 'cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa'])
    const ok = r.eventos.at(-1) as Extract<EventoNaranja, { tipo: 'apertura_completa' }>
    expect(ok.aperturaPct).toBe(100)
    expect(ok.cierreMaxPct).toBe(100)
    expect(ok.sostenidoMs).toBeGreaterThanOrEqual(N1.sostenerMs)
    expect(r.estado.paso).toBe(1) // listo para la siguiente
  })

  it('la naranja aparece solo con la mano abierta un rato seguido', () => {
    let r = correr(N1, [[0, NARANJA_MS - 100]])
    expect(r.estado.paso).toBe(1)
    r = correr(N1, [[0, 200], [50, 100], [0, 200]]) // se interrumpe: no suma
    expect(r.tipos).toEqual([])
    r = correr(N1, [[0, NARANJA_MS + 100]])
    expect(r.tipos).toEqual(['naranja'])
    expect(r.estado.paso).toBe(2)
    // medio abierta (30 %) no vale como "abierta" del nivel 1 (≤ 25 %)
    expect(correr(N1, [[30, 1000]]).tipos).toEqual([])
  })

  it('soltar antes de tiempo en el paso 3 = incompleta con paso 3 y lo que alcanzó', () => {
    const r = correr(N3, [
      [0, 400],
      [90, 300],
      [90, 1200], // 1,2 s de 3 s
      [20, 400], // suelta
    ])
    expect(r.tipos).toEqual(['naranja', 'cierre_inicio', 'umbral_alcanzado', 'repeticion_incompleta'])
    const inc = r.eventos.at(-1) as Extract<EventoNaranja, { tipo: 'repeticion_incompleta' }>
    expect(inc.paso).toBe(3)
    expect(inc.cierreMaxPct).toBe(90)
    expect(inc.sostenidoMs).toBeGreaterThan(900)
    expect(inc.sostenidoMs).toBeLessThan(1500)
    expect(r.estado.paso).toBe(1)
    expect(r.tipos).not.toContain('sostenido_completo')
  })

  it('cerrar a medias y volver a abrir = incompleta en el paso 2', () => {
    const r = correr(N3, [[0, 400], [50, 300], [10, 100]])
    expect(r.tipos).toEqual(['naranja', 'cierre_inicio', 'repeticion_incompleta'])
    expect((r.eventos.at(-1) as { paso: number }).paso).toBe(2)
    expect(r.estado.paso).toBe(1)
  })

  it('quedarse a medias (sobre el inicio y bajo el umbral) no falla ni cuenta: espera', () => {
    const r = correr(N3, [[0, 400], [50, 5000]])
    expect(r.tipos).toEqual(['naranja', 'cierre_inicio'])
    expect(r.estado.paso).toBe(2)
  })

  it('el margen bajo el umbral no corta el tiempo sostenido, pero bajar más sí', () => {
    const justo = N3.umbral - HISTERESIS_PCT + 1
    let r = correr(N3, [[0, 400], [100, 100], [justo, 2000], [100, 1200]])
    expect(r.tipos).toContain('sostenido_completo')
    r = correr(N3, [[0, 400], [100, 100], [N3.umbral - HISTERESIS_PCT - 1, 500]])
    expect(r.tipos.at(-1)).toBe('repeticion_incompleta')
  })

  it('sin mano (null) el paso queda congelado: ni avanza ni falla', () => {
    const base = correr(N3, [[0, 400], [100, 100], [100, 500]])
    expect(base.estado.paso).toBe(3)
    const r = correr(N3, [[null, 10_000]], base.estado)
    expect(r.eventos).toEqual([])
    expect(r.estado).toEqual(base.estado)
  })

  it('paso 4: abrir un poco y volver a cerrar = incompleta en el paso 4; abrir despacio no falla', () => {
    const hasta4: [number, number][] = [[0, 400], [100, 100], [100, 1200]]
    let r = correr(N1, [...hasta4, [40, 200], [100, 200]])
    expect(r.tipos.at(-1)).toBe('repeticion_incompleta')
    expect((r.eventos.at(-1) as { paso: number }).paso).toBe(4)
    expect(r.tipos).toContain('sostenido_completo')
    expect(r.tipos).not.toContain('apertura_completa')
    r = correr(N1, [...hasta4, [45, 400], [30, 400], [10, 200]])
    expect(r.tipos.at(-1)).toBe('apertura_completa')
    // seguir con el puño cerrado mucho rato en el paso 4 no falla y el tiempo sostenido sigue corriendo
    r = correr(N1, [...hasta4, [100, 3000], [0, 300]])
    expect(r.tipos.at(-1)).toBe('apertura_completa')
    expect((r.eventos.at(-1) as { sostenidoMs: number }).sostenidoMs).toBeGreaterThan(3500)
  })

  it('varias repeticiones seguidas: solo cuentan las válidas', () => {
    const buena: [number, number][] = [[0, 400], [100, 100], [100, 1200], [0, 300]]
    const mala: [number, number][] = [[0, 400], [100, 100], [100, 300], [0, 300]] // suelta a los 0,3 s
    const r = correr(N1, [...buena, ...mala, ...buena])
    expect(r.eventos.filter((e) => e.tipo === 'apertura_completa')).toHaveLength(2)
    expect(r.eventos.filter((e) => e.tipo === 'repeticion_incompleta')).toHaveLength(1)
  })
})

describe('progreso de la barra', () => {
  it('0 antes del paso 3, avanza con el tiempo sostenido y queda llena después', () => {
    const e = estadoNaranjaInicial()
    expect(progresoSostener(e, N3)).toBe(0)
    expect(progresoSostener({ ...e, paso: 3, sostenidoMs: 1500 }, N3)).toBeCloseTo(0.5, 6)
    expect(progresoSostener({ ...e, paso: 4 }, N3)).toBe(1)
  })
})

describe('agregados', () => {
  it('cuenta válidas e incompletas por paso y promedia', () => {
    const a = new AgregadoNaranja()
    a.evento({ tipo: 'apertura_completa', aperturaPct: 96, cierreMaxPct: 90, sostenidoMs: 2000 }, 5_000)
    a.evento({ tipo: 'repeticion_incompleta', paso: 3, cierreMaxPct: 80, sostenidoMs: 600 }, 8_000)
    a.evento({ tipo: 'repeticion_incompleta', paso: 2, cierreMaxPct: 40, sostenidoMs: 0 }, 9_000)
    a.evento({ tipo: 'apertura_completa', aperturaPct: 100, cierreMaxPct: 100, sostenidoMs: 4000 }, 15_000)
    const r = a.resumen()
    expect(r).toMatchObject({ repeticiones: 2, incompletas: 2, falloPaso2: 1, falloPaso3: 1, falloPaso4: 0, completadas: 50 })
    expect(r.cierreMax).toBe(78) // (90 + 80 + 40 + 100) / 4 = 77,5
    expect(r.cierreMaxPico).toBe(100)
    expect(r.aperturaCompleta).toBe(98)
    expect(r.tiempoSostenido).toBe(2.2) // (2000 + 600 + 4000) / 3
    expect(r.ritmo).toBe(6) // 1 intervalo de 10 s → 6/min
  })
  it('sin datos devuelve null, no cero', () => {
    const r = new AgregadoNaranja().resumen()
    expect(r.cierreMax).toBeNull()
    expect(r.tiempoSostenido).toBeNull()
    expect(r.aperturaCompleta).toBeNull()
    expect(r.ritmo).toBeNull()
    expect(r.repeticiones).toBe(0)
  })
  it('ritmoRepeticiones: null con menos de 2', () => {
    expect(ritmoRepeticiones([1000])).toBeNull()
    expect(ritmoRepeticiones([0, 5000, 10000])).toBe(12)
  })
})

describe('registro', () => {
  it('Exprime la naranja declara sus 5 niveles con el texto del módulo', () => {
    const j = JUEGOS.find((x) => x.id === 'exprime-naranja')!
    expect(j.niveles.map((n) => n.detalle)).toEqual(([1, 2, 3, 4, 5] as const).map((k) => NIVELES_NARANJA[k].detalle))
    expect(JSON.stringify(j)).not.toMatch(PROHIBIDAS)
  })
})
