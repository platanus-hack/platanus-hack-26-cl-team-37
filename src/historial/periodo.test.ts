import { describe, expect, it } from 'vitest'
import type { Sesion } from '../domain/types'
import { nombrePeriodo, sesionesDelPeriodo } from './periodo'

const HOY = new Date(2026, 10, 21, 12, 0)
const hace = (dias: number) => new Date(2026, 10, 21 - dias, 10, 0).toISOString()
const sesion = (id: string, dias: number, estado: Sesion['estado'] = 'cerrada') => ({ id, inicio: hace(dias), fin: null, estado }) as unknown as Sesion

describe('período de exportación', () => {
  const sesiones = [sesion('a', 0), sesion('b', 6), sesion('c', 7), sesion('d', 27), sesion('e', 28), sesion('f', 1, 'preparada'), sesion('g', 2, 'en curso')]

  it('solo sesiones cerradas, desde el primer día del rango', () => {
    expect(sesionesDelPeriodo(sesiones, '7d', HOY).map((s) => s.id)).toEqual(['a', 'b'])
    expect(sesionesDelPeriodo(sesiones, '4s', HOY).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(sesionesDelPeriodo(sesiones, 'todo', HOY).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(sesionesDelPeriodo([], 'todo', HOY)).toEqual([])
  })

  it('nombre del período con la fecha de corte', () => {
    expect(nombrePeriodo('4s', HOY)).toBe('4 semanas (hasta 21-11-2026)')
    expect(nombrePeriodo('todo', HOY)).toBe('Todo (hasta 21-11-2026)')
  })
})
