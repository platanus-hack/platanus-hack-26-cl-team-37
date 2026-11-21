// Implementación de los repositorios sobre Supabase (Postgres + RLS).
import type {
  Alerta,
  Auditoria,
  Cita,
  Consentimiento,
  EventoSesion,
  Paciente,
  Plan,
  Rol,
  Sesion,
  Usuario,
} from '../domain/types'
import { idSesion } from '../domain/integridad'
import { encolar, vaciarCola, type Pendiente } from './colaLocal'
import type { Repos } from './repos'
import { supabase } from './supabase'

type Fila = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

const nombrePerfil = (p: Fila | null | undefined) => (p ? [p.titulo, p.nombre].filter(Boolean).join(' ') : undefined)

// ---------------------------------------------------------------- mapeos fila ↔ dominio
const aPaciente = (f: Fila): Paciente => ({
  id: f.id,
  usuarioId: f.usuario_id,
  terapeutaId: f.terapeuta_id,
  nombre: f.perfil?.nombre ?? '',
  manoAfectada: f.mano_afectada,
  condicion: f.condicion,
  fechaInicio: f.fecha_inicio,
  largoManoCm: f.largo_mano_cm == null ? null : Number(f.largo_mano_cm),
  compartirMetricas: f.compartir_metricas,
  datosInvestigacion: f.datos_investigacion,
  ultimoMensajeVisto: f.ultimo_mensaje_visto,
})

const aPlan = (f: Fila): Plan => ({
  id: f.id,
  pacienteId: f.paciente_id,
  version: f.version,
  vigenteDesde: f.vigente_desde,
  creadoPor: f.creado_por,
  creadoPorNombre: nombrePerfil(f.autor),
  sesionesPorSemana: f.sesiones_por_semana,
  umbralDolor: f.umbral_dolor,
  mensaje: f.mensaje,
  items: f.items ?? [],
})

const aSesion = (f: Fila): Sesion => ({
  id: f.id,
  pacienteId: f.paciente_id,
  planVersion: f.plan_version,
  juego: f.juego,
  parametros: f.parametros,
  inicio: f.inicio,
  fin: f.fin,
  estado: f.estado,
  calibracion: f.calibracion,
  metricas: f.metricas,
  muestras: f.muestras,
  dolorEVA: f.dolor_eva,
  esfuerzo: f.esfuerzo,
  nota: f.nota,
  dispositivo: f.dispositivo,
  versionApp: f.version_app,
  versionModelo: f.version_modelo,
  hash: f.hash,
  creada: f.creada,
})

const COLUMNAS_SESION: Record<string, string> = {
  pacienteId: 'paciente_id',
  planVersion: 'plan_version',
  juego: 'juego',
  parametros: 'parametros',
  inicio: 'inicio',
  fin: 'fin',
  estado: 'estado',
  calibracion: 'calibracion',
  metricas: 'metricas',
  muestras: 'muestras',
  dolorEVA: 'dolor_eva',
  esfuerzo: 'esfuerzo',
  nota: 'nota',
  dispositivo: 'dispositivo',
  versionApp: 'version_app',
  versionModelo: 'version_modelo',
  hash: 'hash',
}

function aFilaSesion(s: Partial<Sesion>): Fila {
  const f: Fila = {}
  for (const [k, col] of Object.entries(COLUMNAS_SESION)) {
    const v = (s as Fila)[k]
    if (v !== undefined) f[col] = v
  }
  return f
}

const aEvento = (f: Fila): EventoSesion => ({
  sesionId: f.sesion_id,
  seq: f.seq,
  t: f.t,
  tipo: f.tipo,
  mano: f.mano,
  objeto: f.objeto,
  datos: f.datos,
})

const aFilaEvento = (e: EventoSesion): Fila => ({
  sesion_id: e.sesionId,
  seq: e.seq,
  t: e.t,
  tipo: e.tipo,
  mano: e.mano,
  objeto: e.objeto,
  datos: e.datos,
})

const aAuditoria = (f: Fila): Auditoria => ({
  id: f.id,
  quien: f.quien,
  cuando: f.cuando,
  accion: f.accion,
  entidad: f.entidad,
  entidadId: f.entidad_id,
  pacienteId: f.paciente_id,
  antes: f.antes,
  despues: f.despues,
})

const aAlerta = (f: Fila): Alerta => ({
  id: f.id,
  pacienteId: f.paciente_id,
  sesionId: f.sesion_id,
  tipo: f.tipo,
  valor: f.valor,
  creada: f.creada,
  estado: f.estado,
})

const SELECT_PACIENTE = '*, perfil:perfiles!pacientes_usuario_id_fkey(nombre)'
const SELECT_PLAN = '*, autor:perfiles!planes_creado_por_fkey(nombre, titulo)'

// ---------------------------------------------------------------- escrituras con cola local
function esErrorDeRed(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return !navigator.onLine || /fetch|network|Failed to fetch|NetworkError|Load failed/i.test(m)
}

async function ejecutarPendiente(p: Pendiente) {
  if (p.tipo === 'eventos') {
    const filas = (p.payload as EventoSesion[]).map(aFilaEvento)
    // upsert ignorando duplicados: reintentos idempotentes
    ok(await supabase.from('eventos_sesion').upsert(filas, { onConflict: 'sesion_id,seq', ignoreDuplicates: true }))
  } else if (p.tipo === 'actualizarSesion') {
    ok(await supabase.from('sesiones').update(aFilaSesion(p.payload as Partial<Sesion>)).eq('id', p.sesionId))
  }
}

export function sincronizarCola() {
  return vaciarCola(ejecutarPendiente).catch(() => undefined)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void sincronizarCola())
}

// ---------------------------------------------------------------- repos
const cacheNombres = new Map<string, string | null>()

export const supabaseRepos: Repos = {
  auth: {
    async usuarioActual() {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return null
      const r = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle()
      if (r.error || !r.data) return null
      const f = r.data
      return { id: f.id, rol: f.rol as Rol, nombre: f.nombre, titulo: f.titulo, clinicaId: f.clinica_id, demo: f.demo } satisfies Usuario
    },
    async ingresar({ email, password, rol, codigoClinica }) {
      const r = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (r.error) throw new Error(esErrorDeRed(r.error) ? 'Sin conexión. Revisa tu internet e intenta de nuevo.' : 'Correo o contraseña incorrectos.')
      const v = await supabase.rpc('verificar_acceso', { p_rol: rol, p_codigo: codigoClinica })
      if (v.error || !v.data) {
        await supabase.auth.signOut({ scope: 'local' })
        throw new Error(
          rol === 'terapeuta'
            ? 'Esta cuenta no es de terapeuta o no pertenece a esa clínica.'
            : 'Esta cuenta no es de paciente o no pertenece a esa clínica.',
        )
      }
      const u = await supabaseRepos.auth.usuarioActual()
      if (!u) throw new Error('No se pudo cargar el perfil.')
      void sincronizarCola()
      return u
    },
    async salir() {
      // Alcance local: el global revocaría las sesiones de la cuenta demo compartida en todos los dispositivos.
      await supabase.auth.signOut({ scope: 'local' })
      cacheNombres.clear()
    },
    alCambiar(cb) {
      const { data } = supabase.auth.onAuthStateChange(() => cb())
      return () => data.subscription.unsubscribe()
    },
  },

  pacientes: {
    async miPaciente() {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return null
      const f = ok(await supabase.from('pacientes').select(SELECT_PACIENTE).eq('usuario_id', uid).maybeSingle())
      return f ? aPaciente(f) : null
    },
    async porId(id) {
      const f = ok(await supabase.from('pacientes').select(SELECT_PACIENTE).eq('id', id).maybeSingle())
      return f ? aPaciente(f) : null
    },
    async deTerapeuta() {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      const filas = ok(await supabase.from('pacientes').select(SELECT_PACIENTE).eq('terapeuta_id', uid ?? ''))
      return (filas ?? []).map(aPaciente)
    },
    async actualizarPrivacidad(compartir, investigacion) {
      ok(await supabase.rpc('actualizar_privacidad', { p_compartir: compartir, p_investigacion: investigacion }))
    },
    async marcarMensajeVisto(version) {
      ok(await supabase.rpc('marcar_mensaje_visto', { p_version: version }))
    },
    async eliminarMisDatos() {
      ok(await supabase.rpc('eliminar_mis_datos'))
    },
  },

  planes: {
    async vigente(pacienteId) {
      const f = ok(
        await supabase.from('planes').select(SELECT_PLAN).eq('paciente_id', pacienteId).order('version', { ascending: false }).limit(1).maybeSingle(),
      )
      return f ? aPlan(f) : null
    },
    async versiones(pacienteId) {
      const filas = ok(await supabase.from('planes').select(SELECT_PLAN).eq('paciente_id', pacienteId).order('version', { ascending: false }))
      return (filas ?? []).map(aPlan)
    },
    async crearVersion(pacienteId, d) {
      const f = ok(
        await supabase.rpc('crear_version_plan', {
          p_paciente: pacienteId,
          p_sesiones_por_semana: d.sesionesPorSemana,
          p_umbral_dolor: d.umbralDolor,
          p_mensaje: d.mensaje,
          p_items: d.items,
        }),
      ) as Fila
      return aPlan(f)
    },
  },

  sesiones: {
    async listar(pacienteId) {
      const filas = ok(await supabase.from('sesiones').select('*').eq('paciente_id', pacienteId).order('inicio', { ascending: false, nullsFirst: false }))
      return (filas ?? []).map(aSesion)
    },
    async listarVarios(ids) {
      if (!ids.length) return []
      const filas = ok(
        await supabase
          .from('sesiones')
          .select('id, paciente_id, plan_version, juego, parametros, inicio, fin, estado, metricas, dolor_eva, esfuerzo, hash')
          .in('paciente_id', ids)
          .order('inicio', { ascending: false }),
      )
      return (filas ?? []).map(aSesion)
    },
    async obtener(id) {
      const f = ok(await supabase.from('sesiones').select('*').eq('id', id).maybeSingle())
      return f ? aSesion(f) : null
    },
    async crear(datos) {
      const ahora = new Date()
      const dia = idSesion(ahora, 1).slice(2, 10)
      for (let intento = 0; intento < 4; intento++) {
        const id = ok(await supabase.rpc('siguiente_id_sesion', { p_dia: dia })) as string
        const r = await supabase.from('sesiones').insert({ id, ...aFilaSesion(datos) }).select('*').single()
        if (!r.error) return aSesion(r.data)
        if (!/duplicate key/i.test(r.error.message)) throw new Error(r.error.message)
      }
      throw new Error('No se pudo asignar un ID de sesión. Intenta de nuevo.')
    },
    async actualizar(id, cambios) {
      try {
        ok(await supabase.from('sesiones').update(aFilaSesion(cambios)).eq('id', id))
      } catch (e) {
        if (!esErrorDeRed(e)) throw e
        await encolar({ tipo: 'actualizarSesion', sesionId: id, payload: cambios })
      }
    },
    async eventos(id) {
      const filas = ok(await supabase.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq'))
      return (filas ?? []).map(aEvento)
    },
    async agregarEventos(eventos) {
      if (!eventos.length) return
      try {
        for (let i = 0; i < eventos.length; i += 500) {
          const lote = eventos.slice(i, i + 500).map(aFilaEvento)
          ok(await supabase.from('eventos_sesion').upsert(lote, { onConflict: 'sesion_id,seq', ignoreDuplicates: true }))
        }
      } catch (e) {
        if (!esErrorDeRed(e)) throw e
        await encolar({ tipo: 'eventos', sesionId: eventos[0].sesionId, payload: eventos })
      }
    },
  },

  auditoria: {
    async listar(pacienteId) {
      const filas = ok(await supabase.from('auditoria').select('*').eq('paciente_id', pacienteId).order('cuando', { ascending: false }))
      return (filas ?? []).map(aAuditoria)
    },
    async registrar(r) {
      const { data } = await supabase.auth.getSession()
      ok(
        await supabase.from('auditoria').insert({
          quien: data.session?.user.id,
          accion: r.accion,
          entidad: r.entidad,
          entidad_id: r.entidadId ?? null,
          paciente_id: r.pacienteId ?? null,
          antes: r.antes ?? null,
          despues: r.despues ?? null,
        }),
      )
    },
  },

  consentimientos: {
    async ultimo(pacienteId) {
      const f = ok(
        await supabase.from('consentimientos').select('*').eq('paciente_id', pacienteId).order('firmado_el', { ascending: false }).limit(1).maybeSingle(),
      )
      return f
        ? ({ id: f.id, pacienteId: f.paciente_id, version: f.version, firmadoEl: f.firmado_el, opciones: f.opciones } satisfies Consentimiento)
        : null
    },
    async firmar(pacienteId, version, opciones) {
      const f = ok(await supabase.from('consentimientos').insert({ paciente_id: pacienteId, version, opciones }).select('*').single())
      return { id: f.id, pacienteId: f.paciente_id, version: f.version, firmadoEl: f.firmado_el, opciones: f.opciones }
    },
  },

  alertas: {
    async abiertas(ids) {
      let q = supabase.from('alertas').select('*').eq('estado', 'abierta').order('creada', { ascending: false })
      if (ids) q = q.in('paciente_id', ids)
      return (ok(await q) ?? []).map(aAlerta)
    },
    async crear(a) {
      ok(await supabase.from('alertas').insert({ paciente_id: a.pacienteId, sesion_id: a.sesionId, tipo: a.tipo, valor: a.valor }))
    },
    async revisar(id) {
      ok(await supabase.rpc('revisar_alerta', { p_alerta: id }))
    },
  },

  citas: {
    async proxima(pacienteId) {
      const f = ok(
        await supabase
          .from('citas')
          .select('*, terapeuta:perfiles!citas_terapeuta_id_fkey(nombre, titulo)')
          .eq('paciente_id', pacienteId)
          .gte('fecha', new Date().toISOString())
          .order('fecha')
          .limit(1)
          .maybeSingle(),
      )
      return f ? ({ id: f.id, pacienteId: f.paciente_id, fecha: f.fecha, modalidad: f.modalidad, terapeutaNombre: nombrePerfil(f.terapeuta) } satisfies Cita) : null
    },
  },

  perfiles: {
    async nombre(id) {
      if (cacheNombres.has(id)) return cacheNombres.get(id)!
      const f = ok(await supabase.from('perfiles').select('nombre, titulo').eq('id', id).maybeSingle())
      const n = nombrePerfil(f) ?? null
      cacheNombres.set(id, n)
      return n
    },
  },
}
