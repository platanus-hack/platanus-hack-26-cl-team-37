// Código de clínica con formato CRM-0000 y validación de los campos de /acceso (funciones puras).

export const FORMATO_CODIGO = /^CRM-\d{4}$/

/** Mayúsculas, sin espacios y con el guion puesto si se escribió "CRM4821". Máximo 8 caracteres. */
export function normalizarCodigo(texto: string): string {
  let t = texto.toUpperCase().replace(/\s+/g, '')
  if (/^CRM\d/.test(t)) t = 'CRM-' + t.slice(3)
  return t.slice(0, 8)
}

export function codigoValido(codigo: string): boolean {
  return FORMATO_CODIGO.test(codigo)
}

/** true si lo escrito todavía puede terminar siendo un código válido ("CR", "CRM-48"). */
function prefijoPosible(codigo: string): boolean {
  const molde = 'CRM-'
  for (let i = 0; i < codigo.length; i++) {
    const c = codigo[i]
    if (i < 4 ? c !== molde[i] : !/\d/.test(c)) return false
  }
  return codigo.length <= 8
}

/**
 * Error del código para mostrar en vivo. Mientras se escribe solo avisa si ya no puede ser válido;
 * al salir del campo (`completo`) también avisa si quedó incompleto.
 */
export function errorCodigo(codigo: string, completo: boolean): string | null {
  if (!codigo) return completo ? 'Escribe el código de tu clínica (formato CRM-0000).' : null
  if (codigoValido(codigo)) return null
  if (!completo && prefijoPosible(codigo)) return null
  return 'El código debe ser CRM, un guion y 4 números (ej.: CRM-0000).'
}

export function correoValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
