import { describe, expect, it } from 'vitest'
import { bloquesDeMarkdown, consentimientoVigente, TEXTO_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from './consentimiento'

describe('consentimiento informado', () => {
  it('el texto sale de consentimiento-v1.md, marcado como provisorio, y promete que el video no se guarda', () => {
    expect(TEXTO_CONSENTIMIENTO).toContain('TEXTO PROVISORIO')
    expect(TEXTO_CONSENTIMIENTO).toMatch(/video no se guarda/)
    expect(TEXTO_CONSENTIMIENTO).not.toMatch(/fuerza|presi[oó]n/i)
  })
  it('vigente = misma versión que el texto actual', () => {
    expect(consentimientoVigente({ version: VERSION_CONSENTIMIENTO })).toBe(true)
    expect(consentimientoVigente({ version: '0.9' })).toBe(false)
    expect(consentimientoVigente(null)).toBe(false)
  })
  it('bloquesDeMarkdown separa títulos, avisos, listas y párrafos', () => {
    expect(bloquesDeMarkdown('# T\n\n> aviso\n\n## S\n\n- a\n- b\n\nTexto\nde nuevo')).toEqual([
      { tipo: 'titulo', texto: 'T' },
      { tipo: 'aviso', texto: 'aviso' },
      { tipo: 'titulo', texto: 'S' },
      { tipo: 'lista', items: ['a', 'b'] },
      { tipo: 'parrafo', texto: 'Texto' },
      { tipo: 'parrafo', texto: 'de nuevo' },
    ])
  })
})
