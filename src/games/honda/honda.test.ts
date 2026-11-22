import { describe, expect, it } from 'vitest'
import { CORENGTH_5KG, conTiras } from '../../banda/curva'
import { SesionHonda, alcanceDe, bandaConfigurada, estiramientoPara, nivelHonda, resultadoDe, type EventoHonda } from './logica'

const curva = conTiras(CORENGTH_5KG, 2)
const CPS = 30
const REPOSO = 30

/** Simula la banda: largo en cm que da esa carga con la curva. */
const largoPara = (kg: number) => (kg <= 0 ? REPOSO : REPOSO * (1 + estiramientoPara(curva, kg)))

function tramo(s: SesionHonda, r: { t: number }, ms: number, desdeKg: number, hastaKg = desdeKg): EventoHonda[] {
  const n = Math.round((ms / 1000) * CPS)
  const ev: EventoHonda[] = []
  for (let i = 0; i < n; i++) {
    r.t += 1000 / CPS
    const kg = desdeKg + ((hastaKg - desdeKg) * (i + 1)) / n
    ev.push(...s.paso(r.t, largoPara(kg)))
  }
  return ev
}

/** Un tiro: quieta 1 s, estirar hasta `kg` en 1 s, sostener `sosten` ms, volver en 1 s y quieta 1,5 s. */
function tiro(s: SesionHonda, r: { t: number }, kg: number, sosten: number) {
  return [...tramo(s, r, 1000, 0), ...tramo(s, r, 1000, 0, kg), ...tramo(s, r, sosten, kg), ...tramo(s, r, 1000, kg, 0), ...tramo(s, r, 1500, 0)]
}

function nueva(nivel = 3) {
  const n = nivelHonda(nivel)
  const s = new SesionHonda(curva, n.metaKg, n.sostenerS)
  const r = { t: 0 }
  const ev = tramo(s, r, 3000, 0)
  return { s, r, ev }
}

describe('honda: la carga objetivo y el tiro', () => {
  it('marca el cero solo con la banda quieta y queda lista', () => {
    const { s, ev } = nueva()
    expect(ev.some((e) => e.tipo === 'reposo')).toBe(true)
    expect(s.fase).toBe('listo')
    expect(s.kg).toBe(0)
  })

  it('estirar hasta la meta y sostener el tiempo del nivel es un acierto', () => {
    const { s, r } = nueva(3)
    const ev = tiro(s, r, 2.2, 1400)
    expect(ev.map((e) => e.tipo)).toEqual(expect.arrayContaining(['en-ventana', 'sostenido', 'tiro']))
    expect(s.tiros).toHaveLength(1)
    expect(s.tiros[0].resultado).toBe('acierto')
    expect(s.tiros[0].picoKg).toBeCloseTo(2.2, 0)
    expect(s.tiros[0].sostenidoS).toBeGreaterThanOrEqual(1)
    expect(s.aciertos).toBe(1)
  })

  it('llegar pero soltar antes de tiempo no acierta', () => {
    const { s, r } = nueva(3)
    tiro(s, r, 2.1, 300)
    expect(s.tiros[0].resultado).toBe('sin-sostener')
  })

  it('quedarse bajo la meta es corto, y pasarse de golpe es largo', () => {
    const { s, r } = nueva(3)
    tiro(s, r, 1.2, 1500)
    tiro(s, r, 3.6, 1500)
    expect(s.tiros.map((t) => t.resultado)).toEqual(['corto', 'largo'])
  })

  it('pasarse un instante después de haber sostenido no anula el acierto', () => {
    const { s, r } = nueva(3)
    tramo(s, r, 1000, 0)
    tramo(s, r, 1000, 0, 2.2)
    tramo(s, r, 1300, 2.2)
    tramo(s, r, 300, 2.2, 3.3)
    tramo(s, r, 1000, 3.3, 0)
    tramo(s, r, 1500, 0)
    expect(s.tiros[0].resultado).toBe('acierto')
  })

  it('el resumen cuenta aciertos, precisión, carga y tiempo bajo tensión', () => {
    const { s, r } = nueva(2)
    tiro(s, r, 1.7, 1300)
    tiro(s, r, 1.6, 1300)
    tiro(s, r, 1.05, 1300)
    const m = s.resumen()
    expect(m.tiros).toBe(3)
    expect(m.aciertos).toBe(2)
    expect(m.precisionPct).toBe(67)
    expect(m.cargaMetaKg).toBe(1.5)
    expect(m.cargaMaxKg!).toBeGreaterThan(1.5)
    expect(m.tiempoBajoTensionS!).toBeGreaterThan(3)
    expect(m.constanciaPct).not.toBeNull()
    expect(m.cortos).toBe(1)
  })

  it('el resultado se decide por la ventana de carga', () => {
    expect(resultadoDe(2, 2, 1, 1, false)).toBe('acierto')
    expect(resultadoDe(1.8, 2, 1, 1, false)).toBe('corto')
    expect(resultadoDe(2.8, 2, 1, 1, false)).toBe('largo')
    expect(resultadoDe(2.8, 2, 1, 1, true)).toBe('acierto')
    expect(alcanceDe(1)).toBe(1)
    expect(alcanceDe(5)).toBeLessThan(1.5)
  })

  it('usa la banda del laboratorio si hay una guardada en el navegador', () => {
    expect(bandaConfigurada(() => null).origen).toBe('Corength 5 kg × 2 tiras')
    const guardado: Record<string, string> = { 'manoviva.laboratorio.tiras': '4' }
    const c = bandaConfigurada((k) => guardado[k] ?? null)
    expect(c.origen).toBe('Corength 5 kg × 4 tiras')
    expect(c.curva.tiras).toBe(4)
  })
})
