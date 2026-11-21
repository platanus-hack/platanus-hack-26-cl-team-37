// F16 · Carga común del panel del terapeuta (pacientes que comparten métricas, sus planes, sesiones y alertas) y el
// umbral configurable de "Sin sesiones hace N días". Solo usa `repos`.
import { useCallback, useState } from 'react'
import { repos } from '../../data/repos'
import type { Alerta, Paciente, Plan, Sesion } from '../../domain/types'
import { armarFila, DIAS_SIN_SESION_DEFECTO, DIAS_SIN_SESION_MAX, DIAS_SIN_SESION_MIN, type FilaPaciente } from './panel'

export interface DatosPanel {
  pacientes: Paciente[]
  planes: Record<string, Plan | null>
  sesiones: Sesion[]
  alertas: Alerta[]
}

export async function cargarPanel(): Promise<DatosPanel> {
  // La BD (RLS) ya oculta a quien no comparte métricas; se vuelve a filtrar por si acaso.
  const pacientes = (await repos.pacientes.deTerapeuta()).filter((p) => p.compartirMetricas)
  const ids = pacientes.map((p) => p.id)
  const [planes, sesiones, alertas] = await Promise.all([
    Promise.all(pacientes.map(async (p) => [p.id, await repos.planes.vigente(p.id)] as const)),
    repos.sesiones.listarVarios(ids),
    ids.length ? repos.alertas.abiertas(ids) : Promise.resolve([] as Alerta[]),
  ])
  return { pacientes, planes: Object.fromEntries(planes), sesiones, alertas }
}

const CLAVE = 'manoviva-dias-sin-sesion'

function leer(): number {
  try {
    const n = Number(localStorage.getItem(CLAVE))
    if (Number.isInteger(n) && n >= DIAS_SIN_SESION_MIN && n <= DIAS_SIN_SESION_MAX) return n
  } catch {
    /* sin almacenamiento: se usa el valor por defecto */
  }
  return DIAS_SIN_SESION_DEFECTO
}

/** Días sin sesiones para avisar (3 por defecto); se recuerda en este dispositivo. */
export function useDiasSinSesion(): [number, (n: number) => void] {
  const [n, setN] = useState(leer)
  const fijar = useCallback((v: number) => {
    setN(v)
    try {
      localStorage.setItem(CLAVE, String(v))
    } catch {
      /* ignorar */
    }
  }, [])
  return [n, fijar]
}

/** Filas del panel (sin ordenar) para unos datos, una fecha y un umbral de días. */
export function filasDe(d: DatosPanel, hoy: Date, umbralDias: number): FilaPaciente[] {
  return d.pacientes.map((paciente) =>
    armarFila({
      paciente,
      plan: d.planes[paciente.id] ?? null,
      sesiones: d.sesiones.filter((s) => s.pacienteId === paciente.id),
      alertas: d.alertas,
      hoy,
      umbralDias,
    }),
  )
}
