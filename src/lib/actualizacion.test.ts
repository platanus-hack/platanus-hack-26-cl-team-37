import { describe, expect, it } from 'vitest'
import { puedeRecargar } from './actualizacion'

describe('actualización sola de la PWA', () => {
  it('recarga en pantallas de consulta', () => {
    for (const r of ['/', '/inicio', '/ejercicios', '/progreso', '/historial', '/historial/S-20261121-01', '/perfil', '/terapeuta/pacientes', '/terapeuta/alertas']) {
      expect(puedeRecargar(r), r).toBe(true)
    }
  })

  it('no recarga en una sesión ni con un formulario a medio llenar', () => {
    for (const r of ['/sesion/caja-juguetes/preparar', '/sesion/S-1/calibrar', '/sesion/S-1/jugar', '/sesion/S-1/sensacion', '/sesion/S-1/resumen', '/acceso', '/privacidad', '/terapeuta/pacientes/abc/plan']) {
      expect(puedeRecargar(r), r).toBe(false)
    }
  })
})
