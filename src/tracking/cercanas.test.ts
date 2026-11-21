import { describe, expect, it } from 'vitest'
import { masCercanas, tamanoEnImagen } from './cercanas'
import type { ManoSeguida } from './tipos'

// mano de "tamaño" s (fracción de la imagen) centrada en (cx, cy)
function mano(lado: ManoSeguida['lado'], s: number, cx = 0.5, cy = 0.5, confianza = 0.9): ManoSeguida {
  const landmarks = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }))
  landmarks[0] = { x: cx, y: cy + s, z: 0 }
  landmarks[9] = { x: cx, y: cy - s, z: 0 }
  landmarks[5] = { x: cx - s / 2, y: cy - s, z: 0 }
  landmarks[17] = { x: cx + s / 2, y: cy - s, z: 0 }
  return { lado, confianza, landmarks, worldLandmarks: landmarks }
}

describe('manos más cercanas', () => {
  it('el tamaño crece con la mano en la imagen', () => {
    expect(tamanoEnImagen(mano('derecha', 0.2), 640, 480)).toBeGreaterThan(tamanoEnImagen(mano('derecha', 0.05), 640, 480))
  })

  it('en juegos: las 2 más grandes aunque una del fondo tenga más confianza', () => {
    const fondo = mano('derecha', 0.04, 0.9, 0.2, 0.99)
    const propias = [mano('derecha', 0.2, 0.3), mano('izquierda', 0.18, 0.7)]
    const r = masCercanas([fondo, ...propias], 2, 640, 480)
    expect(r).toHaveLength(2)
    expect(r).not.toContain(fondo)
  })

  it('en calibración: solo la más grande', () => {
    const grande = mano('izquierda', 0.25)
    const r = masCercanas([mano('derecha', 0.1, 0.8, 0.3, 0.99), grande], 1, 640, 480)
    expect(r).toEqual([grande])
  })

  it('una por lado: con dos "derechas", queda la más grande y se completa con otra mano', () => {
    const a = mano('derecha', 0.2), b = mano('derecha', 0.15), c = mano('izquierda', 0.05)
    expect(masCercanas([b, c, a], 2, 640, 480)).toEqual([a, c])
  })

  it('sin manos o n = 0 devuelve vacío', () => {
    expect(masCercanas([], 2, 640, 480)).toEqual([])
    expect(masCercanas([mano('derecha', 0.2)], 0, 640, 480)).toEqual([])
  })
})
