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
}
export const PESOS_VACIOS: PesosTexto = { reposoCm: '', filas: [{ kg: '', largoCm: '' }, { kg: '', largoCm: '' }, { kg: '', largoCm: '' }] }

export function aCalibracion(p: PesosTexto): CalibracionPesos {
  return { reposoCm: aNumero(p.reposoCm), filas: p.filas.map((f) => ({ kg: aNumero(f.kg), largoCm: aNumero(f.largoCm) })) }
}
