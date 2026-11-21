// Consentimiento informado (F18). El texto vive en su propio archivo para que lo redacte la clínica:
// edita src/legal/consentimiento-v1.md y, si el cambio es de fondo, sube VERSION_CONSENTIMIENTO
// (los pacientes con una versión anterior quedan "Pendiente" y deben firmar de nuevo antes de su próxima sesión).
import texto from './consentimiento-v1.md?raw'

/** Versión del texto vigente. Los consentimientos sembrados en la demo ya son "1.0". */
export const VERSION_CONSENTIMIENTO = '1.0'
export const TEXTO_CONSENTIMIENTO: string = texto

/** Vigente = firmado con la versión actual del texto. */
export function consentimientoVigente(c: { version: string } | null | undefined): boolean {
  return !!c && c.version === VERSION_CONSENTIMIENTO
}

export type Bloque = { tipo: 'titulo' | 'parrafo' | 'aviso'; texto: string } | { tipo: 'lista'; items: string[] }

/** Markdown mínimo (títulos #/##, listas "- ", citas "> ", párrafos) → bloques para mostrar sin dependencias. */
export function bloquesDeMarkdown(md: string): Bloque[] {
  const bloques: Bloque[] = []
  let lista: string[] | null = null
  const cerrar = () => {
    if (lista) bloques.push({ tipo: 'lista', items: lista })
    lista = null
  }
  for (const cruda of md.split(/\r?\n/)) {
    const l = cruda.trim()
    if (!l) {
      cerrar()
    } else if (l.startsWith('- ')) {
      ;(lista ??= []).push(l.slice(2))
    } else {
      cerrar()
      if (l.startsWith('#')) bloques.push({ tipo: 'titulo', texto: l.replace(/^#+\s*/, '') })
      else if (l.startsWith('>')) bloques.push({ tipo: 'aviso', texto: l.replace(/^>\s*/, '') })
      else bloques.push({ tipo: 'parrafo', texto: l })
    }
  }
  cerrar()
  return bloques
}
