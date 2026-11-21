import { describe, expect, it } from 'vitest'
import { FuenteSintetica, relojManual } from '../tracking/fuenteSimulada'
import { guionPreset, manoSintetica, POSE_BASE } from '../tracking/sintetica'
import type { ManoSeguida } from '../tracking/tipos'
import {
  aVista,
  avanzarCalibracion,
  calibracionInicial,
  chequeoDistancia,
  chequeoLuz,
  elegirMano,
  esperaCalibracion,
  estadoPinza,
  medidasMano,
  pinzaGesto,
  numeroPaso,
  puntosDentro,
  resultadoCalibracion,
  UMBRALES,
  type EstadoCalibracion,
  type MuestraCalibracion,
} from './calibracion'

const muestra = (t: number, p: Partial<MuestraCalibracion> = {}): MuestraCalibracion => ({
  t,
  mano: true,
  dentro: true,
  apertura: 1,
  pinzaCm: 8,
  largoCm: 18,
  confianza: 0.9,
  fps: 30,
  ...p,
})

function correr(muestras: MuestraCalibracion[], e: EstadoCalibracion = calibracionInicial()) {
  for (const m of muestras) e = avanzarCalibracion(e, m)
  return e
}

describe('pasos de la calibración', () => {
  it('paso 1: mano abierta 2 s seguidos (se reinicia si se cierra o sale del marco)', () => {
    let e = correr([muestra(0), muestra(1500)])
    expect(e.paso).toBe('abierta')
    expect(e.progreso).toBeCloseTo(0.75 / 3)
    e = avanzarCalibracion(e, muestra(1600, { apertura: 0.5 }))
    expect(e.desdeAbierta).toBeNull()
    e = correr([muestra(1700, { dentro: false }), muestra(1800), muestra(3700)], e)
    expect(e.paso).toBe('abierta')
    e = avanzarCalibracion(e, muestra(3800))
    expect(e.paso).toBe('abrir-cerrar')
    expect(e.progreso).toBeCloseTo(1 / 3)
  })

  it('paso 2: 3 ciclos cerrar→abrir; paso 3: pinza 0,4 s → lista', () => {
    let e = correr([muestra(0), muestra(2000)])
    expect(e.paso).toBe('abrir-cerrar')
    let t = 2000
    for (let i = 0; i < 3; i++) {
      e = avanzarCalibracion(e, muestra((t += 100), { apertura: 0.1 }))
      e = avanzarCalibracion(e, muestra((t += 100), { apertura: 0.5 }))
      if (i < 2) expect(e.repeticiones).toBe(i)
      e = avanzarCalibracion(e, muestra((t += 100), { apertura: 1 }))
    }
    expect(e.repeticiones).toBe(3)
    expect(e.paso).toBe('pinza')
    e = correr([muestra((t += 100), { pinzaCm: 1 }), muestra((t += 300), { pinzaCm: 1 })], e)
    expect(e.paso).toBe('pinza')
    e = avanzarCalibracion(e, muestra((t += 100), { pinzaCm: 1 }))
    expect(e.paso).toBe('lista')
    expect(e.progreso).toBe(1)
    expect(numeroPaso(e.paso)).toBe(3)
    // Lista es final.
    expect(avanzarCalibracion(e, muestra(t + 100, { mano: false }))).toBe(e)
  })

  describe('paso 3: pinza con dedos "suficientemente cerca"', () => {
    // Llega al paso 3 y devuelve el estado y el reloj.
    function enPinza(): [EstadoCalibracion, number] {
      let e = correr([muestra(0), muestra(2000)])
      let t = 2000
      for (let i = 0; i < 3; i++) e = correr([muestra((t += 100), { apertura: 0.1 }), muestra((t += 100), { apertura: 1 })], e)
      expect(e.paso).toBe('pinza')
      return [e, t]
    }

    it('acepta puntas a 2,5 cm (dedos juntos de verdad: las puntas de MediaPipe no se superponen)', () => {
      let [e, t] = enPinza()
      e = correr([muestra((t += 100), { pinzaCm: 2.5 }), muestra((t += 200), { pinzaCm: 2.5 }), muestra((t += 250), { pinzaCm: 2.5 })], e)
      expect(e.paso).toBe('lista')
    })

    it('acepta por proporción de la palma aunque la escala en cm venga inflada', () => {
      let [e, t] = enPinza()
      e = correr([muestra((t += 100), { pinzaCm: 4.5, pinzaRel: 0.3 }), muestra((t += 450), { pinzaCm: 4.5, pinzaRel: 0.3 })], e)
      expect(e.paso).toBe('lista')
    })

    it('no acepta dedos separados (mano relajada)', () => {
      let [e, t] = enPinza()
      e = correr([muestra((t += 100), { pinzaCm: 6, pinzaRel: 0.7 }), muestra((t += 1000), { pinzaCm: 6, pinzaRel: 0.7 })], e)
      expect(e.paso).toBe('pinza')
      expect(e.desdePinza).toBeNull()
    })

    it('un cuadro con ruido (< 250 ms) no reinicia la cuenta; una separación larga sí', () => {
      let [e, t] = enPinza()
      e = correr([muestra((t += 100), { pinzaCm: 2 }), muestra((t += 150), { pinzaCm: 5 })], e)
      expect(e.desdePinza).not.toBeNull()
      e = avanzarCalibracion(e, muestra((t += 300), { pinzaCm: 2 }))
      expect(e.paso).toBe('lista')

      ;[e, t] = enPinza()
      e = correr([muestra((t += 100), { pinzaCm: 2 }), muestra((t += 100), { pinzaCm: 5 }), muestra((t += 300), { pinzaCm: 5 })], e)
      expect(e.desdePinza).toBeNull()
    })

    it('estadoPinza: junta / casi / lejos', () => {
      expect(estadoPinza({ pinzaCm: 2.9 })).toBe('junta')
      expect(estadoPinza({ pinzaCm: 9, pinzaRel: 0.34 })).toBe('junta')
      expect(estadoPinza({ pinzaCm: 4.5 })).toBe('casi')
      expect(estadoPinza({ pinzaCm: 9, pinzaRel: 0.9 })).toBe('lejos')
    })
  })

  it('sin mano o fuera del marco no avanza ni acumula', () => {
    const e = correr([muestra(0, { mano: false }), muestra(3000, { dentro: false })])
    expect(e.paso).toBe('abierta')
    expect(e.n).toBe(0)
  })

  it('línea base: regla manda, estimado para comparar, escala del mundo', () => {
    let e = calibracionInicial()
    e = correr([muestra(0, { largoCm: 18, pinzaCm: 9, apertura: 1.1, confianza: 0.9, fps: 30 }), muestra(10, { largoCm: 19, pinzaCm: 7, apertura: 0.2, confianza: 0.7, fps: 20 })], e)
    const sinRegla = resultadoCalibracion(e, null)
    expect(sinRegla).toEqual({
      largoManoCm: 18.5,
      largoManoFuente: 'estimado',
      largoManoEstimadoCm: 18.5,
      aperturaPinzaMaxCm: 9,
      rangoAbrirCerrar: { min: 0.2, max: 1.1 },
      fps: 25,
      confianzaMedia: 0.8,
      escalaCmPorUnidad: 100,
    })
    const conRegla = resultadoCalibracion(e, 17)
    expect(conRegla.largoManoCm).toBe(17)
    expect(conRegla.largoManoFuente).toBe('regla')
    expect(conRegla.largoManoEstimadoCm).toBe(18.5)
    expect(conRegla.escalaCmPorUnidad).toBeCloseTo((17 / 18.5) * 100, 1)
  })

  it('el guion sintético "calibracion" completa los 3 pasos en < 10 s', async () => {
    const reloj = relojManual()
    const f = new FuenteSintetica(guionPreset('calibracion'), reloj)
    let e = calibracionInicial()
    f.alCuadro((c) => {
      const m = elegirMano(c.manos, 'derecha')
      const med = m ? medidasMano(m, null) : { apertura: 0, pinzaCm: 0, largoCm: 0 }
      e = avanzarCalibracion(e, { t: c.t, mano: !!m, dentro: true, ...med, confianza: m?.confianza ?? 0, fps: 30 })
    })
    await f.iniciar()
    let tLista: number | null = null
    for (let t = 0; t <= 12_000 && tLista == null; t += 33) {
      reloj.t = t
      f.paso()
      if (e.paso === 'lista') tLista = t
    }
    expect(tLista).not.toBeNull()
    expect(tLista!).toBeLessThan(10_000)
    const c = resultadoCalibracion(e, null)
    expect(c.largoManoCm).toBeGreaterThan(17)
    expect(c.largoManoCm).toBeLessThan(19.5)
    expect(c.aperturaPinzaMaxCm).toBeGreaterThan(5)
    expect(c.rangoAbrirCerrar.min).toBeLessThan(UMBRALES.cerrada)
    expect(c.rangoAbrirCerrar.max).toBeGreaterThan(UMBRALES.abierta)
    expect(c.confianzaMedia).toBeCloseTo(0.95, 2)
  })
})

describe('mano elegida, checklist y vista', () => {
  const mano = (lado: 'derecha' | 'izquierda', confianza: number): ManoSeguida => ({ ...manoSintetica({ ...POSE_BASE, lado }), confianza })

  it('elegirMano: el lado de la sesión; si no está o es ambas, la de mayor confianza', () => {
    const d = mano('derecha', 0.6)
    const i = mano('izquierda', 0.9)
    expect(elegirMano([d, i], 'derecha')).toBe(d)
    expect(elegirMano([d, i], 'ambas')).toBe(i)
    expect(elegirMano([d], 'izquierda')).toBe(d)
    expect(elegirMano([], 'derecha')).toBeNull()
  })

  it('checklist: luz, distancia y textos', () => {
    expect(chequeoLuz(140)).toMatchObject({ nivel: 'ok', texto: 'Buena' })
    expect(chequeoLuz(30)).toMatchObject({ nivel: 'mal', texto: 'Poca' })
    expect(chequeoLuz(null).nivel).toBe('nada')
    expect(chequeoDistancia(48).nivel).toBe('ok')
    expect(chequeoDistancia(20)).toEqual({ nivel: 'mal', consejo: 'Aleja un poco la mano' })
    expect(chequeoDistancia(90).consejo).toBe('Acerca un poco la mano')
  })

  it('aVista: espejo + object-fit cover; puntosDentro', () => {
    const img = { ancho: 640, alto: 480 }
    const vista = { ancho: 390, alto: 844 }
    // Centro de la imagen → centro de la vista; x se espeja.
    expect(aVista({ x: 0.5, y: 0.5 }, img, vista)).toEqual({ x: 195, y: 422 })
    const izq = aVista({ x: 0.45, y: 0.5 }, img, vista)
    expect(izq.x).toBeGreaterThan(195)
    // Cover: el alto llena la vista (y = 0 → 0, y = 1 → 844).
    expect(aVista({ x: 0.5, y: 1 }, img, vista).y).toBeCloseTo(844)
    expect(puntosDentro([{ x: 10, y: 10 }, { x: 50, y: 50 }], { x: 0, y: 0, ancho: 20, alto: 20 })).toBe(1)
  })

  it('esperaCalibracion (modo debug): dice qué condición falta en cada paso', () => {
    expect(esperaCalibracion({ paso: 'abierta', cerrada: false })).toBe('apertura ≥ 0,80 por 2 s')
    expect(esperaCalibracion({ paso: 'abrir-cerrar', cerrada: false })).toBe('cerrar: apertura ≤ 0,30')
    expect(esperaCalibracion({ paso: 'abrir-cerrar', cerrada: true })).toBe('abrir: apertura ≥ 0,80')
    expect(esperaCalibracion({ paso: 'pinza', cerrada: false })).toBe('pinza ≤ 3 cm o ≤ 0,35 palma por 0,4 s')
  })

  it('pinza de frente: si MediaPipe separa las puntas en profundidad, la distancia en la imagen igual la reconoce', () => {
    const img = { ancho: 480, alto: 640 }
    const cerrada = manoSintetica({ ...POSE_BASE, apertura: 0.7, dedos: { indice: 0.5 }, pinzaCm: 0.5 }, img) // como el guion 'pinza'
    // Lo que pasa con la palma a la cámara: la punta del pulgar queda 5 cm "delante" solo en el mundo 3D.
    const conError = { ...cerrada, worldLandmarks: cerrada.worldLandmarks.map((p, i) => (i === 4 ? { ...p, z: p.z - 0.05 } : p)) }
    const med = medidasMano(conError, null, img)
    expect(med.pinzaCm).toBeGreaterThan(UMBRALES.pinzaCm)
    expect(med.pinzaRel!).toBeGreaterThan(UMBRALES.pinzaRel) // solo con la 3D no se reconocería
    expect(med.pinzaVistaCm).not.toBeNull()
    expect(med.pinzaVistaCm!).toBeLessThan(UMBRALES.pinzaCm)
    expect(pinzaGesto(med)).toBeLessThan(UMBRALES.pinzaCm)
    expect(estadoPinza(med)).toBe('junta')
    // Sin error de profundidad, la de la imagen se parece a la 3D (aprox.).
    const bien = medidasMano(cerrada, null, img)
    expect(Math.abs(bien.pinzaVistaCm! - bien.pinzaCm)).toBeLessThan(0.5)
    // Mano abierta sin pinza: ninguna de las dos la reconoce.
    const abierta = medidasMano(manoSintetica({ ...POSE_BASE, apertura: 1 }, img), null, img)
    expect(pinzaGesto(abierta)).toBeGreaterThan(UMBRALES.pinzaCm)
    expect(estadoPinza(abierta)).not.toBe('junta')
    // Sin tamaño de imagen no hay distancia en la imagen: manda la 3D.
    expect(medidasMano(conError, null).pinzaVistaCm).toBeNull()

    // En la máquina de estados: paso 3 con la 3D en 3,5 cm (y 0,4 palmas) y la de la imagen en 0,8 cm → lista.
    let e: EstadoCalibracion = { ...calibracionInicial(), paso: 'pinza' }
    e = avanzarCalibracion(e, muestra(0, { pinzaCm: 3.5, pinzaRel: 0.4, pinzaVistaCm: 0.8 }))
    e = avanzarCalibracion(e, muestra(500, { pinzaCm: 3.5, pinzaRel: 0.4, pinzaVistaCm: 0.8 }))
    expect(e.paso).toBe('lista')
    expect(e.pinzaMaxCm).toBe(3.5) // la línea base sigue siendo la 3D
  })
})
