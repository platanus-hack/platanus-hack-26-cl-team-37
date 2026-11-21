import { describe, expect, it } from 'vitest'
import { aCsv, aJson, celdaCsv, nombreArchivo, type PaqueteDatos } from './exportar'

const paquete: PaqueteDatos = {
  generado: '2026-11-21T12:00:00.000Z',
  aviso: 'x',
  perfil: {
    usuario: { nombre: 'Ana, "la" prueba', titulo: null, rol: 'paciente' },
    paciente: {
      id: 'p1', terapeutaId: 't1', nombre: 'Ana', manoAfectada: 'derecha', condicion: null, fechaInicio: '2026-11-01',
      largoManoCm: 18.2, compartirMetricas: true, datosInvestigacion: false, ultimoMensajeVisto: 0,
    },
  },
  planes: [{ id: 'pl1', pacienteId: 'p1', version: 1, vigenteDesde: '2026-11-01', creadoPor: 't1', sesionesPorSemana: 5, umbralDolor: 5, mensaje: null, items: [{ juego: 'caja-juguetes', nivel: 1, duracionMin: 5, mano: 'derecha', metaAgarres: 8, metaPinzaCm: 6.5 }] }],
  sesiones: [],
  eventos: [{ sesionId: 'S-1', seq: 1, t: 1.5, tipo: 'agarre_inicio', mano: 'derecha', objeto: 'cubo', datos: null }],
  consentimientos: [{ id: 'c1', pacienteId: 'p1', version: '1.0', firmadoEl: '2026-11-02T12:00:00Z', opciones: { a: true } }],
  alertas: [],
  auditoria: [],
}

describe('exportar datos', () => {
  it('celdaCsv escapa comillas, comas y saltos', () => {
    expect(celdaCsv('a,b')).toBe('"a,b"')
    expect(celdaCsv('di "hola"')).toBe('"di ""hola"""')
    expect(celdaCsv('a\nb')).toBe('"a\nb"')
    expect(celdaCsv(null)).toBe('')
    expect(celdaCsv(7)).toBe('7')
    expect(celdaCsv({ x: 1 })).toBe('"{""x"":1}"')
  })
  it('JSON conserva todo', () => {
    expect(JSON.parse(aJson(paquete))).toEqual(paquete)
  })
  it('CSV tiene encabezado y una fila por campo de cada tabla', () => {
    const filas = aCsv(paquete).replace(/^﻿/, '').trim().split('\r\n')
    expect(filas[0]).toBe('tabla,registro,campo,valor')
    expect(filas).toContain('plan,v1,version,1')
    expect(filas).toContain('evento,S-1#1,tipo,agarre_inicio')
    expect(filas).toContain('consentimiento,c1,version,1.0')
    expect(filas).toContain('perfil,usuario,nombre,"Ana, ""la"" prueba"')
    expect(filas.some((f) => f.startsWith('plan,v1,items,"[{'))).toBe(true)
  })
  it('nombre de archivo con fecha', () => {
    expect(nombreArchivo('csv', new Date(2026, 10, 2))).toBe('kuwu-mis-datos-2026-11-02.csv')
  })
})
