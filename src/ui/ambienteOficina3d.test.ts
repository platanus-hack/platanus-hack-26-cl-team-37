import { describe, expect, it } from 'vitest'
import { CAMARA_OFICINA, COTAS_OFICINA, crearAmbienteOficina } from './ambienteOficina3d'

describe('ambienteOficina3d', () => {
  it('construye la oficina 3D con Costanera Center sin red ni canvas real y libera recursos', () => {
    const amb = crearAmbienteOficina()
    expect(amb.grupo.name).toBe('ambiente-oficina-platanus')
    expect(amb.grupo.getObjectByName('costanera-center')).toBeTruthy()

    // Ningún objeto del ambiente debe emitir sombras (la sombra se reserva para la mesa y manos)
    let conSombra = 0
    amb.grupo.traverse((o) => {
      if (o.castShadow || o.receiveShadow) conSombra++
    })
    expect(conSombra).toBe(0)

    expect(() => amb.actualizar(0.016)).not.toThrow()
    expect(() => amb.liberar()).not.toThrow()
  })

  it('degrada progresivamente las capas visibles según calidad 0..3', () => {
    const amb = crearAmbienteOficina({ calidad: 0 })
    const esencial = amb.grupo.getObjectByName('oficina-esencial')
    const mobiliario = amb.grupo.getObjectByName('oficina-mobiliario')
    const detalles = amb.grupo.getObjectByName('oficina-detalles')
    expect(esencial && mobiliario && detalles).toBeTruthy()

    amb.aplicarCalidad(1)
    expect(detalles?.visible).toBe(false)
    expect(mobiliario?.visible).toBe(true)

    amb.aplicarCalidad(2)
    expect(mobiliario?.visible).toBe(false)
    expect(esencial?.visible).toBe(true)

    amb.aplicarCalidad(3)
    expect(esencial?.visible).toBe(false)
    amb.liberar()
  })

  it('mantiene proporciones arquitectónicas 1:1 y cotas dentro del plano lejano de CAMARA_OFICINA', () => {
    // Altura de piso a techo ≈ 3 m en escala 1 m = 2,65 u (mesa en y = 0, piso en y = -2)
    expect(COTAS_OFICINA.pisoY).toBe(-2)
    expect(COTAS_OFICINA.techoY - COTAS_OFICINA.pisoY).toBeGreaterThan(7)
    expect(Math.abs(COTAS_OFICINA.costaneraZ)).toBeLessThan(CAMARA_OFICINA.far)
    expect(COTAS_OFICINA.bannerZ).toBeGreaterThan(COTAS_OFICINA.pilarZ)
    expect(COTAS_OFICINA.pilarZ).toBeGreaterThan(COTAS_OFICINA.paredFondoZ)
    expect(COTAS_OFICINA.paredFondoZ).toBeGreaterThan(COTAS_OFICINA.costaneraZ)
  })
})
