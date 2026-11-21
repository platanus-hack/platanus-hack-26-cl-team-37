import { describe, expect, it } from 'vitest'
import { flexionTodos } from '../../metrics/geometria'
import { manoSintetica } from '../../tracking/sintetica'
import { JUEGOS } from '../registry'
import {
  AgregadoBurbujas,
  CELDAS,
  CERRADO_MS,
  FACTOR_INICIAL,
  HOLD_MS,
  NIVELES_BURBUJAS,
  Reposo,
  UMBRAL_EXTENSION_DEFECTO,
  VentanaMediana,
  ZONA_COMPLETA,
  alcanceCm,
  celdaDe,
  celdasDeMascara,
  cuadriculaDeMascara,
  dentroDeCaja,
  distanciaToque,
  extensionPct,
  factorZona,
  limiteDeZona,
  mascaraDe,
  mediana,
  moverEnCaja,
  nivelBurbujas,
  pasoToque,
  referenciasFlexion,
  sortearPosicion,
  tocaBurbuja,
  toqueInicial,
  velocidadAleatoria,
  zonaDeAparicion,
  type EstadoToque,
} from './logica'

const RANGO = { min: 0.05, max: 1.0 }
const extDe = (apertura: number, rango: { min: number; max: number } | null = RANGO) => {
  const f = flexionTodos(manoSintetica({ apertura }).worldLandmarks)
  return extensionPct(f, referenciasFlexion(rango))
}
/** Cuadros de 50 ms con la misma entrada; devuelve el estado y los eventos. */
function correr(dentro: boolean, ext: number, ms: number, e0: EstadoToque = toqueInicial()) {
  let e = e0
  const eventos: string[] = []
  for (let t = 0; t < ms; t += 50) {
    const r = pasoToque(e, dentro, ext, UMBRAL_EXTENSION_DEFECTO, 50)
    e = r.estado
    if (r.evento) eventos.push(r.evento)
    if (r.evento === 'revienta') break
  }
  return { e, eventos }
}

describe('Atrapa burbujas: niveles', () => {
  it('nivel 1 grande, quieta y sin límite; 3 mediana, lenta, 6 s; 5 chica, rápida, 3 s y zona completa', () => {
    const n = NIVELES_BURBUJAS
    expect(n[1]).toMatchObject({ velocidad: 0, vidaMs: 0 })
    expect(n[3]).toMatchObject({ vidaMs: 6000 })
    expect(n[3].velocidad).toBeGreaterThan(0)
    expect(n[5]).toMatchObject({ vidaMs: 3000, zonaMax: 1 })
    expect(n[1].radio).toBeGreaterThan(n[3].radio)
    expect(n[3].radio).toBeGreaterThan(n[5].radio)
    expect(n[5].velocidad).toBeGreaterThan(n[3].velocidad)
    for (const k of [1, 2, 3, 4, 5] as const) expect(n[k].nombre.length).toBeGreaterThan(3)
    expect(nivelBurbujas(0)).toBe(n[1])
    expect(nivelBurbujas(9)).toBe(n[5])
  })
  it('el registro usa esos niveles y el juego está disponible', () => {
    const j = JUEGOS.find((x) => x.id === 'atrapa-burbujas')!
    expect(j.disponible).toBe(true)
    expect(j.niveles).toHaveLength(5)
    expect(j.niveles[2].detalle).toBe(NIVELES_BURBUJAS[3].detalle)
  })
  it('ningún texto de nivel dice fuerza ni presión', () => {
    for (const v of Object.values(NIVELES_BURBUJAS)) expect(`${v.nombre} ${v.detalle}`).not.toMatch(/fuerza|presi[oó]n/i)
  })
})

describe('Atrapa burbujas: extensión de dedos', () => {
  it('mano abierta supera el umbral, a medio abrir queda bajo él, puño ≈ 0 %', () => {
    expect(extDe(1)).toBeGreaterThanOrEqual(UMBRAL_EXTENSION_DEFECTO)
    expect(extDe(0.9)).toBeGreaterThanOrEqual(UMBRAL_EXTENSION_DEFECTO)
    expect(extDe(0.5)).toBeLessThan(UMBRAL_EXTENSION_DEFECTO - 15)
    expect(extDe(0.6)).toBeLessThan(UMBRAL_EXTENSION_DEFECTO)
    expect(extDe(0)).toBeLessThan(5)
  })
  it('crece con la apertura y siempre está entre 0 y 100', () => {
    let previa = -1
    for (const a of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const e = extDe(a)
      expect(e).toBeGreaterThanOrEqual(previa)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(100)
      previa = e
    }
  })
  it('sin calibración usa referencias típicas y sigue distinguiendo abierta de a medio abrir', () => {
    expect(extDe(1, null)).toBeGreaterThanOrEqual(UMBRAL_EXTENSION_DEFECTO)
    expect(extDe(0.5, null)).toBeLessThan(UMBRAL_EXTENSION_DEFECTO)
  })
  it('un paciente que no llega a abrir del todo: su mano más abierta cuenta como 100 %', () => {
    const limitado = referenciasFlexion({ min: 0.1, max: 0.6 })
    const normal = referenciasFlexion(RANGO)
    expect(limitado.abierta).toBeGreaterThan(normal.abierta)
    const f = flexionTodos(manoSintetica({ apertura: 0.6 }).worldLandmarks)
    expect(extensionPct(f, limitado)).toBeGreaterThan(extensionPct(f, normal))
    expect(extensionPct(f, limitado)).toBeGreaterThanOrEqual(UMBRAL_EXTENSION_DEFECTO)
  })
  it('rango de calibración degenerado: usa los valores por defecto', () => {
    expect(referenciasFlexion({ min: 0.5, max: 0.5 })).toEqual(referenciasFlexion(null))
  })
})

describe('Atrapa burbujas: toque y reventado', () => {
  it('la palma dentro del radio (con holgura) toca; la profundidad pesa la mitad', () => {
    const c = { x: 0, y: 1, z: 0 }
    expect(tocaBurbuja({ x: 0.3, y: 1, z: 0 }, c, 0.4)).toBe(true)
    expect(tocaBurbuja({ x: 1, y: 1, z: 0 }, c, 0.4)).toBe(false)
    expect(distanciaToque({ x: 0, y: 1, z: 1 }, c)).toBeCloseTo(0.5, 5)
    expect(tocaBurbuja({ x: 0, y: 1, z: 0.8 }, c, 0.4)).toBe(true)
  })
  it('mano bien abierta dentro: revienta tras el tiempo de sostén, no antes', () => {
    expect(correr(true, 95, HOLD_MS - 60).eventos).toEqual([])
    expect(correr(true, 95, HOLD_MS + 60).eventos).toEqual(['revienta'])
  })
  it('mano a medio abrir o cerrada dentro NO revienta; anota un intento cerrado una sola vez por contacto', () => {
    for (const ext of [0, 30, 60, 79]) expect(correr(true, ext, 4000).eventos).toEqual(['intento_cerrado'])
    expect(correr(true, 60, CERRADO_MS - 100).eventos).toEqual([])
  })
  it('salir de la burbuja reinicia el contacto (un intento nuevo se puede anotar otra vez)', () => {
    const a = correr(true, 50, 1000)
    const fuera = correr(false, 50, 100, a.e)
    expect(fuera.e).toEqual(toqueInicial())
    expect(correr(true, 50, 1000, fuera.e).eventos).toEqual(['intento_cerrado'])
  })
  it('abrir la mano dentro tras un intento cerrado revienta', () => {
    const a = correr(true, 40, 800)
    expect(correr(true, 90, 300, a.e).eventos).toEqual(['revienta'])
  })
  it('un parpadeo de la extensión no suma: si baja del umbral el sostén se reinicia', () => {
    let r = correr(true, 95, HOLD_MS - 50)
    r = correr(true, 50, 50, r.e)
    expect(r.e.abiertaMs).toBe(0)
    expect(correr(true, 95, HOLD_MS - 50, r.e).eventos).toEqual([])
  })
  it('el umbral es configurable', () => {
    let e = toqueInicial()
    const ev: string[] = []
    for (let t = 0; t < 600; t += 50) {
      const r = pasoToque(e, true, 70, 60, 50)
      e = r.estado
      if (r.evento) ev.push(r.evento)
      if (r.evento === 'revienta') break
    }
    expect(ev).toEqual(['revienta'])
  })
})

describe('Atrapa burbujas: zona de aparición', () => {
  it('empieza chica y crece con los aciertos hasta el tope del nivel', () => {
    expect(factorZona(0, 1)).toBe(FACTOR_INICIAL)
    expect(factorZona(3, 1)).toBeGreaterThan(factorZona(0, 1))
    expect(factorZona(100, 0.6)).toBe(0.6)
    expect(factorZona(100, 1)).toBe(1)
    expect(factorZona(-5, 1)).toBe(FACTOR_INICIAL)
  })
  it('la caja rodea el reposo, cabe en la zona completa y crece con el factor', () => {
    const reposo = { x: 0.2, y: 1, z: 0 }
    const chica = zonaDeAparicion(reposo, 0.4)
    const grande = zonaDeAparicion(reposo, 1)
    expect(chica.x[0]).toBeLessThanOrEqual(0.2)
    expect(chica.x[1]).toBeGreaterThanOrEqual(0.2)
    expect(chica.x[1] - chica.x[0]).toBeLessThan(grande.x[1] - grande.x[0])
    expect(zonaDeAparicion({ x: 0, y: 1, z: 0 }, 1)).toEqual(ZONA_COMPLETA)
    expect(grande.x[1]).toBe(ZONA_COMPLETA.x[1])
  })
  it('un reposo fuera de la zona completa no hace saltar la caja a toda la zona', () => {
    const c = zonaDeAparicion({ x: 0, y: 0.3, z: 0 }, 0.4)
    expect(c.y[1] - c.y[0]).toBeLessThan(ZONA_COMPLETA.y[1] - ZONA_COMPLETA.y[0])
    expect(c.y[0]).toBeGreaterThanOrEqual(ZONA_COMPLETA.y[0])
  })
  it('sin reposo conocido usa el centro', () => {
    const c = zonaDeAparicion(null, 0.4)
    expect((c.x[0] + c.x[1]) / 2).toBeCloseTo(0, 5)
  })
  it('el plan puede limitar la zona: derecha, izquierda y altura media (y valores desconocidos no limitan)', () => {
    expect(limiteDeZona('derecha')!.x[0]).toBe(0)
    expect(limiteDeZona('izquierda')!.x[1]).toBe(0)
    const media = limiteDeZona('altura-media')!
    expect(media.y[0]).toBeGreaterThan(ZONA_COMPLETA.y[0])
    expect(media.y[1]).toBeLessThan(ZONA_COMPLETA.y[1])
    expect(limiteDeZona('Altura media')).toEqual(media)
    expect(limiteDeZona(undefined)).toBeNull()
    expect(limiteDeZona('xyz')).toBeNull()
  })
  it('con un límite, TODAS las burbujas aparecen dentro de él, aunque el reposo esté del otro lado', () => {
    const limite = limiteDeZona('derecha')!
    for (const reposo of [{ x: -1.2, y: 1, z: 0 }, { x: 0.5, y: 1, z: 0 }, { x: 1.5, y: 0.6, z: 0.3 }]) {
      for (const factor of [0.4, 0.7, 1]) {
        const caja = zonaDeAparicion(reposo, factor, limite)
        for (let i = 0; i < 40; i++) {
          const p = sortearPosicion(caja, Math.random)
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(dentroDeCaja(p, caja)).toBe(true)
        }
      }
    }
    const media = limiteDeZona('altura-media')!
    const caja = zonaDeAparicion({ x: 0, y: 0.6, z: 0 }, 1, media)
    expect(caja.y[0]).toBeGreaterThanOrEqual(media.y[0])
    expect(caja.y[1]).toBeLessThanOrEqual(media.y[1])
  })
  it('sortearPosicion se aleja de los puntos a evitar cuando puede', () => {
    const palma = { x: 0, y: 1, z: 0 }
    for (let i = 0; i < 30; i++) expect(tocaBurbuja(sortearPosicion(ZONA_COMPLETA, Math.random, [palma], 0.7), palma, 0.3)).toBe(false)
  })
  it('las burbujas que se mueven rebotan y nunca salen de la caja', () => {
    const caja = zonaDeAparicion({ x: 0, y: 1, z: 0 }, 0.5)
    let p = { x: 0, y: 1, z: 0 }
    let v = velocidadAleatoria(0.45, Math.random)
    for (let i = 0; i < 2000; i++) {
      const r = moverEnCaja(p, v, 0.033, caja)
      p = r.p
      v = r.v
      expect(dentroDeCaja(p, caja)).toBe(true)
    }
    expect(velocidadAleatoria(0, Math.random)).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('Atrapa burbujas: mapa de zonas y alcance', () => {
  it('cada posición cae en una celda 0..14 y el mapa se guarda como máscara de bits', () => {
    expect(celdaDe({ x: -1.7, y: 0.5, z: 0 })).toBe(0)
    expect(celdaDe({ x: 1.7, y: 1.5, z: 0 })).toBe(CELDAS - 1)
    expect(celdaDe({ x: 0, y: 1, z: 0 })).toBe(7)
    const m = mascaraDe([0, 7, 14, 7, 99, -1])
    expect(celdasDeMascara(m)).toEqual([0, 7, 14])
    const g = cuadriculaDeMascara(m)
    expect(g).toHaveLength(3)
    expect(g[2][0]).toBe(true)
    expect(g[0][4]).toBe(true)
    expect(g[1][2]).toBe(true)
  })
  it('alcance: 0 en el reposo y crece con el desplazamiento (cm aprox., modelo pinhole)', () => {
    const r = { x: 0.5, y: 0.5, distanciaCm: 50 }
    expect(alcanceCm(r, r)).toBeCloseTo(0, 5)
    // 0,2 del ancho de la imagen a 50 cm: ancho visible 62,5 cm → 12,5 cm
    expect(alcanceCm(r, { ...r, x: 0.7 })).toBeCloseTo(12.5, 1)
    expect(alcanceCm(r, { ...r, x: 0.7, y: 0.7 })).toBeGreaterThan(alcanceCm(r, { ...r, x: 0.7 }))
    expect(alcanceCm(r, { ...r, distanciaCm: 40 })).toBeCloseTo(10, 5)
    expect(alcanceCm({ ...r, distanciaCm: null }, { ...r, x: 0.6, distanciaCm: null })).toBeGreaterThan(0)
  })
  it('la mediana y la ventana ignoran un valor suelto', () => {
    expect(mediana([])).toBe(0)
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
    const v = new VentanaMediana(5)
    for (const x of [10, 10, 10, 10]) v.agregar(x)
    expect(v.agregar(300)).toBe(10)
    v.reiniciar()
    expect(v.agregar(4)).toBe(4)
  })
  it('el reposo promedia el primer segundo con la mano a la vista y recién entonces está listo', () => {
    const r = new Reposo(1000)
    expect(r.palma).toBeNull()
    for (let i = 0; i < 19; i++) r.agregar(50, { x: 1, y: 1, z: 0 }, { x: 0.4, y: 0.5, distanciaCm: null })
    expect(r.listo).toBe(false)
    r.agregar(50, { x: 1, y: 1, z: 0 }, { x: 0.4, y: 0.5, distanciaCm: 50 })
    expect(r.listo).toBe(true)
    expect(r.palma).toEqual({ x: 1, y: 1, z: 0 })
    expect(r.muneca!.x).toBeCloseTo(0.4, 6)
    expect(r.muneca).toMatchObject({ y: 0.5, distanciaCm: 50 })
    r.agregar(50, { x: 9, y: 9, z: 9 }, { x: 0, y: 0, distanciaCm: 1 })
    expect(r.palma).toEqual({ x: 1, y: 1, z: 0 })
  })
})

describe('Atrapa burbujas: agregados del resumen', () => {
  it('sin datos: todo nulo salvo los conteos', () => {
    const r = new AgregadoBurbujas().resumen()
    expect(r).toMatchObject({ burbujas: 0, extensionMedia: null, alcanceMax: null, tiempoReaccion: null, precision: null, zonasDerecha: 0, zonasIzquierda: 0, alcanceMaxDerecha: null, alcanceMaxIzquierda: null })
  })
  it('promedia extensión y reacción, separa alcance y zonas por mano y calcula la precisión', () => {
    const a = new AgregadoBurbujas()
    a.alcanzar('derecha', 12.3)
    a.alcanzar('derecha', 30.04)
    a.alcanzar('derecha', 20)
    a.alcanzar('izquierda', 8)
    a.reventada({ mano: 'derecha', extension: 90, tiempoMs: 1000, alcanceCm: 20, celda: 3 })
    a.reventada({ mano: 'derecha', extension: 80, tiempoMs: 2000, alcanceCm: 30, celda: 4 })
    a.reventada({ mano: 'izquierda', extension: 100, tiempoMs: 3000, alcanceCm: 8, celda: 10 })
    a.intentosCerrados = 1
    const r = a.resumen()
    expect(r).toMatchObject({
      burbujas: 3,
      extensionMedia: 90,
      extensionMin: 80,
      alcanceMax: 30,
      alcanceMaxDerecha: 30,
      alcanceMaxIzquierda: 8,
      tiempoReaccion: 2,
      intentosCerrados: 1,
      precision: 75,
      zonasDerecha: mascaraDe([3, 4]),
      zonasIzquierda: mascaraDe([10]),
      zonasDerechaPct: 13,
      zonasIzquierdaPct: 7,
    })
  })
  it('una mano que no se vio no lleva alcance ni porcentaje de zonas (no es 0)', () => {
    const a = new AgregadoBurbujas()
    a.alcanzar('izquierda', 15)
    const r = a.resumen()
    expect(r.alcanceMaxDerecha).toBeNull()
    expect(r.zonasDerechaPct).toBeNull()
    expect(r.alcanceMaxIzquierda).toBe(15)
    expect(r.zonasIzquierdaPct).toBe(0)
  })
  it('el intento con la mano sin abrir marca la zona alcanzada', () => {
    const a = new AgregadoBurbujas()
    a.alcanzar('derecha', 5)
    a.zona('derecha', 6)
    expect(a.resumen().zonasDerecha).toBe(1 << 6)
  })
})
