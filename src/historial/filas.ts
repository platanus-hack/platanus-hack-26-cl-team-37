// F15 · Historial: lógica pura (mezcla de sesiones y cambios de plan, etiquetas, parámetros). Solo describe datos.
import type { Auditoria, Mano, Sesion } from '../domain/types'
import { nombreJuego } from '../games/registry'
import { nombreMano, num } from '../lib/formato'

/** Fecha con la que se ordena y muestra una sesión. */
export function fechaSesion(s: Sesion): Date {
  return new Date(s.inicio ?? s.fin ?? s.creada ?? 0)
}

export interface CambioPlan {
  /** Nombre del ejercicio al que se refiere (null si es del plan completo). */
  juego: string | null
  campo: string
  antes: string | null
  despues: string | null
}

export interface FilaSesion {
  tipo: 'sesion'
  clave: string
  fecha: Date
  sesion: Sesion
}

export interface FilaPlan {
  tipo: 'plan'
  clave: string
  fecha: Date
  auditoria: Auditoria
  titulo: string
  /** Nombre visible de quien hizo el cambio (null si no se pudo leer). */
  quien: string | null
  cambios: CambioPlan[]
}

export type FilaHistorial = FilaSesion | FilaPlan

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const items = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => !!x) : [])
const texto = (v: unknown): string | null => (v == null ? null : String(v))

const CAMPOS_ITEM: { clave: string; campo: string; formato: (v: unknown) => string | null }[] = [
  { clave: 'nivel', campo: 'Nivel', formato: texto },
  { clave: 'duracionMin', campo: 'Duración', formato: (v) => (v == null ? null : `${v} min`) },
  { clave: 'mano', campo: 'Mano', formato: (v) => (v == null ? null : nombreMano(String(v) as Mano).toLowerCase()) },
  { clave: 'metaAgarres', campo: 'Meta', formato: texto },
  { clave: 'metaPinzaCm', campo: 'Meta de pinza', formato: (v) => (v == null ? null : `${num(Number(v), Number.isInteger(Number(v)) ? 0 : 1)} cm`) },
]

/** Qué cambió entre dos versiones del plan (formato de la auditoría: sesionesPorSemana, umbralDolor, items). */
export function cambiosPlan(antes: unknown, despues: unknown): CambioPlan[] {
  const a = obj(antes)
  const d = obj(despues)
  if (!d) return []
  const out: CambioPlan[] = []
  if (!a) {
    out.push({ juego: null, campo: 'Plan inicial', antes: null, despues: `${items(d.items).length} ejercicios` })
    return out
  }
  if (a.sesionesPorSemana !== d.sesionesPorSemana) out.push({ juego: null, campo: 'Sesiones por semana', antes: texto(a.sesionesPorSemana), despues: texto(d.sesionesPorSemana) })
  if (a.umbralDolor !== d.umbralDolor) out.push({ juego: null, campo: 'Umbral de dolor', antes: texto(a.umbralDolor), despues: texto(d.umbralDolor) })
  const ia = items(a.items)
  const id = items(d.items)
  for (const x of id) {
    const nombre = nombreJuego(String(x.juego))
    const previo = ia.find((y) => y.juego === x.juego)
    if (!previo) {
      out.push({ juego: nombre, campo: 'Ejercicio agregado', antes: null, despues: nombre })
      continue
    }
    for (const c of CAMPOS_ITEM) {
      if (previo[c.clave] !== x[c.clave]) out.push({ juego: nombre, campo: c.campo, antes: c.formato(previo[c.clave]), despues: c.formato(x[c.clave]) })
    }
  }
  for (const y of ia) {
    if (!id.some((x) => x.juego === y.juego)) out.push({ juego: nombreJuego(String(y.juego)), campo: 'Ejercicio quitado', antes: nombreJuego(String(y.juego)), despues: null })
  }
  return out
}

/** "Nivel 1 → 2" (etiqueta corta de la fila). */
export function textoCambio(c: CambioPlan): string {
  if (c.antes != null && c.despues != null) {
    // "Nivel 1 → 2": el campo y el valor anterior, luego el nuevo sin repetir la unidad si es la misma.
    return `${c.campo} ${c.antes} → ${c.despues}`
  }
  if (c.campo === 'Plan inicial') return `Plan inicial: ${c.despues}`
  return c.campo
}

export const tituloPlan = (a: Auditoria) => (a.accion === 'plan_creado' ? 'Plan creado' : 'Plan actualizado')

/**
 * Mezcla sesiones cerradas y cambios de plan (auditoría de entidad 'plan'), lo más reciente primero.
 * `nombres`: id de usuario → nombre visible (de repos.perfiles).
 */
export function unirHistorial(sesiones: Sesion[], auditoria: Auditoria[], nombres: Record<string, string | null> = {}): FilaHistorial[] {
  const filas: FilaHistorial[] = []
  for (const s of sesiones) {
    if (s.estado !== 'cerrada') continue
    filas.push({ tipo: 'sesion', clave: `s-${s.id}`, fecha: fechaSesion(s), sesion: s })
  }
  for (const a of auditoria) {
    if (a.entidad !== 'plan') continue
    filas.push({
      tipo: 'plan',
      clave: `a-${a.id}`,
      fecha: new Date(a.cuando),
      auditoria: a,
      titulo: tituloPlan(a),
      quien: a.quien ? (nombres[a.quien] ?? null) : null,
      cambios: cambiosPlan(a.antes, a.despues),
    })
  }
  return filas.sort((x, y) => y.fecha.getTime() - x.fecha.getTime() || (x.clave < y.clave ? 1 : -1))
}

export const cantidadSesiones = (filas: FilaHistorial[]) => filas.filter((f) => f.tipo === 'sesion').length
export const textoCantidad = (n: number) => (n === 1 ? '1 sesión registrada' : `${n} sesiones registradas`)

export interface EtiquetaSesion {
  texto: string
  tono: 'ok' | 'malo' | 'gris'
}

/** Contador y meta de una sesión (las del seed no traen metricas.contador). */
export function contadorYMeta(s: Sesion): { contador: number | null; meta: number } {
  const m = s.metricas
  const contador = m ? (m.contador ?? m.agarres ?? null) : null
  const meta = m?.meta ?? s.parametros?.metaAgarres ?? 0
  return { contador, meta }
}

/** Etiquetas de la fila: contador/meta (verde si se cumplió), precisión y dolor. */
export function etiquetasSesion(s: Sesion): EtiquetaSesion[] {
  const out: EtiquetaSesion[] = []
  const m = s.metricas
  const { contador, meta } = contadorYMeta(s)
  if (contador != null) {
    if (meta > 0) out.push({ texto: `${contador}/${meta}`, tono: contador >= meta ? 'ok' : 'malo' })
    else out.push({ texto: `${contador} ${contador === 1 ? 'agarre' : 'agarres'}`, tono: 'gris' })
  }
  if (m && m.intentos > 0 && Number.isFinite(m.precision)) out.push({ texto: `${Math.round(m.precision * 100)}%`, tono: 'gris' })
  if (s.dolorEVA != null) out.push({ texto: `Dolor ${s.dolorEVA}`, tono: 'gris' })
  if (!out.length && m?.duracionS) out.push({ texto: `${Math.round(m.duracionS / 60)} min`, tono: 'gris' })
  return out
}

/** "Nivel 2 · Ambas · 6 min". */
export function textoParametros(s: Sesion): string {
  const p = s.parametros
  if (!p) return '—'
  return [`Nivel ${p.nivel}`, nombreMano(p.mano), `${p.duracionMin} min`].join(' · ')
}

/** "Cámara frontal · 30 fps". */
export function textoDispositivo(s: Sesion): string {
  const d = s.dispositivo
  if (!d) return '—'
  return [d.camara, d.fps ? `${Math.round(d.fps)} fps` : null].filter(Boolean).join(' · ')
}

/** "App 1.4.0 · MediaPipe Hands". */
export function textoVersion(s: Sesion): string {
  return [s.versionApp ? `App ${s.versionApp}` : null, s.versionModelo].filter(Boolean).join(' · ') || '—'
}
