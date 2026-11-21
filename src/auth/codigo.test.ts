import { describe, expect, it } from 'vitest'
import { codigoValido, correoValido, errorCodigo, normalizarCodigo } from './codigo'

describe('código de clínica', () => {
  it('normaliza mayúsculas, espacios y guion', () => {
    expect(normalizarCodigo('crm-4821')).toBe('CRM-4821')
    expect(normalizarCodigo(' crm 4821 ')).toBe('CRM-4821')
    expect(normalizarCodigo('CRM4821')).toBe('CRM-4821')
    expect(normalizarCodigo('CRM-482199')).toBe('CRM-4821')
  })

  it('valida el formato CRM-0000', () => {
    expect(codigoValido('CRM-4821')).toBe(true)
    expect(codigoValido('CRM-482')).toBe(false)
    expect(codigoValido('CRX-4821')).toBe(false)
    expect(codigoValido('CRM-48A1')).toBe(false)
  })

  it('error en vivo solo si ya no puede ser válido; al terminar, también si está incompleto', () => {
    expect(errorCodigo('', false)).toBeNull()
    expect(errorCodigo('CR', false)).toBeNull()
    expect(errorCodigo('CRM-48', false)).toBeNull()
    expect(errorCodigo('CRM-4821', true)).toBeNull()
    expect(errorCodigo('ABC', false)).toMatch(/CRM-0000/)
    expect(errorCodigo('CRM-4A', false)).toMatch(/CRM-0000/)
    expect(errorCodigo('CRM-48', true)).toMatch(/CRM-0000/)
    expect(errorCodigo('', true)).toMatch(/código/)
  })

  it('correo con forma básica', () => {
    expect(correoValido('carmen.demo@example.com')).toBe(true)
    expect(correoValido('carmen@')).toBe(false)
  })
})
