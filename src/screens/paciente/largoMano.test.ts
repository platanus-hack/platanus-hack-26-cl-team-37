import { describe, expect, it } from 'vitest'
import { leerLargo, pasoLargo, textoLargo, validarLargo } from './largoMano'

describe('leerLargo', () => {
  it('acepta coma y punto decimal', () => {
    expect(leerLargo('18,5')).toBe(18.5)
    expect(leerLargo('18.5')).toBe(18.5)
    expect(leerLargo(' 19 cm ')).toBe(19)
  })
  it('rechaza lo que no es número', () => {
    for (const t of ['', 'abc', '1,2,3', '-5', '18,', '1e2']) expect(leerLargo(t)).toBeNull()
  })
})

describe('validarLargo', () => {
  it('acepta el rango 10 a 30 y redondea a 1 decimal', () => {
    expect(validarLargo('10')).toEqual({ ok: true, cm: 10 })
    expect(validarLargo('30')).toEqual({ ok: true, cm: 30 })
    expect(validarLargo('18,46')).toEqual({ ok: true, cm: 18.5 })
  })
  it('rechaza vacío, texto y fuera de rango con mensaje', () => {
    expect(validarLargo('  ')).toMatchObject({ ok: false, error: expect.stringContaining('Escribe') })
    expect(validarLargo('hola')).toMatchObject({ ok: false })
    expect(validarLargo('9,9')).toMatchObject({ ok: false, error: 'El largo debe estar entre 10 y 30 cm.' })
    expect(validarLargo('30,1')).toMatchObject({ ok: false })
  })
})

describe('pasoLargo', () => {
  it('avanza de a 0,5 y respeta los topes', () => {
    expect(pasoLargo(18, 1)).toBe(18.5)
    expect(pasoLargo(18.2, -1)).toBe(17.7)
    expect(pasoLargo(30, 1)).toBe(30)
    expect(pasoLargo(10, -1)).toBe(10)
  })
})

describe('textoLargo', () => {
  it('usa coma decimal', () => {
    expect(textoLargo(18)).toBe('18')
    expect(textoLargo(18.5)).toBe('18,5')
  })
})
