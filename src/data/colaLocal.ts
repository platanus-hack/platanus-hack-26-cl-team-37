// Cola local (IndexedDB) para escrituras de sesión que no alcanzaron a llegar al servidor
// (p. ej. se cortó internet al terminar el juego). Se reintenta al volver la conexión.
import Dexie, { type Table } from 'dexie'

export interface Pendiente {
  id?: number
  tipo: 'eventos' | 'actualizarSesion'
  sesionId: string
  payload: unknown
  creado: number
}

class BaseLocal extends Dexie {
  pendientes!: Table<Pendiente, number>
  constructor() {
    super('manoviva')
    this.version(1).stores({ pendientes: '++id, sesionId, creado' })
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
