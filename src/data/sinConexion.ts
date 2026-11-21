// Uso sin conexión (F20). Envuelve los repos de Supabase para que la sesión del paciente (preparar → calibrar → jugar →
// sensación) se pueda completar sin red:
//  · Lecturas: se guardan en IndexedDB (tabla `cache`) la última vez que salieron bien y se devuelven si ahora no hay red.
//  · Escrituras de sesión: las que ya sabían encolarse (actualizar, agregarEventos) siguen igual; se suman crear sesión y
//    crear alerta de dolor. Todo se sube en orden al volver la conexión (`sincronizar`).
//  · Sesión creada sin red: recibe un ID provisional (S-AAAAMMDD-Lxxxxx). Al sincronizar, el servidor le asigna el real y se
//    guarda un alias provisional → real; las escrituras en cola y las lecturas posteriores lo resuelven solas.
//  · Cerrar la sesión (hash) exige red y que no quede nada pendiente: sin red el resumen se muestra con aviso y "Reintentar".
// Al cerrar sesión de la cuenta se borra la copia local (no queda salud de otra persona en un teléfono compartido).
import type { Alerta, EventoSesion, Sesion, Usuario } from '../domain/types'
import { borrarCache, encolar, esErrorDeRed, eventosPendientes, guardarCache, hayPendientes, leerCache, resolverAlias } from './colaLocal'
import type { Repos } from './repos'

const PROVISIONAL = /^S-\d{8}-L[0-9a-z]+$/

export const esIdProvisional = (id: string) => PROVISIONAL.test(id)

/** ID provisional de una sesión creada sin conexión: `S-AAAAMMDD-L` + 5 caracteres al azar. */
export function idProvisional(ahora: Date, azar: () => number = Math.random): string {
  const dia = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}`
  const sufijo = Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(azar() * 36)]).join('')
  return `S-${dia}-L${sufijo}`
}

/** El navegador sabe que no hay red (modo avión, wifi apagado): no se intenta nada, que el cliente de Supabase reintenta con esperas. */
const sinRed = () => typeof navigator !== 'undefined' && !navigator.onLine

export function conRespaldoLocal(base: Repos, sincronizar: () => Promise<void>): Repos {
  /** Lee del servidor y guarda copia; sin red devuelve la copia (o `vacio`, o repite el error si no hay nada). */
  async function leer<T>(clave: string, f: () => Promise<T>, vacio?: T): Promise<T> {
    if (sinRed()) {
      const c = await leerCache<T>(clave)
      if (c !== undefined) return c
      if (vacio !== undefined) return vacio
    }
    try {
      const v = await f()
      void guardarCache(clave, v).catch(() => undefined)
      return v
    } catch (e) {
      if (!esErrorDeRed(e)) throw e
      const c = await leerCache<T>(clave)
      if (c !== undefined) return c
      if (vacio !== undefined) return vacio
      throw e
    }
  }

  /** ID real de la sesión, o null si es provisional y todavía no se sincroniza. */
  async function idReal(id: string): Promise<string | null> {
    if (!esIdProvisional(id)) return id
    const r = await resolverAlias(id)
    if (r) return r
    if (!sinRed()) await sincronizar()
    return (await resolverAlias(id)) ?? null
  }

  async function parcharSesion(id: string, cambios: Partial<Sesion>) {
    const clave = `sesiones.obtener:${id}`
    const actual = await leerCache<Sesion | null>(clave)
    if (actual) await guardarCache(clave, { ...actual, ...cambios })
  }

  const sesiones: Repos['sesiones'] = {
    listar: (pacienteId) => leer(`sesiones.listar:${pacienteId}`, () => base.sesiones.listar(pacienteId), []),
    listarVarios: (ids) => leer(`sesiones.listarVarios:${ids.join(',')}`, () => base.sesiones.listarVarios(ids), []),
    async obtener(id) {
      const real = await idReal(id)
      if (real === null) return (await leerCache<Sesion | null>(`sesiones.obtener:${id}`)) ?? null
      return leer(`sesiones.obtener:${real}`, () => base.sesiones.obtener(real))
    },
    async crear(datos) {
      try {
        if (sinRed()) throw new Error('Failed to fetch')
        return await base.sesiones.crear(datos)
      } catch (e) {
        if (!esErrorDeRed(e)) throw e
        const id = idProvisional(new Date())
        const local: Sesion = { id, ...datos }
        await guardarCache(`sesiones.obtener:${id}`, local)
        await encolar({ tipo: 'crearSesion', sesionId: id, payload: datos })
        return local
      }
    },
    async actualizar(id, cambios) {
      const real = await idReal(id)
      if (real === null || sinRed()) {
        await encolar({ tipo: 'actualizarSesion', sesionId: real === null ? id : real, payload: cambios })
        await parcharSesion(real ?? id, cambios)
        return
      }
      await base.sesiones.actualizar(real, cambios) // si la red falla a medias, el repo base la encola
      await parcharSesion(real, cambios).catch(() => undefined)
    },
    async cerrar(id) {
      const real = await idReal(id)
      if (real === null || sinRed()) throw new Error('Sin conexión: la sesión todavía no se ha subido.')
      await sincronizar()
      // Lo encolado con el ID provisional no cuenta en el repo base (que mira el real): se revisa aquí.
      if (id !== real && (await hayPendientes(id))) throw new Error('Sin conexión: quedan datos de la sesión por subir.')
      return base.sesiones.cerrar(real)
    },
    async eventos(id) {
      const real = await idReal(id)
      // Sin red: lo que se sabe es lo que está en la cola (la base de Jugar lo usa para seguir la numeración de eventos).
      if (real === null || sinRed()) return eventosPendientes<EventoSesion>(real === null ? [id] : [id, real])
      try {
        return await base.sesiones.eventos(real)
      } catch (e) {
        if (!esErrorDeRed(e)) throw e
        return eventosPendientes<EventoSesion>([id, real])
      }
    },
    async agregarEventos(eventos: EventoSesion[]) {
      if (!eventos.length) return
      const real = await idReal(eventos[0].sesionId)
      if (real === null || sinRed()) {
        await encolar({ tipo: 'eventos', sesionId: real ?? eventos[0].sesionId, payload: eventos })
        return
      }
      return base.sesiones.agregarEventos(real === eventos[0].sesionId ? eventos : eventos.map((e) => ({ ...e, sesionId: real })))
    },
  }

  return {
    ...base,
    auth: {
      ...base.auth,
      async usuarioActual() {
        let u: Usuario | null = null
        if (sinRed()) {
          const guardado = await leerCache<Usuario>('usuario')
          if (guardado) return guardado
        }
        try {
          u = await base.auth.usuarioActual()
        } catch (e) {
          if (!esErrorDeRed(e)) throw e
        }
        if (u) {
          const previo = await leerCache<Usuario>('usuario')
          if (previo && previo.id !== u.id) await borrarCache() // otra cuenta en el mismo teléfono
          await guardarCache('usuario', u).catch(() => undefined)
          return u
        }
        // Sin red el perfil no se puede pedir (y el token puede estar vencido): se sigue con la última cuenta conocida.
        return null
      },
      async salir() {
        await base.auth.salir()
        await borrarCache().catch(() => undefined)
      },
    },
    pacientes: {
      ...base.pacientes,
      miPaciente: () => leer('pacientes.miPaciente', () => base.pacientes.miPaciente()),
      porId: (id) => leer(`pacientes.porId:${id}`, () => base.pacientes.porId(id)),
    },
    planes: {
      ...base.planes,
      vigente: (pacienteId) => leer(`planes.vigente:${pacienteId}`, () => base.planes.vigente(pacienteId)),
      versiones: (pacienteId) => leer(`planes.versiones:${pacienteId}`, () => base.planes.versiones(pacienteId), []),
    },
    sesiones,
    consentimientos: {
      ...base.consentimientos,
      ultimo: (pacienteId) => leer(`consentimientos.ultimo:${pacienteId}`, () => base.consentimientos.ultimo(pacienteId)),
    },
    alertas: {
      ...base.alertas,
      abiertas: (ids) => leer(`alertas.abiertas:${(ids ?? []).join(',')}`, () => base.alertas.abiertas(ids), [] as Alerta[]),
      async deSesion(sesionId) {
        const real = await idReal(sesionId)
        if (real === null) return []
        return leer(`alertas.deSesion:${real}`, () => base.alertas.deSesion(real), [] as Alerta[])
      },
      async crear(a) {
        const real = await idReal(a.sesionId)
        if (real !== null && !sinRed()) {
          try {
            return await base.alertas.crear({ ...a, sesionId: real })
          } catch (e) {
            if (!esErrorDeRed(e)) throw e
          }
        }
        await encolar({ tipo: 'crearAlerta', sesionId: a.sesionId, payload: { pacienteId: a.pacienteId, tipo: a.tipo, valor: a.valor } })
      },
    },
    citas: {
      ...base.citas,
      proxima: (pacienteId) => leer(`citas.proxima:${pacienteId}`, () => base.citas.proxima(pacienteId)),
    },
    perfiles: {
      ...base.perfiles,
      nombre: (id) => leer(`perfiles.nombre:${id}`, () => base.perfiles.nombre(id)),
      clinica: (id) => leer(`perfiles.clinica:${id}`, () => base.perfiles.clinica(id)),
    },
  }
}
