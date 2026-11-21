import { describe, expect, it } from 'vitest'
import type { Alerta, Paciente, Plan, Sesion } from '../../domain/types'
import {
  armarFila,
  condicionOMano,
  diasCalendario,
  diasSinSesion,
  dolorAbierto,
  filtrarPorNombre,
  indicadores,
  ordenar,
  serieApertura,
  textoDolor,
  textoSinSesiones,
} from './panel'

const HOY = new Date(2026, 10, 21, 15, 0, 0) // 21-nov-2026 15:00 local

function paciente(id: string, nombre: string, extra: Partial<Paciente> = {}): Paciente {
  return {
    id, usuarioId: 'u' + id, terapeutaId: 't', nombre, manoAfectada: 'derecha', condicion: null, fechaInicio: '2026-10-01',
    largoManoCm: 18, compartirMetricas: true, datosInvestigacion: false, ultimoMensajeVisto: 0, ...extra,
  }
}
const plan: Plan = { id: 'pl', pacienteId: 'a', version: 1, vigenteDesde: '2026-10-01', creadoPor: null, sesionesPorSemana: 2, umbralDolor: 5, mensaje: null, items: [{ juego: 'caja-juguetes', nivel: 1, duracionMin: 5, mano: 'derecha', metaAgarres: 8, metaPinzaCm: 6 }] }

function sesion(pid: string, diasAtras: number, apertura = 7, estado: Sesion['estado'] = 'cerrada'): Sesion {
  const d = new Date(HOY)
  d.setDate(d.getDate() - diasAtras)
  d.setHours(10, 0, 0, 0)
  return {
    id: `${pid}-${diasAtras}-${apertura}`, pacienteId: pid, planVersion: 1, juego: 'caja-juguetes',
    parametros: { mano: 'derecha', nivel: 1, duracionMin: 5, metaAgarres: 8, metaPinzaCm: 6, prescritoPor: null },
    inicio: d.toISOString(), fin: null, estado, calibracion: null,
    metricas: { aperturaMaxCm: apertura } as Sesion['metricas'], muestras: null, dolorEVA: 2, esfuerzo: null, nota: null,
    dispositivo: null, versionApp: null, versionModelo: null, hash: null,
  }
}
function alerta(pid: string, valor: number, creada = '2026-11-19T18:00:00Z', estado: Alerta['estado'] = 'abierta', tipo: Alerta['tipo'] = 'dolor'): Alerta {
  return { id: `al-${pid}-${valor}-${creada}`, pacienteId: pid, sesionId: null, tipo, valor, creada, estado }
}

describe('días sin sesiones', () => {
  it('cuenta días de calendario, no horas', () => {
    expect(diasCalendario('2026-11-20T23:59:00', HOY)).toBe(1)
    expect(diasCalendario(HOY, HOY)).toBe(0)
    expect(diasCalendario('2026-11-25T10:00:00', HOY)).toBe(0)
  })
  it('usa la última sesión cerrada y, sin sesiones, el inicio del tratamiento', () => {
    expect(diasSinSesion([sesion('a', 6), sesion('a', 4)], '2026-10-01', HOY)).toBe(4)
    expect(diasSinSesion([sesion('a', 1, 7, 'en curso')], '2026-11-18', HOY)).toBe(3)
    expect(diasSinSesion([], '2026-11-21', HOY)).toBe(0)
  })
})

describe('serie del minigráfico', () => {
  it('es cronológica, solo cerradas y recorta a las últimas', () => {
    const ss = [sesion('a', 1, 8), sesion('a', 3, 7), sesion('a', 5, 6), sesion('a', 0, 99, 'en curso')]
    expect(serieApertura(ss)).toEqual([6, 7, 8])
    expect(serieApertura(ss, 2)).toEqual([7, 8])
  })
})

describe('alertas de dolor', () => {
  it('toma la abierta más reciente y no las revisadas ni otros tipos', () => {
    const as = [alerta('a', 6, '2026-11-18T10:00:00Z'), alerta('a', 8, '2026-11-20T10:00:00Z'), alerta('a', 9, '2026-11-21T10:00:00Z', 'revisada'), alerta('a', 1, '2026-11-21T11:00:00Z', 'abierta', 'inactividad'), alerta('b', 7)]
    expect(dolorAbierto(as, 'a')?.valor).toBe(8)
    expect(dolorAbierto(as, 'c')).toBeNull()
  })
})

describe('fila, orden, búsqueda e indicadores', () => {
  const luis = paciente('l', 'Luis A.', { manoAfectada: 'izquierda' })
  const carmen = paciente('c', 'Carmen R.', { condicion: 'Fractura de muñeca', manoAfectada: 'ambas' })
  const jorge = paciente('j', 'Jorge P.')
  const marta = paciente('m', 'Marta S.')
  const alertas = [alerta('l', 6)]
  const ses = {
    c: [sesion('c', 0), sesion('c', 1), sesion('c', 3)],
    l: [sesion('l', 2), sesion('l', 6)],
    j: [sesion('j', 4), sesion('j', 6)],
    m: [sesion('m', 1), sesion('m', 2)],
  }
  const fila = (p: Paciente, k: keyof typeof ses, umbralDias = 3) => armarFila({ paciente: p, plan: { ...plan, pacienteId: p.id }, sesiones: ses[k], alertas, hoy: HOY, umbralDias })
  const filas = [fila(carmen, 'c'), fila(jorge, 'j'), fila(marta, 'm'), fila(luis, 'l')]

  it('arma alertas, semana y adherencia', () => {
    const l = filas[3]!
    expect(l.dolor?.valor).toBe(6)
    expect(l.sinSesiones).toBeNull()
    expect(l.semana).toBe(8)
    const j = filas[1]!
    expect(j.dolor).toBeNull()
    expect(j.sinSesiones).toBe(4)
    expect(filas[0]!.conAlerta).toBe(false)
    expect(filas[0]!.adherencia).toBe(1) // 3 sesiones en 7 días, plan = 2
    expect(j.adherencia).toBe(1)
  })
  it('el umbral de días es configurable', () => {
    expect(fila(jorge, 'j', 5).sinSesiones).toBeNull()
    expect(fila(jorge, 'j', 4).sinSesiones).toBe(4)
    expect(fila(marta, 'm', 1).sinSesiones).toBe(1)
  })
  it('ordena con alertas primero (dolor, luego sin sesiones) y luego por nombre', () => {
    expect(ordenar(filas).map((f) => f.paciente.nombre)).toEqual(['Luis A.', 'Jorge P.', 'Carmen R.', 'Marta S.'])
  })
  it('busca por nombre sin importar mayúsculas ni tildes', () => {
    expect(filtrarPorNombre(filas, ' CARM').map((f) => f.paciente.id)).toEqual(['c'])
    expect(filtrarPorNombre(filas, '').length).toBe(4)
    expect(filtrarPorNombre(filas, 'zzz')).toEqual([])
    expect(filtrarPorNombre([{ ...filas[0]!, paciente: paciente('x', 'José Muñoz') }], 'jose munoz').length).toBe(1)
  })
  it('indicadores: activos, alertas (dolor + inactividad) y adherencia media', () => {
    const i = indicadores(filas, alertas)
    expect(i.activos).toBe(4)
    expect(i.alertas).toBe(2)
    expect(i.adherenciaMedia).toBeCloseTo(1, 5)
    expect(indicadores([], []).adherenciaMedia).toBeNull()
    expect(indicadores(filas, [alerta('l', 6, '2026-11-19T00:00:00Z', 'revisada')]).alertas).toBe(1)
  })
})

describe('textos', () => {
  it('condición o mano', () => {
    expect(condicionOMano({ condicion: 'Fractura de muñeca', manoAfectada: 'ambas' })).toBe('Fractura de muñeca')
    expect(condicionOMano({ condicion: null, manoAfectada: 'izquierda' })).toBe('Mano izquierda')
    expect(condicionOMano({ condicion: ' ', manoAfectada: 'ambas' })).toBe('Ambas manos')
  })
  it('mensajes de alerta', () => {
    expect(textoDolor(6)).toBe('Dolor 6/10 en la última sesión')
    expect(textoSinSesiones(4)).toBe('Sin sesiones hace 4 días')
    expect(textoSinSesiones(1)).toBe('Sin sesiones hace 1 día')
  })
})
