import { describe, expect, it } from 'vitest'
import { colorEn, colorUtil, coincide, elegirPar, manchas, rgbAHsv } from './marcas'

/** Imagen RGBA de `ancho`×`alto` con fondo gris y cuadrados de color. */
function imagen(ancho: number, alto: number, cuadros: { x: number; y: number; lado: number; rgb: [number, number, number] }[], fondo: [number, number, number] = [200, 196, 190]) {
  const d = new Uint8ClampedArray(ancho * alto * 4)
  for (let i = 0; i < ancho * alto; i++) d.set([...fondo, 255], i * 4)
  for (const c of cuadros) {
    for (let y = c.y; y < c.y + c.lado; y++) for (let x = c.x; x < c.x + c.lado; x++) d.set([...c.rgb, 255], (y * ancho + x) * 4)
  }
  return d
}

const VERDE: [number, number, number] = [40, 220, 60]
const AZUL: [number, number, number] = [30, 80, 200]

describe('color', () => {
  it('pasa de RGB a tono, saturación y brillo', () => {
    expect(rgbAHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 })
    expect(rgbAHsv(0, 255, 0).h).toBeCloseTo(120)
    expect(rgbAHsv(0, 0, 255).h).toBeCloseTo(240)
    expect(rgbAHsv(128, 128, 128).s).toBe(0)
  })

  it('reconoce el color elegido y descarta grises y otros tonos', () => {
    const verde = rgbAHsv(...VERDE)
    expect(coincide(rgbAHsv(60, 200, 80), verde)).toBe(true)
    expect(coincide(rgbAHsv(...AZUL), verde)).toBe(false)
    expect(coincide(rgbAHsv(200, 196, 190), verde)).toBe(false)
    expect(coincide(rgbAHsv(10, 40, 12), verde)).toBe(false)
  })

  it('promedia el color alrededor de un punto, también en el corte del rojo', () => {
    const img = imagen(20, 20, [{ x: 5, y: 5, lado: 8, rgb: VERDE }])
    expect(colorEn(img, 20, 20, 9, 9).h).toBeCloseTo(rgbAHsv(...VERDE).h, 0)
    // Rojos a ambos lados de 0°: el promedio circular queda cerca de 0, no en 180.
    const rojos = imagen(4, 2, [
      { x: 0, y: 0, lado: 2, rgb: [255, 0, 20] },
      { x: 2, y: 0, lado: 2, rgb: [255, 20, 0] },
    ])
    const h = colorEn(rojos, 4, 2, 1.5, 0.5, 2).h
    expect(Math.min(h, 360 - h)).toBeLessThan(10)
  })

  it('no acepta como marca un color sin saturación', () => {
    expect(colorUtil(rgbAHsv(...VERDE))).toBe(true)
    expect(colorUtil(rgbAHsv(220, 215, 210))).toBe(false)
  })
})

describe('manchas', () => {
  it('encuentra las dos marcas, con su centro y área, e ignora la banda azul', () => {
    const img = imagen(80, 40, [
      { x: 0, y: 18, lado: 4, rgb: AZUL },
      { x: 10, y: 15, lado: 6, rgb: VERDE },
      { x: 60, y: 16, lado: 5, rgb: VERDE },
    ])
    const m = manchas(img, 80, 40, rgbAHsv(...VERDE))
    expect(m).toHaveLength(2)
    expect(m[0]).toEqual({ x: 12.5, y: 17.5, area: 36 })
    expect(m[1].x).toBeCloseTo(62)
  })

  it('descarta manchas más chicas que el mínimo', () => {
    const img = imagen(40, 20, [
      { x: 2, y: 2, lado: 2, rgb: VERDE },
      { x: 20, y: 5, lado: 5, rgb: VERDE },
    ])
    expect(manchas(img, 40, 20, rgbAHsv(...VERDE), 6)).toHaveLength(1)
  })
})

describe('elegir el par de marcas', () => {
  const m = (x: number, y: number, area: number) => ({ x, y, area })

  it('sin cuadro anterior toma las dos más grandes, ordenadas de izquierda a derecha', () => {
    expect(elegirPar([m(50, 10, 40), m(10, 10, 30), m(30, 30, 5)], null)).toEqual([m(10, 10, 30), m(50, 10, 40)])
    expect(elegirPar([m(1, 1, 9)], null)).toBeNull()
  })

  it('con cuadro anterior sigue a cada marca aunque aparezca una mancha más grande en el fondo', () => {
    const previas: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
    ]
    const par = elegirPar([m(90, 40, 200), m(12, 10, 20), m(48, 11, 22)], previas)
    expect(par).toEqual([m(12, 10, 20), m(48, 11, 22)])
  })

  it('no acepta saltos más grandes que el máximo', () => {
    const previas: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
    ]
    expect(elegirPar([m(80, 10, 20), m(120, 10, 20)], previas, 15)).toBeNull()
  })
})
