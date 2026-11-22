// F38 · Indicadores de cada juego para comparar dos sesiones: qué se muestra, cómo se lee de la sesión y la diferencia.
// Los juegos conocidos tienen su lista fija (las sesiones sembradas antes de F09 no traen `metricas.juego`, así que se
// leen de los agregados base); los demás usan las métricas de resumen que declara su módulo. Solo describe datos.
import type { Sesion } from '../domain/types'
import type { DefMetrica } from '../games/shell/contrato'
import { num } from '../lib/formato'
import { tarjetasResumen, valorMetrica } from '../metrics/resumen'

export interface DefKpi {
  id: string
  nombre: string
  unidad: DefMetrica['unidad'] | 'kg'
  decimales?: number
  mejor?: 'mayor' | 'menor'
  /** Medida de cámara: se rotula "aprox.". */
  aprox?: boolean
  leer(s: Sesion): number | null
}

const fin = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const delJuego = (s: Sesion, id: string) => fin(s.metricas?.juego?.[id])

export function decimalesKpi(d: Pick<DefKpi, 'unidad' | 'decimales'>): number {
  return d.decimales ?? (d.unidad === 'cm' || d.unidad === 's' || d.unidad === 'kg' ? 1 : 0)
}

/** "6,1 cm", "68°", "86%", "2,4 kg", "9". */
export function formatoKpi(d: Pick<DefKpi, 'unidad' | 'decimales'>, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const t = num(v, decimalesKpi(d))
  if (d.unidad === '°' || d.unidad === '%') return `${t}${d.unidad}`
  return d.unidad ? `${t} ${d.unidad}` : t
}

export interface DifKpi {
  /** "+0,6 cm", "−2 pts", "sin cambio". */
  texto: string
  direccion: 'sube' | 'baja' | 'igual'
  /** Verde si va hacia lo mejor según `mejor`; neutro si la métrica no declara cuál es mejor o no cambió. */
  tono: 'mejor' | 'otro' | 'neutro'
}

/** Diferencia después − antes, redondeada a los decimales mostrados. Falta un valor: null. */
export function difKpi(d: Pick<DefKpi, 'unidad' | 'decimales' | 'mejor'>, antes: number | null, despues: number | null): DifKpi | null {
  if (antes == null || despues == null) return null
  const dec = decimalesKpi(d)
  const f = 10 ** dec
  const x = Math.round((despues - antes) * f) / f
  if (x === 0) return { texto: 'sin cambio', direccion: 'igual', tono: 'neutro' }
  const abs = Math.abs(x)
  const signo = x > 0 ? '+' : '−'
  const cuerpo = d.unidad === '%' ? `${num(abs, dec)} pts` : formatoKpi(d, abs)
  return { texto: `${signo}${cuerpo}`, direccion: x > 0 ? 'sube' : 'baja', tono: !d.mejor ? 'neutro' : x > 0 === (d.mejor === 'mayor') ? 'mejor' : 'otro' }
}

export interface KpiValor {
  def: DefKpi
  antes: number | null
  despues: number | null
  dif: DifKpi | null
}

export function kpisDe(defs: DefKpi[], antes: Sesion, despues: Sesion): KpiValor[] {
  return defs.map((def) => {
    const a = def.leer(antes)
    const d = def.leer(despues)
    return { def, antes: a, despues: d, dif: difKpi(def, a, d) }
  })
}

export interface PuntoSerie {
  id: string
  t: number
  v: number
}

/** Valor del indicador en cada sesión (ya ordenadas), sin las que no lo tienen. */
export function serieDe(def: DefKpi, sesiones: Sesion[]): PuntoSerie[] {
  const out: PuntoSerie[] = []
  for (const s of sesiones) {
    const v = def.leer(s)
    if (v != null) out.push({ id: s.id, t: new Date(s.inicio ?? s.creada ?? 0).getTime(), v })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Listas por juego

export const DOLOR: DefKpi = { id: 'dolor', nombre: 'Dolor (0–10)', unidad: '', mejor: 'menor', leer: (s) => fin(s.dolorEVA) }

const APERTURA: DefKpi = { id: 'apertura', nombre: 'Apertura máxima', unidad: 'cm', aprox: true, mejor: 'mayor', leer: (s) => fin(s.metricas?.aperturaMaxCm) }
const FLEX_INDICE: DefKpi = { id: 'flexIndice', nombre: 'Flexión del índice', unidad: '°', aprox: true, mejor: 'mayor', leer: (s) => fin(s.metricas?.flexionIndiceMax) }
const SUAVIDAD: DefKpi = { id: 'suavidad', nombre: 'Suavidad', unidad: '%', mejor: 'mayor', leer: (s) => fin(s.metricas?.suavidad) }

const MOVILIDAD: DefKpi[] = [
  APERTURA,
  FLEX_INDICE,
  SUAVIDAD,
  { id: 'ciclos', nombre: 'Ciclos', unidad: '', mejor: 'mayor', leer: (s) => delJuego(s, 'ciclos') ?? fin(s.metricas?.agarres) },
]

const CAJA: DefKpi[] = [
  { id: 'agarres', nombre: 'Agarres logrados', unidad: '', mejor: 'mayor', leer: (s) => delJuego(s, 'agarres') ?? fin(s.metricas?.agarres) },
  {
    id: 'precision',
    nombre: 'Precisión',
    unidad: '%',
    mejor: 'mayor',
    leer: (s) => delJuego(s, 'precision') ?? (s.metricas && s.metricas.intentos > 0 ? s.metricas.precision * 100 : null),
  },
  { id: 'tiempoAgarre', nombre: 'Tiempo por agarre', unidad: 's', mejor: 'menor', leer: (s) => delJuego(s, 'tiempoMedioAgarre') ?? fin(s.metricas?.tiempoMedioAgarreS) },
  APERTURA,
]

// Contrato de los juegos nuevos (se leen de metricas.juego; no hay lectura base).
const mj = (id: string, nombre: string, unidad: DefKpi['unidad'], extra: Partial<DefKpi> = {}): DefKpi => ({ id, nombre, unidad, leer: (s) => delJuego(s, id), ...extra })

const BANDA: DefKpi[] = [
  mj('estiramientoMaxCm', 'Estiramiento máximo', 'cm', { aprox: true, mejor: 'mayor' }),
  mj('estiramientoMaxPct', 'Estiramiento sobre el reposo', '%', { aprox: true, mejor: 'mayor' }),
  mj('repeticiones', 'Repeticiones', '', { mejor: 'mayor' }),
  mj('cargaMaxKg', 'Carga máxima (aprox.)', 'kg', { aprox: true, mejor: 'mayor' }),
  mj('tiempoBajoTensionS', 'Tiempo bajo tensión', 's', { mejor: 'mayor' }),
  mj('cambioPicoPct', 'Cambio del pico (1.ª → última)', '%'),
]

/** Honda (F39): llegar a la carga del nivel y sostenerla; la precisión y la constancia muestran el control. */
const HONDA: DefKpi[] = [
  mj('aciertos', 'Aciertos', '', { mejor: 'mayor' }),
  mj('precisionPct', 'Tiros en el blanco', '%', { mejor: 'mayor' }),
  mj('cargaMaxKg', 'Carga máxima (aprox.)', 'kg', { aprox: true, mejor: 'mayor' }),
  mj('constanciaPct', 'Constancia entre tiros', '%', { mejor: 'mayor' }),
  mj('sostenidoPromedioS', 'Sostenido promedio', 's', { mejor: 'mayor' }),
  mj('tiempoBajoTensionS', 'Tiempo bajo tensión', 's', { mejor: 'mayor' }),
]

/** Direcciones de la muñeca (° respecto de la mano neutra). */
export const DIRECCIONES_MUNECA: DefKpi[] = [
  mj('flexionMax', 'Flexión', '°', { aprox: true, mejor: 'mayor' }),
  mj('extensionMax', 'Extensión', '°', { aprox: true, mejor: 'mayor' }),
  mj('radialMax', 'Desviación radial', '°', { aprox: true, mejor: 'mayor' }),
  mj('cubitalMax', 'Desviación cubital', '°', { aprox: true, mejor: 'mayor' }),
  mj('giroPosMax', 'Giro +', '°', { aprox: true, mejor: 'mayor' }),
  mj('giroNegMax', 'Giro −', '°', { aprox: true, mejor: 'mayor' }),
  mj('conoMax', 'Cono', '°', { aprox: true, mejor: 'mayor' }),
]
const MUNECA: DefKpi[] = [...DIRECCIONES_MUNECA.slice(0, 4), mj('movimientos', 'Movimientos', '', { mejor: 'mayor' })]

const FIJOS: Record<string, DefKpi[]> = {
  'movilidad-guiada': MOVILIDAD,
  'caja-juguetes': CAJA,
  'banda-elastica': BANDA,
  'muneca-3d': MUNECA,
  honda: HONDA,
}

/** El juego tiene lista fija (no hace falta cargar su módulo para saber qué comparar). */
export function tieneListaFija(juego: string): boolean {
  return juego in FIJOS
}

function desdeMetricas(defs: DefMetrica[]): DefKpi[] {
  return tarjetasResumen(defs).map((d) => ({ ...d, leer: (s: Sesion) => valorMetrica(d, s.metricas) }))
}

/**
 * Indicadores a comparar de un juego: la lista fija si existe; si no, las métricas de resumen de su módulo (si ninguna
 * tiene valor en estas sesiones, las básicas). Se quitan los que ninguna sesión trae y se agrega el dolor al final.
 */
export function listaKpis(juego: string, defsModulo: DefMetrica[] | null, sesiones: Sesion[]): DefKpi[] {
  let lista = FIJOS[juego] ?? (defsModulo ? desdeMetricas(defsModulo) : [])
  const conDato = (l: DefKpi[]) => l.filter((d) => sesiones.some((s) => d.leer(s) != null))
  let util = conDato(lista)
  if (!util.length && !FIJOS[juego]) {
    lista = [APERTURA, FLEX_INDICE, SUAVIDAD, { id: 'contador', nombre: 'Contador', unidad: '', mejor: 'mayor', leer: (s: Sesion) => fin(s.metricas?.contador ?? s.metricas?.agarres) }]
    util = conDato(lista)
  }
  const dolor = sesiones.some((s) => DOLOR.leer(s) != null) ? [DOLOR] : []
  return [...util, ...dolor]
}
