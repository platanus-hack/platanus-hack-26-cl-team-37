import { describe, expect, it } from 'vitest'
import { guionPreset, manosEnGuion, type GuionSintetico } from '../tracking/sintetica'
import type { CuadroManos } from '../tracking/tipos'
import { resumirPista, textoReporte } from './camara'
import { CORENGTH_5KG, CURVAS_PUBLICADAS, FORMA_LATEX, areaHasta, cargaEn, conTiras, curvaDesdePesos, curvaDesdeUnPunto, curvaPropia } from './curva'
import { CapturaReposo, ContadorReps, MS_REPOSO, MS_REPOSO_AUTO, ToleranciaPerdida, PALMA_MIN, alcanzaMeta, reposoMalMarcado, textoResumen, estiramiento, manosAlBorde, medirBanda, puntoAgarre, tamanoPalma, totales } from './medicion'

const amarilla = CURVAS_PUBLICADAS.find((c) => c.id === 'thera-amarilla')!

describe('curva de la banda', () => {
  it('devuelve los valores medidos en los puntos de la tabla', () => {
    expect(cargaEn(amarilla, 0.25).kg).toBeCloseTo(0.48)
    expect(cargaEn(amarilla, 1).kg).toBeCloseTo(1.17)
    expect(cargaEn(amarilla, 2.5)).toEqual({ kg: 1.98, fueraDeRango: false })
  })

  it('une los puntos con tramos rectos desde el origen', () => {
    expect(cargaEn(amarilla, 0.125).kg).toBeCloseTo(0.24)
    expect(cargaEn(amarilla, 0.375).kg).toBeCloseTo((0.48 + 0.83) / 2)
  })

  it('con la banda suelta no hay carga', () => {
    expect(cargaEn(amarilla, 0)).toEqual({ kg: 0, fueraDeRango: false })
    expect(cargaEn(amarilla, -0.2).kg).toBe(0)
    expect(cargaEn({ puntos: [] }, 0.5).kg).toBe(0)
  })

  it('pasado el último punto prolonga el último tramo y lo marca', () => {
    const c = cargaEn(amarilla, 2.75)
    expect(c.fueraDeRango).toBe(true)
    expect(c.kg).toBeCloseTo(1.98 + (1.98 - 1.83))
  })

  it('no es una recta: el primer cuarto del estiramiento ya da cerca del 40 % de la carga al doble de largo', () => {
    const cuarto = FORMA_LATEX[0].kg
    expect(cuarto).toBeGreaterThan(0.35)
    expect(cuarto).toBeLessThan(0.45)
    expect(cargaEn({ puntos: FORMA_LATEX }, 1).kg).toBeCloseTo(1)
  })

  it('el área bajo la curva suma los tramos, también pasado el último punto', () => {
    const recta = { puntos: [{ estiramiento: 1, kg: 4 }] }
    expect(areaHasta(recta, 0.5)).toBeCloseTo(0.5)
    expect(areaHasta(recta, 1)).toBeCloseTo(2)
    expect(areaHasta(recta, 1.5)).toBeCloseTo(4.5)
    expect(areaHasta(recta, 0)).toBe(0)
    expect(areaHasta(amarilla, 0.5)).toBeCloseTo((0.48 / 2 + (0.48 + 0.83) / 2) * 0.25)
  })

  it('las tiras en paralelo suman su carga', () => {
    // Thera-Band se midió en una tira: tomada en lazo (2 tiras) opone el doble.
    expect(cargaEn(conTiras(amarilla, 2), 1).kg).toBeCloseTo(2.34)
    // El envase de la Corength mide el lazo entero: una sola tira opone la mitad.
    expect(cargaEn(conTiras(CORENGTH_5KG, 1), 1).kg).toBeCloseTo(2.5)
    expect(conTiras(amarilla, 1)).toBe(amarilla)
    expect(conTiras(amarilla, 0)).toBe(amarilla)
  })

  it('todas las curvas publicadas suben al estirar', () => {
    for (const c of CURVAS_PUBLICADAS) {
      expect(c.puntos).toHaveLength(10)
      for (let i = 1; i < c.puntos.length; i++) expect(c.puntos[i].kg).toBeGreaterThan(c.puntos[i - 1].kg)
    }
  })

  it('la curva del envase pasa por el punto del envase', () => {
    expect(cargaEn(CORENGTH_5KG, 1).kg).toBeCloseTo(5)
    expect(cargaEn(CORENGTH_5KG, 0.25).kg).toBeGreaterThan(1.75)
    expect(curvaDesdeUnPunto({ estiramiento: 0.5, kg: 2 }).find((p) => p.estiramiento === 0.5)?.kg).toBeCloseTo(2)
    expect(curvaDesdeUnPunto({ estiramiento: 0.5, kg: 0 })).toEqual([])
  })
})

describe('calibración con pesos', () => {
  it('convierte largos en estiramiento y ordena los puntos', () => {
    const r = curvaDesdePesos({ reposoCm: 100, filas: [{ kg: 2, largoCm: 150 }, { kg: 1, largoCm: 120 }, { kg: 3, largoCm: 200 }] })
    expect(r.avisos).toEqual([])
    expect(r.puntos.map((p) => p.kg)).toEqual([1, 2, 3])
    expect(r.puntos[0].estiramiento).toBeCloseTo(0.2)
    expect(cargaEn(r, 0.35).kg).toBeCloseTo(1.5)
  })

  it('descarta filas vacías o más cortas que el reposo y avisa', () => {
    const r = curvaDesdePesos({ reposoCm: 100, filas: [{ kg: 1, largoCm: 90 }, { kg: 0, largoCm: 0 }, { kg: 1, largoCm: 130 }, { kg: 2, largoCm: 170 }] })
    expect(r.puntos).toHaveLength(2)
    expect(r.avisos).toEqual(['La medida 1 es más corta que el reposo.'])
  })

  it('avisa si con más estiramiento la carga baja', () => {
    const r = curvaDesdePesos({ reposoCm: 100, filas: [{ kg: 2, largoCm: 130 }, { kg: 1, largoCm: 160 }] })
    expect(r.avisos.join(' ')).toMatch(/debería subir/)
  })

  it('con una sola medida usa la forma típica del látex', () => {
    const r = curvaDesdePesos({ reposoCm: 100, filas: [{ kg: 2, largoCm: 150 }] })
    expect(r.puntos).toHaveLength(FORMA_LATEX.length)
    expect(cargaEn(r, 0.5).kg).toBeCloseTo(2)
    expect(r.avisos.join(' ')).toMatch(/Agrega más pesos/)
  })

  it('sin reposo o sin medidas no hay curva propia', () => {
    expect(curvaPropia({ reposoCm: 0, filas: [{ kg: 1, largoCm: 120 }] })).toBeNull()
    expect(curvaPropia({ reposoCm: 100, filas: [] })).toBeNull()
    const propia = curvaPropia({ reposoCm: 100, filas: [{ kg: 1, largoCm: 120 }, { kg: 2, largoCm: 150 }] })
    expect(propia?.fuente).toBe('Calibrada con 2 pesos colgados, en 2 tiras.')
    expect(propia?.tiras).toBe(2)
    expect(curvaPropia({ reposoCm: 100, filas: [{ kg: 1, largoCm: 120 }], tiras: 1 })?.fuente).toBe('Calibrada con 1 peso colgado, en 1 tira.')
  })
})

const cuadro = (guion: GuionSintetico, t: number): CuadroManos => ({ t, manos: manosEnGuion(guion, t).manos, ancho: guion.camara?.ancho ?? 640, alto: guion.camara?.alto ?? 480 })

describe('medición entre las dos manos', () => {
  const banda = guionPreset('banda')
  const T_REPOSO = 1000
  const T_ESTIRADA = 4000

  it('mide el largo entre los puntos de agarre', () => {
    const m = medirBanda(cuadro(banda, T_REPOSO), 'pinza')!
    // Las manos están a 0,33 y 0,67 del ancho: 34 % de 640 px a 50 cm con f = 512 px son 21 cm entre palmas; la pinza
    // queda unos centímetros hacia el pulgar de cada mano, así que el largo real es algo menor.
    expect(m.largoCm).toBeGreaterThan(12)
    expect(m.largoCm).toBeLessThan(24)
    expect(m.desnivel).toBeLessThan(0.02)
    const palmas = medirBanda(cuadro(banda, T_REPOSO), 'palma')!.largoCm
    expect(palmas).toBeGreaterThan(19.5)
    expect(palmas).toBeLessThan(22.5)
  })

  it('el estiramiento del guion queda cerca del 65 % medido por las palmas', () => {
    const reposo = medirBanda(cuadro(banda, T_REPOSO), 'palma')!.largoCm
    const estirada = medirBanda(cuadro(banda, T_ESTIRADA), 'palma')!.largoCm
    expect(estiramiento(estirada, reposo)).toBeCloseTo(0.56 / 0.34 - 1, 1)
  })

  it('no depende del lente ni de la distancia al teléfono', () => {
    // La misma escena real (mismas manos, misma separación) vista con otro lente u otra distancia: en la imagen las
    // manos cambian de tamaño y de posición, pero el largo medido debe ser el mismo.
    const vistaCon = (factorFocal: number, distanciaCm: number): GuionSintetico => ({
      camara: { factorFocal },
      manos: banda.manos.map((m) => ({
        ...m,
        poses: m.poses.map((p) => ({ ...p, distanciaCm, ...(p.x == null ? {} : { x: 0.5 + (p.x - 0.5) * (factorFocal / 0.8) * (50 / distanciaCm) }) })),
      })),
    })
    for (const t of [T_REPOSO, T_ESTIRADA]) {
      const base = medirBanda(cuadro(banda, t), 'pinza')!.largoCm
      for (const [factorFocal, distanciaCm] of [[0.55, 50], [1.1, 50], [0.8, 38], [0.8, 75], [0.6, 65]]) {
        const otra = medirBanda(cuadro(vistaCon(factorFocal, distanciaCm), t), 'pinza')!.largoCm
        expect(Math.abs(otra / base - 1)).toBeLessThan(0.04)
      }
    }
  })

  it('avisa cuando una mano está más cerca de la cámara que la otra', () => {
    const g: GuionSintetico = { manos: banda.manos.map((m, i) => ({ ...m, poses: m.poses.map((p) => ({ ...p, distanciaCm: i === 0 ? 40 : 60 })) })) }
    expect(medirBanda(cuadro(g, T_REPOSO), 'pinza')!.desnivel).toBeGreaterThan(0.2)
  })

  it('avisa cuando una mano se pega al borde de la imagen', () => {
    expect(medirBanda(cuadro(banda, T_REPOSO), 'pinza')!.alBorde).toBe(false)
    const abierta: GuionSintetico = { manos: banda.manos.map((m, i) => ({ ...m, poses: m.poses.map((p) => ({ ...p, x: i === 0 ? 0.06 : 0.94 })) })) }
    expect(medirBanda(cuadro(abierta, T_REPOSO), 'pinza')!.alBorde).toBe(true)
    expect(manosAlBorde([])).toBe(false)
  })

  it('mide el tamaño de la palma para pedir que se acerquen', () => {
    // Mano promedio a 50 cm con f = 0,8 × 640: la palma (9 cm) ocupa unos 92 px de los 480 del lado corto.
    expect(medirBanda(cuadro(banda, T_REPOSO), 'pinza')!.palma).toBeGreaterThan(0.15)
    const lejos: GuionSintetico = { manos: banda.manos.map((m) => ({ ...m, poses: m.poses.map((p) => ({ ...p, distanciaCm: 160 })) })) }
    expect(medirBanda(cuadro(lejos, T_REPOSO), 'pinza')!.palma).toBeLessThan(PALMA_MIN)
    // Se normaliza por el lado corto: la misma mano en una imagen vertical u horizontal da lo mismo.
    const mano = cuadro(banda, 0).manos[0]
    const px = tamanoPalma(mano, 640, 480) * 480
    expect(px).toBeGreaterThan(60)
  })

  it('con una sola mano no mide', () => {
    expect(medirBanda(cuadro(guionPreset('quieta'), 0), 'pinza')).toBeNull()
  })

  it('cada agarre usa su punto', () => {
    const mano = cuadro(banda, 0).manos[0]
    const pinza = puntoAgarre(mano, 'pinza', 640, 480)
    expect(pinza.x).toBeCloseTo(((mano.landmarks[4].x + mano.landmarks[8].x) / 2) * 640)
    expect(puntoAgarre(mano, 'nudillo', 640, 480).y).toBeCloseTo(mano.landmarks[5].y * 480)
  })
})

describe('marcar el reposo', () => {
  it('promedia un segundo de banda quieta', () => {
    const c = new CapturaReposo()
    let r: number | null = null
    for (let t = 0; t <= MS_REPOSO; t += 100) r = c.agregar(t, 20 + (t % 200 ? 0.2 : -0.2))
    expect(r).toBeCloseTo(20, 0)
  })

  it('con otra ventana espera más y sigue entregando el valor mientras la banda siga quieta', () => {
    const c = new CapturaReposo(MS_REPOSO_AUTO)
    expect(c.agregar(0, 30)).toBeNull()
    expect(c.agregar(1000, 30)).toBeNull()
    expect(c.agregar(1500, 30)).toBeCloseTo(30)
    expect(c.agregar(4000, 30.5)).toBeCloseTo(30.25, 1)
    expect(c.progreso(4000)).toBe(1)
  })

  it('detecta un reposo marcado con la banda estirada', () => {
    expect(reposoMalMarcado(73, 52)).toBe(true)
    expect(reposoMalMarcado(52, 50)).toBe(false)
    expect(reposoMalMarcado(52, 60)).toBe(false)
  })

  it('si la persona se mueve, parte de nuevo', () => {
    const c = new CapturaReposo()
    expect(c.agregar(0, 20)).toBeNull()
    expect(c.agregar(600, 20)).toBeNull()
    expect(c.agregar(900, 26)).toBeNull()
    expect(c.progreso(900)).toBe(0)
    expect(c.agregar(1500, 26)).toBeNull()
    expect(c.agregar(1900, 26)).toBeCloseTo(26)
  })
})

describe('pérdidas breves de la mano', () => {
  it('un hueco corto se ignora y uno largo corta', () => {
    const p = new ToleranciaPerdida(500)
    expect(p.cuadro(0, false)).toBe('perdida')
    expect(p.cuadro(100, true)).toBe('medida')
    expect(p.cuadro(300, false)).toBe('hueco')
    expect(p.cuadro(600, false)).toBe('hueco')
    expect(p.cuadro(700, false)).toBe('perdida')
    expect(p.cuadro(800, true)).toBe('medida')
  })

  it('con huecos breves a mitad del estiramiento la repetición no se parte', () => {
    const c = new ContadorReps()
    const p = new ToleranciaPerdida()
    const recta = { puntos: [{ estiramiento: 1, kg: 4 }] }
    // Ida y vuelta de 2 s a 30 cuadros por segundo; cada décimo cuadro MediaPipe no ve una mano (≈ 33 ms).
    for (let i = 0; i <= 60; i++) {
      const t = i * 33
      const largo = 20 + 10 * Math.sin((Math.PI * i) / 60)
      const estado = p.cuadro(t, i % 10 !== 5)
      if (estado === 'medida') c.agregar(t, largo, 20, recta)
      else if (estado === 'perdida') c.cortar()
    }
    expect(c.repeticiones).toHaveLength(1)
  })
})

describe('repeticiones', () => {
  const recta = { puntos: [{ estiramiento: 1, kg: 4 }] }

  it('cuenta una repetición al estirar y volver, con su pico, tiempo y trabajo', () => {
    const c = new ContadorReps()
    // Reposo 20 cm; se estira a 30 cm (50 %) en 1 s y vuelve en 1 s.
    for (let i = 0; i <= 10; i++) c.agregar(i * 100, 20 + i, 20, recta)
    expect(c.estirando).toBe(true)
    for (let i = 1; i <= 10; i++) c.agregar(1000 + i * 100, 30 - i, 20, recta)
    expect(c.estirando).toBe(false)
    expect(c.repeticiones).toHaveLength(1)
    const r = c.repeticiones[0]
    expect(r.picoEstiramiento).toBeCloseTo(0.5)
    expect(r.picoKg).toBeCloseTo(2)
    expect(r.tensionS).toBeGreaterThan(1.5)
    // Trabajo de estirar una recta desde el reposo: carga media (1 kg) × g × recorrido (0,1 m).
    expect(r.trabajoJ).toBeCloseTo(1 * 9.80665 * 0.1, 3)
  })

  it('un temblor bajo el umbral no cuenta', () => {
    const c = new ContadorReps()
    for (let i = 0; i < 30; i++) c.agregar(i * 50, 20 + (i % 2), 20, recta)
    expect(c.repeticiones).toHaveLength(0)
    expect(c.estirando).toBe(false)
  })

  it('si se pierde una mano, cierra la repetición en curso', () => {
    const c = new ContadorReps()
    c.agregar(0, 20, 20, recta)
    c.agregar(500, 28, 20, recta)
    c.cortar()
    expect(c.repeticiones).toHaveLength(1)
    expect(c.repeticiones[0].picoKg).toBeCloseTo(1.6)
    // El trabajo sale del pico, así que no se pierde aunque la cámara haya visto pocos cuadros.
    expect(c.repeticiones[0].trabajoJ).toBeCloseTo(0.8 * 9.80665 * 0.08, 3)
  })

  it('con el guion sintético cuenta una repetición por ciclo', () => {
    const banda = guionPreset('banda')
    const c = new ContadorReps()
    const reposo = medirBanda(cuadro(banda, 1000), 'pinza')!.largoCm
    for (let t = 0; t < 13000; t += 33) c.agregar(t, medirBanda(cuadro(banda, t), 'pinza')!.largoCm, reposo, CORENGTH_5KG)
    expect(c.repeticiones).toHaveLength(2)
    expect(totales(c.repeticiones).mejorKg).toBeGreaterThan(2)
  })

  it('suma los totales, la constancia, la meta y las rápidas', () => {
    expect(totales([])).toEqual({ n: 0, mejorKg: null, promedioKg: null, tensionS: 0, trabajoJ: 0, constancia: null, enMeta: 0, rapidas: 0 })
    const reps = [
      { picoKg: 2, picoEstiramiento: 0.5, tensionS: 2, trabajoJ: 1, fueraDeRango: false },
      { picoKg: 3, picoEstiramiento: 0.7, tensionS: 0.6, trabajoJ: 2, fueraDeRango: false },
    ]
    const t = totales(reps, 2.9)
    expect(t).toMatchObject({ n: 2, mejorKg: 3, promedioKg: 2.5, tensionS: 2.6, trabajoJ: 3, enMeta: 1, rapidas: 1 })
    // Picos 2 y 3: media 2,5 y desviación 0,5, así que la constancia es 1 − 0,2.
    expect(t.constancia).toBeCloseTo(0.8)
    expect(totales(reps.slice(0, 1)).constancia).toBeNull()
  })

  it('arma un resumen de la serie para pegar en el chat', () => {
    const reps = [
      { picoKg: 2, picoEstiramiento: 0.5, tensionS: 2, trabajoJ: 1, fueraDeRango: false },
      { picoKg: 3, picoEstiramiento: 0.7, tensionS: 3, trabajoJ: 2, fueraDeRango: false },
    ]
    const t = textoResumen(reps, { banda: 'Corength 5 kg', tiras: 2, metaKg: 2.5, reposoCm: 18.4 })
    expect(t).toContain('Banda: Corength 5 kg, 2 tiras, reposo 18 cm')
    expect(t).toContain('Repeticiones: 2 (1 llegó a la meta de 2,5 kg)')
    expect(textoResumen(reps, { banda: 'X', tiras: 1, metaKg: 1, reposoCm: null })).toContain('(2 llegaron a la meta de 1,0 kg)')
    expect(t).toContain('Constancia entre repeticiones: 80 %')
    expect(t).toContain('Picos: 2,0 kg (50 %), 3,0 kg (70 %)')
    expect(t).not.toMatch(/presión/i)
    expect(textoResumen([], { banda: 'X', tiras: 1, metaKg: null, reposoCm: null })).toContain('Repeticiones: 0')
  })

  it('una repetición llega a la meta con una tolerancia chica', () => {
    expect(alcanzaMeta({ picoKg: 2.9 }, 3)).toBe(true)
    expect(alcanzaMeta({ picoKg: 2.8 }, 3)).toBe(false)
    expect(alcanzaMeta({ picoKg: 9 }, null)).toBe(false)
    expect(alcanzaMeta({ picoKg: 9 }, 0)).toBe(false)
  })
})

describe('reporte de la cámara', () => {
  it('resume lo que entregó la pista de video', () => {
    const r = resumirPista({ width: 640, height: 480, frameRate: 30, facingMode: 'user' }, { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 60 }, zoom: { max: 4 } } as MediaTrackCapabilities)
    expect(r).toEqual({ ancho: 640, alto: 480, cuadrosCamara: 30, anchoMax: 1920, altoMax: 1080, cuadrosMax: 60, camara: 'Frontal', controles: ['zoom'] })
  })

  it('sin capacidades deja los máximos sin dato', () => {
    const r = resumirPista({ width: 480, height: 640 }, null)
    expect(r.anchoMax).toBeNull()
    expect(r.controles).toEqual([])
  })

  it('arma un texto para pegar en el chat', () => {
    const t = textoReporte({ fuente: 'camara', ancho: 640, alto: 480, cuadrosCamara: 30, cuadrosSeguimiento: 27.6, anchoMax: null, altoMax: null, cuadrosMax: null, camara: 'Frontal', delegado: 'GPU', luz: 131.2, controles: [], navegador: 'Prueba' })
    expect(t).toContain('Video: 640×480 a 30 cuadros/s')
    expect(t).toContain('Seguimiento: 28 cuadros/s en GPU')
    expect(t).toContain('Ajustes que deja controlar: ninguno')
    expect(t).toContain('Máximo de la cámara: sin dato a sin dato')
  })
})
