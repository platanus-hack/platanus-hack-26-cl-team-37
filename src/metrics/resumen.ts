// Resumen de sesión (F13): qué tarjetas mostrar, sus valores y la diferencia contra la sesión anterior del mismo
// juego y nivel. Solo describe datos: la diferencia dice cuánto cambió y en qué dirección, sin interpretarla.
import type { DefMetrica } from '../games/shell/contrato'
import { decimalesDe, formatoMetrica } from '../games/shell/contrato'
import type { MetricasSesion, Sesion } from '../domain/types'
import { num } from '../lib/formato'

/** Tarjetas del resumen: las métricas del juego con unidad (o `tarjeta: true`), hasta 5. La 6.ª es el dolor. */
export function tarjetasResumen(defs: DefMetrica[]): DefMetrica[] {
  return defs.filter((d) => d.tarjeta ?? d.unidad !== '').slice(0, 5)
}

// Sesiones sembradas antes de F09 no tienen `metricas.juego`: se leen de los agregados base cuando la métrica del
// juego mide lo mismo (mismo id y misma unidad).
const BASE: Record<string, { unidad: DefMetrica['unidad']; valor: (m: MetricasSesion) => number | null }> = {
  agarres: { unidad: '', valor: (m) => m.agarres },
  intentos: { unidad: '', valor: (m) => m.intentos },
  precision: { unidad: '%', valor: (m) => (m.intentos ? m.precision * 100 : null) },
  tiempoMedioAgarre: { unidad: 's', valor: (m) => m.tiempoMedioAgarreS },
  aperturaMax: { unidad: 'cm', valor: (m) => m.aperturaMaxCm },
  flexionIndiceMax: { unidad: '°', valor: (m) => m.flexionIndiceMax },
  suavidad: { unidad: '%', valor: (m) => m.suavidad },
}

/** Valor de una métrica de resumen en la unidad mostrada, o null si la sesión no la tiene. */
export function valorMetrica(def: Pick<DefMetrica, 'id' | 'unidad'>, m: MetricasSesion | null | undefined): number | null {
  if (!m) return null
  const v = m.juego ? m.juego[def.id] : undefined
  if (v !== undefined) return v != null && Number.isFinite(v) ? v : null
  const b = BASE[def.id]
  if (!b || b.unidad !== def.unidad) return null
  const x = b.valor(m)
  return x != null && Number.isFinite(x) ? x : null
}

const momento = (s: Sesion) => new Date(s.inicio ?? s.creada ?? 0).getTime()

/** Última sesión cerrada del mismo juego y nivel anterior a `actual` (o null). */
export function sesionAnterior(actual: Sesion, sesiones: Sesion[]): Sesion | null {
  const t = momento(actual)
  let mejor: Sesion | null = null
  for (const s of sesiones) {
    if (s.id === actual.id || s.estado !== 'cerrada' || s.juego !== actual.juego) continue
    if (s.parametros?.nivel !== actual.parametros?.nivel || !s.metricas) continue
    if (momento(s) >= t) continue
    if (!mejor || momento(s) > momento(mejor)) mejor = s
  }
  return mejor
}

export interface Diferencia {
  direccion: 'sube' | 'baja' | 'igual'
  /** "4 pts", "0,6 s", "3°", "igual". */
  texto: string
  /** Según `mejor` de la métrica: 'mejor' (verde), 'otro' (neutro). Sin `mejor` o igual: 'neutro'. */
  tono: 'mejor' | 'otro' | 'neutro'
}

/** Diferencia actual − anterior redondeada a los decimales mostrados. Sin alguno de los dos valores: null. */
export function diferencia(def: Pick<DefMetrica, 'unidad' | 'decimales' | 'mejor'>, actual: number | null, anterior: number | null): Diferencia | null {
  if (actual == null || anterior == null) return null
  const dec = decimalesDe(def)
  const f = 10 ** dec
  const d = Math.round((actual - anterior) * f) / f
  if (d === 0) return { direccion: 'igual', texto: 'igual', tono: 'neutro' }
  const abs = Math.abs(d)
  const texto = def.unidad === '%' ? `${num(abs, dec)} pts` : formatoMetrica(def, abs)
  const direccion = d > 0 ? 'sube' : 'baja'
  const tono = !def.mejor ? 'neutro' : (d > 0) === (def.mejor === 'mayor') ? 'mejor' : 'otro'
  return { direccion, texto, tono }
}

/** Banda descriptiva de la escala EVA 0–10 (la misma escala que marca el paciente; no es una evaluación). */
export function bandaDolor(eva: number | null): string {
  if (eva == null) return 'Sin registro'
  if (eva <= 0) return 'Sin dolor'
  if (eva <= 3) return 'Leve'
  if (eva <= 6) return 'Moderado'
  return 'Intenso'
}

/** "6:00 min". */
export function duracionTexto(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.round(segundos ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`
}

/** Avance del anillo 0..1 (sin meta: lleno si hubo al menos uno). */
export function avanceMeta(contador: number, meta: number): number {
  if (meta <= 0) return contador > 0 ? 1 : 0
  return Math.max(0, Math.min(1, contador / meta))
}
