// Interfaces de acceso a datos. Las pantallas solo conocen estas interfaces;
// la implementación actual es Supabase (supabaseRepos.ts) con cola local en IndexedDB.
import type {
  Alerta,
  Auditoria,
  Cita,
  Consentimiento,
  EventoSesion,
  Paciente,
  Plan,
  PlanItem,
  Rol,
  Sesion,
  Usuario,
} from '../domain/types'
import { supabaseRepos } from './supabaseRepos'

export interface AuthService {
  usuarioActual(): Promise<Usuario | null>
  ingresar(datos: { email: string; password: string; rol: Rol; codigoClinica: string }): Promise<Usuario>
  salir(): Promise<void>
  alCambiar(cb: () => void): () => void
}

export interface PacientesRepo {
  miPaciente(): Promise<Paciente | null>
  porId(id: string): Promise<Paciente | null>
  deTerapeuta(): Promise<Paciente[]>
  actualizarPrivacidad(compartir: boolean, investigacion: boolean): Promise<void>
  marcarMensajeVisto(version: number): Promise<void>
  eliminarMisDatos(): Promise<void>
}

export interface PlanesRepo {
  vigente(pacienteId: string): Promise<Plan | null>
  versiones(pacienteId: string): Promise<Plan[]>
  crearVersion(pacienteId: string, datos: { sesionesPorSemana: number; umbralDolor: number; mensaje: string; items: PlanItem[] }): Promise<Plan>
}

export interface SesionesRepo {
  listar(pacienteId: string): Promise<Sesion[]>
  listarVarios(pacienteIds: string[]): Promise<Sesion[]>
  obtener(id: string): Promise<Sesion | null>
  crear(datos: Omit<Sesion, 'id'>): Promise<Sesion>
  actualizar(id: string, cambios: Partial<Sesion>): Promise<void>
  /**
   * Cierra una sesión 'en curso' (F13): sube lo pendiente de la cola local, calcula el SHA-256 sobre la sesión y sus
   * eventos tal como quedaron en la BD y la marca 'cerrada' con ese hash (desde ahí es inmutable). Idempotente: si ya
   * está cerrada la devuelve tal cual. Falla si quedan escrituras pendientes (sin conexión) o si no está 'en curso'.
   */
  cerrar(id: string): Promise<Sesion>
  eventos(id: string): Promise<EventoSesion[]>
  agregarEventos(eventos: EventoSesion[]): Promise<void>
}

export interface AuditoriaRepo {
  listar(pacienteId: string): Promise<Auditoria[]>
  registrar(r: { accion: string; entidad: string; entidadId?: string | null; pacienteId?: string | null; antes?: unknown; despues?: unknown }): Promise<void>
}

export interface ConsentimientosRepo {
  ultimo(pacienteId: string): Promise<Consentimiento | null>
  /** Todos los consentimientos firmados (F18: descargar mis datos). */
  listar(pacienteId: string): Promise<Consentimiento[]>
  firmar(pacienteId: string, version: string, opciones: Record<string, unknown>): Promise<Consentimiento>
}

export interface AlertasRepo {
  abiertas(pacienteIds?: string[]): Promise<Alerta[]>
  /** Alertas (abiertas o revisadas) de una sesión: evita duplicar la alerta de dolor si se guarda dos veces. */
  deSesion(sesionId: string): Promise<Alerta[]>
  /** Todas las alertas del paciente, abiertas o revisadas (F18: descargar mis datos). */
  delPaciente(pacienteId: string): Promise<Alerta[]>
  crear(a: { pacienteId: string; sesionId: string; tipo: 'dolor'; valor: number }): Promise<void>
  revisar(id: string): Promise<void>
}

export interface CitasRepo {
  proxima(pacienteId: string): Promise<Cita | null>
}

export interface PerfilesRepo {
  nombre(id: string): Promise<string | null>
}

export interface Repos {
  auth: AuthService
  pacientes: PacientesRepo
  planes: PlanesRepo
  sesiones: SesionesRepo
  auditoria: AuditoriaRepo
  consentimientos: ConsentimientosRepo
  alertas: AlertasRepo
  citas: CitasRepo
  perfiles: PerfilesRepo
}

// Implementación activa. Las pantallas importan `repos` desde aquí.
export const repos: Repos = supabaseRepos
