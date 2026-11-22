import { describe, expect, it } from 'vitest'
import { accionToqueSonido, botonSilenciado } from './audio'
import { manoSintetica } from '../../tracking/sintetica'
import {
  AgregadoPiano,
  CalibradorReposo,
  DEDOS_PIANO,
  DetectorMano,
  EPISODIO_MS,
  ESPERA_FIN_MS,
  Juez,
  NIVELES_PIANO,
  REPOSO_MS,
  flexionMcp,
  independenciaPct,
  inicioPausa,
  frecuenciaNota,
  ladosDelNivel,
  nivelPiano,
  relojPartitura,
  separarTeclas,
  type Dedo,
  type EventoPiano,
  type Flexiones,
  type Pulsacion,
} from './logica'

const plano = (v = 0): Flexiones => ({ pulgar: v, indice: v, medio: v, anular: v, menique: v })
const con = (d: Partial<Flexiones>, base = 0): Flexiones => ({ ...plano(base), ...d })
const mov = (d: Partial<Flexiones>): Flexiones => con(d)
let semilla = 7
const rng = () => {
  semilla = (semilla * 16807) % 2147483647
  return semilla / 2147483647
}

describe('flexionMcp', () => {
  it('lee la flexión MCP de la mano sintética: crece con la flexión pedida y no cambia los otros dedos', () => {
    const quieta = flexionMcp(manoSintetica({ apertura: 1 }).worldLandmarks)
    const medio = flexionMcp(manoSintetica({ apertura: 1, dedos: { medio: 0.6 } }).worldLandmarks)
    expect(medio.medio - quieta.medio).toBeGreaterThan(40)
    for (const d of ['indice', 'anular', 'menique'] as Dedo[]) expect(Math.abs(medio[d] - quieta[d])).toBeLessThan(1)
  })
  it('es igual para la mano izquierda (espejo)', () => {
    const d = flexionMcp(manoSintetica({ apertura: 1, dedos: { anular: 0.5 }, lado: 'derecha' }).worldLandmarks)
    const i = flexionMcp(manoSintetica({ apertura: 1, dedos: { anular: 0.5 }, lado: 'izquierda' }).worldLandmarks)
    for (const k of DEDOS_PIANO) expect(i[k]).toBeCloseTo(d[k], 3)
  })
})

describe('CalibradorReposo', () => {
  it('fija el reposo (promedio) tras 3 s con la mano quieta', () => {
    const c = new CalibradorReposo()
    let p = 0
    for (let t = 0; t < REPOSO_MS - 100; t += 100) p = c.paso(con({ indice: 5 }, 2), 100)
    expect(p).toBeLessThan(1)
    expect(c.reposo()).toBeNull()
    c.paso(con({ indice: 7 }, 2), 100)
    c.paso(con({ indice: 5 }, 2), 100)
    const r = c.reposo()!
    expect(r.medio).toBeCloseTo(2, 5)
    expect(r.indice).toBeGreaterThan(5)
    expect(r.indice).toBeLessThan(5.2)
  })
  it('si la mano se mueve o se pierde, empieza de nuevo', () => {
    const c = new CalibradorReposo()
    for (let t = 0; t < 2000; t += 100) c.paso(plano(), 100)
    expect(c.progreso()).toBeGreaterThan(0.6)
    c.paso(con({ medio: 40 }), 100) // se movió un dedo
    expect(c.progreso()).toBeLessThan(0.1)
    for (let t = 0; t < 1500; t += 100) c.paso(plano(), 100)
    c.paso(null, 100) // sin mano
    expect(c.progreso()).toBe(0)
    expect(c.reposo()).toBeNull()
  })
})

/** Alimenta el detector con flexiones constantes durante `ms` (cuadros de 33 ms) y devuelve la primera pulsación. */
function correr(det: DetectorMano, flex: Flexiones, desde: number, ms: number): { t: number; pulsacion: Pulsacion | null } {
  let t = desde
  let pulsacion: Pulsacion | null = null
  for (; t < desde + ms; t += 33) pulsacion = det.paso(flex, t) ?? pulsacion
  return { t, pulsacion }
}

describe('DetectorMano', () => {
  it('sin reposo no detecta nada', () => {
    const det = new DetectorMano()
    expect(det.paso(con({ medio: 60 }), 0)).toBeNull()
  })
  it('un dedo abajo respecto de SU reposo (no del cero) cierra una pulsación con ese dedo', () => {
    const det = new DetectorMano()
    det.fijarReposo(con({ medio: 30 }, 5)) // el medio descansa a 30°, los demás a 5°
    let r = correr(det, con({ medio: 32 }, 5), 0, 600)
    expect(r.pulsacion).toBeNull() // 32° está a 2° de SU reposo
    r = correr(det, con({ medio: 70 }, 5), r.t, 600)
    expect(r.pulsacion?.abajo).toEqual(['medio'])
    expect(r.pulsacion?.movimiento.medio).toBeGreaterThan(35)
    expect(r.pulsacion?.movimiento.indice).toBeLessThan(1)
    expect(det.abajo.medio).toBe(true)
  })
  it('dos dedos a la vez dan una sola pulsación con ambos', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, plano(), 0, 300)
    const r = correr(det, con({ medio: 50, anular: 45 }), 300, 600)
    expect(r.pulsacion?.abajo).toEqual(['medio', 'anular'])
  })
  it('dos dedos con unos pocos cuadros de diferencia (dentro del episodio) cuentan como a la vez', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    let t = 0
    for (; t < 300; t += 33) det.paso(plano(), t)
    let pul: Pulsacion | null = null
    for (let k = 0; k < 6; k++, t += 33) pul = det.paso(con({ indice: 50 }), t) ?? pul
    for (let k = 0; k < 20; k++, t += 33) pul = det.paso(con({ indice: 50, medio: 50 }), t) ?? pul
    expect(pul?.abajo).toEqual(['indice', 'medio'])
  })
  it('no cuenta otra pulsación hasta que todos los dedos vuelven arriba', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, plano(), 0, 300)
    let r = correr(det, con({ indice: 50 }), 300, 600)
    expect(r.pulsacion).not.toBeNull()
    r = correr(det, con({ indice: 50, medio: 50 }), r.t, 600) // sigue abajo el índice
    expect(r.pulsacion).toBeNull()
    r = correr(det, plano(), r.t, 300)
    expect(det.hayAbajo()).toBe(false)
    r = correr(det, con({ medio: 50 }), r.t, 600)
    expect(r.pulsacion?.abajo).toEqual(['medio'])
  })
  it('la histéresis mantiene el dedo abajo entre los dos umbrales', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, con({ indice: 40 }), 0, 100)
    expect(det.abajo.indice).toBe(true)
    correr(det, con({ indice: 18 }), 100, 100) // sobre el umbral de subida (11°) y sin recuperar el 60% del recorrido
    expect(det.abajo.indice).toBe(true)
    correr(det, con({ indice: 5 }), 200, 100)
    expect(det.abajo.indice).toBe(false)
  })
  it('el reposo deriva despacio con los dedos arriba, pero no con un dedo abajo', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano(0))
    correr(det, plano(6), 0, 8000)
    expect(det.reposo!.indice).toBeGreaterThan(3)
    expect(det.reposo!.indice).toBeLessThan(6.1)
    const antes = det.reposo!.medio
    correr(det, con({ medio: 60 }, 6), 8000, 4000)
    expect(det.reposo!.medio).toBeCloseTo(antes, 5)
  })
  it('un dedo que no vuelve a menos de 11° del reposo se da por subido al recuperar parte de su recorrido', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, plano(), 0, 300)
    let r = correr(det, con({ indice: 40 }), 300, 600)
    expect(r.pulsacion?.abajo).toEqual(['indice'])
    r = correr(det, con({ indice: 14 }), r.t, 300) // extensión limitada: queda a 14° (>11°) pero recuperó 26 de 40°
    expect(det.abajo.indice).toBe(false)
    expect(det.fase).toBe('reposo')
    r = correr(det, con({ indice: 14, medio: 45 }), r.t, 600) // la siguiente nota ya se puede tocar
    expect(r.pulsacion?.abajo).toEqual(['medio'])
  })
  it('recuperar poco del recorrido no suelta el dedo, y soltarlo no deja volver a bajar sin cruzar el umbral de bajada', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, con({ indice: 40 }), 0, 300)
    correr(det, con({ indice: 25 }), 300, 300) // recuperó 15 de 40° (37%)
    expect(det.abajo.indice).toBe(true)
    correr(det, con({ indice: 14 }), 600, 100)
    expect(det.abajo.indice).toBe(false)
    correr(det, con({ indice: 20 }), 700, 300) // sigue bajo el umbral de bajada (22°): no vuelve a contar
    expect(det.abajo.indice).toBe(false)
  })
  it('con un recorrido enorme, el límite de subida sigue por debajo del umbral de bajada', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, con({ indice: 100 }), 0, 300)
    correr(det, con({ indice: 19 }), 300, 100) // 60% de 100° sería 40°, pero nunca más que 18°
    expect(det.abajo.indice).toBe(true)
    correr(det, con({ indice: 17 }), 400, 100)
    expect(det.abajo.indice).toBe(false)
  })
  it('perder la mano olvida la pulsación en curso', () => {
    const det = new DetectorMano()
    det.fijarReposo(plano())
    correr(det, plano(), 0, 100)
    correr(det, con({ indice: 50 }), 100, 100)
    det.perder()
    expect(det.hayAbajo()).toBe(false)
    expect(det.fase).toBe('reposo')
  })
})

describe('independenciaPct', () => {
  it('1 − movimiento medio de los otros / movimiento del pedido', () => {
    expect(independenciaPct(mov({ medio: 40 }), 'medio')).toBe(100)
    expect(independenciaPct(mov({ medio: 40, anular: 40 }), 'medio')).toBeCloseTo(75, 5) // (40/4)/40 = 0,25
    expect(independenciaPct(mov({ medio: 40, anular: 20, menique: 10, indice: 10 }), 'medio')).toBeCloseTo(75, 5)
  })
  it('se recorta a 0..100 y sin movimiento del pedido es 0', () => {
    expect(independenciaPct(mov({ medio: 10, anular: 80, indice: 80, menique: 80, pulgar: 80 }), 'medio')).toBe(0)
    expect(independenciaPct(plano(), 'medio')).toBe(0)
  })
})

describe('niveles', () => {
  it('nivel 1: una mano, índice y medio, ritmo lento y ventana amplia; nivel 5: dos manos, cinco dedos, rápido y estrecho', () => {
    const n1 = NIVELES_PIANO[1]
    const n3 = NIVELES_PIANO[3]
    const n5 = NIVELES_PIANO[5]
    expect([n1.manos, n1.dedos]).toEqual([1, 2])
    expect([n3.manos, n3.dedos]).toEqual([1, 5])
    expect([n5.manos, n5.dedos]).toEqual([2, 5])
    expect(n1.intervaloMs).toBeGreaterThan(n3.intervaloMs)
    expect(n3.intervaloMs).toBeGreaterThan(n5.intervaloMs)
    expect(n1.ventanaMs).toBeGreaterThan(n3.ventanaMs)
    expect(n3.ventanaMs).toBeGreaterThan(n5.ventanaMs)
    for (const n of [1, 2, 3, 4, 5] as const) {
      const v = NIVELES_PIANO[n]
      expect(v.ventanaMs * 2).toBeLessThan(v.intervaloMs) // las ventanas de dos notas no se pisan
      expect(v.nombre.length + v.detalle.length).toBeGreaterThan(10)
    }
  })
  it('nivelPiano acota y ladosDelNivel elige las manos', () => {
    expect(nivelPiano(0)).toBe(NIVELES_PIANO[1])
    expect(nivelPiano(9)).toBe(NIVELES_PIANO[5])
    expect(ladosDelNivel(NIVELES_PIANO[1], 'izquierda')).toEqual(['izquierda'])
    expect(ladosDelNivel(NIVELES_PIANO[3], 'ambas')).toEqual(['derecha'])
    expect(ladosDelNivel(NIVELES_PIANO[5], 'izquierda')).toEqual(['derecha', 'izquierda'])
  })
})

describe('Juez: partitura', () => {
  it('nivel 1: solo índice y medio, una mano, a ritmo fijo y exactamente `total` notas', () => {
    const n = NIVELES_PIANO[1]
    const j = new Juez(n, ['derecha'], rng, 6, 1000)
    const evs: EventoPiano[] = []
    for (let t = 0; t < 40_000; t += 100) evs.push(...j.avanzar(t))
    const notas = j.notas
    expect(notas).toHaveLength(6)
    expect(notas.every((x) => x.lado === 'derecha' && (x.dedo === 'indice' || x.dedo === 'medio'))).toBe(true)
    notas.forEach((x, i) => {
      expect(x.tMs).toBe(1000 + n.caidaMs + i * n.intervaloMs)
      expect(x.apareceMs).toBe(1000 + i * n.intervaloMs)
    })
    for (let i = 1; i < notas.length; i++) expect(notas[i].dedo !== notas[i - 1].dedo).toBe(true) // nunca el mismo dedo dos veces seguidas
    expect(evs.filter((e) => e.tipo === 'nota_mostrada')).toHaveLength(6)
    expect(evs.filter((e) => e.tipo === 'nota_perdida')).toHaveLength(6)
  })
  it('nivel 3 usa los cinco dedos y el nivel 5 las dos manos', () => {
    const j3 = new Juez(NIVELES_PIANO[3], ['derecha'], rng, 80, 0)
    j3.avanzar(80 * NIVELES_PIANO[3].intervaloMs)
    expect(new Set(j3.notas.map((x) => x.dedo))).toEqual(new Set(DEDOS_PIANO))
    const j5 = new Juez(NIVELES_PIANO[5], ['derecha', 'izquierda'], rng, 60, 0)
    j5.avanzar(60 * NIVELES_PIANO[5].intervaloMs)
    expect(new Set(j5.notas.map((x) => x.lado))).toEqual(new Set(['derecha', 'izquierda']))
  })
  it('es determinista con la misma semilla y sin tope (total 0) sigue generando', () => {
    const hacer = () => {
      let s = 3
      const r = () => ((s = (s * 48271) % 2147483647) / 2147483647)
      const j = new Juez(NIVELES_PIANO[3], ['derecha'], r, 0, 0)
      j.avanzar(100_000)
      return j.notas.map((x) => x.dedo).join(',')
    }
    expect(hacer()).toBe(hacer())
    expect(hacer().split(',').length).toBeGreaterThan(30)
  })
  it('atrasar corre las notas abiertas y las siguientes', () => {
    const n = NIVELES_PIANO[1]
    const j = new Juez(n, ['derecha'], rng, 3, 0)
    j.avanzar(100)
    const antes = j.notas[0].tMs
    j.atrasar(5000)
    expect(j.notas[0].tMs).toBe(antes + 5000)
    j.avanzar(5000 + n.intervaloMs + 10)
    expect(j.notas[1].apareceMs).toBe(5000 + n.intervaloMs)
  })
})

describe('pausa para fijar el reposo', () => {
  it('apretar "Fijar reposo" dos veces conserva el primer instante de pausa', () => {
    expect(inicioPausa(null, 1000)).toBe(1000)
    expect(inicioPausa(1000, 3000)).toBe(1000)
  })
  it('con el instante conservado las notas no vuelven ya vencidas (con el segundo sí)', () => {
    const n = NIVELES_PIANO[1]
    const armar = () => {
      const j = new Juez(n, ['derecha'], rng, 3, 0)
      j.avanzar(100)
      return j
    }
    const reloj = 6000
    const bien = armar()
    let pausa = inicioPausa(null, 1000)
    pausa = inicioPausa(pausa, 3000) // segundo toque durante la calibración
    bien.atrasar(reloj - pausa)
    expect(bien.notas[0].tMs).toBe(n.caidaMs + 5000)
    const mal = armar()
    mal.atrasar(reloj - 3000) // lo que pasaba antes: se perdían 2 s de atraso
    expect(mal.notas[0].tMs).toBeLessThan(bien.notas[0].tMs)
  })
})

describe('botón de sonido (iOS: contexto suspendido)', () => {
  it('se ve silenciado mientras el contexto no corre, aunque el paciente no lo haya silenciado', () => {
    expect(botonSilenciado(false, 'running')).toBe(false)
    expect(botonSilenciado(false, 'suspended')).toBe(true)
    expect(botonSilenciado(false, null)).toBe(true)
    expect(botonSilenciado(true, 'running')).toBe(true)
  })
  it('el toque desbloquea cuando el contexto no corre y solo silencia cuando suena', () => {
    expect(accionToqueSonido(false, 'suspended')).toEqual({ silencio: false, desbloquear: true })
    expect(accionToqueSonido(false, null)).toEqual({ silencio: false, desbloquear: true })
    expect(accionToqueSonido(true, 'suspended')).toEqual({ silencio: false, desbloquear: true })
    expect(accionToqueSonido(false, 'running')).toEqual({ silencio: true, desbloquear: false })
  })
})

/** Juez de nivel 3 con una sola nota conocida del dedo `dedo`, ya mostrada. */
function juezCon(dedo: Dedo, nivel = NIVELES_PIANO[3]) {
  const j = new Juez(nivel, ['derecha'], () => 0, 1, 0)
  j.avanzar(0)
  j.notas[0].dedo = dedo
  return { j, nota: j.notas[0] }
}
const pul = (t: number, abajo: Dedo[], movimiento: Partial<Flexiones>): Pulsacion => ({ t, abajo, movimiento: mov(movimiento) })

describe('Juez: pulsaciones', () => {
  it('solo el dedo pedido, en la ventana: acierto con desfase e independencia', () => {
    const { j, nota } = juezCon('medio')
    const evs = j.pulsacion('derecha', pul(nota.tMs + 120, ['medio'], { medio: 45, indice: 1, anular: 2 }))
    expect(evs).toHaveLength(1)
    const e = evs[0]
    expect(e.tipo).toBe('acierto')
    if (e.tipo !== 'acierto') return
    expect(e.desfaseMs).toBe(120)
    expect(e.independencia).toBeGreaterThan(95)
    expect(nota.estado).toBe('acierto')
  })
  it('un dedo antes de la línea (adelantado) da desfase negativo; fuera de la ventana no hace nada', () => {
    const { j, nota } = juezCon('indice')
    expect(j.pulsacion('derecha', pul(nota.tMs - NIVELES_PIANO[3].ventanaMs - 50, ['indice'], { indice: 40 }))).toEqual([])
    const e = j.pulsacion('derecha', pul(nota.tMs - 200, ['indice'], { indice: 40 }))[0]
    expect(e.tipo === 'acierto' && e.desfaseMs).toBe(-200)
  })
  it('dos dedos a la vez NO es acierto limpio: dedo_equivocado, la independencia baja y la nota sigue abierta', () => {
    const { j, nota } = juezCon('medio')
    const evs = j.pulsacion('derecha', pul(nota.tMs, ['medio', 'anular'], { medio: 40, anular: 40 }))
    expect(evs.map((e) => e.tipo)).toEqual(['independencia', 'dedo_equivocado'])
    expect(evs[0].tipo === 'independencia' && evs[0].valor).toBeCloseTo(75, 5)
    const eq = evs[1]
    expect(eq.tipo === 'dedo_equivocado' && eq.dedo).toBe('anular')
    expect(eq.tipo === 'dedo_equivocado' && eq.simultaneo).toBe(true)
    expect(nota.estado).toBe('pendiente')
    expect(nota.error).toBe(true)
    // se puede repetir limpio dentro de la misma ventana
    const e2 = j.pulsacion('derecha', pul(nota.tMs + 400, ['medio'], { medio: 40 }))[0]
    expect(e2.tipo).toBe('acierto')
  })
  it('un dedo distinto del pedido es dedo_equivocado (no acierto) y la nota sigue abierta', () => {
    const { j, nota } = juezCon('medio')
    const evs = j.pulsacion('derecha', pul(nota.tMs, ['menique'], { menique: 45 }))
    expect(evs).toHaveLength(1)
    expect(evs[0].tipo === 'dedo_equivocado' && evs[0].dedo).toBe('menique')
    expect(evs[0].tipo === 'dedo_equivocado' && evs[0].simultaneo).toBe(false)
    expect(nota.estado).toBe('pendiente')
  })
  it('sin acierto hasta el fin de la ventana: nota_perdida; si hay una pulsación en curso se espera a que cierre', () => {
    const v = NIVELES_PIANO[3].ventanaMs
    const { j, nota } = juezCon('anular')
    expect(j.avanzar(nota.tMs + v - 1)).toEqual([])
    expect(j.avanzar(nota.tMs + v + 1, () => true)).toEqual([]) // mano ocupada: espera
    const evs = j.avanzar(nota.tMs + v + 1)
    expect(evs.map((e) => e.tipo)).toEqual(['nota_perdida'])
    expect(nota.estado).toBe('perdida')
    // aun ocupada, no espera para siempre
    const o = juezCon('anular')
    expect(o.j.avanzar(o.nota.tMs + v + 1_000, () => true).map((e) => e.tipo)).toEqual(['nota_perdida'])
  })
  it('las pulsaciones de otra mano no tocan la nota', () => {
    const { j, nota } = juezCon('indice')
    expect(j.pulsacion('izquierda', pul(nota.tMs, ['indice'], { indice: 40 }))).toEqual([])
    expect(nota.estado).toBe('pendiente')
  })
  it('contador de resueltas y pendientes', () => {
    const j = new Juez(NIVELES_PIANO[1], ['derecha'], rng, 3, 0)
    j.avanzar(100)
    expect(j.pendientes()).toHaveLength(1)
    j.pulsacion('derecha', pul(j.notas[0].tMs, [j.notas[0].dedo], { [j.notas[0].dedo]: 40 }))
    expect(j.resueltas).toBe(1)
  })
})

describe('Juez: la meta cuenta aciertos, no notas resueltas', () => {
  const N = NIVELES_PIANO[1]
  /** Corre la partitura completa de `total` notas; `acertar(i)` decide si la nota i se toca bien. */
  function partitura(total: number, acertar: (i: number) => boolean) {
    const j = new Juez(N, ['derecha'], rng, total, 0)
    for (let t = 0; t <= N.caidaMs + total * N.intervaloMs + N.ventanaMs + 1000; t += 50) {
      j.avanzar(t)
      const n = j.activa('derecha', t)
      if (n && t >= n.tMs && acertar(n.i)) j.pulsacion('derecha', pul(t, [n.dedo], { [n.dedo]: 40 }))
    }
    return j
  }
  it('sin ningún acierto la partitura termina (todas perdidas) pero la meta NO se cumple', () => {
    const j = partitura(4, () => false)
    expect(j.resueltas).toBe(4)
    expect(j.completa).toBe(true) // el juego termina igual
    expect(j.aciertos).toBe(0) // contador que ve la base: 0/4 → metaCumplida false
    expect(j.aciertos >= j.total).toBe(false)
  })
  it('con algunas perdidas el contador son solo los aciertos y la meta sigue sin cumplirse', () => {
    const j = partitura(4, (i) => i % 2 === 0)
    expect(j.completa).toBe(true)
    expect(j.notas.map((n) => n.estado)).toEqual(['acierto', 'perdida', 'acierto', 'perdida'])
    expect(j.aciertos).toBe(2)
    expect(j.aciertos >= j.total).toBe(false)
  })
  it('acertando todas se cumple la meta; a medio camino ni termina ni la cumple', () => {
    const j = partitura(3, () => true)
    expect(j.aciertos).toBe(3)
    expect(j.completa).toBe(true)
    expect(j.aciertos >= j.total).toBe(true)
    const medio = new Juez(N, ['derecha'], rng, 3, 0)
    medio.avanzar(100)
    medio.pulsacion('derecha', pul(medio.notas[0].tMs, [medio.notas[0].dedo], { [medio.notas[0].dedo]: 40 }))
    expect([medio.aciertos, medio.completa]).toEqual([1, false])
  })
  it('sin tope (práctica libre) nunca está completa', () => {
    const j = new Juez(N, ['derecha'], rng, 0, 0)
    j.avanzar(60_000)
    expect(j.resueltas).toBeGreaterThan(5)
    expect(j.completa).toBe(false)
    expect(ESPERA_FIN_MS).toBeGreaterThan(0)
  })
})

describe('sin mano la partitura no corre', () => {
  it('relojPartitura solo avanza con alguna mano del juego a la vista', () => {
    expect(relojPartitura(1000, 16, true)).toBe(1016)
    expect(relojPartitura(1000, 16, false)).toBe(1000)
    expect(relojPartitura(1000, -5, true)).toBe(1000)
  })
  it('la mano se pierde con una nota abierta: no hay nota_perdida mientras no se ve ni al volver, y se puede acertar', () => {
    const N = NIVELES_PIANO[1]
    const j = new Juez(N, ['derecha'], rng, 4, 0)
    const evs: EventoPiano[] = []
    let reloj = 0
    const cuadro = (hayMano: boolean) => {
      reloj = relojPartitura(reloj, 16, hayMano)
      evs.push(...j.avanzar(reloj))
    }
    // Con la mano: corre hasta que la primera nota llega a la línea.
    while (reloj < N.caidaMs) cuadro(true)
    const nota = j.notas[0]
    expect(j.activa('derecha', reloj)).toBe(nota)
    // 2 s sin mano (lo que tarda la base en pausar), mucho más que la ventana que quedaba: el reloj queda quieto.
    const antes = reloj
    for (let i = 0; i < 125; i++) cuadro(false)
    expect(reloj).toBe(antes)
    expect(evs.filter((e) => e.tipo === 'nota_perdida')).toEqual([])
    expect(j.notas).toHaveLength(1) // tampoco cayeron notas nuevas
    // Vuelve la mano: la nota sigue abierta y se puede acertar.
    cuadro(true)
    expect(nota.estado).toBe('pendiente')
    expect(j.pulsacion('derecha', pul(reloj, [nota.dedo], { [nota.dedo]: 40 })).map((e) => e.tipo)).toEqual(['acierto'])
    // Con el reloj corriendo sin congelar (lo que pasaba antes) esa misma nota se habría perdido.
    const sinCongelar = new Juez(N, ['derecha'], rng, 4, 0)
    sinCongelar.avanzar(N.caidaMs)
    expect(sinCongelar.avanzar(N.caidaMs + 2000).map((e) => e.tipo)).toContain('nota_perdida')
  })
})

describe('AgregadoPiano', () => {
  it('cuenta aciertos, perdidas, equivocados; independencia por dedo, desfase medio y errores por dedo', () => {
    const { j, nota } = juezCon('medio')
    const a = new AgregadoPiano()
    const alimentar = (evs: EventoPiano[]) => evs.forEach((e) => a.evento(e))
    // 1.ª pulsación: medio + anular (no limpio); 2.ª: medio solo (acierto), desfase +200
    alimentar(j.pulsacion('derecha', pul(nota.tMs, ['medio', 'anular'], { medio: 40, anular: 40 })))
    alimentar(j.pulsacion('derecha', pul(nota.tMs + 200, ['medio'], { medio: 40 })))
    // otra nota del índice que se pierde
    const j2 = new Juez(NIVELES_PIANO[3], ['derecha'], () => 0, 1, 0)
    j2.avanzar(0)
    j2.notas[0].dedo = 'indice'
    alimentar(j2.avanzar(10_000))
    const r = a.resumen()
    expect(r.aciertos).toBe(1)
    expect(r.notasPerdidas).toBe(1)
    expect(r.dedosEquivocados).toBe(1)
    expect(r.independenciaMedio).toBe(88) // (75 + 100) / 2 = 87,5 redondeado
    expect(r.independenciaIndice).toBeNull()
    expect(r.desfaseMedio).toBe(200)
    expect(r.erroresMedio).toBe(1) // la nota del medio tuvo un dedo de más: un solo error aunque se repitió limpio
    expect(r.erroresIndice).toBe(1) // la nota perdida
    expect(r.erroresAnular).toBe(0)
    expect(a.independencia()).toBeCloseTo(87.5, 0)
    expect(a.independenciaReciente()).toBeCloseTo(87.5, 0)
  })
  it('la independencia de un dedo baja si se baja otro a la vez (criterio de aceptación)', () => {
    const limpio = new AgregadoPiano()
    const sucio = new AgregadoPiano()
    for (const [ag, mv] of [[limpio, { medio: 40 }], [sucio, { medio: 40, anular: 40 }]] as const) {
      const { j, nota } = juezCon('medio')
      j.pulsacion('derecha', pul(nota.tMs, mv.anular ? ['medio', 'anular'] : ['medio'], mv)).forEach((e) => ag.evento(e))
    }
    expect(limpio.independenciaDedo('medio')).toBe(100)
    expect(sucio.independenciaDedo('medio')).toBeLessThan(limpio.independenciaDedo('medio')!)
    expect(limpio.aciertos).toBe(1)
    expect(sucio.aciertos).toBe(0)
  })
  it('sin datos todo es null y los conteos 0', () => {
    const r = new AgregadoPiano().resumen()
    expect(r.independencia).toBeNull()
    expect(r.desfaseMedio).toBeNull()
    expect(r.aciertos).toBe(0)
  })
})

it('el episodio dura lo que dice la constante', () => {
  expect(EPISODIO_MS).toBeGreaterThan(100)
})

describe('teclas y notas', () => {
  it('separarTeclas respeta el orden de los dedos, la separación mínima y el centro', () => {
    const r = separarTeclas({ pulgar: -0.2, indice: -0.1, medio: 0, anular: 0.05, menique: 0.12 }, 0.25)
    const orden = ['pulgar', 'indice', 'medio', 'anular', 'menique'] as Dedo[]
    for (let i = 1; i < orden.length; i++) expect(r[orden[i]] - r[orden[i - 1]]).toBeGreaterThanOrEqual(0.25 - 1e-9)
    expect(orden.reduce((s, d) => s + r[d], 0) / 5).toBeCloseTo((-0.2 - 0.1 + 0 + 0.05 + 0.12) / 5, 9)
    // mano izquierda: el pulgar queda a la derecha
    const z = separarTeclas({ pulgar: 0.2, indice: 0.1, medio: 0, anular: -0.05, menique: -0.12 }, 0.25)
    expect(z.pulgar).toBeGreaterThan(z.menique)
  })
  it('separarTeclas acerca una tecla muy apartada (el pulgar) con huecoMax sin romper el orden', () => {
    const r = separarTeclas({ pulgar: -0.9, indice: -0.1, medio: 0, anular: 0.1, menique: 0.2 }, 0.25, 0.36)
    expect(r.indice - r.pulgar).toBeCloseTo(0.36, 9)
    expect(r.medio - r.indice).toBeGreaterThanOrEqual(0.25 - 1e-9)
  })
  it('cada dedo suena distinto y la izquierda una octava abajo', () => {
    const f = DEDOS_PIANO.map((d) => frecuenciaNota(d, 'derecha'))
    expect(new Set(f).size).toBe(5)
    expect(frecuenciaNota('medio', 'izquierda') * 2).toBeCloseTo(frecuenciaNota('medio', 'derecha'), 9)
  })
})
