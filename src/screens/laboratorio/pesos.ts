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

/**
 * Opciones de tiras de banda entre las manos. Las tiras en paralelo se estiran lo mismo y suman su carga: la misma banda
 * doblada (2 tiras) opone el doble; un lazo doblado otra vez (4 tiras), el cuádruple.
 */
export const TIRAS = [
  { v: 1, n: '1 tira' },
  { v: 2, n: '2 tiras' },
  { v: 3, n: '3 tiras' },
  { v: 4, n: '4 tiras' },
]
