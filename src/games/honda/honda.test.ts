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
  })

  it('marca el cero solo con la banda quieta y queda lista', () => {
    const { s, ev } = nueva()
    expect(ev.some((e) => e.tipo === 'reposo')).toBe(true)
    expect(s.fase).toBe('listo')
    expect(s.kg).toBe(0)
  })

  it('estirar hasta la zona, sostener y soltar es un acierto, y el tiro sale al soltar', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 1000, 0, 0.85)
    const sosten = tramo(s, r, 1400, 0.85)
    expect(sosten.map((e) => e.tipo)).toEqual(expect.arrayContaining(['sostenido']))
    expect(s.fase).toBe('sostenido')
    // Soltar: la banda aún no vuelve al reposo (queda en 20 %) y el tiro ya salió.
    const suelta = tramo(s, r, 250, 0.85, 0.2)
    expect(suelta.filter((e) => e.tipo === 'tiro')).toHaveLength(1)
    expect(s.tiros[0]).toMatchObject({ resultado: 'acierto', sePaso: false })
    expect(s.tiros[0].sostenidoS).toBeGreaterThanOrEqual(1)
    expect(s.tiros[0].picoEstiramiento).toBeCloseTo(0.85, 1)
    tramo(s, r, 1500, 0.2, 0)
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
    // Volver a la zona no dispara el tiro, aunque el pico haya sido alto.
    const vuelta = [...tramo(s, r, 600, 1.6, 0.9), ...tramo(s, r, 1400, 0.9)]
    expect(vuelta.some((e) => e.tipo === 'tiro')).toBe(false)
    expect(vuelta.some((e) => e.tipo === 'sostenido')).toBe(true)
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
    tramo(s, r, 700, 0, 0.75)
    tramo(s, r, 400, 0.75, 0.33)
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
