import { describe, expect, it } from 'vitest'
import { JUEGOS } from '../registry'
import { crearTorre } from './modulo'
import {
  BASE,
  MAX_PISOS,
  NIVELES_TORRE,
  REPOSO_MS,
  STD_MAX_CM,
  U_POR_CM,
  alturaMinimaSostenido,
  alturaSilueta,
  aperturaAlTomar,
  desvioCm,
  distanciaToma,
  estaQuieto,
  estabilidad,
  evaluarColocacion,
  ladoUnidades,
  nivelTorre,
  pasoReposo,
  posicionAntes,
  posicionesCubos,
  registroVacio,
  resumenTorre,
  torreCaida,
  type CuboColocado,
} from './logica'

describe('niveles', () => {
  it('1, 3 y 5 siguen J1 (cubos grandes/3, medianos/5, chicos/6) y la tolerancia se estrecha', () => {
    expect(NIVELES_TORRE[1].cubos).toBe(3)
    expect(NIVELES_TORRE[3].cubos).toBe(5)
    expect(NIVELES_TORRE[5].cubos).toBe(6)
    const lados = ([1, 2, 3, 4, 5] as const).map((n) => NIVELES_TORRE[n].ladoCm)
    const tol = ([1, 2, 3, 4, 5] as const).map((n) => NIVELES_TORRE[n].toleranciaCm)
    for (let i = 1; i < 5; i++) {
      expect(lados[i]).toBeLessThan(lados[i - 1])
      expect(tol[i]).toBeLessThan(tol[i - 1])
    }
    expect(Math.max(...([1, 2, 3, 4, 5] as const).map((n) => NIVELES_TORRE[n].cubos))).toBeLessThanOrEqual(MAX_PISOS)
  })
  it('nivelTorre recorta fuera de rango', () => {
    expect(nivelTorre(0)).toBe(NIVELES_TORRE[1])
    expect(nivelTorre(9)).toBe(NIVELES_TORRE[5])
    expect(nivelTorre(Number.NaN)).toBe(NIVELES_TORRE[1])
  })
  it('el registro de juegos usa los mismos niveles y está disponible', () => {
    const j = JUEGOS.find((x) => x.id === 'torre-cubos')!
    expect(j.disponible).toBe(true)
    expect(j.niveles.map((n) => n.cantidad)).toEqual([3, 4, 5, 5, 6])
  })
  it('el texto de cada nivel es coherente: el nombre y el detalle dicen lo mismo del tamaño y de la cantidad', () => {
    const tam = (t: string) => t.match(/medianos|grandes|pequeños/)?.[0]
    for (const n of [1, 2, 3, 4, 5] as const) {
      const v = NIVELES_TORRE[n]
      expect(v.detalle).toContain(`${v.cubos} cubos ${tam(v.nombre)}`)
    }
    expect(NIVELES_TORRE[4].detalle).not.toContain('pequeños')
  })
  it('la meta del plan: con metaAgarres 0 es práctica libre (sin meta); con meta, los cubos del nivel', () => {
    const { desdePlan } = crearTorre().meta
    const p = { nivel: 3, duracionMin: 5, metaPinzaCm: 0 }
    expect(desdePlan({ ...p, metaAgarres: 0 })).toBe(0)
    expect(desdePlan({ ...p, metaAgarres: 5 })).toBe(5)
    expect(desdePlan({ ...p, nivel: 5, metaAgarres: 1 })).toBe(6)
  })
  it('los textos no usan las palabras prohibidas', () => {
    const texto = JSON.stringify(NIVELES_TORRE).toLowerCase()
    expect(texto).not.toMatch(/fuerza|presi[oó]n/)
  })
})

describe('desvío y colocación', () => {
  const lado = ladoUnidades(NIVELES_TORRE[1])
  it('desvío horizontal en cm, ignorando la altura', () => {
    expect(desvioCm({ x: BASE.x, y: 3, z: BASE.z })).toBe(0)
    expect(desvioCm({ x: BASE.x + 0.1, y: 0, z: BASE.z })).toBe(1)
    expect(desvioCm({ x: BASE.x + 0.3, y: 0, z: BASE.z + 0.4 })).toBe(5)
  })
  it('la silueta sube un lado por piso', () => {
    expect(alturaSilueta(1, lado) - alturaSilueta(0, lado)).toBeCloseTo(lado, 6)
    expect(alturaSilueta(0, lado)).toBeCloseTo(BASE.grosor + lado / 2, 6)
  })
  it('colocado: dentro de la tolerancia y a la altura de la silueta', () => {
    const tol = NIVELES_TORRE[1].toleranciaCm
    const ok = evaluarColocacion({ x: BASE.x + 0.1, y: alturaSilueta(0, lado), z: BASE.z }, 0, lado, tol)
    expect(ok.valida).toBe(true)
    expect(ok.desvioCm).toBe(1)
    const lejos = evaluarColocacion({ x: BASE.x + (tol + 0.5) * U_POR_CM, y: alturaSilueta(0, lado), z: BASE.z }, 0, lado, tol)
    expect(lejos.valida).toBe(false)
    expect(lejos.enHuella).toBe(true)
  })
  it('un cubo a la altura equivocada no cuenta (piso 1 pedido, quedó en el piso 0)', () => {
    const e = evaluarColocacion({ x: BASE.x, y: alturaSilueta(0, lado), z: BASE.z }, 1, lado, 2)
    expect(e.valida).toBe(false)
    expect(e.dy).toBeCloseTo(-1, 1)
  })
  it('un cubo suelto en la mesa lejos de la torre no está en la huella', () => {
    expect(evaluarColocacion({ x: BASE.x + 1.5, y: lado / 2, z: BASE.z }, 0, lado, 2).enHuella).toBe(false)
  })
})

describe('caída de la torre', () => {
  const c = (extra: Partial<CuboColocado> = {}): CuboColocado => ({ x0: 0, y0: 0.3, z0: 0, x: 0, y: 0.3, z: 0, lado: 0.45, ...extra })
  it('no cae con pequeños asentamientos', () => {
    expect(torreCaida([c({ x: 0.05, y: 0.29 })])).toBe(false)
  })
  it('cae si se corre más de medio lado o baja más de 0,4 lados', () => {
    expect(torreCaida([c(), c({ x: 0.3 })])).toBe(true)
    expect(torreCaida([c({ y: 0.1 })])).toBe(true)
  })
  it('sin cubos no hay caída', () => expect(torreCaida([])).toBe(false))
})

describe('reposo de 1 s', () => {
  it('cuenta desde que queda quieto y se reinicia al moverse', () => {
    let r = pasoReposo(null, 0, true)
    expect(r).toEqual({ desde: 0, listo: false })
    r = pasoReposo(r.desde, REPOSO_MS - 1, true)
    expect(r.listo).toBe(false)
    r = pasoReposo(r.desde, REPOSO_MS, true)
    expect(r.listo).toBe(true)
    r = pasoReposo(r.desde, REPOSO_MS + 10, false)
    expect(r).toEqual({ desde: null, listo: false })
  })
  it('estaQuieto mira velocidad lineal y angular', () => {
    expect(estaQuieto({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(true)
    expect(estaQuieto({ x: 0.5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(false)
    expect(estaQuieto({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 0 })).toBe(false)
  })
})

describe('métricas de la mano', () => {
  const quieta = Array.from({ length: 10 }, (_, i) => ({ t: i * 100, x: 1, y: 1, z: 1 }))
  it('estabilidad: mano quieta = 100, mucha variación = 0', () => {
    expect(estabilidad(quieta, 900)).toBe(100)
    const temblor = quieta.map((m, i) => ({ ...m, x: m.x + (i % 2 ? 1 : -1) * STD_MAX_CM * U_POR_CM * 2 }))
    expect(estabilidad(temblor, 900)).toBe(0)
  })
  it('estabilidad: usa solo el último segundo y pide al menos 3 muestras', () => {
    const viejo = [{ t: 0, x: 5, y: 5, z: 5 }, ...quieta.map((m) => ({ ...m, t: m.t + 2000 }))]
    expect(estabilidad(viejo, 2900)).toBe(100)
    expect(estabilidad(quieta.slice(0, 2), 900)).toBeNull()
  })
  it('estabilidad intermedia', () => {
    const m = [-1, 0, 1, 0].map((d, i) => ({ t: i * 100, x: d * 0.1, y: 0, z: 0 }))
    const e = estabilidad(m, 300)!
    expect(e).toBeGreaterThan(50)
    expect(e).toBeLessThan(100)
  })
  it('apertura al tomar: la mayor de los últimos 1,5 s', () => {
    const m = [
      { t: 0, cm: 9 },
      { t: 2000, cm: 4 },
      { t: 2500, cm: 6.24 },
      { t: 3000, cm: 2 },
    ]
    expect(aperturaAlTomar(m, 3000)).toBe(6.2)
    expect(aperturaAlTomar([], 100)).toBeNull()
  })
  it('posicionAntes: el cubo se suelta donde estaba 150 ms antes', () => {
    const r = Array.from({ length: 10 }, (_, i) => ({ t: i * 50, x: i, y: 0, z: 0 }))
    expect(posicionAntes(r, 450)!.x).toBe(6)
    expect(posicionAntes(r, 100)!.x).toBe(0)
    expect(posicionAntes([], 100)).toBeNull()
  })
})

describe('toma de un cubo suelto', () => {
  const c = { x: 0, y: 0.225, z: 0 }
  it('toma si el punto de pinza está sobre o junto al cubo', () => {
    expect(distanciaToma({ x: 0.1, y: 0.25, z: 0 }, c, 0.45)).not.toBeNull()
  })
  it('no toma lejos en el plano ni muy alto', () => {
    expect(distanciaToma({ x: 1, y: 0.25, z: 0 }, c, 0.45)).toBeNull()
    expect(distanciaToma({ x: 0, y: 1.5, z: 0 }, c, 0.45)).toBeNull()
  })
})

describe('posiciones iniciales y resumen', () => {
  it('cubos a los dos lados de la torre, sin solaparse con la base', () => {
    const ps = posicionesCubos(6)
    expect(ps).toHaveLength(6)
    for (const p of ps) expect(Math.hypot(p.x - BASE.x, p.z - BASE.z)).toBeGreaterThan(BASE.radio + 0.3)
    expect(new Set(ps.map((p) => `${p.x}|${p.z}`)).size).toBe(6)
    expect(posicionesCubos(0)).toEqual([])
  })
  it('resumen: medias, altura, caídas y desvío de cada cubo', () => {
    const r = registroVacio()
    r.desvioPorPiso[0] = 0.6
    r.desvioPorPiso[1] = 1.2
    r.desvioPorPiso[2] = 0.9
    r.desviosColocados.push(0.6, 1.2, 0.9)
    r.aperturas.push(3, 4)
    r.estabilidades.push(80, 90)
    r.alturaMax = 3
    r.caidas = 1
    const s = resumenTorre(r)
    expect(s).toMatchObject({ desvioMedio: 0.9, aperturaPinza: 3.5, estabilidad: 85, alturaMax: 3, caidas: 1, desvioCubo1: 0.6, desvioCubo2: 1.2, desvioCubo3: 0.9, desvioCubo4: null, desvioCubo6: null })
  })
  it('resumen vacío no inventa datos', () => {
    const s = resumenTorre(registroVacio())
    expect(s.desvioMedio).toBeNull()
    expect(s.alturaMax).toBe(0)
  })
})

describe('piso del cubo sostenido (no empujar la torre)', () => {
  const lado = ladoUnidades(NIVELES_TORRE[1])
  const mesa = 0
  it('sobre la base el piso es la silueta: justo encima del último cubo colocado', () => {
    for (const k of [0, 1, 2]) expect(alturaMinimaSostenido(BASE.x, BASE.z, k, lado, mesa)).toBeGreaterThanOrEqual(alturaSilueta(k, lado, mesa))
    // con 2 cubos colocados no puede bajar más que el centro del tercer piso
    expect(alturaMinimaSostenido(BASE.x + 0.05, BASE.z, 2, lado, mesa)).toBeCloseTo(alturaSilueta(2, lado, mesa), 5)
  })
  it('el piso sube con cada cubo colocado y respeta la altura de la mesa', () => {
    const a = alturaMinimaSostenido(BASE.x, BASE.z, 1, lado, mesa)
    const b = alturaMinimaSostenido(BASE.x, BASE.z, 2, lado, mesa)
    expect(b - a).toBeCloseTo(lado, 5)
    expect(alturaMinimaSostenido(BASE.x, BASE.z, 1, lado, 0.5) - a).toBeCloseTo(0.5, 5)
  })
  it('lejos de la base solo cuenta la mesa (no se ve afectado por la torre)', () => {
    expect(alturaMinimaSostenido(BASE.x + 1.5, BASE.z, 3, lado, mesa)).toBeCloseTo(lado / 2 + 0.02, 5)
  })
  it('bajar el cubo hasta la torre y soltarlo da una posición sobre la silueta que cuenta como colocada', () => {
    // La mano baja el cubo 0,3 por debajo de la silueta (dentro de la torre): el piso lo deja justo encima.
    const k = 2
    const y = Math.max(alturaSilueta(k, lado, mesa) - 0.3, alturaMinimaSostenido(BASE.x, BASE.z, k, lado, mesa))
    const ev = evaluarColocacion({ x: BASE.x, y, z: BASE.z }, k, lado, NIVELES_TORRE[1].toleranciaCm, mesa)
    expect(y).toBeGreaterThanOrEqual(alturaSilueta(k, lado, mesa))
    expect(ev.valida).toBe(true)
  })
})
