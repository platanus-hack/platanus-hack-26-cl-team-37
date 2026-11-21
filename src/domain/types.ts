export type Rol = 'paciente' | 'terapeuta'
export type Mano = 'izquierda' | 'derecha' | 'ambas'
export type LadoMano = 'izquierda' | 'derecha'
export type EstadoSesion = 'preparada' | 'en curso' | 'cerrada'
export type Esfuerzo = 'Muy suave' | 'Suave' | 'Moderado' | 'Fuerte' | 'Muy fuerte'
export const ESFUERZOS: Esfuerzo[] = ['Muy suave', 'Suave', 'Moderado', 'Fuerte', 'Muy fuerte']

export interface Usuario {
  id: string
  rol: Rol
  nombre: string
  titulo?: string | null
  clinicaId: string
  demo?: boolean
}

export interface Paciente {
  id: string
  usuarioId: string
  terapeutaId: string | null
  nombre: string
  manoAfectada: Mano
  condicion: string | null
  fechaInicio: string // YYYY-MM-DD
  largoManoCm: number | null
  compartirMetricas: boolean
  datosInvestigacion: boolean
  ultimoMensajeVisto: number
}

export interface PlanItem {
  juego: string
  nivel: number
  duracionMin: number
  mano: Mano
  metaAgarres: number
  metaPinzaCm: number
}

export interface Plan {
  id: string
  pacienteId: string
  version: number
  vigenteDesde: string
  creadoPor: string | null
  creadoPorNombre?: string
  sesionesPorSemana: number
  umbralDolor: number
  mensaje: string | null
  items: PlanItem[]
}

export interface ParametrosSesion {
  mano: Mano
  nivel: number
  duracionMin: number
  metaAgarres: number
  metaPinzaCm: number
  prescritoPor: string | null
}

export interface Calibracion {
  largoManoCm: number
  largoManoFuente: 'regla' | 'estimado'
  largoManoEstimadoCm: number
  aperturaPinzaMaxCm: number
  rangoAbrirCerrar: { min: number; max: number } // apertura normalizada 0..1
  fps: number
  confianzaMedia: number
  escalaCmPorUnidad: number
}

export interface FlexionDedos {
  pulgar: number
  indice: number
  medio: number
  anular: number
  menique: number
}

export interface MetricasSesion {
  agarres: number
  agarresIzq: number
  agarresDer: number
  intentos: number
  precision: number // 0..1
  tiempoMedioAgarreS: number | null
  aperturaMaxCm: number
  flexionMax: FlexionDedos
  flexionIndiceMax: number
  suavidad: number | null // 0..100
  calidadRegistro: number // 0..1 cuadros con mano
  duracionS: number
  fpsMedio: number
  metaCumplida: boolean
  /** Métricas de resumen propias del juego (ModuloJuego.metricasResumen), por id. Sesiones desde F09. */
  juego?: Record<string, number | null>
  /** Contador del juego contra la meta (agarres, burbujas, cierres…) y la meta. Sesiones desde F09. */
  contador?: number
  meta?: number
  /** Cómo terminó: por tiempo, por meta o a pedido del paciente. Sesiones desde F09. */
  motivoFin?: 'tiempo' | 'meta' | 'manual'
}

export interface Muestras {
  hz: number
  t: number[]
  apertura: (number | null)[]
  flexIndice: (number | null)[]
  /** Señales propias de cada juego (ModuloJuego.muestra), alineadas con `t`. */
  canales?: Record<string, (number | null)[]>
}

export interface Dispositivo {
  modelo: string
  camara: string
  fps: number
}

export interface Sesion {
  id: string
  pacienteId: string
  planVersion: number | null
  juego: string
  parametros: ParametrosSesion
  inicio: string | null
  fin: string | null
  estado: EstadoSesion
  calibracion: Calibracion | null
  metricas: MetricasSesion | null
  muestras: Muestras | null
  dolorEVA: number | null
  esfuerzo: Esfuerzo | null
  nota: string | null
  dispositivo: Dispositivo | null
  versionApp: string | null
  versionModelo: string | null
  hash: string | null
  creada?: string
}

export type TipoEvento = 'agarre_inicio' | 'agarre_fin' | 'soltar' | 'perdida_seguimiento' | 'pausa' | 'reanudar'

export interface EventoSesion {
  sesionId: string
  seq: number
  t: number // ms desde el inicio
  tipo: TipoEvento
  mano: LadoMano | null
  objeto: string | null
  datos: Record<string, unknown> | null
}

export interface Auditoria {
  id: number
  quien: string | null
  quienNombre?: string
  cuando: string
  accion: string
  entidad: string
  entidadId: string | null
  pacienteId: string | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
}

export interface Consentimiento {
  id: string
  pacienteId: string
  version: string
  firmadoEl: string
  opciones: Record<string, unknown>
}

export interface Alerta {
  id: string
  pacienteId: string
  sesionId: string | null
  tipo: 'dolor' | 'inactividad'
  valor: number | null
  creada: string
  estado: 'abierta' | 'revisada'
}

export interface Cita {
  id: string
  pacienteId: string
  fecha: string
  modalidad: string
  terapeutaNombre?: string
}
