import { describe, expect, it } from 'vitest'
import { manoSintetica } from '../../tracking/sintetica'
import {
  AgregadoCartas,
  NIVELES_CARTAS,
  SuavizadorGiro,
  anguloGiro,
  cartaBajo,
  configGiro,
  crearTablero,
  estadoManoInicial,
  metaCartas,
  mezclar,
  paresDeNivel,
  nivelCartas,
  normalPalma,
  pasoMano,
  progresoGiro,
  tableroCompleto,
  tapar,
  voltear,
  paresEncontrados,
  type EntradaMano,
  type EstadoMano,
  type EventoMano,
} from './logica'

const giro = (deg: number, lado: 'derecha' | 'izquierda' = 'derecha', extra: object = {}) => anguloGiro(manoSintetica({ lado, pronacionDeg: -deg, ...extra }).worldLandmarks, lado)

describe('giro del antebrazo (worldLandmarks)', () => {
  it('palma de cara a la cámara = 0° y la normal sale de la palma', () => {
    for (const lado of ['derecha', 'izquierda'] as const) {
      const m = manoSintetica({ lado })
      expect(anguloGiro(m.worldLandmarks, lado)).toBeCloseTo(0, 1)
      const n = normalPalma(m.worldLandmarks, lado)!
      expect(n[2]).toBeLessThan(-0.95) // hacia la cámara
    }
  })

  it('supinación positiva y pronación negativa, igual en mano derecha e izquierda', () => {
    for (const lado of ['derecha', 'izquierda'] as const) {
      for (const g of [20, 45, 80, 120]) {
        expect(giro(g, lado)).toBeCloseTo(g, 0)
        expect(giro(-g, lado)).toBeCloseTo(-g, 0)
      }
    }
  })

  it('no depende de la posición ni de la distancia, y tolera una leve inclinación', () => {
    expect(giro(60, 'derecha', { x: 0.2, y: 0.7, distanciaCm: 35 })).toBeCloseTo(60, 0)
    expect(giro(60, 'derecha', { inclinacionDeg: 15 })).toBeGreaterThan(55)
    expect(giro(60, 'derecha', { inclinacionDeg: 15 })).toBeLessThan(66)
  })

  it('con los dedos apuntando a la cámara no se puede medir', () => {
    expect(giro(30, 'derecha', { inclinacionDeg: 85 })).toBeNull()
  })

  it('la mano cerrada (puño) sigue dando el giro de la palma', () => {
    expect(giro(50, 'derecha', { apertura: 0.5 })).toBeGreaterThan(40)
  })

  it('un cuadro sin puntos suficientes no revienta', () => {
    expect(anguloGiro([], 'derecha')).toBeNull()
    expect(normalPalma([], 'izquierda')).toBeNull()
  })
})

describe('suavizado del giro', () => {
  it('reduce el ruido sin atrasar un giro sostenido', () => {
    const s = new SuavizadorGiro()
    const crudo: number[] = []
    const suave: number[] = []
    for (let i = 0; i < 90; i++) {
      const verdadero = i < 30 ? 0 : 60
      // ruido determinista de ±8°
      const r = verdadero + Math.sin(i * 12.9898) * 8
      crudo.push(r)
      suave.push(s.filtrar(r, i * 33))
    }
    const desv = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length
      return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)
    }
    expect(desv(suave.slice(60))).toBeLessThan(desv(crudo.slice(60)) * 0.6)
    expect(Math.abs(suave[89] - 60)).toBeLessThan(6)
  })
})

describe('suavizado del giro cerca de palma arriba (salto de ±180°)', () => {
  // atan2 da +175° y al cuadro siguiente −178° con la misma mano casi boca arriba (≈182°).
  const cruce = [170, 172, 175, 176, 175, -178, 176, 174, -179, 177, 175, 173]

  it('el salto +175 → −178 no se promedia como lineal: la salida se queda cerca de palma arriba', () => {
    const s = new SuavizadorGiro()
    const salida = cruce.map((g, i) => s.filtrar(g, i * 33))
    expect(Math.min(...salida)).toBeGreaterThan(150)
    expect(Math.max(...salida)).toBeLessThanOrEqual(180)
  })

  it('el giro real hacia el otro lado (−178 sostenido desde el principio) no se tuerce', () => {
    const s = new SuavizadorGiro()
    const salida = [-170, -172, -175, -178, -176].map((g, i) => s.filtrar(g, i * 33))
    expect(Math.max(...salida)).toBeLessThan(-150)
    expect(Math.min(...salida)).toBeGreaterThanOrEqual(-180)
  })

  it('reiniciar() olvida el valor previo (no se desenrolla contra una mano que ya no estaba)', () => {
    const s = new SuavizadorGiro()
    s.filtrar(175, 0)
    s.reiniciar()
    expect(s.filtrar(-170, 1000)).toBeCloseTo(-170, 5)
  })

  it('sin falso retorno_palma_abajo y sin inflar la pronación máxima al voltear con la palma casi arriba', () => {
    const cfg = configGiro(60)
    const s = new SuavizadorGiro()
    const ag = new AgregadoCartas()
    let e = estadoManoInicial()
    const ev: EventoMano[] = []
    let t = 0
    const cuadro = (crudo: number) => {
      const a = s.filtrar(crudo, t)
      ag.giro(a)
      const r = pasoMano(e, { angulo: a, carta: 0, dtMs: 33, bloqueado: false }, cfg)
      e = r.estado
      ev.push(...r.eventos)
      t += 33
    }
    for (let i = 0; i < 10; i++) cuadro(0) // palma abajo sobre la carta 0
    for (let i = 0; i < 20; i++) cuadro(100) // giro sostenido: se voltea
    expect(tipos(ev)).toEqual(['sobre_carta', 'volteo'])
    // Palma casi arriba con un cuadro ruidoso que cruza ±180°: no hay retorno, no se puede voltear otra carta.
    for (const g of cruce) cuadro(g)
    for (let i = 0; i < 20; i++) cuadro(176)
    expect(tipos(ev)).toEqual(['sobre_carta', 'volteo'])
    expect(e.esperaRetorno).toBe(true)
    expect(e.armada).toBe(false)
    expect(ag.pronacionMax).toBe(0)
    expect(ag.supinacionMax).toBeGreaterThan(150)
    expect(ag.supinacionMax).toBeLessThanOrEqual(180)
    // Volver de verdad a palma abajo sí cuenta como retorno.
    for (let i = 0; i < 60; i++) cuadro(0)
    expect(tipos(ev)).toEqual(['sobre_carta', 'volteo', 'retorno_palma_abajo'])
  })
})

describe('meta de la sesión', () => {
  it('sin metaAgarres es práctica libre (0); con meta, los pares del nivel', () => {
    expect(metaCartas(1, 0)).toBe(0)
    expect(metaCartas(5, 0)).toBe(0)
    expect(metaCartas(1, 12)).toBe(2)
    expect(metaCartas(3, 5)).toBe(4)
    expect(metaCartas(5, 1)).toBe(6)
  })
  it('paresDeNivel recibe el número de nivel, no la cantidad de pares', () => {
    expect(paresDeNivel(3)).toBe(4)
    expect(paresDeNivel(NIVELES_CARTAS[3].pares)).toBe(paresDeNivel(4)) // 4 como número de nivel = 5 pares, no 4
    expect(paresDeNivel(4)).not.toBe(NIVELES_CARTAS[3].pares)
  })
})

describe('niveles', () => {
  it('1, 3 y 5 siguen el prompt J5', () => {
    expect(NIVELES_CARTAS[1]).toMatchObject({ filas: 2, columnas: 2, umbralDeg: 45, pares: 2 })
    expect(NIVELES_CARTAS[3]).toMatchObject({ filas: 2, columnas: 4, umbralDeg: 60, pares: 4 })
    expect(NIVELES_CARTAS[5]).toMatchObject({ filas: 3, columnas: 4, umbralDeg: 80, pares: 6 })
  })
  it('2 y 4 quedan entre ellos y todo nivel tiene pares enteros', () => {
    expect(NIVELES_CARTAS[2].umbralDeg).toBeGreaterThan(45)
    expect(NIVELES_CARTAS[2].umbralDeg).toBeLessThan(60)
    expect(NIVELES_CARTAS[4].umbralDeg).toBeGreaterThan(60)
    expect(NIVELES_CARTAS[4].umbralDeg).toBeLessThan(80)
    for (const n of [1, 2, 3, 4, 5] as const) expect((NIVELES_CARTAS[n].filas * NIVELES_CARTAS[n].columnas) % 2).toBe(0)
    expect(nivelCartas(9)).toBe(NIVELES_CARTAS[5])
    expect(nivelCartas(0)).toBe(NIVELES_CARTAS[1])
  })
  it('sin las palabras prohibidas', () => {
    expect(JSON.stringify(NIVELES_CARTAS)).not.toMatch(/fuerza|presi[oó]n/i)
  })
})

// Simula cuadros de 50 ms.
function correr(est: EstadoMano, pasos: { angulo: number | null; carta: number | null; ms: number; bloqueado?: boolean }[], umbral = 60): { estado: EstadoMano; eventos: EventoMano[] } {
  const cfg = configGiro(umbral)
  const eventos: EventoMano[] = []
  let e = est
  for (const p of pasos) {
    for (let t = 0; t < p.ms; t += 50) {
      const x: EntradaMano = { angulo: p.angulo, carta: p.carta, dtMs: 50, bloqueado: p.bloqueado ?? false }
      const r = pasoMano(e, x, cfg)
      e = r.estado
      eventos.push(...r.eventos)
    }
  }
  return { estado: e, eventos }
}
const tipos = (ev: EventoMano[]) => ev.map((e) => e.tipo)

describe('detección por mano', () => {
  it('sobre una carta con palma abajo: sobre_carta una sola vez, sin voltear', () => {
    const r = correr(estadoManoInicial(), [{ angulo: 0, carta: 2, ms: 600 }])
    expect(r.eventos).toEqual([{ tipo: 'sobre_carta', carta: 2 }])
    expect(r.estado.armada).toBe(true)
  })

  it('un giro bajo el umbral no voltea, por mucho que se mantenga', () => {
    const r = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 55, carta: 0, ms: 3000 }])
    expect(tipos(r.eventos)).toEqual(['sobre_carta'])
    expect(progresoGiro(r.estado, 55, 60)).toBeCloseTo(55 / 60, 2) // se inclina…
    expect(progresoGiro(r.estado, 80, 60)).toBe(1) // …y se recorta en 1
  })

  it('sobre el umbral hay que mantenerlo 0,3 s; un pico corto no voltea', () => {
    const corto = correr(estadoManoInicial(), [{ angulo: 0, carta: 1, ms: 300 }, { angulo: 70, carta: 1, ms: 200 }, { angulo: 10, carta: 1, ms: 300 }, { angulo: 70, carta: 1, ms: 250 }])
    expect(tipos(corto.eventos)).toEqual(['sobre_carta'])
    const largo = correr(estadoManoInicial(), [{ angulo: 0, carta: 1, ms: 300 }, { angulo: 70, carta: 1, ms: 350 }])
    expect(largo.eventos.at(-1)).toEqual({ tipo: 'volteo', carta: 1, grados: 70 })
  })

  it('el volteo informa el giro máximo sostenido', () => {
    const r = correr(estadoManoInicial(), [{ angulo: 0, carta: 3, ms: 300 }, { angulo: 62, carta: 3, ms: 100 }, { angulo: 71, carta: 3, ms: 250 }])
    expect(r.eventos.at(-1)).toEqual({ tipo: 'volteo', carta: 3, grados: 71 })
  })

  it('tras voltear hay que volver a palma abajo (retorno_palma_abajo) antes de otro volteo', () => {
    let r = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 70, carta: 0, ms: 400 }])
    expect(tipos(r.eventos)).toEqual(['sobre_carta', 'volteo'])
    // Se queda girada sobre otra carta: no voltea.
    r = correr(r.estado, [{ angulo: 70, carta: 1, ms: 2000 }])
    expect(tipos(r.eventos)).toEqual(['sobre_carta'])
    // Vuelve a palma abajo → retorno; después sí voltea.
    r = correr(r.estado, [{ angulo: 5, carta: 1, ms: 200 }])
    expect(tipos(r.eventos)).toEqual(['retorno_palma_abajo'])
    r = correr(r.estado, [{ angulo: 72, carta: 1, ms: 400 }])
    expect(tipos(r.eventos)).toEqual(['volteo'])
  })

  it('un giro intermedio (entre palma abajo y el umbral) no cuenta como retorno', () => {
    let r = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 70, carta: 0, ms: 400 }])
    r = correr(r.estado, [{ angulo: 40, carta: 0, ms: 1000 }])
    expect(r.estado.armada).toBe(false)
    expect(tipos(r.eventos)).not.toContain('retorno_palma_abajo')
  })

  it('no voltea mientras el tablero resuelve un no_par, ni sin haber mostrado palma abajo', () => {
    const bloqueado = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 70, carta: 0, ms: 1000, bloqueado: true }])
    expect(tipos(bloqueado.eventos)).toEqual(['sobre_carta'])
    // Empieza ya girada: sin palma abajo previa no hay volteo.
    const girada = correr(estadoManoInicial(), [{ angulo: 70, carta: 0, ms: 2000 }])
    expect(tipos(girada.eventos)).toEqual(['sobre_carta'])
  })

  it('cambiar de carta reinicia lo sostenido; el temblor entre cartas no elige ninguna', () => {
    let r = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 70, carta: 0, ms: 250 }])
    r = correr(r.estado, [{ angulo: 70, carta: 1, ms: 100 }, { angulo: 70, carta: 0, ms: 50 }])
    expect(tipos(r.eventos)).toEqual([])
    // Alternar cada 50 ms nunca llega a 120 ms estables.
    let e = estadoManoInicial()
    const ev: EventoMano[] = []
    for (let i = 0; i < 20; i++) {
      const o = correr(e, [{ angulo: 0, carta: i % 2, ms: 50 }])
      e = o.estado
      ev.push(...o.eventos)
    }
    expect(ev).toEqual([])
  })

  it('sin mano medible se pierde lo sostenido pero no la palma abajo', () => {
    let r = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 70, carta: 0, ms: 200 }, { angulo: null, carta: 0, ms: 100 }])
    expect(r.estado.mantenidoMs).toBe(0)
    expect(r.estado.armada).toBe(true)
    r = correr(r.estado, [{ angulo: 70, carta: 0, ms: 250 }])
    expect(tipos(r.eventos)).toEqual([])
    r = correr(r.estado, [{ angulo: 70, carta: 0, ms: 100 }])
    expect(tipos(r.eventos)).toEqual(['volteo'])
  })

  it('el umbral es configurable', () => {
    const baja = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 50, carta: 0, ms: 400 }], 45)
    expect(tipos(baja.eventos)).toContain('volteo')
    const alta = correr(estadoManoInicial(), [{ angulo: 0, carta: 0, ms: 300 }, { angulo: 50, carta: 0, ms: 400 }], 80)
    expect(tipos(alta.eventos)).not.toContain('volteo')
  })
})

describe('tablero y pares', () => {
  const rng = () => 0.37
  it('cada figura aparece dos veces y todo empieza tapado', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const { filas, columnas, pares } = NIVELES_CARTAS[n]
      const t = crearTablero(filas, columnas)
      expect(t.figuras).toHaveLength(filas * columnas)
      expect(t.estados.every((e) => e === 'tapada')).toBe(true)
      const cuentas = new Map<number, number>()
      for (const f of t.figuras) cuentas.set(f, (cuentas.get(f) ?? 0) + 1)
      expect(cuentas.size).toBe(pares)
      expect([...cuentas.values()].every((c) => c === 2)).toBe(true)
    }
  })

  it('la mezcla es determinista con la misma semilla y conserva los elementos', () => {
    expect(mezclar([1, 2, 3, 4, 5], rng)).toEqual(mezclar([1, 2, 3, 4, 5], rng))
    expect([...mezclar([1, 2, 3, 4, 5], rng)].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('dos cartas iguales forman un par y quedan arriba', () => {
    let t = crearTablero(2, 2, rng)
    const a = 0
    const b = t.figuras.findIndex((f, i) => i !== a && f === t.figuras[a])
    let r = voltear(t, a)
    expect(r.resultado).toBeNull()
    r = voltear(r.tablero, b)
    expect(r.resultado).toBe('par')
    t = r.tablero
    expect(t.estados[a]).toBe('par')
    expect(t.estados[b]).toBe('par')
    expect(t.abiertas).toEqual([])
    expect(paresEncontrados(t)).toBe(1)
    expect(voltear(t, a).resultado).toBeNull() // una carta ya arriba no se vuelve a voltear
  })

  it('dos distintas son no_par, se ven hasta que se tapan y no se pueden voltear más mientras tanto', () => {
    const t = crearTablero(2, 2, rng)
    const a = 0
    const b = t.figuras.findIndex((f) => f !== t.figuras[a])
    const c = [0, 1, 2, 3].find((i) => i !== a && i !== b)!
    let r = voltear(t, a)
    r = voltear(r.tablero, b)
    expect(r.resultado).toBe('no_par')
    expect(r.tablero.estados[a]).toBe('visible')
    expect(voltear(r.tablero, c).tablero).toBe(r.tablero)
    const tapado = tapar(r.tablero)
    expect(tapado.estados.every((e) => e === 'tapada')).toBe(true)
    expect(tapado.abiertas).toEqual([])
  })

  it('el tablero se completa al encontrar todos los pares', () => {
    let t = crearTablero(2, 3, rng)
    expect(tableroCompleto(t)).toBe(false)
    for (let f = 0; f < 3; f++) {
      const a = t.estados.findIndex((e) => e === 'tapada')
      const b = t.figuras.findIndex((x, i) => i !== a && x === t.figuras[a])
      t = voltear(voltear(t, a).tablero, b).tablero
    }
    expect(tableroCompleto(t)).toBe(true)
    expect(paresEncontrados(t)).toBe(3)
  })

  it('cartaBajo ubica la celda y devuelve null fuera del tablero', () => {
    // 2 filas × 3 columnas, paso 1, centrado en (0, 0)
    expect(cartaBajo(-1, -0.5, 2, 3, 1, 1, 0, 0)).toBe(0)
    expect(cartaBajo(0, -0.5, 2, 3, 1, 1, 0, 0)).toBe(1)
    expect(cartaBajo(1, 0.5, 2, 3, 1, 1, 0, 0)).toBe(5)
    expect(cartaBajo(2, 0, 2, 3, 1, 1, 0, 0)).toBeNull()
    expect(cartaBajo(0, 1.2, 2, 3, 1, 1, 0, 0)).toBeNull()
  })
})

describe('métricas', () => {
  it('máximos a cada lado, giro por volteo, pares, intentos y tiempo', () => {
    const a = new AgregadoCartas()
    for (const g of [0, 20, 66.4, 40, -12, -31.2, 5]) a.giro(g)
    a.volteo(62)
    a.volteo(70)
    a.volteo(68)
    a.resultado('no_par')
    a.resultado('par')
    expect(a.resumen(95.4)).toEqual({
      giroMedioVolteo: 67,
      giroMinVolteo: 62,
      giroMaxVolteo: 70,
      supinacionMax: 66,
      pronacionMax: 31,
      pares: 1,
      intentos: 2,
      volteos: 3,
      aciertos: 50,
      tiempoTotal: 95,
    })
  })
  it('reiniciar el tablero pone a cero pares, intentos y volteos, pero conserva los giros máximos', () => {
    const a = new AgregadoCartas()
    a.giro(70)
    a.giro(-20)
    a.volteo(66)
    a.resultado('par')
    a.resultado('no_par')
    a.reiniciarTablero()
    expect(a.resumen(10)).toMatchObject({ pares: 0, intentos: 0, volteos: 0, giroMedioVolteo: null, supinacionMax: 70, pronacionMax: 20 })
  })
  it('sin volteos los promedios quedan sin dato y no se divide por cero', () => {
    const r = new AgregadoCartas().resumen(0)
    expect(r.giroMedioVolteo).toBeNull()
    expect(r.aciertos).toBeNull()
    expect(r.supinacionMax).toBe(0)
  })
})
