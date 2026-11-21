// Cola local (IndexedDB) para escrituras de sesión que no alcanzaron a llegar al servidor
// (p. ej. se cortó internet al terminar el juego). Se reintenta al volver la conexión.
import Dexie, { type Table } from 'dexie'

export interface Pendiente {
  id?: number
  // crearSesion / crearAlerta (F20): se encolan cuando se crean sin conexión. Su `sesionId` puede ser provisional (ver alias).
  tipo: 'eventos' | 'actualizarSesion' | 'crearSesion' | 'crearAlerta'
  sesionId: string
  payload: unknown
  creado: number
}

/** Copia local de lo último leído del servidor (para poder abrir pantallas sin red). Se borra al cerrar sesión. */
export interface EntradaCache {
  clave: string
  valor: unknown
}
/** Sesión creada sin conexión: id provisional → id real que le dio el servidor al sincronizar. */
export interface AliasSesion {
  local: string
  real: string
}

class BaseLocal extends Dexie {
  pendientes!: Table<Pendiente, number>
  cache!: Table<EntradaCache, string>
  alias!: Table<AliasSesion, string>
  constructor() {
    super('manoviva')
    this.version(1).stores({ pendientes: '++id, sesionId, creado' })
    this.version(2).stores({ pendientes: '++id, sesionId, creado', cache: 'clave', alias: 'local' })
  }
}

export const baseLocal = new BaseLocal()

export async function encolar(p: Omit<Pendiente, 'id' | 'creado'>) {
  await baseLocal.pendientes.add({ ...p, creado: Date.now() })
}

export async function hayPendientes(sesionId?: string): Promise<number> {
  if (sesionId) return baseLocal.pendientes.where('sesionId').equals(sesionId).count()
  return baseLocal.pendientes.count()
}

let vaciando = false
/** Procesa la cola en orden de llegada. Se detiene en el primer error (para respetar el orden). */
export async function vaciarCola(ejecutar: (p: Pendiente) => Promise<void>): Promise<void> {
  if (vaciando) return
  vaciando = true
  try {
    const todos = await baseLocal.pendientes.orderBy('creado').toArray()
    for (const p of todos) {
      await ejecutar(p)
      await baseLocal.pendientes.delete(p.id!)
    }
  } finally {
    vaciando = false
  }
}

/** ¿El error es de red (sin conexión, servidor inalcanzable)? Estos se encolan; los demás se muestran. */
export function esErrorDeRed(e: unknown): boolean {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return (typeof navigator !== 'undefined' && !navigator.onLine) || /fetch|network|Failed to fetch|NetworkError|Load failed/i.test(m)
}

export async function guardarCache(clave: string, valor: unknown) {
  await baseLocal.cache.put({ clave, valor })
}
/** `undefined` = no hay copia; `null` es un valor válido (p. ej. "no hay plan"). */
export async function leerCache<T>(clave: string): Promise<T | undefined> {
  const e = await baseLocal.cache.get(clave)
  return e ? (e.valor as T) : undefined
}
export async function borrarCache() {
  await baseLocal.cache.clear()
}

export async function guardarAlias(local: string, real: string) {
  await baseLocal.alias.put({ local, real })
}
export async function resolverAlias(local: string): Promise<string | undefined> {
  return (await baseLocal.alias.get(local))?.real
}

/** Eventos de sesión que todavía no se han subido (en orden de llegada). Sirven para seguir una sesión sin red. */
export async function eventosPendientes<T>(sesionIds: string[]): Promise<T[]> {
  const filas = await baseLocal.pendientes.where('sesionId').anyOf(sesionIds).filter((p) => p.tipo === 'eventos').sortBy('creado')
  return filas.flatMap((p) => p.payload as T[])
}
