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
  eventos(id: string): Promise<EventoSesion[]>
  agregarEventos(eventos: EventoSesion[]): Promise<void>
}

export interface AuditoriaRepo {
  listar(pacienteId: string): Promise<Auditoria[]>
  registrar(r: { accion: string; entidad: string; entidadId?: string | null; pacienteId?: string | null; antes?: unknown; despues?: unknown }): Promise<void>
}

export interface ConsentimientosRepo {
  ultimo(pacienteId: string): Promise<Consentimiento | null>
  firmar(pacienteId: string, version: string, opciones: Record<string, unknown>): Promise<Consentimiento>
}

export interface AlertasRepo {
  abiertas(pacienteIds?: string[]): Promise<Alerta[]>
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
