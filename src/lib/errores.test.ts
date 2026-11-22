import { describe, expect, it } from 'vitest'
import { esFalloDeCarga, mensajeDeError, mensajeLegible } from './errores'

describe('mensajes de error para personas', () => {
  it('lo técnico en inglés se cambia por una frase en español', () => {
    expect(mensajeLegible('JWT expired')).toBe('Tu sesión venció. Vuelve a entrar e intenta de nuevo.')
    expect(mensajeLegible('new row violates row-level security policy for table "sesiones"')).toBe('Tu cuenta no tiene permiso para hacer esto.')
    expect(mensajeLegible('TypeError: Failed to fetch')).toBe('Sin conexión. Revisa tu internet e intenta de nuevo.')
    expect(mensajeDeError(new Error('invalid input syntax for type uuid: "x"'))).toBe('Algo salió mal al guardar o leer los datos. Intenta de nuevo.')
  })

  it('conserva el encabezado en español que puso la app', () => {
    expect(mensajeLegible('No pudimos guardar: JWT expired')).toBe('No pudimos guardar. Tu sesión venció. Vuelve a entrar e intenta de nuevo.')
    expect(mensajeLegible('No se pudo exportar: canceling statement due to statement timeout')).toBe(
      'No se pudo exportar. El servidor tardó demasiado en responder. Intenta de nuevo.',
    )
  })

  it('los mensajes que ya están en español pasan sin tocar', () => {
    const propios = [
      'sesión cerrada: es inmutable',
      'Sin conexión: quedan datos de la sesión por subir.',
      'Correo o contraseña incorrectos.',
      'La sesión todavía no se ha jugado.',
      'sin permiso sobre este paciente',
      'No pudimos cerrar la sesión.',
    ]
    for (const t of propios) expect(mensajeLegible(t)).toBe(t)
  })

  it('reconoce cuando un trozo de la app no se pudo bajar', () => {
    expect(esFalloDeCarga(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Jugar-abc.js'))).toBe(true)
    expect(esFalloDeCarga(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(esFalloDeCarga(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})
