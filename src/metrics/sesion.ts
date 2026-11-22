// Agregados de sesión, adherencia, racha y calidad. Funciones puras.
import type { EventoSesion, FlexionDedos, MetricasSesion, Plan, Sesion } from '../domain/types'

export function precision(exitosos: number, intentos: number): number {
  return intentos > 0 ? exitosos / intentos : 0
}

export function calidadRegistro(cuadrosConMano: number, cuadrosTotales: number): number {
  return cuadrosTotales > 0 ? cuadrosConMano / cuadrosTotales : 0
}

/**
 * Sesión jugada con una fuente de manos simulada (`?fuente=sintetica` o `grabacion`: pruebas y demostraciones sin cámara).
 * Queda marcada desde la calibración (dispositivo.camara y versionModelo). Sus medidas no vienen de la mano del paciente:
 * se ven en el historial con esa marca, pero no entran en la tendencia de /progreso.
 */
export function esSimulada(s: Pick<Sesion, 'dispositivo' | 'versionModelo'>): boolean {
  const camara = s.dispositivo?.camara
  return camara === 'sintetica' || camara === 'grabacion' || /^(sintetica|grabacion)\b/.test(s.versionModelo ?? '')
}

export const UMBRAL_CALIDAD = 0.7
export function calidadSuficiente(s: Pick<Sesion, 'metricas'>): boolean {
  return (s.metricas?.calidadRegistro ?? 0) >= UMBRAL_CALIDAD
}

/**
 * Intentos y agarres exitosos a partir de los eventos. Un intento = un agarre_inicio. Éxito = soltar con datos.enCaja.
 * Tiempo de un agarre = agarre_inicio → agarre_fin (abrir la pinza) del mismo mano|objeto si existe; si no, → soltar
 * (en Caja, `soltar` llega cuando el juguete ya quedó quieto, F10).
 * Los eventos llevan la hora del reloj, que sigue corriendo en pausa: el tiempo entre `pausa` y `reanudar` se descuenta,
 * así un agarre que quedó a medias durante una pausa (p. ej. la automática por perder la mano) no infla el tiempo medio.
 * Un `soltar` con datos.motivo = 'sin-mano' (el seguimiento perdió la mano mientras agarraba) anula ese intento: no baja la precisión.
 */
export function contarAgarres(eventos: EventoSesion[]) {
  let intentos = 0
  let exitosos = 0
  let izq = 0
  let der = 0
  const tiempos: number[] = []
  const abiertos = new Map<string, number>()
  const finales = new Map<string, number>()
  let pausado = 0
  let enPausaDesde: number | null = null
  for (const e of eventos) {
    if (e.tipo === 'pausa') {
      enPausaDesde ??= e.t
      continue
    }
    if (e.tipo === 'reanudar') {
      if (enPausaDesde != null) pausado += Math.max(0, e.t - enPausaDesde)
      enPausaDesde = null
      continue
    }
    // Tiempo activo (sin pausas) de este evento.
    const t = e.t - pausado - (enPausaDesde != null ? Math.max(0, e.t - enPausaDesde) : 0)
    const clave = `${e.mano}|${e.objeto}`
    if (e.tipo === 'agarre_inicio') {
      intentos++
      abiertos.set(clave, t)
      finales.delete(clave)
    } else if (e.tipo === 'agarre_fin') {
      if (abiertos.has(clave)) finales.set(clave, t)
    } else if (e.tipo === 'soltar') {
      const t0 = abiertos.get(clave)
      const t1 = finales.get(clave) ?? t
      abiertos.delete(clave)
      finales.delete(clave)
      // Agarre que terminó porque se dejó de ver la mano (no lo soltó el paciente): no es un intento fallido suyo.
      if (t0 != null && (e.datos as { motivo?: string } | null)?.motivo === 'sin-mano') {
        intentos = Math.max(0, intentos - 1)
        continue
      }
      if (e.datos && (e.datos as { enCaja?: boolean }).enCaja) {
        exitosos++
        if (e.mano === 'izquierda') izq++
        else if (e.mano === 'derecha') der++
        if (t0 != null) tiempos.push((t1 - t0) / 1000)
      }
    }
  }
  const tiempoMedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null
  return { intentos, exitosos, izq, der, tiempoMedio }
}

export interface EntradaAgregados {
  eventos: EventoSesion[]
  aperturaMaxCm: number
  flexionMax: FlexionDedos
  suavidad: number | null
  cuadrosConMano: number
  cuadrosTotales: number
  duracionS: number
  fpsMedio: number
  metaAgarres: number
}

const r1 = (x: number) => Math.round(x * 10) / 10
const r3 = (x: number) => Math.round(x * 1000) / 1000

export function agregarSesion(e: EntradaAgregados): MetricasSesion {
  const c = contarAgarres(e.eventos)
  return {
    agarres: c.exitosos,
    agarresIzq: c.izq,
    agarresDer: c.der,
    intentos: c.intentos,
    precision: r3(precision(c.exitosos, c.intentos)),
    tiempoMedioAgarreS: c.tiempoMedio == null ? null : r1(c.tiempoMedio),
    aperturaMaxCm: r1(e.aperturaMaxCm),
    flexionMax: {
      pulgar: Math.round(e.flexionMax.pulgar),
      indice: Math.round(e.flexionMax.indice),
      medio: Math.round(e.flexionMax.medio),
      anular: Math.round(e.flexionMax.anular),
      menique: Math.round(e.flexionMax.menique),
    },
    flexionIndiceMax: Math.round(e.flexionMax.indice),
    suavidad: e.suavidad,
    calidadRegistro: r3(calidadRegistro(e.cuadrosConMano, e.cuadrosTotales)),
    duracionS: Math.round(e.duracionS),
    fpsMedio: r1(e.fpsMedio),
    metaCumplida: c.exitosos >= e.metaAgarres,
  }
}

// ---------------------------------------------------------------- fechas (zona local)
export function claveDia(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function sesionesCerradas(sesiones: Sesion[]) {
  return sesiones.filter((s) => s.estado === 'cerrada' && s.inicio)
}

/** Sesiones planificadas por semana = días de práctica × ejercicios del plan. */
export function planificadasPorSemana(plan: Pick<Plan, 'sesionesPorSemana'> & { items?: unknown[] }): number {
  return plan.sesionesPorSemana * Math.max(1, plan.items?.length ?? 1)
}

/**
 * Adherencia = sesiones hechas / sesiones planificadas en los últimos 7 días (tope 1).
 * Planificadas = días de práctica por semana × ejercicios del plan.
 */
export function adherencia(sesiones: Sesion[], plan: (Pick<Plan, 'sesionesPorSemana'> & { items?: unknown[] }) | null, hoy: Date): number | null {
  if (!plan || plan.sesionesPorSemana <= 0) return null
  const planificadas = planificadasPorSemana(plan)
  const desde = new Date(hoy)
  desde.setHours(0, 0, 0, 0)
  desde.setDate(desde.getDate() - 6)
  const hechas = sesionesCerradas(sesiones).filter((s) => {
    const t = new Date(s.inicio!)
    return t >= desde && t <= hoy
  }).length
  return Math.min(1, hechas / planificadas)
}

/** Días consecutivos con al menos una sesión cerrada, contando hasta hoy (o hasta ayer si hoy aún no hay). */
export function racha(sesiones: Sesion[], hoy: Date): number {
  const dias = new Set(sesionesCerradas(sesiones).map((s) => claveDia(new Date(s.inicio!))))
  const d = new Date(hoy)
  if (!dias.has(claveDia(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (dias.has(claveDia(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export type EstadoDia = 'cumplido' | 'parcial' | 'pendiente' | 'futuro'

/** Estado de cada día de la semana actual (lunes a domingo). */
export function semana(sesiones: Sesion[], ejerciciosPorDia: number, hoy: Date): { clave: string; estado: EstadoDia; hoy: boolean; hechas: number }[] {
  const lunes = new Date(hoy)
  lunes.setHours(0, 0, 0, 0)
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
  const porDia = new Map<string, number>()
  for (const s of sesionesCerradas(sesiones)) {
    const k = claveDia(new Date(s.inicio!))
    porDia.set(k, (porDia.get(k) ?? 0) + 1)
  }
  const out = []
  const kHoy = claveDia(hoy)
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    const k = claveDia(d)
    const n = porDia.get(k) ?? 0
    let estado: EstadoDia
    if (k > kHoy) estado = 'futuro'
    else if (n >= Math.max(1, ejerciciosPorDia)) estado = 'cumplido'
    else if (n > 0) estado = 'parcial'
    else estado = 'pendiente'
    out.push({ clave: k, estado, hoy: k === kHoy, hechas: n })
  }
  return out
}

export type EstadoEjercicio = 'hecho' | 'siguiente' | 'pendiente'

/**
 * Estado de cada ejercicio del plan de hoy. Un ejercicio está hecho si hoy hay una sesión cerrada de ese juego
 * (cada sesión cubre un solo ítem, en orden). El primer ejercicio no hecho es el siguiente; el resto, pendientes.
 */
export function planDeHoy<T extends { juego: string }>(items: T[], sesiones: Sesion[], hoy: Date): { item: T; estado: EstadoEjercicio }[] {
  const kHoy = claveDia(hoy)
  const hechasHoy = new Map<string, number>()
  for (const s of sesionesCerradas(sesiones)) {
    if (claveDia(new Date(s.inicio!)) === kHoy) hechasHoy.set(s.juego, (hechasHoy.get(s.juego) ?? 0) + 1)
  }
  let haySiguiente = false
  return items.map((item) => {
    const n = hechasHoy.get(item.juego) ?? 0
    if (n > 0) {
      hechasHoy.set(item.juego, n - 1)
      return { item, estado: 'hecho' as const }
    }
    if (!haySiguiente) {
      haySiguiente = true
      return { item, estado: 'siguiente' as const }
    }
    return { item, estado: 'pendiente' as const }
  })
}

/** Diferencia contra la sesión anterior del mismo juego y nivel (o null si no hay). */
export function sesionAnterior(actual: Sesion, todas: Sesion[]): Sesion | null {
  const previas = todas
    .filter(
      (s) =>
        s.id !== actual.id &&
        s.estado === 'cerrada' &&
        s.juego === actual.juego &&
        s.parametros?.nivel === actual.parametros?.nivel &&
        s.inicio &&
        actual.inicio &&
        s.inicio < actual.inicio,
    )
    .sort((a, b) => (a.inicio! < b.inicio! ? 1 : -1))
  return previas[0] ?? null
}

/** Variación porcentual entre el primer y último valor. */
export function variacionPct(primero: number, ultimo: number): number | null {
  if (!primero) return null
  return ((ultimo - primero) / primero) * 100
}

export function diasDesde(fechaIso: string | null, hoy: Date): number | null {
  if (!fechaIso) return null
  const ms = hoy.getTime() - new Date(fechaIso).getTime()
  return Math.floor(ms / 86400000)
}

export function semanaTratamiento(fechaInicio: string, hoy: Date): number {
  const d = new Date(fechaInicio + 'T00:00:00')
  return Math.max(1, Math.floor((hoy.getTime() - d.getTime()) / (7 * 86400000)) + 1)
}
