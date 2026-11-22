import { describe, expect, it } from 'vitest'
import { manoSintetica } from '../../tracking/sintetica'
import { formatoMetrica } from '../shell/contrato'
import {
  DetectorRepeticiones,
  NIVELES_BANDA,
  PISTA_REPOSO,
  REPOSO_MS,
  SesionBanda,
  cargaDe,
  centroNudillosPx,
  escalaPxPorUnidad,
  grosorDeEstiramiento,
  medirCuadro,
  mediana,
  nivelBanda,
  pistaBanda,
  repeticionesDeSerie,
  tonoDeEstiramiento,
  type EventoBanda,
  type MedidaCuadro,
} from './logica'

const DT = 33
const CAM = { ancho: 640, alto: 480 }
const medida = (distPx: number, pxPorCm = 10): MedidaCuadro => ({ distPx, pxPorCm })

/** Corre `ms` de cuadros a 30 Hz con una distancia que viene de f(t). Devuelve los eventos. */
function correr(s: SesionBanda, ms: number, f: (t: number) => number | null, desde = 0): EventoBanda[] {
  const out: EventoBanda[] = []
  for (let t = 0; t < ms; t += DT) {
    const d = f(desde + t)
    out.push(...s.paso(DT, d == null ? null : medida(d), d == null ? 0 : 2))
  }
  return out
}

/** Distancia (px) de un tirón con forma de campana: sube y baja en `dur` ms hasta `picoPct` sobre un reposo de 200 px. */
const tiron = (t: number, inicio: number, dur: number, picoPct: number, reposo = 200) => {
  const u = (t - inicio) / dur
  return u < 0 || u > 1 ? 0 : reposo * (picoPct / 100) * Math.sin(Math.PI * u)
}

describe('geometría de las manos', () => {
  it('la escala y la distancia salen de landmarks sintéticos (px por cm y distancia entre nudillos)', () => {
    const a = manoSintetica({ lado: 'derecha', x: 0.35, y: 0.5, distanciaCm: 50 }, CAM)
    const b = manoSintetica({ lado: 'izquierda', x: 0.65, y: 0.5, distanciaCm: 50 }, CAM)
    const m = medirCuadro([a, b], CAM.ancho, CAM.alto, 100)!
    expect(m).not.toBeNull()
    // Las palmas están a 0,30 × 640 = 192 px; los nudillos quedan casi en la misma vertical.
    expect(m.distPx).toBeGreaterThan(185)
    expect(m.distPx).toBeLessThan(200)
    // f = 0,8 × 640 = 512 px a 50 cm → 10,24 px/cm
    expect(m.pxPorCm).toBeGreaterThan(9.5)
    expect(m.pxPorCm).toBeLessThan(11)
    const cm = m.distPx / m.pxPorCm
    expect(cm).toBeGreaterThan(17)
    expect(cm).toBeLessThan(20)
  })

  it('una sola mano no se mide', () => {
    const a = manoSintetica({ lado: 'derecha', x: 0.4 }, CAM)
    expect(medirCuadro([a], CAM.ancho, CAM.alto)).toBeNull()
    expect(medirCuadro([], CAM.ancho, CAM.alto)).toBeNull()
  })

  it('la escala px/cm sigue a la calibración (mano 10 % más grande → 10 % menos px por cm)', () => {
    const a = manoSintetica({ lado: 'derecha', x: 0.35 }, CAM)
    const b = manoSintetica({ lado: 'izquierda', x: 0.65 }, CAM)
    const normal = medirCuadro([a, b], CAM.ancho, CAM.alto, 100)!
    const grande = medirCuadro([a, b], CAM.ancho, CAM.alto, 110)!
    expect(grande.pxPorCm / normal.pxPorCm).toBeCloseTo(1 / 1.1, 3)
    expect(grande.distPx).toBeCloseTo(normal.distPx, 6)
  })

  it('escalaPxPorUnidad: nudillos promedio de 5, 9, 13 y 17, y sin datos devuelve null', () => {
    const a = manoSintetica({ lado: 'derecha', x: 0.5, y: 0.5 }, CAM)
    const c = centroNudillosPx(a.landmarks, CAM.ancho, CAM.alto)
    const media = [5, 9, 13, 17].reduce((s, i) => s + a.landmarks[i].x * CAM.ancho, 0) / 4
    expect(c.x).toBeCloseTo(media, 6)
    expect(escalaPxPorUnidad(a.landmarks, a.worldLandmarks, CAM.ancho, CAM.alto)).toBeGreaterThan(900)
    expect(escalaPxPorUnidad([], [], 640, 480)).toBeNull()
  })

  it('mediana', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
    expect(mediana([])).toBeNaN()
  })
})

describe('niveles = color y carga nominal de la banda', () => {
  it('2, 4, 6, 8 y 10 kg al doble de largo', () => {
    expect([1, 2, 3, 4, 5].map((n) => nivelBanda(n).kgBanda)).toEqual([2, 4, 6, 8, 10])
    expect(nivelBanda(0).kgBanda).toBe(2)
    expect(nivelBanda(9).kgBanda).toBe(10)
    expect(NIVELES_BANDA[1].nombre).toBe('Banda amarilla')
  })

  it('carga ≈ kgBanda × estiramiento: nominal al 100 %', () => {
    expect(cargaDe(6, 100)).toBe(6)
    expect(cargaDe(6, 50)).toBe(3)
    expect(cargaDe(10, 32)).toBeCloseTo(3.2, 10)
  })

  it('la banda se enfría/calienta y se adelgaza al estirarla', () => {
    expect(tonoDeEstiramiento(0)).toBeCloseTo(0.58)
    expect(tonoDeEstiramiento(100)).toBe(0)
    expect(tonoDeEstiramiento(250)).toBe(0)
    expect(tonoDeEstiramiento(50)).toBeGreaterThan(tonoDeEstiramiento(80))
    expect(grosorDeEstiramiento(0)).toBe(1)
    expect(grosorDeEstiramiento(100)).toBe(0.5)
    expect(grosorDeEstiramiento(30)).toBeGreaterThan(grosorDeEstiramiento(70))
  })

  it('formatoMetrica imprime los kg con coma decimal', () => {
    expect(formatoMetrica({ unidad: 'kg' }, 3.2)).toBe('3,2 kg')
    expect(formatoMetrica({ unidad: 'kg' }, null)).toBe('—')
  })
})

describe('reposo', () => {
  it('se marca solo con distancia estable ±2 % durante 2 s, y congela la escala px/cm', () => {
    const s = new SesionBanda(4)
    expect(s.fase).toBe('sin-manos')
    // el ruido de ±1 % no lo impide; la escala cambia cuadro a cuadro pero se congela al marcar
    const ev = correr(s, REPOSO_MS + 300, (t) => 200 * (1 + 0.01 * Math.sin(t / 50)))
    const reposo = ev.find((e) => e.tipo === 'reposo')
    expect(reposo).toBeDefined()
    expect(reposo).toMatchObject({ automatico: true })
    expect(s.conReposo).toBe(true)
    expect(s.fase).toBe('listo')
    expect(s.reposoPx).toBeGreaterThan(195)
    expect(s.reposoPx).toBeLessThan(205)
    expect(s.reposoCm).toBeCloseTo(s.reposoPx! / 10, 6) // pxPorCm = 10
    const congelada = s.pxPorCm
    // después de marcarlo, una escala distinta (puño girado) no mueve el estiramiento %
    for (let i = 0; i < 5; i++) s.paso(DT, { distPx: 300, pxPorCm: 18 }, 2)
    expect(s.pxPorCm).toBe(congelada)
    expect(s.estiramientoPct!).toBeGreaterThan(45)
    expect(s.estiramientoPct!).toBeLessThan(55)
    expect(s.estiramientoCm!).toBeCloseTo((s.estiramientoPct! / 100) * s.reposoCm!, 6)
  })

  it('no se marca si la distancia se mueve más de ±2 %, ni con menos de 2 s', () => {
    const s = new SesionBanda(4)
    // oscila ±5 % cada 400 ms: nunca hay 2 s estables
    const ev = correr(s, 6000, (t) => 200 * (1 + 0.05 * Math.sign(Math.sin(t / 130))))
    expect(ev.some((e) => e.tipo === 'reposo')).toBe(false)
    expect(s.conReposo).toBe(false)
    const s2 = new SesionBanda(4)
    correr(s2, REPOSO_MS - 400, () => 200)
    expect(s2.conReposo).toBe(false)
    expect(s2.progresoReposo).toBeGreaterThan(0.7)
    expect(s2.progresoReposo).toBeLessThan(1)
  })

  it('perder una mano reinicia la cuenta de los 2 s; con una mano no hay medida', () => {
    const s = new SesionBanda(4)
    correr(s, 1500, () => 200)
    expect(s.progresoReposo).toBeGreaterThan(0.6)
    s.paso(DT, null, 1)
    expect(s.fase).toBe('una-mano')
    expect(s.progresoReposo).toBe(0)
    expect(s.estiramientoPct).toBeNull()
    expect(s.marcarReposo()).toBeNull() // el botón tampoco marca con una mano
    const ev = correr(s, REPOSO_MS - 500, () => 200)
    expect(ev.some((e) => e.tipo === 'reposo')).toBe(false)
    expect(correr(s, 800, () => 200).some((e) => e.tipo === 'reposo')).toBe(true)
  })

  it('el botón marca el reposo al instante y marcar de nuevo lo reemplaza, conservando lo contado', () => {
    const s = new SesionBanda(4)
    correr(s, 400, () => 180)
    const e = s.marcarReposo()
    expect(e).toMatchObject({ tipo: 'reposo', automatico: false })
    expect(s.reposoPx).toBeCloseTo(180, 3)
    // un tirón cuenta
    correr(s, 3000, (t) => 180 + tiron(t, 300, 1200, 50, 180))
    expect(s.repeticiones).toBe(1)
    correr(s, 600, () => 180)
    s.borrarReposo()
    expect(s.conReposo).toBe(false)
    expect(s.estiramientoPct).toBeNull()
    expect(s.repeticiones).toBe(1)
    correr(s, 400, () => 240)
    s.marcarReposo()
    expect(s.reposoPx).toBeCloseTo(240, 3)
    expect(s.maxPct).toBeGreaterThan(45)
  })
})

describe('deriva del reposo (prueba real: la banda resbala en el puño)', () => {
  it('si tras un tirón la banda queda quieta un poco más larga, ese largo pasa a ser el reposo y la carga vuelve a 0', () => {
    const s = new SesionBanda(6)
    correr(s, REPOSO_MS + 200, () => 200)
    expect(s.reposoPx).toBeCloseTo(200, 0)
    correr(s, 1500, (t) => 200 + tiron(t, 0, 1500, 50))
    // Vuelve a 216 px (8 % sobre el reposo, como de 20 a 21,6 cm) y se queda quieta.
    const ev = correr(s, REPOSO_MS + 400, () => 216)
    expect(ev.filter((e) => e.tipo === 'reposo')).toHaveLength(1)
    expect(s.reposoPx).toBeCloseTo(216, 0)
    expect(s.reposoCm).toBeCloseTo(21.6, 1)
    expect(s.estiramientoPct!).toBeLessThan(1)
    expect(s.cargaKg!).toBeLessThan(0.1)
    expect(s.repeticiones).toBe(1)
  })

  it('si el reposo subió por deriva y la banda vuelve a quedar quieta en su largo, baja de nuevo, pero no bajo el marcado', () => {
    const s = new SesionBanda(6)
    correr(s, REPOSO_MS + 200, () => 200)
    correr(s, 1500, (t) => 200 + tiron(t, 0, 1500, 50))
    correr(s, REPOSO_MS + 400, () => 216)
    expect(s.reposoPx).toBeCloseTo(216, 0)
    // Vuelve a 200 px y queda quieta: el reposo baja a 200.
    correr(s, REPOSO_MS + 400, () => 200)
    expect(s.reposoPx).toBeCloseTo(200, 0)
    // Manos juntas (120 px, banda suelta): no baja más.
    correr(s, REPOSO_MS + 1000, () => 120)
    expect(s.reposoPx).toBeCloseTo(200, 0)
    expect(s.estiramientoPct).toBe(0)
  })

  it('no toca el reposo si la banda vuelve a su largo, ni mientras se sostiene un estiramiento de repetición', () => {
    const s = new SesionBanda(6)
    correr(s, REPOSO_MS + 200, () => 200)
    // De vuelta al reposo exacto (o con 2 % de ruido): nada.
    expect(correr(s, 3000, () => 204).some((e) => e.tipo === 'reposo')).toBe(false)
    // Sostener 30 % durante 4 s es una repetición en curso, no un reposo nuevo.
    expect(correr(s, 4000, () => 260).some((e) => e.tipo === 'reposo')).toBe(false)
    expect(s.reposoPx).toBeCloseTo(200, 0)
  })
})

describe('estiramiento, repeticiones y métricas de una sesión', () => {
  /** Sesión con reposo de 200 px (10 px/cm = 20 cm) y 3 tirones de 40, 60 y 50 %. */
  function sesionTres() {
    const s = new SesionBanda(4)
    correr(s, REPOSO_MS + 200, () => 200)
    expect(s.conReposo).toBe(true)
    const picos = [40, 60, 50]
    const eventos: EventoBanda[] = []
    picos.forEach((p) => eventos.push(...correr(s, 3000, (t) => 200 + tiron(t, 400, 1400, p))))
    eventos.push(...correr(s, 800, () => 200))
    return { s, eventos }
  }

  it('cuenta tres repeticiones con su pico y su carga (kgBanda × %)', () => {
    const { s, eventos } = sesionTres()
    const reps = eventos.filter((e) => e.tipo === 'repeticion')
    expect(reps).toHaveLength(3)
    expect(s.repeticiones).toBe(3)
    const picos = s.picos.map((p) => p.picoPct)
    expect(picos[0]).toBeGreaterThan(36)
    expect(picos[0]).toBeLessThan(41)
    expect(picos[1]).toBeGreaterThan(56)
    expect(picos[1]).toBeLessThan(61)
    expect(reps.map((e) => (e.tipo === 'repeticion' ? e.n : 0))).toEqual([1, 2, 3])
    for (const e of reps) {
      if (e.tipo !== 'repeticion') continue
      expect(e.cargaKg).toBeCloseTo((4 * e.picoPct) / 100, 6)
      expect(e.picoCm).toBeCloseTo((e.picoPct / 100) * 20, 0)
    }
  })

  it('métricas del resumen', () => {
    const { s } = sesionTres()
    const r = s.resumen()
    expect(r.kgBanda).toBe(4)
    expect(r.repeticiones).toBe(3)
    expect(r.estiramientoMaxPct!).toBeGreaterThan(56)
    expect(r.estiramientoMaxPct!).toBeLessThan(61)
    expect(r.estiramientoMaxCm!).toBeCloseTo((r.estiramientoMaxPct! / 100) * r.reposoCm!, 0)
    expect(r.reposoCm!).toBeGreaterThan(19)
    expect(r.reposoCm!).toBeLessThan(21)
    expect(r.cargaMaxKg!).toBeCloseTo((4 * r.estiramientoMaxPct!) / 100, 1)
    // pico 1 ≈ 40, pico 3 ≈ 50 → +25 %
    expect(r.cambioPicoPct!).toBeGreaterThan(18)
    expect(r.cambioPicoPct!).toBeLessThan(32)
    expect(r.tiempoBajoTensionS!).toBeGreaterThan(0.8)
    expect(r.tiempoBajoTensionS!).toBeLessThan(6)
    expect(r.reposoCm).not.toBeNull()
  })

  it('sin reposo no hay medidas; con un solo tirón el cambio de pico es null', () => {
    const s = new SesionBanda(6)
    const r = s.resumen()
    expect(r).toMatchObject({ estiramientoMaxCm: null, estiramientoMaxPct: null, cargaMaxKg: null, tiempoBajoTensionS: null, cambioPicoPct: null, reposoCm: null, repeticiones: 0, kgBanda: 6 })
    correr(s, 400, () => 200)
    s.marcarReposo()
    correr(s, 3000, (t) => 200 + tiron(t, 300, 1400, 60))
    correr(s, 600, () => 200)
    expect(s.repeticiones).toBe(1)
    expect(s.resumen().cambioPicoPct).toBeNull()
    expect(s.resumen().cargaMaxKg).toBeGreaterThan(3)
  })

  it('el tiempo bajo tensión suma solo cuadros con carga ≥ 50 % del pico', () => {
    const s = new SesionBanda(10)
    correr(s, 400, () => 200)
    s.marcarReposo()
    // 1 s a 60 % (pico), 1 s a 40 % (≥ 50 % del pico), 1 s a 20 % (no), 1 s en reposo
    correr(s, 1000, () => 320)
    correr(s, 1000, () => 280)
    correr(s, 1000, () => 240)
    correr(s, 1000, () => 200)
    const t = s.tiempoBajoTensionS()
    expect(t).toBeGreaterThan(1.8)
    expect(t).toBeLessThan(2.2)
  })

  it('un cuadro largo (pausa) no suma más de 0,1 s al tiempo bajo tensión', () => {
    const s = new SesionBanda(10)
    correr(s, 400, () => 200)
    s.marcarReposo()
    for (let i = 0; i < 5; i++) s.paso(DT, medida(300), 2)
    const antes = s.tiempoBajoTensionS()
    s.paso(5000, medida(300), 2)
    expect(s.tiempoBajoTensionS() - antes).toBeCloseTo(0.1, 6)
  })

  it('perder las manos a mitad de un tirón lo cierra tras 0,35 s y se cuenta', () => {
    const s = new SesionBanda(4)
    correr(s, 400, () => 200)
    s.marcarReposo()
    correr(s, 800, (t) => 200 + tiron(t, 0, 1600, 60)) // sube hasta ~el pico
    correr(s, 300, () => 320)
    const ev = correr(s, 800, () => null)
    expect(ev.some((e) => e.tipo === 'repeticion')).toBe(true)
    expect(s.estiramientoPct).toBeNull()
  })
})

describe('repeticiones: huecos, fragmentos e incompletas', () => {
  const serie = (dt: number, tramos: [number, number | null][]) => tramos.flatMap(([ms, pct]) => Array.from({ length: Math.round(ms / dt) }, () => [dt, pct] as const))

  it('un hueco de 0,3 s dentro del tirón no lo parte; uno de 0,5 s sí', () => {
    const corto = repeticionesDeSerie(serie(50, [[0, 0], [600, 50], [300, 0], [600, 50], [800, 0]]))
    expect(corto.validas).toHaveLength(1)
    const largo = repeticionesDeSerie(serie(50, [[600, 50], [500, 0], [600, 50], [800, 0]]))
    expect(largo.validas).toHaveLength(2)
  })

  it('un fragmento menor al 35 % del pico no es repetición (la cola de un tirón)', () => {
    // pico 80 %; luego un tramo de 20 % (25 % del pico): fragmento. Uno de 30 % (37 %): cuenta.
    const r = repeticionesDeSerie(serie(50, [[800, 80], [800, 0], [500, 20], [800, 0], [500, 30], [800, 0]]))
    expect(r.validas.map((x) => x.picoPct)).toEqual([80, 30])
    expect(r.fragmentos).toHaveLength(1)
    expect(r.incompletas).toHaveLength(0)
  })

  it('el umbral sube con el pico: 15 % del pico (o 10 % mínimo)', () => {
    const d = new DetectorRepeticiones()
    expect(d.umbralPct).toBe(10)
    d.paso(33, 100, 20)
    expect(d.umbralPct).toBe(15)
  })

  it('un tramo que nunca pasa el 25 % queda como incompleto, no como repetición', () => {
    const r = repeticionesDeSerie(serie(50, [[800, 18], [800, 0], [800, 50], [800, 0]]))
    expect(r.incompletas.map((x) => x.picoPct)).toEqual([18])
    expect(r.validas.map((x) => x.picoPct)).toEqual([50])
  })

  it('el ruido de uno o dos cuadros no es nada, ni siquiera incompleta', () => {
    const r = repeticionesDeSerie(serie(33, [[500, 0], [66, 30], [800, 0], [99, 60], [800, 0]]))
    expect(r.validas).toHaveLength(0)
    expect(r.incompletas).toHaveLength(0)
    expect(r.fragmentos.length).toBeGreaterThan(0)
  })

  it('los eventos incompletos llevan el umbral y el estiramiento', () => {
    const s = new SesionBanda(4)
    correr(s, 400, () => 200)
    s.marcarReposo()
    const ev = correr(s, 3000, (t) => 200 + tiron(t, 300, 1200, 18))
    const inc = ev.find((e) => e.tipo === 'incompleta')
    expect(inc).toMatchObject({ umbralPct: 25 })
    expect(s.incompletas).toBe(1)
    expect(s.repeticiones).toBe(0)
  })
})

describe('textos', () => {
  it('la pista de reposo es la acordada y ningún texto dice lo que la cámara no mide', () => {
    expect(pistaBanda('buscando-reposo')).toBe(PISTA_REPOSO)
    expect(PISTA_REPOSO).toBe('Toma la banda con las dos manos, recién tensa, y quédate quieto')
    expect(pistaBanda('una-mano')).toMatch(/solo una mano/)
    const todas = (['sin-manos', 'una-mano', 'buscando-reposo', 'listo'] as const).flatMap((f) => [pistaBanda(f), pistaBanda(f, true)])
    for (const t of todas) expect(t).not.toMatch(new RegExp(`${'fuer'}za|${'pre'}si[oó]n`, 'i'))
  })
})
