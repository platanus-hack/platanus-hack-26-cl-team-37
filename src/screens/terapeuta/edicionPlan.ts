// F17 · Prescripción del plan: lógica pura (borrador, diferencias antes → después, validación y tendencia de pinza).
// Solo describe y compara valores; no interpreta ni recomienda. Sin React ni repos.
import type { Mano, Plan, PlanItem, Sesion } from '../../domain/types'
import { DURACION_POR_DEFECTO } from '../../games/preparar'
import { JUEGOS, nombreJuego, type Juego } from '../../games/registry'
import { num } from '../../lib/formato'
import { calcularProgreso } from '../../metrics/progreso'

export const NIVEL_MIN = 1
export const NIVEL_MAX = 5
/** Días de práctica por semana (el plan los llama «sesiones por semana»). */
export const SESIONES_MIN = 1
export const SESIONES_MAX = 7
/** Meta de cada juego por sesión (agarres, burbujas, ciclos…). 0 = práctica libre: la sesión termina por tiempo. */
export const META_JUEGO_MIN = 0
export const META_JUEGO_MAX = 60
/** Meta por sesión de un ejercicio recién agregado (la que usan los planes demo). */
export const META_JUEGO_NUEVO = 10
export const META_PINZA_MIN = 1
export const META_PINZA_MAX = 15
export const META_PINZA_PASO = 0.5
export const UMBRAL_MIN = 1
export const UMBRAL_MAX = 10
export const MENSAJE_MAX = 280

/** Valores editables del plan. La meta de pinza es una sola y se aplica a todos los ejercicios del plan. */
export interface Borrador {
  /** Ejercicios del plan, en orden (ids del registro). Un plan necesita al menos uno. */
  juegos: string[]
  /** Nivel por juego (id del registro). */
  niveles: Record<string, number>
  /** Meta por sesión de cada juego (metaAgarres del ítem). */
  metas: Record<string, number>
  sesionesPorSemana: number
  metaPinzaCm: number
  umbralDolor: number
  mensaje: string
}

export type Campo = 'ejercicio' | 'nivel' | 'meta' | 'sesiones' | 'metaPinza' | 'umbral' | 'mensaje'

export interface Cambio {
  campo: Campo
  /** Id del juego cuando el campo es 'ejercicio', 'nivel' o 'meta'. */
  juego?: string
  etiqueta: string
  antes: string
  despues: string
}

/** Cómo queda un ejercicio respecto del plan vigente. */
export type EstadoEjercicio = 'igual' | 'nuevo' | 'quitado'

const redondear = (n: number) => Math.round(n * 1000) / 1000
const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(n)) || min))

/** Meta de pinza del plan: la mayor meta (> 0) entre sus ejercicios (como Progreso); 0 si ninguno tiene. */
export function metaPinzaDe(items: PlanItem[]): number {
  const v = items.map((i) => i.metaPinzaCm).filter((x) => typeof x === 'number' && x > 0)
  return v.length ? Math.max(...v) : 0
}

/** Ajusta una meta al paso de 0,5 y a los límites. */
export function ajustarMeta(v: number): number {
  const paso = Math.round(v / META_PINZA_PASO) * META_PINZA_PASO
  return redondear(Math.min(META_PINZA_MAX, Math.max(META_PINZA_MIN, paso)))
}

/** Juegos del plan en orden, sin repetir. */
export function juegosDelPlan(plan: Plan): string[] {
  return [...new Set(plan.items.map((i) => i.juego))]
}

/** Borrador inicial = el plan vigente (sin mensaje). Con dos ítems del mismo juego se usan el nivel y la meta mayores. */
export function borradorDe(plan: Plan): Borrador {
  const niveles: Record<string, number> = {}
  const metas: Record<string, number> = {}
  for (const it of plan.items) {
    niveles[it.juego] = Math.max(niveles[it.juego] ?? NIVEL_MIN, acotar(it.nivel, NIVEL_MIN, NIVEL_MAX))
    metas[it.juego] = Math.max(metas[it.juego] ?? META_JUEGO_MIN, acotar(it.metaAgarres, META_JUEGO_MIN, META_JUEGO_MAX))
  }
  const meta = metaPinzaDe(plan.items)
  return {
    juegos: juegosDelPlan(plan),
    niveles,
    metas,
    sesionesPorSemana: acotar(plan.sesionesPorSemana, SESIONES_MIN, SESIONES_MAX),
    metaPinzaCm: meta > 0 ? ajustarMeta(meta) : META_PINZA_MIN,
    umbralDolor: acotar(plan.umbralDolor, UMBRAL_MIN, UMBRAL_MAX),
    mensaje: '',
  }
}

/** Estado de un ejercicio: sigue en el plan, se agrega o se quita al enviar. */
export function estadoEjercicio(plan: Plan, b: Borrador, juego: string): EstadoEjercicio {
  const antes = juegosDelPlan(plan).includes(juego)
  const despues = b.juegos.includes(juego)
  return antes && !despues ? 'quitado' : !antes && despues ? 'nuevo' : 'igual'
}

/** Ejercicios a mostrar: los del borrador y, en su lugar original, los que se quitarán (para poder deshacerlo). */
export function ejerciciosEnPantalla(plan: Plan, b: Borrador): string[] {
  const base = juegosDelPlan(plan)
  return [...base, ...b.juegos.filter((j) => !base.includes(j))]
}

/** Juegos del catálogo que se pueden agregar: disponibles y que no estén en pantalla (un ejercicio quitado se recupera
 *  con «Deshacer» en su propia tarjeta). */
export function juegosParaAgregar(plan: Plan, b: Borrador, catalogo: Pick<Juego, 'id' | 'disponible' | 'oculto'>[] = JUEGOS): string[] {
  const enPantalla = ejerciciosEnPantalla(plan, b)
  // Los ocultos del catálogo (`oculto: true`) tampoco se ofrecen al terapeuta.
  return catalogo.filter((j) => j.disponible && !j.oculto && !enPantalla.includes(j.id)).map((j) => j.id)
}

/** Agrega un ejercicio: si estaba en el plan vigente vuelve con sus valores; si es nuevo, nivel 1 y la meta por defecto. */
export function agregarJuego(plan: Plan, b: Borrador, juego: string): Borrador {
  if (b.juegos.includes(juego)) return b
  const base = borradorDe(plan)
  return {
    ...b,
    juegos: [...b.juegos, juego],
    niveles: { ...b.niveles, [juego]: base.niveles[juego] ?? NIVEL_MIN },
    metas: { ...b.metas, [juego]: base.metas[juego] ?? META_JUEGO_NUEVO },
  }
}

/** Quita un ejercicio del borrador. El último no se puede quitar: un plan necesita al menos uno. */
export function quitarJuego(b: Borrador, juego: string): Borrador {
  if (!b.juegos.includes(juego) || b.juegos.length <= 1) return b
  return { ...b, juegos: b.juegos.filter((j) => j !== juego) }
}

/** ¿Este campo (y juego) difiere del plan vigente? Sirve para destacarlo hasta enviar. Un ejercicio nuevo o quitado
 *  cuenta como 'ejercicio'; su nivel y su meta solo se comparan si sigue en el plan. */
export function cambiado(plan: Plan, b: Borrador, campo: Campo, juego?: string): boolean {
  const base = borradorDe(plan)
  switch (campo) {
    case 'ejercicio':
      return juego != null && estadoEjercicio(plan, b, juego) !== 'igual'
    case 'nivel':
      return juego != null && estadoEjercicio(plan, b, juego) === 'igual' && b.juegos.includes(juego) && b.niveles[juego] !== base.niveles[juego]
    case 'meta':
      return juego != null && estadoEjercicio(plan, b, juego) === 'igual' && b.juegos.includes(juego) && b.metas[juego] !== base.metas[juego]
    case 'sesiones':
      return b.sesionesPorSemana !== base.sesionesPorSemana
    case 'metaPinza':
      return b.metaPinzaCm !== base.metaPinzaCm
    case 'umbral':
      return b.umbralDolor !== base.umbralDolor
    case 'mensaje':
      return b.mensaje.trim() !== ''
  }
}

export const textoMeta = (cm: number) => `${num(cm, 1)} cm`
export const textoUmbral = (n: number) => `EVA ≥ ${n}`
/** Meta de un juego como texto: 0 es práctica libre. */
export const textoMetaJuego = (n: number) => (n > 0 ? String(n) : 'Libre')

/** Lista de diferencias antes → después, en el orden de la pantalla. */
export function cambios(plan: Plan, b: Borrador): Cambio[] {
  const base = borradorDe(plan)
  const out: Cambio[] = []
  for (const juego of ejerciciosEnPantalla(plan, b)) {
    const estado = estadoEjercicio(plan, b, juego)
    if (estado === 'quitado') {
      out.push({ campo: 'ejercicio', juego, etiqueta: `${nombreJuego(juego)} · ejercicio`, antes: 'En el plan', despues: 'Se quita' })
      continue
    }
    if (estado === 'nuevo') {
      out.push({
        campo: 'ejercicio',
        juego,
        etiqueta: `${nombreJuego(juego)} · ejercicio`,
        antes: 'No está',
        despues: `Se agrega: nivel ${b.niveles[juego]}, meta ${textoMetaJuego(b.metas[juego] ?? 0).toLowerCase()}`,
      })
      continue
    }
    if (cambiado(plan, b, 'nivel', juego))
      out.push({ campo: 'nivel', juego, etiqueta: `${nombreJuego(juego)} · nivel de dificultad`, antes: String(base.niveles[juego]), despues: String(b.niveles[juego]) })
    if (cambiado(plan, b, 'meta', juego))
      out.push({ campo: 'meta', juego, etiqueta: `${nombreJuego(juego)} · meta por sesión`, antes: textoMetaJuego(base.metas[juego] ?? 0), despues: textoMetaJuego(b.metas[juego] ?? 0) })
  }
  if (cambiado(plan, b, 'sesiones')) out.push({ campo: 'sesiones', etiqueta: 'Sesiones por semana', antes: String(base.sesionesPorSemana), despues: String(b.sesionesPorSemana) })
  if (cambiado(plan, b, 'metaPinza')) out.push({ campo: 'metaPinza', etiqueta: 'Meta de pinza', antes: textoMeta(base.metaPinzaCm), despues: textoMeta(b.metaPinzaCm) })
  if (cambiado(plan, b, 'umbral')) out.push({ campo: 'umbral', etiqueta: 'Aviso por dolor', antes: textoUmbral(base.umbralDolor), despues: textoUmbral(b.umbralDolor) })
  if (cambiado(plan, b, 'mensaje')) out.push({ campo: 'mensaje', etiqueta: 'Mensaje para el paciente', antes: '—', despues: b.mensaje.trim() })
  return out
}

export const hayCambios = (plan: Plan, b: Borrador) => cambios(plan, b).length > 0

/** Texto del error de validación (null si el borrador se puede enviar). */
export function validar(_plan: Plan, b: Borrador): string | null {
  const entero = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max
  if (b.juegos.length === 0) return 'El plan necesita al menos un ejercicio.'
  for (const j of b.juegos) {
    if (!entero(b.niveles[j] ?? NaN, NIVEL_MIN, NIVEL_MAX)) return `El nivel de ${nombreJuego(j)} va de ${NIVEL_MIN} a ${NIVEL_MAX}.`
    if (!entero(b.metas[j] ?? NaN, META_JUEGO_MIN, META_JUEGO_MAX)) return `La meta de ${nombreJuego(j)} va de ${META_JUEGO_MIN} a ${META_JUEGO_MAX}.`
  }
  if (!entero(b.sesionesPorSemana, SESIONES_MIN, SESIONES_MAX)) return `Las sesiones por semana van de ${SESIONES_MIN} a ${SESIONES_MAX}.`
  if (!(b.metaPinzaCm >= META_PINZA_MIN && b.metaPinzaCm <= META_PINZA_MAX) || redondear(b.metaPinzaCm / META_PINZA_PASO) % 1 !== 0)
    return `La meta de pinza va de ${num(META_PINZA_MIN)} a ${num(META_PINZA_MAX)} cm, de 0,5 en 0,5.`
  if (!entero(b.umbralDolor, UMBRAL_MIN, UMBRAL_MAX)) return `El aviso por dolor va de ${UMBRAL_MIN} a ${UMBRAL_MAX}.`
  if (b.mensaje.trim().length > MENSAJE_MAX) return `El mensaje puede tener hasta ${MENSAJE_MAX} caracteres.`
  return null
}

/** Ítem de un ejercicio agregado: duración por defecto, la mano de los demás ejercicios y la meta de pinza del borrador. */
export function itemNuevo(plan: Plan, b: Borrador, juego: string): PlanItem {
  const mano: Mano = plan.items[0]?.mano ?? 'ambas'
  return {
    juego,
    nivel: b.niveles[juego] ?? NIVEL_MIN,
    duracionMin: DURACION_POR_DEFECTO,
    mano,
    metaAgarres: b.metas[juego] ?? META_JUEGO_NUEVO,
    metaPinzaCm: b.metaPinzaCm,
  }
}

/**
 * Ítems de la versión nueva: parte de los del plan vigente (conserva duración, mano, metas por dedo, etc.) y solo
 * cambia lo que el terapeuta editó: nivel y meta del juego tocado; la meta de pinza, en todos los ítems. Los ejercicios
 * quitados no pasan; los agregados van al final con `itemNuevo`.
 */
export function itemsNuevos(plan: Plan, b: Borrador): PlanItem[] {
  const tocaPinza = cambiado(plan, b, 'metaPinza')
  const siguen = plan.items
    .filter((it) => b.juegos.includes(it.juego))
    .map((it) => ({
      ...it,
      ...(cambiado(plan, b, 'nivel', it.juego) ? { nivel: b.niveles[it.juego]! } : {}),
      ...(cambiado(plan, b, 'meta', it.juego) ? { metaAgarres: b.metas[it.juego]! } : {}),
      ...(tocaPinza ? { metaPinzaCm: b.metaPinzaCm } : {}),
    }))
  const nuevos = b.juegos.filter((j) => estadoEjercicio(plan, b, j) === 'nuevo').map((j) => itemNuevo(plan, b, j))
  return [...siguen, ...nuevos]
}

/** Datos para `repos.planes.crearVersion` (la RPC crea la versión N+1 y escribe la auditoría). Lo no editado va tal cual. */
export function datosDeEnvio(plan: Plan, b: Borrador) {
  return {
    sesionesPorSemana: cambiado(plan, b, 'sesiones') ? b.sesionesPorSemana : plan.sesionesPorSemana,
    umbralDolor: cambiado(plan, b, 'umbral') ? b.umbralDolor : plan.umbralDolor,
    mensaje: b.mensaje.trim(),
    items: itemsNuevos(plan, b),
  }
}

export interface Tendencia {
  /** Valores en cm (sesiones con calidad suficiente de las últimas 4 semanas). */
  valores: number[]
  primero: number | null
  ultimo: number | null
  /** Variación % entre el primero y el último (null con < 2 valores). */
  pct: number | null
}

/** Apertura de pinza de las últimas 4 semanas (misma lógica que Progreso, F14). */
export function tendenciaPinza(sesiones: Sesion[], plan: Plan | null, hoy: Date): Tendencia {
  const p = calcularProgreso(sesiones, plan, null, '4s', hoy)
  const valores = p.puntos.map((x) => x.cm)
  return { valores, primero: valores[0] ?? null, ultimo: valores[valores.length - 1] ?? null, pct: p.variacionPct }
}
