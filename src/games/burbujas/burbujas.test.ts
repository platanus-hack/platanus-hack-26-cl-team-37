import { describe, expect, it } from 'vitest'
import { flexionTodos } from '../../metrics/geometria'
import { manoSintetica } from '../../tracking/sintetica'
import { tarjetasResumen } from '../../metrics/resumen'
import { JUEGOS } from '../registry'
import { crearBurbujas } from './modulo'
import {
  TAMANO_MAX,
  TAMANO_MIN,
  radioBurbuja,
  AgregadoBurbujas,
  AlcanceMano,
  CELDAS,
  CERRADO_MS,
  FACTOR_INICIAL,
  HOLD_MS,
  NIVELES_BURBUJAS,
  PERDIDA_REPOSO_MS,
  Reposo,
  UMBRAL_EXTENSION_DEFECTO,
  VentanaMediana,
  ZONA_COMPLETA,
  alcanceCm,
  burbujaAgotada,
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
  nacimientoBurbuja,
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

describe('Atrapa burbujas: alcance solo al reventar y reposo tras perder la mano', () => {
  const M = (x: number, y = 0.5) => ({ x, y, distanciaCm: 50 })
  const P = { x: 0, y: 1, z: 0 }

  it('el reposo se descarta al perder la mano un rato y se vuelve a medir al reaparecer', () => {
    const r = new Reposo(1000)
    for (let i = 0; i < 20; i++) r.agregar(50, P, M(0.2))
    expect(r.listo).toBe(true)
    r.reiniciar()
    expect(r.listo).toBe(false)
    expect(r.muneca).toBeNull()
    for (let i = 0; i < 20; i++) r.agregar(50, P, M(0.9))
    expect(r.muneca!.x).toBeCloseTo(0.9, 6)
  })
  it('AlcanceMano: sin reposo no hay alcance; con reposo, crece con el desplazamiento', () => {
    const a = new AlcanceMano(1000)
    expect(a.vista(50, P, M(0.5))).toBeNull()
    for (let i = 0; i < 20; i++) a.vista(50, P, M(0.5))
    for (let i = 0; i < 5; i++) a.vista(50, P, M(0.7))
    expect(a.actual!).toBeCloseTo(12.5, 0)
  })
  it('una pérdida corta conserva el reposo; una larga lo descarta y el alcance se mide desde donde reaparece', () => {
    const a = new AlcanceMano(1000)
    for (let i = 0; i < 25; i++) a.vista(50, P, M(0.5))
    a.perdida(100)
    expect(a.reposo.listo).toBe(true)
    expect(a.actual).toBeNull()
    // La mano se baja al regazo (otro lugar del cuadro) y reaparece: el reposo se vuelve a fijar ahí.
    for (let t = 0; t < PERDIDA_REPOSO_MS; t += 100) a.perdida(100)
    expect(a.reposo.listo).toBe(false)
    for (let i = 0; i < 25; i++) a.vista(50, P, M(0.95, 0.95))
    expect(a.reposo.listo).toBe(true)
    expect(a.actual!).toBeCloseTo(0, 1) // sin reposo nuevo habría dado decenas de cm de "alcance" falso
  })
  it('una mano distinta entrando al cuadro no infla el alcance: solo cuentan las burbujas reventadas', () => {
    const ag = new AgregadoBurbujas()
    const derecha = new AlcanceMano(1000)
    for (let i = 0; i < 25; i++) derecha.vista(50, P, M(0.45))
    // Durante la sesión la mano baja al regazo y reaparece lejos: el alcance "en vivo" sube mucho pero NO se guarda solo.
    for (let t = 0; t < 1000; t += 100) derecha.perdida(100)
    for (let i = 0; i < 25; i++) derecha.vista(50, P, M(0.95, 0.95))
    expect(ag.alcanceMax).toBe(0)
    expect(ag.resumen().alcanceMax).toBeNull()
    // Se revienta una burbuja con la mano a 8 cm de su reposo: eso es lo único que cuenta.
    ag.reventada({ mano: 'derecha', extension: 90, tiempoMs: 1500, alcanceCm: 8, celda: 3, numero: 1 })
    expect(ag.resumen()).toMatchObject({ alcanceMax: 8, alcanceMaxDerecha: 8, alcanceMaxIzquierda: null })
  })
  it('sin reventadas el resumen no trae alcance, aunque se hayan visto manos', () => {
    const ag = new AgregadoBurbujas()
    ag.intentoCerrado('derecha', 4, 1)
    ag.agotada(2)
    expect(ag.resumen()).toMatchObject({ burbujas: 0, alcanceMax: null, alcanceMaxDerecha: null, alcanceMaxIzquierda: null })
  })
})

describe('Atrapa burbujas: agregados del resumen', () => {
  it('sin datos: todo nulo salvo los conteos', () => {
    const r = new AgregadoBurbujas().resumen()
    expect(r).toMatchObject({ burbujas: 0, extensionMedia: null, alcanceMax: null, tiempoBurbuja: null, precision: null, zonasDerecha: 0, zonasIzquierda: 0, alcanceMaxDerecha: null, alcanceMaxIzquierda: null, zonasDerechaPct: null })
  })
  it('promedia extensión y tiempo por burbuja, separa alcance (al reventar) y zonas por mano y calcula los aciertos', () => {
    const a = new AgregadoBurbujas()
    a.reventada({ mano: 'derecha', extension: 90, tiempoMs: 1000, alcanceCm: 20, celda: 3, numero: 1 })
    a.reventada({ mano: 'derecha', extension: 80, tiempoMs: 2000, alcanceCm: 30.04, celda: 4, numero: 2 })
    a.reventada({ mano: 'izquierda', extension: 100, tiempoMs: 3000, alcanceCm: 8, celda: 10, numero: 3 })
    a.intentoCerrado('derecha', 6, 4) // burbuja 4: intento y nunca se reventó → 1 fallo
    const r = a.resumen()
    expect(r).toMatchObject({
      burbujas: 3,
      extensionMedia: 90,
      extensionMin: 80,
      alcanceMax: 30,
      alcanceMaxDerecha: 30,
      alcanceMaxIzquierda: 8,
      tiempoBurbuja: 2,
      intentosCerrados: 1,
      precision: 75,
      zonasDerecha: mascaraDe([3, 4, 6]),
      zonasIzquierda: mascaraDe([10]),
      zonasDerechaPct: 20,
      zonasIzquierdaPct: 7,
    })
    expect(r).not.toHaveProperty('tiempoReaccion')
  })
  it('Aciertos %: un intento cerrado seguido de reventar la MISMA burbuja no castiga; solo falla la que nunca se revienta', () => {
    const a = new AgregadoBurbujas()
    a.intentoCerrado('derecha', 5, 1)
    a.intentoCerrado('derecha', 5, 1) // varios intentos en la misma burbuja: un solo fallo posible
    a.reventada({ mano: 'derecha', extension: 90, tiempoMs: 4000, alcanceCm: 10, celda: 5, numero: 1 })
    expect(a.intentosCerrados).toBe(2) // el conteo de eventos sigue siendo de eventos
    expect(a.resumen().precision).toBe(100)
    a.agotada(2) // la burbuja 2 se agotó: fallo
    a.intentoCerrado('derecha', 7, 3) // burbuja 3: intento y después se agotó: UN solo fallo
    a.agotada(3)
    a.reventada({ mano: 'derecha', extension: 90, tiempoMs: 1000, alcanceCm: 10, celda: 6, numero: 4 })
    expect(a.burbujasFalladas).toBe(2)
    expect(a.resumen().precision).toBe(50) // 2 reventadas de 4 burbujas
  })
  it('una mano sin burbujas ni intentos no lleva alcance ni porcentaje de zonas (no es 0)', () => {
    const a = new AgregadoBurbujas()
    a.reventada({ mano: 'izquierda', extension: 90, tiempoMs: 1000, alcanceCm: 15, celda: 2, numero: 1 })
    const r = a.resumen()
    expect(r.alcanceMaxDerecha).toBeNull()
    expect(r.zonasDerechaPct).toBeNull()
    expect(r.alcanceMaxIzquierda).toBe(15)
    expect(r.zonasIzquierdaPct).toBe(7)
  })
  it('el intento con la mano sin abrir marca la zona alcanzada', () => {
    const a = new AgregadoBurbujas()
    a.intentoCerrado('derecha', 6, 1)
    expect(a.resumen().zonasDerecha).toBe(1 << 6)
  })
  it('el resumen no gasta tarjetas en el alcance por mano ni usa "reacción"', () => {
    const m = crearBurbujas()
    const tarjetas = tarjetasResumen(m.metricasResumen).map((d) => d.id)
    expect(tarjetas).toEqual(['extensionMedia', 'alcanceMax', 'tiempoBurbuja'])
    const nombres = [...m.metricasVivo, ...m.metricasResumen].map((d) => d.nombre.toLowerCase())
    expect(nombres.some((n) => n.includes('reacci'))).toBe(false)
    expect(m.metricasVivo.map((d) => d.id)).toEqual(['extension', 'alcance', 'tiempoBurbuja'])
  })
})

describe('varias burbujas a la vez, de tamaños distintos', () => {
  it('cada nivel muestra 2 o 3 burbujas a la vez', () => {
    for (const k of [1, 2, 3, 4, 5] as const) {
      expect(NIVELES_BURBUJAS[k].simultaneas).toBeGreaterThanOrEqual(2)
      expect(NIVELES_BURBUJAS[k].simultaneas).toBeLessThanOrEqual(3)
    }
  })

  it('el radio de cada burbuja va entre TAMANO_MIN y TAMANO_MAX veces el del nivel', () => {
    const n = NIVELES_BURBUJAS[3]
    expect(radioBurbuja(n, () => 0)).toBeCloseTo(n.radio * TAMANO_MIN)
    expect(radioBurbuja(n, () => 1)).toBeCloseTo(n.radio * TAMANO_MAX)
    const radios = Array.from({ length: 50 }, () => radioBurbuja(n, Math.random))
    expect(Math.max(...radios) - Math.min(...radios)).toBeGreaterThan(0)
  })
})

describe('sin mano la vida de la burbuja no corre', () => {
  /** Igual que el módulo: el reloj siempre avanza y el nacimiento se corre mientras no se ve ninguna mano de la sesión. */
  function simular(tramos: [number, boolean][], vidaMs: number) {
    let reloj = 0
    let t0 = 0
    let expiroEn: number | null = null
    for (const [ms, hayMano] of tramos) {
      for (let k = 0; k < ms / 50 && expiroEn == null; k++) {
        reloj += 50
        t0 = nacimientoBurbuja(t0, 50, hayMano)
        if (burbujaAgotada(reloj, t0, vidaMs)) expiroEn = reloj
      }
    }
    return { reloj, edad: reloj - t0, expiroEn }
  }
  const vida = NIVELES_BURBUJAS[5].vidaMs // 3 s

  it('con la mano a la vista expira al cumplir su vida, como siempre', () => {
    expect(simular([[10_000, true]], vida).expiroEn).toBe(vida)
    expect(simular([[60_000, true]], NIVELES_BURBUJAS[1].vidaMs).expiroEn).toBeNull() // nivel 1: sin límite
  })
  it('perder la mano no la hace expirar: ni mientras no se ve ni al volver; le queda la vida que tenía', () => {
    // 1 s con mano, 2 s sin mano (lo que tarda la base en pausar): antes expiraba a los 3 s sin que nadie la viera.
    const perdida = simular([[1000, true], [2000, false]], vida)
    expect(perdida.expiroEn).toBeNull()
    expect(perdida.edad).toBe(1000)
    // Vuelve la mano: no expira en el primer cuadro; le quedan sus 2 s.
    expect(simular([[1000, true], [2000, false], [1950, true]], vida).expiroEn).toBeNull()
    expect(simular([[1000, true], [2000, false], [5000, true]], vida).expiroEn).toBe(1000 + 2000 + 2000)
  })
  it('sin mano por mucho tiempo tampoco expira', () => {
    expect(simular([[60_000, false]], vida)).toMatchObject({ expiroEn: null, edad: 0 })
  })
})
