import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoSesion, Sesion } from '../domain/types'
import { baseLocal, encolar, ESPERA_ENTRE_INTENTOS_MS, fijarProveedorDueno, guardarAlias, hayPendientes, MAX_INTENTOS, vaciarCola, type Pendiente } from './colaLocal'
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
  await baseLocal.descartados.clear()
  fijarProveedorDueno(async () => null)
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

describe('cola: rechazos del servidor y cuentas', () => {
  const pend = (sesionId: string, creado: number, extra: Partial<Pendiente> = {}): Pendiente => ({ tipo: 'actualizarSesion', sesionId, payload: {}, creado, ...extra })
  const quedan = async () => (await baseLocal.pendientes.orderBy('creado').toArray()).map((p) => `${p.sesionId}:${p.creado}`)

  it('un ítem rechazado no frena a las demás sesiones y conserva el orden dentro de la suya', async () => {
    await baseLocal.pendientes.bulkAdd([pend('S-A', 1), pend('S-A', 2), pend('S-B', 3)])
    const subidos: string[] = []
    await vaciarCola(async (p) => {
      if (p.sesionId === 'S-A' && p.creado === 1) throw new Error('sesión cerrada: es inmutable')
      subidos.push(`${p.sesionId}:${p.creado}`)
    })
    // S-A:2 no se sube antes que S-A:1 (orden de la sesión); S-B sí pasa.
    expect(subidos).toEqual(['S-B:3'])
    expect(await quedan()).toEqual(['S-A:1', 'S-A:2'])
    expect((await baseLocal.pendientes.orderBy('creado').first())?.intentos).toBe(1)
  })

  it('sin red la pasada se corta y no cuenta como rechazo', async () => {
    await baseLocal.pendientes.bulkAdd([pend('S-A', 1), pend('S-B', 2)])
    await expect(vaciarCola(async () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow('Failed to fetch')
    expect(await quedan()).toEqual(['S-A:1', 'S-B:2'])
    expect((await baseLocal.pendientes.toArray()).every((p) => !p.intentos)).toBe(true)
  })

  it('tras varios rechazos espaciados el ítem se aparta (no se borra) y la sesión sigue', async () => {
    await baseLocal.pendientes.bulkAdd([pend('S-A', 1), pend('S-A', 2)])
    const ejecutar = vi.fn(async (p: Pendiente) => {
      if (p.creado === 1) throw new Error('violates row-level security policy')
    })
    let t = 1_000_000
    for (let i = 0; i < MAX_INTENTOS; i++) {
      await vaciarCola(ejecutar, undefined, () => t)
      // Un reintento inmediato (doble toque en «Reintentar») no gasta otro intento.
      await vaciarCola(ejecutar, undefined, () => t + 1)
      t += ESPERA_ENTRE_INTENTOS_MS
    }
    expect(await quedan()).toEqual([])
    const apartados = await baseLocal.descartados.toArray()
    expect(apartados).toHaveLength(1)
    expect(apartados[0]).toMatchObject({ sesionId: 'S-A', creado: 1, intentos: MAX_INTENTOS, error: 'violates row-level security policy' })
  })

  it('solo sube lo de la cuenta abierta; lo de otra cuenta espera y sin cuenta no sube nada', async () => {
    await baseLocal.pendientes.bulkAdd([pend('S-A', 1, { usuario: 'ana' }), pend('S-B', 2, { usuario: 'beto' }), pend('S-C', 3)])
    const ejecutar = vi.fn(async () => undefined)
    await vaciarCola(ejecutar, null)
    expect(ejecutar).not.toHaveBeenCalled()
    await vaciarCola(ejecutar, 'beto')
    // Lo de Beto y lo antiguo sin dueño; lo de Ana queda intacto para cuando vuelva a entrar.
    expect(await quedan()).toEqual(['S-A:1'])
    expect((await baseLocal.pendientes.toArray())[0].intentos).toBeUndefined()
  })

  it('lo encolado queda a nombre de la última cuenta conocida (copia local) o, sin copia, de la sesión abierta', async () => {
    fijarProveedorDueno(async () => 'ana')
    await encolar({ tipo: 'eventos', sesionId: 'S-A', payload: [] })
    await baseLocal.cache.put({ clave: 'usuario', valor: { id: 'beto' } })
    await encolar({ tipo: 'eventos', sesionId: 'S-B', payload: [] })
    expect((await baseLocal.pendientes.orderBy('id').toArray()).map((p) => p.usuario)).toEqual(['ana', 'beto'])
  })

  it('dos llamadas a la vez comparten la misma pasada', async () => {
    await baseLocal.pendientes.bulkAdd([pend('S-A', 1)])
    const ejecutar = vi.fn(async () => undefined)
    const [a, b] = [vaciarCola(ejecutar), vaciarCola(ejecutar)]
    expect(a).toBe(b)
    await Promise.all([a, b])
    expect(ejecutar).toHaveBeenCalledTimes(1)
  })

  it('entrar con otra cuenta borra la copia local de la anterior', async () => {
    const { base, r } = baseFalsa()
    const ana = { id: 'ana', rol: 'paciente', nombre: 'Ana', titulo: null, clinicaId: 'c', demo: true }
    const beto = { ...ana, id: 'beto', nombre: 'Beto' }
    r.auth.usuarioActual.mockResolvedValue(ana)
    const repos = conRespaldoLocal(base, async () => undefined)
    await repos.auth.usuarioActual()
    await repos.pacientes.miPaciente() // deja copia de la ficha de Ana
    ;(r.auth as unknown as { ingresar: unknown }).ingresar = vi.fn(async () => beto)
    const repos2 = conRespaldoLocal(base, async () => undefined)
    await repos2.auth.ingresar({ email: 'b@x.cl', password: 'x', rol: 'paciente', codigoClinica: 'CRM-0000' })
    expect(await baseLocal.cache.get('pacientes.miPaciente')).toBeUndefined()
    expect((await baseLocal.cache.get('usuario'))?.valor).toEqual(beto)
  })
})
