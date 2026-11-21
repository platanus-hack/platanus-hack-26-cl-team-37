// Lo que la persona escribe en el formulario de pesos (texto) y su paso a números para src/banda/curva.ts.
import type { CalibracionPesos } from '../../banda/curva'

/** Texto de un campo numérico → número (acepta coma decimal). */
export const aNumero = (texto: string) => {
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export interface PesosTexto {
  reposoCm: string
  filas: { kg: string; largoCm: string }[]
  /** Tiras que sostenían el peso. Las calibraciones guardadas antes de este campo no lo traen: se asume un lazo (2). */
  tiras?: number
}
export const PESOS_VACIOS: PesosTexto = { reposoCm: '', filas: [{ kg: '', largoCm: '' }, { kg: '', largoCm: '' }, { kg: '', largoCm: '' }], tiras: 2 }

export function aCalibracion(p: PesosTexto): CalibracionPesos {
  return { reposoCm: aNumero(p.reposoCm), filas: p.filas.map((f) => ({ kg: aNumero(f.kg), largoCm: aNumero(f.largoCm) })), tiras: p.tiras ?? 2 }
}

/** Opciones de tiras de banda (las tiras en paralelo suman su carga). */
export const TIRAS = [
  { v: 1, n: '1 tira' },
  { v: 2, n: '2 tiras' },
]
