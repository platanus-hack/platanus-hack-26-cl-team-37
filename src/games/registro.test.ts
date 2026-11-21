// Cada juego se declara en su src/games/<juego>/juego.ts y el registro los junta solo: esto cuida que el resultado
// sea coherente aunque nadie edite una lista central.
import { describe, expect, it } from 'vitest'
import { JUEGOS } from './registry'
import { MODULOS } from './shell/modulos'

describe('registro de juegos (un archivo por juego)', () => {
  it('trae los 8 juegos del catálogo, en el orden de la spec', () => {
    expect(JUEGOS.map((j) => j.id)).toEqual(['caja-juguetes', 'movilidad-guiada', 'torre-cubos', 'pinza-fina', 'atrapa-burbujas', 'exprime-naranja', 'memoria-cartas', 'piano-dedos'])
  })

  it('ids y orden no se repiten', () => {
    expect(new Set(JUEGOS.map((j) => j.id)).size).toBe(JUEGOS.length)
    expect(new Set(JUEGOS.map((j) => j.orden)).size).toBe(JUEGOS.length)
  })

  it('todo juego disponible se puede cargar, y los "Próximamente" no', () => {
    for (const j of JUEGOS) expect(typeof j.crear === 'function', j.id).toBe(j.disponible)
    for (const j of JUEGOS) expect(j.id in MODULOS, j.id).toBe(j.disponible)
    expect(Object.keys(MODULOS)).toEqual(expect.arrayContaining(['prueba-shell', 'prueba-fisica']))
  })

  it('cada juego tiene 5 niveles', () => {
    for (const j of JUEGOS) expect(j.niveles.map((n) => n.nivel), j.id).toEqual([1, 2, 3, 4, 5])
  })
})
