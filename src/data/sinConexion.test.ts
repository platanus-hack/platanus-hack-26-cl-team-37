import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoSesion, Sesion } from '../domain/types'
import { baseLocal, guardarAlias, hayPendientes } from './colaLocal'
import type { Repos } from './repos'
import { conRespaldoLocal, esIdProvisional, idProvisional } from './sinConexion'

const PROV = 'S-20261121-Labcde'
const REAL = 'S-20261121-07'

const datos: Omit<Sesion, 'id'> = {
  pacienteId: 'p1', planVersion: 1, juego: 'caja-juguetes', parametros: { mano: 'derecha', nivel: 1, duracionMin: 3, metaAgarres: 12, metaPinzaCm: 0, prescritoPor: null },
  inicio: null, fin: null, estado: 'preparada', calibracion: null, metricas: null, muestras: null, dolorEVA: null, esfuerzo: null, nota: null,
  dispositivo: null, versionApp: null, versionModelo: null, hash: null,
}
const ev = (sesionId: string, seq: number): EventoSesion => ({ sesionId, seq, t: seq, tipo: 'pausa', mano: null, objeto: null, datos: null })

function baseFalsa() {
  const r = {
    sesiones: {
      crear: vi.fn(async (d: Omit<Sesion, 'id'>) => ({ id: REAL, ...d })),
      obtener: vi.fn(async (id: string) => ({ id, ...datos })),
      actualizar: vi.fn(async () => undefined),
      agregarEventos: vi.fn(async () => undefined),
      eventos: vi.fn(async () => [] as EventoSesion[]),
      cerrar: vi.fn(async (id: string) => ({ id, ...datos, estado: 'cerrada' as const })),
      listar: vi.fn(async () => [] as Sesion[]),
      listarVarios: vi.fn(async () => [] as Sesion[]),
    },
    pacientes: { miPaciente: vi.fn(async () => ({ id: 'p1' })), porId: vi.fn() },
    planes: { vigente: vi.fn(async () => null), versiones: vi.fn(async () => []) },
    consentimientos: { ultimo: vi.fn(async () => null) },
    alertas: { abiertas: vi.fn(async () => []), deSesion: vi.fn(async () => []), crear: vi.fn(async () => undefined) },
    citas: { proxima: vi.fn(async () => null) },
    perfiles: { nombre: vi.fn(async () => null) },
    auth: { usuarioActual: vi.fn(async () => null as unknown), salir: vi.fn(async () => undefined) },
  }
  return { base: r as unknown as Repos, r }
}

const enLinea = (v: boolean) => vi.stubGlobal('navigator', { onLine: v })

beforeEach(async () => {
  await baseLocal.pendientes.clear()
  await baseLocal.cache.clear()
  await baseLocal.alias.clear()
  enLinea(true)
})
afterEach(() => vi.unstubAllGlobals())

describe('ID provisional', () => {
  it('tiene el formato S-AAAAMMDD-L y se reconoce; los reales no', () => {
    const id = idProvisional(new Date(2026, 10, 21), () => 0.5)
    expect(id).toBe('S-20261121-Lsssss')
    expect(esIdProvisional(id)).toBe(true)
    expect(esIdProvisional(REAL)).toBe(false)
  })
})

describe('lecturas con respaldo local', () => {
  it('con red guarda copia; sin red devuelve la copia sin llamar al servidor', async () => {
    const { base, r } = baseFalsa()
    const repos = conRespaldoLocal(base, async () => undefined)
    expect(await repos.pacientes.miPaciente()).toEqual({ id: 'p1' })
    enLinea(false)
    r.pacientes.miPaciente.mockClear()
    expect(await repos.pacientes.miPaciente()).toEqual({ id: 'p1' })
    expect(r.pacientes.miPaciente).not.toHaveBeenCalled()
    // El valor null es una copia válida ("sin plan").
    enLinea(true)
    await repos.planes.vigente('p1')
    enLinea(false)
    expect(await repos.planes.vigente('p1')).toBeNull()
  })

  it('un error que no es de red se propaga', async () => {
    const { base, r } = baseFalsa()
    r.pacientes.miPaciente.mockRejectedValueOnce(new Error('permission denied'))
    await expect(conRespaldoLocal(base, async () => undefined).pacientes.miPaciente()).rejects.toThrow('permission denied')
  })

  it('el usuario guardado mantiene la sesión sin red y salir borra la copia', async () => {
    const { base, r } = baseFalsa()
    const u = { id: 'u1', rol: 'paciente', nombre: 'P', titulo: null, clinicaId: 'c', demo: true }
    r.auth.usuarioActual.mockResolvedValue(u)
    const repos = conRespaldoLocal(base, async () => undefined)
    expect(await repos.auth.usuarioActual()).toEqual(u)
    enLinea(false)
    r.auth.usuarioActual.mockResolvedValue(null)
    expect(await repos.auth.usuarioActual()).toEqual(u)
    await repos.auth.salir()
    expect(await repos.auth.usuarioActual()).toBeNull()
  })
})

describe('sesión creada sin conexión', () => {
  it('crea con ID provisional, encola y sigue la sesión completa en local', async () => {
    enLinea(false)
    const { base, r } = baseFalsa()
    const repos = conRespaldoLocal(base, async () => undefined)
    const s = await repos.sesiones.crear(datos)
    expect(esIdProvisional(s.id)).toBe(true)
    expect(r.sesiones.crear).not.toHaveBeenCalled()
    expect(await repos.sesiones.obtener(s.id)).toMatchObject({ id: s.id, estado: 'preparada' })

    await repos.sesiones.actualizar(s.id, { estado: 'en curso', dolorEVA: 2 })
    await repos.sesiones.agregarEventos([ev(s.id, 1), ev(s.id, 2)])
    await repos.alertas.crear({ pacienteId: 'p1', sesionId: s.id, tipo: 'dolor', valor: 7 })
    expect(await repos.sesiones.obtener(s.id)).toMatchObject({ estado: 'en curso', dolorEVA: 2 })
    expect((await repos.sesiones.eventos(s.id)).map((e) => e.seq)).toEqual([1, 2])
    expect(await repos.alertas.deSesion(s.id)).toEqual([])
    const tipos = (await baseLocal.pendientes.orderBy('creado').toArray()).map((p) => p.tipo)
    expect(tipos).toEqual(['crearSesion', 'actualizarSesion', 'eventos', 'crearAlerta'])
    expect(r.sesiones.actualizar).not.toHaveBeenCalled()
    expect(r.alertas.crear).not.toHaveBeenCalled()
    // Cerrar (hash) exige red.
    await expect(repos.sesiones.cerrar(s.id)).rejects.toThrow(/Sin conexión/)
  })

  it('al sincronizar (alias), lo siguiente va al servidor con el ID real y cerrar espera lo pendiente', async () => {
    const { base, r } = baseFalsa()
    let aliasListo = false
    const repos = conRespaldoLocal(base, async () => {
      if (aliasListo) await guardarAlias(PROV, REAL)
    })
    await baseLocal.pendientes.add({ tipo: 'eventos', sesionId: PROV, payload: [], creado: 1 })
    // Sin alias todavía: se atiende en local.
    await repos.sesiones.actualizar(PROV, { nota: 'a' })
    expect(r.sesiones.actualizar).not.toHaveBeenCalled()
    await expect(repos.sesiones.cerrar(PROV)).rejects.toThrow()

    aliasListo = true
    await repos.sesiones.actualizar(PROV, { nota: 'b' })
    expect(r.sesiones.actualizar).toHaveBeenCalledWith(REAL, { nota: 'b' })
    await repos.sesiones.agregarEventos([ev(PROV, 3)])
    expect(r.sesiones.agregarEventos).toHaveBeenCalledWith([ev(REAL, 3)])
    await repos.sesiones.obtener(PROV)
    expect(r.sesiones.obtener).toHaveBeenCalledWith(REAL)
    // Quedan pendientes con el ID provisional (el de arriba y la actualización 'a'): no se cierra con datos sin subir.
    expect(await hayPendientes(PROV)).toBeGreaterThan(0)
    await expect(repos.sesiones.cerrar(PROV)).rejects.toThrow(/por subir/)
    expect(r.sesiones.cerrar).not.toHaveBeenCalled()
    await baseLocal.pendientes.clear()
    await repos.sesiones.cerrar(PROV)
    expect(r.sesiones.cerrar).toHaveBeenCalledWith(REAL)
  })
})
