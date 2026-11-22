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
  /** Cuenta que lo encoló. La cola solo sube lo de la cuenta abierta (teléfono compartido). Sin valor = ítem antiguo. */
  usuario?: string | null
  /** Veces que el servidor lo rechazó (no cuenta la falta de red) y cuándo fue la última vez contada. */
  intentos?: number
  ultimoIntento?: number
}

/** Ítem que el servidor rechazó tantas veces que se apartó de la cola para no frenar al resto. No se borra: queda aquí. */
export interface Descartado extends Omit<Pendiente, 'id'> {
  id?: number
  error: string
  descartado: number
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
  descartados!: Table<Descartado, number>
  constructor() {
    super('manoviva')
    this.version(1).stores({ pendientes: '++id, sesionId, creado' })
    this.version(2).stores({ pendientes: '++id, sesionId, creado', cache: 'clave', alias: 'local' })
    this.version(3).stores({ pendientes: '++id, sesionId, creado', cache: 'clave', alias: 'local', descartados: '++id, sesionId' })
  }
}

export const baseLocal = new BaseLocal()

/** Quién es la cuenta abierta según el cliente de datos (lo registra supabaseRepos). Sin registro, solo vale la copia local. */
let proveedorDueno: () => Promise<string | null> = async () => null
export function fijarProveedorDueno(f: () => Promise<string | null>) {
  proveedorDueno = f
}

/**
 * Cuenta a la que pertenece lo que se encola ahora. Primero la última cuenta conocida (copia local: es inmediata y funciona
 * sin red); solo si no hay copia se pregunta al cliente de datos, que con el token vencido y sin red puede tardar en responder
 * (y encolar eventos en medio de un juego no puede esperar).
 */
async function duenoActual(): Promise<string | null> {
  const guardado = (await baseLocal.cache.get('usuario'))?.valor as { id?: string } | undefined
  if (guardado?.id) return guardado.id
  return proveedorDueno().catch(() => null)
}

export async function encolar(p: Omit<Pendiente, 'id' | 'creado' | 'usuario' | 'intentos' | 'ultimoIntento'>) {
  await baseLocal.pendientes.add({ ...p, usuario: await duenoActual(), creado: Date.now() })
}

export async function hayPendientes(sesionId?: string): Promise<number> {
  if (sesionId) return baseLocal.pendientes.where('sesionId').equals(sesionId).count()
  return baseLocal.pendientes.count()
}

/** Rechazos del servidor que se toleran antes de apartar un ítem, y separación mínima entre dos rechazos contados. */
export const MAX_INTENTOS = 6
export const ESPERA_ENTRE_INTENTOS_MS = 30_000

let enCurso: Promise<void> | null = null
/**
 * Sube la cola en orden de llegada. Quien llama mientras ya hay una pasada en curso espera esa misma pasada.
 *  · Sin red: la pasada se corta y todo queda igual (se reintenta al volver la conexión).
 *  · Si el servidor rechaza un ítem (permisos, sesión ya cerrada, dato inválido): se cuenta el rechazo, se saltan en esta pasada
 *    los demás ítems de ESA sesión (para respetar su orden) y se sigue con las otras sesiones. Antes, un solo ítem rechazado
 *    dejaba la cola frenada para siempre. Tras MAX_INTENTOS rechazos espaciados, el ítem pasa a `descartados`.
 *  · `dueno`: cuenta abierta. Solo se sube lo de esa cuenta (y lo antiguo sin dueño); lo de otra cuenta espera a que vuelva.
 *    Con `null` (nadie con sesión abierta) no se sube nada. Sin el argumento no se filtra.
 */
export function vaciarCola(ejecutar: (p: Pendiente) => Promise<void>, dueno?: string | null, ahora: () => number = Date.now): Promise<void> {
  if (enCurso) return enCurso
  enCurso = pasada(ejecutar, dueno, ahora).finally(() => {
    enCurso = null
  })
  return enCurso
}

async function pasada(ejecutar: (p: Pendiente) => Promise<void>, dueno: string | null | undefined, ahora: () => number) {
  if (dueno === null) return
  const todos = await baseLocal.pendientes.orderBy('creado').toArray()
  const frenadas = new Set<string>()
  for (const p of todos) {
    if (dueno !== undefined && p.usuario && p.usuario !== dueno) continue
    const sesion = (await resolverAlias(p.sesionId)) ?? p.sesionId
    if (frenadas.has(sesion)) continue
    try {
      await ejecutar(p)
      await baseLocal.pendientes.delete(p.id!)
    } catch (e) {
      if (esErrorDeRed(e)) throw e
      const t = ahora()
      const contado = p.ultimoIntento == null || t - p.ultimoIntento >= ESPERA_ENTRE_INTENTOS_MS
      const intentos = (p.intentos ?? 0) + (contado ? 1 : 0)
      if (intentos >= MAX_INTENTOS) {
        const { id, ...resto } = p
        await baseLocal.descartados.add({ ...resto, intentos, error: e instanceof Error ? e.message : String(e), descartado: t })
        await baseLocal.pendientes.delete(id!)
      } else {
        if (contado) await baseLocal.pendientes.update(p.id!, { intentos, ultimoIntento: t })
        frenadas.add(sesion)
      }
    }
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
