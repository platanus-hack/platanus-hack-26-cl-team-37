// F15 · Datos del PDF de exportación (puro y probado). El dibujo está en pdf.ts.
// Solo describe lo medido: sin interpretación clínica.
import type { Sesion } from '../domain/types'
import { nombreJuego } from '../games/registry'
import { fechaNumerica, hora, num, nombreMano } from '../lib/formato'
import type { EstadoIntegridad } from './csv'
import { contadorYMeta, fechaSesion } from './filas'

export const PIE_PDF = 'Mediciones estimadas con cámara; no reemplazan la evaluación clínica'

export interface EntradaPdf {
  paciente: { nombre: string; manoAfectada: string; condicion?: string | null }
  terapeuta: string | null
  generadoPor: string
  generadoEn: Date
  /** Texto del período ("Últimos 7 días", "Toda la historia", "Sesión S-…"). */
  periodo: string
  sesiones: Sesion[]
  integridad: Record<string, EstadoIntegridad>
}

export interface PuntoSerie {
  /** ms epoch */
  x: number
  y: number
}

export interface SerieGrafico {
  id: string
  titulo: string
  unidad: string
  puntos: PuntoSerie[]
}

export interface DatosPdf {
  titulo: string
  encabezado: [string, string][]
  columnas: string[]
  filas: string[][]
  dolor: string
  series: SerieGrafico[]
  hashes: { id: string; hash: string; integridad: string }[]
  pie: string
}

export const TEXTO_INTEGRIDAD: Record<EstadoIntegridad, string> = { verificado: 'Verificado', alterado: 'Alterado', 'sin-hash': 'Sin hash' }

export function rangoFechas(sesiones: Sesion[]): { desde: Date; hasta: Date } | null {
  if (!sesiones.length) return null
  const t = sesiones.map((s) => fechaSesion(s).getTime())
  return { desde: new Date(Math.min(...t)), hasta: new Date(Math.max(...t)) }
}

export function datosPdf(e: EntradaPdf): DatosPdf {
  const orden = [...e.sesiones].sort((a, b) => fechaSesion(a).getTime() - fechaSesion(b).getTime())
  const r = rangoFechas(orden)
  const encabezado: [string, string][] = [
    ['Paciente', e.paciente.nombre],
    ['Mano afectada', nombreMano(e.paciente.manoAfectada)],
    ['Terapeuta', e.terapeuta ?? 'Sin terapeuta asignado'],
    ['Período', e.periodo],
    ['Fechas incluidas', r ? (fechaNumerica(r.desde) === fechaNumerica(r.hasta) ? fechaNumerica(r.desde) : `${fechaNumerica(r.desde)} a ${fechaNumerica(r.hasta)}`) : 'Sin sesiones'],
    ['Sesiones incluidas', String(orden.length)],
    ['Generado', `${fechaNumerica(e.generadoEn)} ${hora(e.generadoEn)} por ${e.generadoPor}`],
  ]

  const columnas = ['Fecha', 'Ejercicio', 'Nivel', 'Agarres/meta', 'Precisión', 'T. por agarre', 'Apertura pinza máx.', 'Flexión índice máx.', 'Dolor (0-10)']
  const filas = orden.map((s) => {
    const m = s.metricas
    const { contador, meta } = contadorYMeta(s)
    const f = fechaSesion(s)
    return [
      `${fechaNumerica(f)} ${hora(f)}`,
      nombreJuego(s.juego),
      String(s.parametros?.nivel ?? '-'),
      contador == null ? '-' : meta > 0 ? `${contador}/${meta}` : String(contador),
      m && m.intentos > 0 ? `${Math.round(m.precision * 100)}%` : '-',
      m?.tiempoMedioAgarreS != null ? `${num(m.tiempoMedioAgarreS)} s` : '-',
      m ? `${num(m.aperturaMaxCm)} cm aprox.` : '-',
      m ? `${Math.round(m.flexionIndiceMax)}° aprox.` : '-',
      s.dolorEVA != null ? String(s.dolorEVA) : '-',
    ]
  })

  const dolores = orden.map((s) => s.dolorEVA).filter((x): x is number => x != null)
  const dolor = dolores.length
    ? `Dolor reportado por el paciente (0 a 10): ${dolores.length} registros; promedio ${num(dolores.reduce((a, b) => a + b, 0) / dolores.length)}; mínimo ${Math.min(...dolores)}; máximo ${Math.max(...dolores)}.`
    : 'Sin dolor reportado en las sesiones incluidas.'

  const serie = (id: string, titulo: string, unidad: string, valor: (s: Sesion) => number | null): SerieGrafico => ({
    id,
    titulo,
    unidad,
    puntos: orden.flatMap((s) => {
      const y = valor(s)
      return y == null || !Number.isFinite(y) ? [] : [{ x: fechaSesion(s).getTime(), y }]
    }),
  })
  const series = [
    serie('apertura', 'Apertura máxima de pinza (aprox.)', 'cm', (s) => s.metricas?.aperturaMaxCm ?? null),
    serie('precision', 'Precisión', '%', (s) => (s.metricas && s.metricas.intentos > 0 ? s.metricas.precision * 100 : null)),
  ]

  return {
    titulo: orden.length === 1 ? `Registro de sesión ${orden[0].id}` : 'Historial de sesiones',
    encabezado,
    columnas,
    filas,
    dolor,
    series,
    hashes: orden.map((s) => ({ id: s.id, hash: s.hash ?? '-', integridad: TEXTO_INTEGRIDAD[e.integridad[s.id] ?? 'sin-hash'] })),
    pie: PIE_PDF,
  }
}

/** Nombre de archivo sin caracteres raros: "manoviva-S-20261121-02.pdf". */
export function nombreArchivo(base: string, ext: string): string {
  return `manoviva-${base.replace(/[^A-Za-z0-9_-]+/g, '-')}.${ext}`
}
