import { describe, expect, it } from 'vitest'
import { CORENGTH_5KG, conTiras } from '../../banda/curva'
import { ANCHO_ZONA, SesionHonda, alcanceCorto, bandaConfigurada, nivelHonda, resultadoDe, zonaDe, type EventoHonda } from './logica'

const curva = conTiras(CORENGTH_5KG, 2)
const CPS = 30
const REPOSO = 30

/** Pasa un tramo de `ms` en que el estiramiento (fracción sobre el reposo) va de `desde` a `hasta` en línea recta. */
function tramo(s: SesionHonda, r: { t: number }, ms: number, desde: number, hasta = desde): EventoHonda[] {
  const n = Math.round((ms / 1000) * CPS)
  const ev: EventoHonda[] = []
  for (let i = 0; i < n; i++) {
    r.t += 1000 / CPS
    ev.push(...s.paso(r.t, REPOSO * (1 + desde + ((hasta - desde) * (i + 1)) / n)))
  }
  return ev
}

/** Un tiro: quieta 1 s, estirar hasta `e` en 1 s, sostener `sosten` ms, soltar en 0,3 s y quieta 1,5 s. */
function tiro(s: SesionHonda, r: { t: number }, e: number, sosten: number) {
  return [...tramo(s, r, 1000, 0), ...tramo(s, r, 1000, 0, e), ...tramo(s, r, sosten, e), ...tramo(s, r, 300, e, 0), ...tramo(s, r, 1500, 0)]
}

function nueva(nivel = 3) {
  const s = new SesionHonda(curva, nivelHonda(nivel))
  const r = { t: 0 }
  const ev = tramo(s, r, 3000, 0)
  return { s, r, ev }
}

describe('honda: la zona verde y el tiro', () => {
  it('la zona sale del estiramiento del nivel y de la curva de la banda', () => {
    const z = zonaDe(nivelHonda(3), curva)
    expect(z.minKg).toBeCloseTo(4.0, 0)
    expect(z.maxKg).toBeGreaterThan(z.minKg + 0.5)
    // Con el doble de tiras, el mismo nivel carga el doble.
    expect(zonaDe(nivelHonda(3), conTiras(CORENGTH_5KG, 4)).minKg).toBeCloseTo(2 * z.minKg, 5)
    expect(ANCHO_ZONA).toBeGreaterThanOrEqual(0.3)
    // Curvas malas (vacía, o plana desde antes de la zona): igual queda una zona jugable.
    const vacia = zonaDe(nivelHonda(3), { puntos: [] })
    expect(vacia.minKg).toBeGreaterThan(0)
    expect(vacia.maxKg).toBeGreaterThan(vacia.minKg)
    const plana = zonaDe(nivelHonda(3), { puntos: [{ estiramiento: 0.2, kg: 2 }, { estiramiento: 0.4, kg: 2 }] })
    expect(plana.maxKg).toBeGreaterThan(plana.minKg)
  })

  it('marca el cero solo con la banda quieta y queda lista', () => {
    const { s, ev } = nueva()
    expect(ev.some((e) => e.tipo === 'reposo')).toBe(true)
    expect(s.fase).toBe('listo')
    expect(s.kg).toBe(0)
  })

  it('estirar hasta la zona y sostener es un acierto: la piedra sale sola al cumplir el sostén', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 1000, 0, 0.85)
    const sosten = tramo(s, r, 1400, 0.85)
    expect(sosten.map((e) => e.tipo)).toEqual(expect.arrayContaining(['sostenido', 'tiro']))
    expect(s.tiros[0]).toMatchObject({ resultado: 'acierto', sePaso: false })
    expect(s.tiros[0].sostenidoS).toBeGreaterThanOrEqual(1)
    expect(s.tiros[0].picoEstiramiento).toBeCloseTo(0.85, 1)
    // La banda sigue estirada: no sale otro tiro y la fase pide volver al centro.
    expect(s.fase).toBe('volver')
    tramo(s, r, 2500, 0.85)
    expect(s.tiros).toHaveLength(1)
    tramo(s, r, 300, 0.85, 0)
    tramo(s, r, 1000, 0)
    expect(s.fase).toBe('listo')
    expect(s.tiros).toHaveLength(1)
  })

  it('llegar pero soltar antes de tiempo no acierta', () => {
    const { s, r } = nueva(3)
    tiro(s, r, 0.85, 300)
    expect(s.tiros[0].resultado).toBe('sin-sostener')
  })

  it('no llegar es corto, y pasar de largo sin sostener es largo', () => {
    const { s, r } = nueva(3)
    tiro(s, r, 0.45, 1500)
    tiro(s, r, 1.5, 1500)
    expect(s.tiros.map((t) => t.resultado)).toEqual(['corto', 'largo'])
    expect(s.tiros[1].sePaso).toBe(true)
  })

  it('pasarse y volver a la zona para sostener es un acierto (prueba real: se pasaba y volvía)', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 1000, 0)
    tramo(s, r, 800, 0, 1.6)
    expect(s.fase).toBe('pasado')
    // Volver a la zona no dispara el tiro por sí solo; sale al cumplir el sostén.
    expect(tramo(s, r, 600, 1.6, 0.9).some((e) => e.tipo === 'tiro')).toBe(false)
    const sosten = tramo(s, r, 1400, 0.9)
    expect(sosten.filter((e) => e.tipo === 'tiro')).toHaveLength(1)
    tramo(s, r, 300, 0.9, 0)
    expect(s.tiros).toHaveLength(1)
    expect(s.tiros[0]).toMatchObject({ resultado: 'acierto', sePaso: true })
  })

  it('juntar las manos entre tiros (banda suelta) no baja el reposo (prueba real: se leían 14 kg)', () => {
    const { s, r } = nueva(3)
    tiro(s, r, 0.85, 1300)
    // Manos juntas 4 s: la mitad del largo en reposo.
    tramo(s, r, 4000, -0.5)
    expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO, 0)
    tiro(s, r, 0.85, 1300)
    expect(s.tiros).toHaveLength(2)
    expect(s.tiros[1].picoEstiramiento).toBeCloseTo(0.85, 1)
    expect(s.tiros[1].resultado).toBe('acierto')
  })

  it('si la banda vuelve un poco más larga y queda quieta, ese es el nuevo reposo y el tiro siguiente se arma', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 1000, 0, 0.85)
    tramo(s, r, 1300, 0.85)
    tramo(s, r, 300, 0.85, 0.08)
    tramo(s, r, 2000, 0.08)
    expect(s.tiros).toHaveLength(1)
    expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO * 1.08, 0)
    expect(s.kg).toBe(0)
    expect(s.fase).toBe('listo')
  })

  it('sostener en el borde bajo de la zona no se toma por reposo nuevo (nivel 1)', () => {
    const { s, r } = nueva(1)
    tramo(s, r, 1000, 0)
    tramo(s, r, 700, 0, 0.95)
    tramo(s, r, 600, 0.95, 0.33)
    const sosten = tramo(s, r, 2500, 0.33)
    expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO, 0)
    expect(sosten.some((e) => e.tipo === 'sostenido')).toBe(true)
    tramo(s, r, 300, 0.33, 0)
    expect(s.tiros[0].resultado).toBe('acierto')
  })

  it('un salto del seguimiento de pocos cuadros no es un tiro (prueba real: 11 «tiros» de 0,1 s)', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 500, 0)
    // Tres cuadros con el largo al doble (se coló otra mano) y vuelve.
    for (let i = 0; i < 3; i++) s.paso((r.t += 1000 / CPS), REPOSO * 2)
    tramo(s, r, 1000, 0)
    expect(s.tiros).toHaveLength(0)
    // Un tirón real pero de 0,2 s tampoco cuenta.
    tramo(s, r, 100, 0, 0.5)
    tramo(s, r, 100, 0.5, 0)
    tramo(s, r, 1000, 0)
    expect(s.tiros).toHaveLength(0)
    // Y después de eso un tiro normal sí cuenta.
    tiro(s, r, 0.85, 1300)
    expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto'])
  })

  it('una medida imposible avisa que el cero quedó mal y no cuenta como tiro', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 1500, 0, 2.6)
    tramo(s, r, 500, 2.6)
    expect(s.ceroDudoso).toBe(true)
    tramo(s, r, 600, 2.6, 0)
    tramo(s, r, 1000, 0)
    expect(s.tiros).toHaveLength(0)
    s.pedirCero()
    expect(s.ceroDudoso).toBe(false)
    tramo(s, r, 1200, 0)
    expect(s.fase).toBe('listo')
  })

  it('con el ruido de una cámara real (temblor, cuadros perdidos) cuenta bien 12 tiros sostenidos cerca del borde', () => {
    // Generador con semilla, para que la prueba sea siempre la misma.
    let semilla = 12345
    const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const gauss = () => Math.sqrt(-2 * Math.log(azar() + 1e-9)) * Math.cos(2 * Math.PI * azar())
    const s = new SesionHonda(curva, nivelHonda(3))
    const r = { t: 0 }
    const ruidoso = (ms: number, desde: number, hasta = desde) => {
      const n = Math.round((ms / 1000) * CPS)
      for (let i = 0; i < n; i++) {
        r.t += 1000 / CPS
        const e = desde + ((hasta - desde) * (i + 1)) / n
        // 1,2 % de ruido por cuadro (medido: 0,7–0,8 %), y 3 % de los cuadros sin una mano.
        s.paso(r.t, azar() < 0.03 ? null : REPOSO * (1 + e) * (1 + 0.012 * gauss()))
      }
    }
    ruidoso(3000, 0)
    expect(s.seguidor.reposoCm).not.toBeNull()
    for (let i = 0; i < 12; i++) {
      ruidoso(900, 0, 0.74)
      ruidoso(1600, 0.74)
      ruidoso(300, 0.74, 0.03)
      ruidoso(1400, 0.03)
    }
    expect(s.tiros).toHaveLength(12)
    expect(s.aciertos).toBeGreaterThanOrEqual(11)
    expect(s.ceroDudoso).toBe(false)
  })

  it('un temblor de un instante fuera de la zona no corta el sostén, pero salir de verdad sí', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 800, 0, 0.8)
    tramo(s, r, 500, 0.8)
    // 100 ms bajo la zona y vuelve: el sostén sigue.
    tramo(s, r, 100, 0.6)
    const sigue = tramo(s, r, 700, 0.8)
    expect(sigue.some((e) => e.tipo === 'sostenido')).toBe(true)
    tramo(s, r, 300, 0.8, 0)
    tramo(s, r, 1200, 0)
    // Medio segundo fuera: el sostén parte de nuevo y no alcanza.
    tramo(s, r, 800, 0, 0.8)
    tramo(s, r, 500, 0.8)
    tramo(s, r, 600, 0.55)
    tramo(s, r, 500, 0.8)
    tramo(s, r, 300, 0.8, 0)
    expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto', 'sin-sostener'])
  })

  it('el cero se marca en 1,5 s aunque la banda oscile como en la mano (grabación real: tardaba 7 s)', () => {
    const s = new SesionHonda(curva, nivelHonda(3))
    const r = { t: 0 }
    // Oscila ±4 % (pico a pico 8 %) con período de 1,2 s.
    for (let i = 0; i < 60; i++) s.paso((r.t += 1000 / CPS), REPOSO * (1 + 0.04 * Math.sin((i / CPS) * ((2 * Math.PI) / 1.2))))
    expect(s.seguidor.reposoCm).not.toBeNull()
    expect(s.seguidor.reposoCm!).toBeGreaterThan(REPOSO * 0.96)
    expect(s.seguidor.reposoCm!).toBeLessThan(REPOSO * 1.04)
  })

  it('una pausa no cuenta como tiempo quieto ni como tiempo sostenido', () => {
    // El cero no se marca con dos muestras a los lados de una pausa de 5 s.
    const a = new SesionHonda(curva, nivelHonda(3))
    a.paso(1000, REPOSO)
    a.paso(1033, REPOSO)
    a.paso(6000, REPOSO)
    a.paso(6033, REPOSO)
    expect(a.seguidor.reposoCm).toBeNull()
    // Sostener 0,3 s, pausa de 1,5 s y 0,3 s más no completa 1 s de sostén; hay que sostenerlo de nuevo.
    const { s, r } = nueva(3)
    tramo(s, r, 800, 0, 0.85)
    tramo(s, r, 300, 0.85)
    r.t += 1500
    const tras = tramo(s, r, 400, 0.85)
    expect(tras.some((e) => e.tipo === 'sostenido')).toBe(false)
    expect(tramo(s, r, 900, 0.85).some((e) => e.tipo === 'sostenido')).toBe(true)
    tramo(s, r, 300, 0.85, 0)
    expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto'])
    // Tras una pausa larga a mitad de un estirón, ese tiro se descarta y el siguiente cuenta normal.
    tramo(s, r, 1500, 0)
    tramo(s, r, 800, 0, 0.85)
    r.t += 4000
    tramo(s, r, 300, 0.85, 0)
    tramo(s, r, 1500, 0)
    expect(s.tiros).toHaveLength(1)
    tiro(s, r, 0.85, 1300)
    expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto', 'acierto'])
  })

  describe('casos de la revisión independiente del 22-nov-2026', () => {
    it('con el cero marcado con la banda colgando, el tiro igual sale y el cero se corrige solo', () => {
      // El cero queda en 30 cm con la banda suelta; la banda recién tensa está a 42 cm (+40 %).
      const { s, r } = nueva(2)
      tramo(s, r, 800, 0, 0.7)
      expect(tramo(s, r, 1300, 0.7).filter((e) => e.tipo === 'tiro')).toHaveLength(1)
      tramo(s, r, 300, 0.7, 0.4)
      tramo(s, r, 3000, 0.4)
      expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto'])
      expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO * 1.4, 0)
      expect(s.kg).toBe(0)
      expect(s.fase).toBe('listo')
    })

    it('si el cero subió porque la persona se detuvo a medio camino, vuelve a bajar hasta el cero marcado', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 800, 0, 0.6)
      tramo(s, r, 400, 0.6, 0.3)
      tramo(s, r, 1500, 0.3)
      expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO * 1.3, 0)
      tramo(s, r, 300, 0.3, 0)
      tramo(s, r, 3500, 0)
      expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO, 0)
      const n = s.tiros.length
      tiro(s, r, 0.85, 1300)
      expect(s.tiros).toHaveLength(n + 1)
      expect(s.tiros[n].resultado).toBe('acierto')
      // Juntar las manos después no lo baja del cero marcado.
      tramo(s, r, 4000, -0.5)
      expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO, 0)
    })

    it('un tiro ya sostenido no se pierde si la banda vuelve a quedar quieta un poco estirada', () => {
      const { s, r } = nueva(2)
      tramo(s, r, 800, 0, 0.6)
      tramo(s, r, 1600, 0.6)
      tramo(s, r, 300, 0.6, 0.28)
      tramo(s, r, 2500, 0.28)
      expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto'])
      expect(s.aciertos).toBe(1)
    })

    it('mientras se pone en cero la fase es «reposo», no «listo»', () => {
      const { s, r } = nueva(3)
      s.pedirCero()
      s.paso((r.t += 33), REPOSO)
      expect(s.fase).toBe('reposo')
      tramo(s, r, 1000, 0)
      expect(s.fase).toBe('listo')
    })

    it('un cuadro perdido a mitad del sostén no hace parpadear la carga a cero', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 800, 0, 0.85)
      tramo(s, r, 400, 0.85)
      const antes = s.kg!
      s.paso((r.t += 33), null)
      expect(s.kg).toBe(antes)
      expect(s.fase).toBe('en-ventana')
    })

    it('el aviso de cero dudoso se apaga con un tiro creíble', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 600, 0, 2.6)
      tramo(s, r, 700, 2.6)
      tramo(s, r, 600, 2.6, 0)
      tramo(s, r, 1500, 0)
      expect(s.ceroDudoso).toBe(true)
      tiro(s, r, 0.85, 1300)
      expect(s.ceroDudoso).toBe(false)
    })

    it('volver a quedar un poco estirado y con temblor tras un acierto no inventa un tiro corto', () => {
      const { s, r } = nueva(1)
      tramo(s, r, 800, 0, 0.45)
      tramo(s, r, 900, 0.45)
      tramo(s, r, 300, 0.45, 0.2)
      // 3 s oscilando ±6 puntos alrededor de +20 %.
      for (let i = 0; i < 90; i++) s.paso((r.t += 1000 / CPS), REPOSO * (1.2 + 0.06 * Math.sin(i / 3)))
      expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto'])
    })

    it('si el reloj vuelve atrás (una grabación que parte de nuevo), el juego sigue contando bien', () => {
      const { s, r } = nueva(3)
      tiro(s, r, 0.85, 1300)
      r.t = 0
      tramo(s, r, 2500, 0)
      tiro(s, r, 0.85, 1300)
      expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto', 'acierto'])
      expect(s.progresoSostener).toBeGreaterThanOrEqual(0)
    })
  })

  describe('el tiro sale solo al cumplir el sostén (pruebas reales: «falla al soltarlo»)', () => {
    it('tras el tiro, otro se arma al volver al centro aunque la banda no llegue justo a cero', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 800, 0, 0.85)
      tramo(s, r, 1300, 0.85)
      expect(s.tiros).toHaveLength(1)
      // Vuelve hasta +6 % (el reposo se corrió un poco) y estira de nuevo de inmediato.
      tramo(s, r, 300, 0.85, 0.06)
      tramo(s, r, 300, 0.06)
      tramo(s, r, 800, 0.06, 0.85)
      tramo(s, r, 1300, 0.85)
      expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto', 'acierto'])
    })

    it('quedarse en la zona moviéndose un poco después del tiro no lanza otro', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 800, 0, 0.85)
      tramo(s, r, 1300, 0.85)
      for (let i = 0; i < 120; i++) s.paso((r.t += 1000 / CPS), REPOSO * (1.85 + 0.1 * Math.sin(i / 4)))
      expect(s.tiros).toHaveLength(1)
      expect(s.fase).toBe('volver')
    })

    it('bajar las manos fuera de la imagen después del tiro no lanza otro, y al volver se arma el siguiente', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 800, 0, 0.85)
      tramo(s, r, 1300, 0.85)
      expect(s.tiros).toHaveLength(1)
      const ev: EventoHonda[] = []
      for (let i = 0; i < 90; i++) ev.push(...s.paso((r.t += 1000 / CPS), null))
      expect(ev.filter((e) => e.tipo === 'tiro')).toHaveLength(0)
      tramo(s, r, 2500, 0)
      tiro(s, r, 0.85, 1300)
      expect(s.tiros.map((t) => t.resultado)).toEqual(['acierto', 'acierto'])
    })

    it('perder las manos sin haber sostenido no inventa un tiro', () => {
      const { s, r } = nueva(3)
      tramo(s, r, 800, 0, 0.85)
      tramo(s, r, 300, 0.85)
      for (let i = 0; i < 100; i++) s.paso((r.t += 1000 / CPS), null)
      expect(s.tiros).toHaveLength(0)
    })
  })

  it('una sesión larga en bucle (60 tiros con ruido de cámara) no se traba ni pierde la cuenta', () => {
    let semilla = 7
    const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const s = new SesionHonda(curva, nivelHonda(3))
    const r = { t: 0 }
    const ruidoso = (ms: number, desde: number, hasta = desde) => {
      const n = Math.round((ms / 1000) * CPS)
      for (let i = 0; i < n; i++) {
        r.t += 1000 / CPS
        const e = desde + ((hasta - desde) * (i + 1)) / n
        s.paso(r.t, azar() < 0.03 ? null : REPOSO * (1 + e) * (1 + 0.01 * (azar() - 0.5) * 2))
      }
    }
    ruidoso(3000, 0)
    const esperado: string[] = []
    for (let i = 0; i < 60; i++) {
      const tipo = i % 3
      const e = tipo === 0 ? 0.85 : tipo === 1 ? 0.45 : 1.4
      ruidoso(800, 0, e)
      ruidoso(tipo === 2 ? 200 : 1300, e)
      ruidoso(300, e, 0)
      ruidoso(1500, 0)
      esperado.push(tipo === 0 ? 'acierto' : tipo === 1 ? 'corto' : 'largo')
    }
    expect(s.tiros).toHaveLength(60)
    expect(s.tiros.map((t) => t.resultado)).toEqual(esperado)
    expect(s.seguidor.reposoCm).toBeCloseTo(REPOSO, 0)
    expect(s.fase).toBe('listo')
    expect(Number.isFinite(s.resumen().tiempoBajoTensionS!)).toBe(true)
  })

  it('el resumen cuenta aciertos, precisión, carga y tiempo bajo tensión', () => {
    const { s, r } = nueva(2)
    tiro(s, r, 0.65, 1300)
    tiro(s, r, 0.7, 1300)
    tiro(s, r, 0.3, 1300)
    const m = s.resumen()
    expect(m.tiros).toBe(3)
    expect(m.aciertos).toBe(2)
    expect(m.precisionPct).toBe(67)
    expect(m.cargaMetaKg).toBeCloseTo(zonaDe(nivelHonda(2), curva).minKg, 1)
    expect(m.cargaMaxKg!).toBeGreaterThan(m.cargaMetaKg!)
    expect(m.tiempoBajoTensionS!).toBeGreaterThan(3)
    expect(m.constanciaPct).not.toBeNull()
    expect(m.estiramientoMaxPct!).toBeGreaterThan(60)
    expect(m.cortos).toBe(1)
    expect(m.largos).toBe(0)
  })

  it('el resultado se decide por la zona y por sostener', () => {
    const zona = { minKg: 2, maxKg: 3 }
    expect(resultadoDe(2.5, zona, true)).toBe('acierto')
    expect(resultadoDe(5, zona, true)).toBe('acierto')
    expect(resultadoDe(1.8, zona, false)).toBe('corto')
    expect(resultadoDe(3.5, zona, false)).toBe('largo')
    expect(resultadoDe(2.5, zona, false)).toBe('sin-sostener')
    expect(alcanceCorto(1, zona)).toBeLessThan(alcanceCorto(1.9, zona))
    expect(alcanceCorto(1.99, zona)).toBeLessThan(0.8)
    expect(alcanceCorto(0.1, zona)).toBeGreaterThanOrEqual(0.3)
  })

  it('usa la banda del laboratorio si hay una guardada en el navegador', () => {
    expect(bandaConfigurada(() => null).origen).toBe('Corength 5 kg × 2 tiras')
    const guardado: Record<string, string> = { 'manoviva.laboratorio.tiras': '4' }
    const c = bandaConfigurada((k) => guardado[k] ?? null)
    expect(c.origen).toBe('Corength 5 kg × 4 tiras')
    expect(c.curva.tiras).toBe(4)
  })
})
