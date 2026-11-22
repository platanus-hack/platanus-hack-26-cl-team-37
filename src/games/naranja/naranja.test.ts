import { describe, expect, it } from 'vitest'
import { JUEGOS } from '../registry'
import {
  AgregadoNaranja,
  ESPERA_PASO_MS,
  HISTERESIS_PCT,
  INICIO_CIERRE_PCT,
  NARANJA_MS,
  NIVELES_NARANJA,
  REPETICIONES_VASO,
  cierreDeApertura,
  cortarRepeticion,
  estadoNaranjaInicial,
  nivelNaranja,
  pasoNaranja,
  progresoSostener,
  ritmoRepeticiones,
  type DondeMano,
  type EstadoNaranja,
  type EventoNaranja,
} from './logica'
import { crearNaranja } from './modulo'

// Las palabras que la cámara no puede respaldar (las dos de siempre y los verbos que sugieren medir cuánto se cierra con empuje),
// armadas por partes para que este archivo no las contenga.
const PROHIBIDAS = new RegExp(`${'fuer'}za|${'pre'}si[oó]n|${'apr'}(?:e|ie)t`, 'i')

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

describe('dónde está la mano', () => {
  /** Como correr(), pero con la posición de la palma en cada tramo. */
  function correrEn(tramos: [number, number, DondeMano][]) {
    let estado = estadoNaranjaInicial()
    const eventos: EventoNaranja[] = []
    for (const [c, ms, donde] of tramos)
      for (let t = 0; t < ms; t += 50) {
        const r = pasoNaranja(estado, c, 50, N1, donde)
        estado = r.estado
        eventos.push(...r.eventos)
      }
    return { estado, tipos: eventos.map((e) => e.tipo) }
  }

  it('la naranja se toma solo con la mano abierta sobre la fuente', () => {
    expect(correrEn([[0, NARANJA_MS + 200, 'vaso']]).tipos).toEqual([])
    expect(correrEn([[0, NARANJA_MS + 200, 'otro']]).tipos).toEqual([])
    expect(correrEn([[0, NARANJA_MS + 200, 'fuente']]).tipos).toEqual(['naranja'])
  })

  it('con la naranja, exprimir solo avanza sobre el vaso: lejos del vaso queda en pausa', () => {
    // Toma la naranja, cierra el puño camino al vaso (no cuenta) y recién sobre el vaso pasa el umbral y sostiene.
    let r = correrEn([[0, NARANJA_MS + 100, 'fuente'], [90, 2000, 'otro']])
    expect(r.estado.paso).toBe(2)
    expect(r.tipos).toEqual(['naranja'])
    r = correrEn([[0, NARANJA_MS + 100, 'fuente'], [90, 500, 'otro'], [90, N1.sostenerMs + 300, 'vaso'], [0, 200, 'vaso']])
    expect(r.tipos).toEqual(['naranja', 'cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa'])
  })

  it('abrir la mano lejos del vaso no la deja incompleta (sigue en pausa)', () => {
    const r = correrEn([[0, NARANJA_MS + 100, 'fuente'], [90, 300, 'vaso'], [0, 500, 'otro']])
    expect(r.tipos).not.toContain('repeticion_incompleta')
  })
})

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

  it('el tiempo sostenido deja de sumar al empezar el paso 4: 3 s de sostén y 10 s más de puño se guardan como 3 s', () => {
    const r = correr(N3, [
      [0, 400],
      [100, 3500],
    ])
    expect(r.estado.paso).toBe(4)
    expect(r.estado.sostenidoMs).toBe(N3.sostenerMs)
    const largo = correr(N3, [[100, 10_000]], r.estado)
    expect(largo.estado.paso).toBe(4)
    expect(largo.estado.sostenidoMs).toBe(3000)
    expect(progresoSostener(largo.estado, N3)).toBe(1)
    const fin = correr(N3, [[0, 400]], largo.estado)
    const ok = fin.eventos.find((e) => e.tipo === 'apertura_completa') as Extract<EventoNaranja, { tipo: 'apertura_completa' }>
    expect(ok).toBeDefined()
    expect(ok.sostenidoMs).toBe(3000)
    expect(new AgregadoNaranja().resumen().tiempoSostenido).toBeNull()
    const ag = new AgregadoNaranja()
    ag.evento(ok, 0)
    expect(ag.resumen().tiempoSostenido).toBe(3)
  })

  it('"Reiniciar" a mitad de una repetición la deja incompleta con su paso; en el paso 1 no hay nada que cerrar', () => {
    expect(cortarRepeticion(estadoNaranjaInicial())).toEqual([])
    expect(cortarRepeticion({ ...estadoNaranjaInicial(), paso: 2 })).toEqual([]) // aún no empezó a cerrar
    const en2 = correr(N3, [[0, 400], [40, 200]])
    expect(en2.estado).toMatchObject({ paso: 2, iniciada: true })
    expect(cortarRepeticion(en2.estado)).toEqual([{ tipo: 'repeticion_incompleta', paso: 2, cierreMaxPct: 40, sostenidoMs: 0 }])
    const en3 = correr(N3, [[0, 400], [90, 1000]])
    expect(en3.estado.paso).toBe(3)
    expect(cortarRepeticion(en3.estado)).toEqual([{ tipo: 'repeticion_incompleta', paso: 3, cierreMaxPct: 90, sostenidoMs: 950 }])
    const en4 = correr(N3, [[0, 400], [90, 3500]])
    expect(en4.estado.paso).toBe(4)
    expect(cortarRepeticion(en4.estado)).toEqual([{ tipo: 'repeticion_incompleta', paso: 4, cierreMaxPct: 90, sostenidoMs: 3000 }])
    // Cada cierre_inicio / umbral_alcanzado queda cerrado por una incompleta o una apertura_completa.
    const ag = new AgregadoNaranja()
    for (const ev of cortarRepeticion(en3.estado)) ag.evento(ev, 0)
    expect(ag.resumen()).toMatchObject({ incompletas: 1, falloPaso3: 1, repeticiones: 0 })
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
    // seguir con el puño cerrado mucho rato en el paso 4 no falla y el tiempo sostenido ya no suma
    r = correr(N1, [...hasta4, [100, 3000], [0, 300]])
    expect(r.tipos.at(-1)).toBe('apertura_completa')
    expect((r.eventos.at(-1) as { sostenidoMs: number }).sostenidoMs).toBe(N1.sostenerMs)
  })

  it('paso 2: empezó a cerrar y no llega al umbral ni vuelve a abrir → a los ESPERA_PASO_MS queda incompleta y sigue', () => {
    // 50 %: sobre el inicio (30 %), bajo el umbral (75 %) y sin poder volver a ≤ 15 %.
    const casi = correr(N3, [[0, 400], [50, ESPERA_PASO_MS - 50]])
    expect(casi.tipos).toEqual(['naranja', 'cierre_inicio'])
    expect(casi.estado.paso).toBe(2)
    const r = correr(N3, [[50, 100]], casi.estado)
    expect(r.eventos).toEqual([{ tipo: 'repeticion_incompleta', paso: 2, cierreMaxPct: 50, sostenidoMs: 0 }])
    expect(r.estado).toEqual(estadoNaranjaInicial()) // empieza la siguiente
    // Con la naranja en la mano y SIN haber empezado a cerrar no hay repetición abierta: descansar no se cobra.
    const descansa = correr(N3, [[0, 400], [20, ESPERA_PASO_MS * 3]])
    expect(descansa.tipos).toEqual(['naranja'])
    expect(descansa.estado.paso).toBe(2)
  })

  it('paso 4: no logra abrir por completo → a los ESPERA_PASO_MS queda incompleta en el paso 4, con lo que alcanzó', () => {
    const hasta4: [number, number][] = [[0, 400], [100, 100], [100, 1200]]
    // Abre hasta el 40 % de cierre (nivel 1 pide ≤ 25 %) y no puede más.
    const casi = correr(N1, [...hasta4, [40, ESPERA_PASO_MS - 500]])
    expect(casi.estado.paso).toBe(4)
    expect(casi.tipos.at(-1)).toBe('sostenido_completo')
    const r = correr(N1, [[40, 600]], casi.estado)
    expect(r.eventos).toEqual([{ tipo: 'repeticion_incompleta', paso: 4, cierreMaxPct: 100, sostenidoMs: N1.sostenerMs }])
    expect(r.estado.paso).toBe(1)
    // Tampoco se queda para siempre con el puño cerrado sin abrir.
    const puno = correr(N1, [...hasta4, [100, ESPERA_PASO_MS + 500]])
    expect(puno.tipos.at(-1)).toBe('repeticion_incompleta')
    expect((puno.eventos.at(-1) as { paso: number }).paso).toBe(4)
    // La incompleta entra en las métricas (cierre máximo y fallo en el paso 4).
    const ag = new AgregadoNaranja()
    for (const ev of r.eventos) ag.evento(ev, 0)
    expect(ag.resumen()).toMatchObject({ incompletas: 1, falloPaso4: 1, cierreMax: 100 })
  })

  it('la espera máxima no corre sin mano y no cambia nada para quien completa el movimiento a su ritmo', () => {
    const hasta4: [number, number][] = [[0, 400], [100, 100], [100, 1200]]
    // Paso 4, casi al límite, y se pierde la mano un buen rato: al volver sigue en el paso 4 y puede terminar.
    const casi = correr(N1, [...hasta4, [40, ESPERA_PASO_MS - 1000]])
    const sinMano = correr(N1, [[null, 60_000]], casi.estado)
    expect(sinMano.eventos).toEqual([])
    expect(sinMano.estado.paso).toBe(4)
    expect(correr(N1, [[0, 300]], sinMano.estado).tipos).toEqual(['apertura_completa'])
    // Lento pero completo (10 s para llegar al umbral, 10 s para abrir): repetición válida, sin incompletas.
    const lento = correr(N1, [[0, 400], [45, 10_000], [100, 1200], [100, 4000], [40, 6000], [0, 300]])
    expect(lento.tipos).toEqual(['naranja', 'cierre_inicio', 'umbral_alcanzado', 'sostenido_completo', 'apertura_completa'])
  })

  it('una repetición abierta al terminar la sesión se cierra como incompleta (cortarRepeticion) y no se pierde', () => {
    const en3 = correr(N3, [[0, 400], [90, 1000]])
    const ag = new AgregadoNaranja()
    for (const ev of cortarRepeticion(en3.estado)) ag.evento(ev, 0)
    expect(ag.resumen()).toMatchObject({ repeticiones: 0, incompletas: 1, falloPaso3: 1, cierreMax: 90, tiempoSostenido: 1 })
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
  it('la fórmula del tiempo sostenido dice sobre "umbral − 10" y los textos visibles dicen puño cerrado y cierres', () => {
    const m = crearNaranja()
    const f = m.metricasVivo.find((x) => x.id === 'sostenido')!.formula
    expect(f).toContain('umbral − 10')
    expect(m.meta.etiqueta).toBe('Naranjas')
    expect(m.meta.unidad).toBe('naranjas')
  })
  it('la meta es llenar el vaso: las repeticiones del plan, o REPETICIONES_VASO si el plan no fija', () => {
    const { desdePlan } = crearNaranja().meta
    const p = { nivel: 1, duracionMin: 5, metaPinzaCm: 0 }
    expect(desdePlan({ ...p, metaAgarres: 0 })).toBe(REPETICIONES_VASO)
    expect(desdePlan({ ...p, metaAgarres: 6 })).toBe(6)
  })
  it('Exprime la naranja declara sus 5 niveles con el texto del módulo', () => {
    const j = JUEGOS.find((x) => x.id === 'exprime-naranja')!
    expect(j.niveles.map((n) => n.detalle)).toEqual(([1, 2, 3, 4, 5] as const).map((k) => NIVELES_NARANJA[k].detalle))
    expect(JSON.stringify(j)).not.toMatch(PROHIBIDAS)
  })
})
