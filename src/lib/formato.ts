// Formato en español de Chile (decimales con coma).
const LOCALE = 'es-CL'

export function num(n: number | null | undefined, decimales = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(LOCALE, { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

export function entero(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString(LOCALE)
}

export function pct(fraccion: number | null | undefined, decimales = 0): string {
  if (fraccion == null || !Number.isFinite(fraccion)) return '—'
  return `${num(fraccion * 100, decimales)} %`
}

/** Igual que pct pero sin espacio, para etiquetas compactas (92%). */
export function pctCorto(fraccion: number | null | undefined): string {
  if (fraccion == null || !Number.isFinite(fraccion)) return '—'
  return `${Math.round(fraccion * 100)}%`
}

export function conSigno(n: number, decimales = 1): string {
  const s = num(Math.abs(n), decimales)
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export function fechaLarga(d: Date): string {
  const dia = DIAS[d.getDay()]
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

export function fechaCorta(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getDate()} ${MESES_CORTOS[x.getMonth()]}`
}

export function mesCorto(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return MESES_CORTOS[x.getMonth()]
}

export function fechaNumerica(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`
}

export function hora(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}

export function mmss(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function iniciales(nombre: string): string {
  return nombre
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export const LETRAS_DIA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function nombreMano(m: string): string {
  return m === 'izquierda' ? 'Izquierda' : m === 'derecha' ? 'Derecha' : 'Ambas'
}
