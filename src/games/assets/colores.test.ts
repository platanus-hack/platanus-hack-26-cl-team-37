// Los juegos toman sus colores de la paleta del brandbook: ningún archivo de src/games (salvo assets/colores.ts y
// assets/naturales.ts, que guarda la excepción de los objetos reales) escribe colores a mano en hexadecimal o rgb().
import { describe, expect, it } from 'vitest'
import { KUWU } from '../../ui/paleta'
import { COLOR_DEDO } from '../piano/logica'
import { COLORES as COLORES_CAJA } from '../caja/logica'
import { COLORES as COLORES_TORRE } from '../torre/logica'
import { MANO, PASTELES, tono } from './colores'

const FUENTES = import.meta.glob<string>(['/src/games/**/*.{ts,tsx}', '!/src/games/**/*.test.{ts,tsx}', '!/src/games/assets/colores.ts', '!/src/games/assets/naturales.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const COLOR_A_MANO = /0x[0-9a-f]{6}\b|['"`]#[0-9a-f]{3,8}['"`]|rgba?\(/i

const enPaleta = new Set(Object.values(KUWU).map((h) => parseInt(h.slice(1), 16)))

describe('colores de los juegos', () => {
  it('ningún juego escribe colores a mano', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(20)
    const malos = Object.entries(FUENTES).flatMap(([ruta, texto]) =>
      texto.split('\n').flatMap((linea, i) => (COLOR_A_MANO.test(linea) ? [`${ruta}:${i + 1}: ${linea.trim()}`] : [])),
    )
    expect(malos).toEqual([])
  })

  it('juguetes, cubos, teclas y mano usan colores de la paleta', () => {
    for (const c of [...PASTELES, ...COLORES_CAJA, ...COLORES_TORRE, ...Object.values(COLOR_DEDO), ...Object.values(MANO)]) {
      expect(enPaleta.has(c)).toBe(true)
    }
  })

  it('tono oscurece un color de la paleta', () => {
    expect(tono('amarillo', 1)).toBe(parseInt(KUWU.amarillo.slice(1), 16))
    expect(tono('amarillo', 0.35)).toBeLessThan(parseInt(KUWU.amarillo.slice(1), 16))
  })
})
