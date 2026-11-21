import { describe, expect, it } from 'vitest'
import { pasoEva, planDeSesion, requiereAlerta, sensacionAGuardar } from './sensacion'
import type { Plan } from './types'

const plan = (version: number, umbralDolor: number) => ({ version, umbralDolor }) as Plan

describe('pasoEva', () => {
  it('sin valor: + empieza en 0 y − no marca nada', () => {
    expect(pasoEva(null, 1)).toBe(0)
    expect(pasoEva(null, -1)).toBeNull()
  })
  it('acota entre 0 y 10', () => {
    expect(pasoEva(0, -1)).toBe(0)
    expect(pasoEva(10, 1)).toBe(10)
    expect(pasoEva(4, 1)).toBe(5)
    expect(pasoEva(4, -1)).toBe(3)
  })
})

describe('planDeSesion', () => {
  it('usa la versión congelada en la sesión, si no la vigente', () => {
    const v1 = plan(1, 5)
    const v2 = plan(2, 7)
    expect(planDeSesion({ planVersion: 1 }, [v2, v1], v2)).toBe(v1)
    expect(planDeSesion({ planVersion: null }, [v2, v1], v2)).toBe(v2)
    expect(planDeSesion({ planVersion: 9 }, [v2, v1], v2)).toBe(v2)
    expect(planDeSesion({ planVersion: null }, [], null)).toBeNull()
  })
})

describe('requiereAlerta', () => {
  it('dolor igual o mayor al umbral', () => {
    expect(requiereAlerta(5, 5)).toBe(true)
    expect(requiereAlerta(8, 5)).toBe(true)
    expect(requiereAlerta(4, 5)).toBe(false)
    expect(requiereAlerta(null, 5)).toBe(false)
    expect(requiereAlerta(10, null)).toBe(false)
  })
})

describe('sensacionAGuardar', () => {
  it('exige EVA entero 0–10', () => {
    expect(sensacionAGuardar(null, 'Suave', '')).toBeNull()
    expect(sensacionAGuardar(11, null, '')).toBeNull()
    expect(sensacionAGuardar(2.5, null, '')).toBeNull()
    expect(sensacionAGuardar(0, null, '')).toEqual({ dolorEVA: 0, esfuerzo: null, nota: null })
  })
  it('recorta la nota a 280 y vacía = null', () => {
    expect(sensacionAGuardar(2, 'Moderado', '  Molestia leve  ')).toEqual({ dolorEVA: 2, esfuerzo: 'Moderado', nota: 'Molestia leve' })
    expect(sensacionAGuardar(2, null, '   ')!.nota).toBeNull()
    expect(sensacionAGuardar(2, null, 'x'.repeat(300))!.nota).toHaveLength(280)
  })
})
