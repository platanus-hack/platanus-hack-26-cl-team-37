// F19 · Lógica pura del perfil: validación del largo de mano medido con regla (cm).
// Es la referencia de escala de la calibración (pacientes.largo_mano_cm). Rango y pasos: spec §4.
export const LARGO_MIN_CM = 10
export const LARGO_MAX_CM = 30
export const LARGO_PASO_CM = 0.5
/** Valor inicial del selector cuando todavía no hay medida guardada. */
export const LARGO_INICIAL_CM = 18

export type ResultadoLargo = { ok: true; cm: number } | { ok: false; error: string }

/** Convierte lo escrito ("18,5", "18.5", " 18 cm ") a un número; null si no es un número. */
export function leerLargo(texto: string): number | null {
  const t = texto.trim().replace(/\s*cm$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Valida el texto escrito por el paciente. Se guarda con 1 decimal (numeric(4,1)). */
export function validarLargo(texto: string): ResultadoLargo {
  if (!texto.trim()) return { ok: false, error: 'Escribe el largo de tu mano en centímetros.' }
  const n = leerLargo(texto)
  if (n === null) return { ok: false, error: 'Escribe solo números, por ejemplo 18,5.' }
  const cm = Math.round(n * 10) / 10
  if (cm < LARGO_MIN_CM || cm > LARGO_MAX_CM) return { ok: false, error: `El largo debe estar entre ${LARGO_MIN_CM} y ${LARGO_MAX_CM} cm.` }
  return { ok: true, cm }
}

/** Suma o resta un paso y deja el valor dentro del rango (un decimal). */
export function pasoLargo(cm: number, direccion: 1 | -1): number {
  const v = Math.round((cm + direccion * LARGO_PASO_CM) * 10) / 10
  return Math.min(LARGO_MAX_CM, Math.max(LARGO_MIN_CM, v))
}

/** Texto con coma decimal para el campo (sin ceros de más: 18 → "18", 18,5 → "18,5"). */
export function textoLargo(cm: number): string {
  return String(Math.round(cm * 10) / 10).replace('.', ',')
}
