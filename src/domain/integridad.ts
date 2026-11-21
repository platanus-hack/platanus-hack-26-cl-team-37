// Integridad de sesiones: SHA-256 (Web Crypto) sobre un JSON canónico de la sesión y sus eventos.
// JSON canónico: claves ordenadas, sin espacios, fechas como milisegundos epoch y números con
// a lo más 6 decimales. Así el hash es estable aunque la base de datos reordene claves o cambie
// el formato de las fechas.
import type { EventoSesion, Sesion } from './types'


function normalizarNumero(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export function canonico(valor: unknown): string {
  if (valor === null || valor === undefined) return 'null'
  if (typeof valor === 'number') return Number.isFinite(valor) ? JSON.stringify(normalizarNumero(valor)) : 'null'
  if (typeof valor === 'string' || typeof valor === 'boolean') return JSON.stringify(valor)
  if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']'
  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>
    const claves = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
    return '{' + claves.map((k) => JSON.stringify(k) + ':' + canonico(obj[k])).join(',') + '}'
  }
  return 'null'
}

/** Subconjunto de la sesión que queda sellado por el hash. */
export function contenidoSellado(s: Sesion, eventos: EventoSesion[]) {
  const fecha = (v: string | null) => (v ? new Date(v).getTime() : null)
  return {
    sesion: {
      id: s.id,
      pacienteId: s.pacienteId,
      planVersion: s.planVersion,
      juego: s.juego,
      parametros: s.parametros,
      inicio: fecha(s.inicio),
      fin: fecha(s.fin),
      calibracion: s.calibracion,
      metricas: s.metricas,
      muestras: s.muestras,
      dolorEVA: s.dolorEVA,
      esfuerzo: s.esfuerzo,
      nota: s.nota,
      dispositivo: s.dispositivo,
      versionApp: s.versionApp,
      versionModelo: s.versionModelo,
    },
    eventos: [...eventos]
      .sort((a, b) => a.seq - b.seq)
      .map((e) => ({ seq: e.seq, t: e.t, tipo: e.tipo, mano: e.mano, objeto: e.objeto, datos: e.datos })),
  }
}


export async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', datos)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashSesion(s: Sesion, eventos: EventoSesion[]): Promise<string> {
  return sha256Hex(canonico(contenidoSellado(s, eventos)))
}

export async function verificarSesion(s: Sesion, eventos: EventoSesion[]): Promise<'verificado' | 'alterado' | 'sin-hash'> {
  if (!s.hash) return 'sin-hash'
  return (await hashSesion(s, eventos)) === s.hash ? 'verificado' : 'alterado'
}

/** ID legible: S-AAAAMMDD-NN (NN = correlativo del día para el paciente). */
export function idSesion(fecha: Date, correlativo: number): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `S-${y}${m}${d}-${String(correlativo).padStart(2, '0')}`
}

export function hashCorto(h: string | null): string {
  if (!h) return '—'
  return `${h.slice(0, 4)}…${h.slice(-4)}`
}
