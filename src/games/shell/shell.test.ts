import { describe, expect, it } from 'vitest'
import type { EventoSesion } from '../../domain/types'
import { manoSintetica, POSE_BASE } from '../../tracking/sintetica'
import { cicloInicial, ESPERA_META_MS, pasoCiclo, terminarCiclo, type CambioCiclo, type EntradaCiclo, type EstadoCiclo } from './ciclo'
import { formatoMetrica } from './contrato'
import { anclaEnEscena, centroPalma, puntosEnEscena, ZONA_BASE } from './manos3d'
import { AcumuladorBase, aperturaCalibrada, MaximoSostenido, medirMano, SOSTENIDO_MS } from './medidas'
import { RegistroSesion } from './registro'

const base: Omit<EntradaCiclo, 't'> = { sinManoMs: 0, manual: false, vertical: false, oculta: false, contador: 0 }
const cfg = { duracionMs: 10_000, meta: 0 }

/** Avanza el ciclo de `desde` a `hasta` ms en pasos de 16 ms con la entrada dada; junta los cambios. */
function correr(e: EstadoCiclo, desde: number, hasta: number, x: Partial<EntradaCiclo> = {}, c = cfg) {
  const cambios: CambioCiclo[] = []
  for (let t = desde; t <= hasta; t += 16) {
    const r = pasoCiclo(e, { ...base, ...x, t }, c)
    e = r.estado
    cambios.push(...r.cambios)
  }
  return { e, cambios }
}

describe('ciclo de sesión', () => {
  it('espera la mano sin contar tiempo y empieza al verla', () => {
    let { e, cambios } = correr(cicloInicial(), 0, 3000, { sinManoMs: null })
    expect(e.fase).toBe('esperando')
    expect(e.jugadoMs).toBe(0)
    expect(cambios).toEqual([])
    ;({ e, cambios } = correr(e, 3016, 4000))
    expect(e.fase).toBe('jugando')
    expect(cambios).toEqual([{ tipo: 'inicio' }])
    expect(e.jugadoMs).toBeGreaterThan(900)
  })

  it('pausa automática solo después de 2 s sin mano, y se reanuda sola', () => {
    let { e } = correr(cicloInicial(), 0, 1000)
    let r = correr(e, 1016, 2900, { sinManoMs: 1990 })
    expect(r.e.fase).toBe('jugando')
    r = correr(r.e, 2916, 3000, { sinManoMs: 2100 })
    expect(r.e.fase).toBe('pausa')
    expect(r.e.motivos).toEqual(['sin-mano'])
    expect(r.cambios).toEqual([{ tipo: 'perdida' }, { tipo: 'pausa', motivo: 'sin-mano' }])
    const congelado = r.e.jugadoMs
    r = correr(r.e, 3016, 6000, { sinManoMs: 5000 })
    expect(r.e.jugadoMs).toBe(congelado)
    r = correr(r.e, 6016, 6100, { sinManoMs: 10 })
    expect(r.e.fase).toBe('jugando')
    expect(r.cambios).toEqual([{ tipo: 'reanudar' }])
    e = r.e
    expect(e.vioMano).toBe(true)
  })

  it('pausa manual, en vertical y en segundo plano detienen el tiempo', () => {
    const { e } = correr(cicloInicial(), 0, 1000)
    for (const x of [{ manual: true }, { vertical: true }, { oculta: true }]) {
      const r = correr(e, 1016, 3000, x)
      expect(r.e.fase).toBe('pausa')
      expect(r.e.jugadoMs).toBeLessThan(1100)
    }
    const r = correr(e, 1016, 1100, { vertical: true, manual: true })
    expect(r.e.motivos).toEqual(['orientacion', 'manual'])
  })

  it('termina por tiempo de juego activo', () => {
    const r = correr(cicloInicial(), 0, 12_000, {}, { duracionMs: 5000, meta: 0 })
    expect(r.e.fase).toBe('terminada')
    expect(r.e.fin).toBe('tiempo')
    expect(r.e.jugadoMs).toBe(5000)
    expect(r.cambios.filter((c) => c.tipo === 'fin')).toEqual([{ tipo: 'fin', motivo: 'tiempo' }])
  })

  it('termina por meta tras mostrar el aviso', () => {
    let r = correr(cicloInicial(), 0, 1000, { contador: 2 }, { duracionMs: 60_000, meta: 3 })
    expect(r.e.fase).toBe('jugando')
    r = correr(r.e, 1016, 1016 + ESPERA_META_MS - 100, { contador: 3 }, { duracionMs: 60_000, meta: 3 })
    expect(r.cambios).toEqual([{ tipo: 'meta' }])
    expect(r.e.fase).toBe('jugando')
    r = correr(r.e, 1016 + ESPERA_META_MS, 1016 + ESPERA_META_MS + 200, { contador: 3 }, { duracionMs: 60_000, meta: 3 })
    expect(r.e.fin).toBe('meta')
  })

  it('un juego agotado sin cumplir la meta termina como por tiempo, sin aviso de meta; si la cumplió manda la meta', () => {
    const c = { duracionMs: 60_000, meta: 4 }
    let r = correr(cicloInicial(), 0, 1000, { contador: 2 }, c)
    expect(r.e.fase).toBe('jugando')
    r = correr(r.e, 1016, 1016, { contador: 2, agotado: true }, c)
    expect(r.e.fase).toBe('terminada')
    expect(r.e.fin).toBe('tiempo')
    expect(r.cambios).toEqual([{ tipo: 'fin', motivo: 'tiempo' }]) // nunca { tipo: 'meta' }
    // Con la meta cumplida de verdad, `agotado` no adelanta el final: se muestra el aviso y termina por meta.
    r = correr(cicloInicial(), 0, 1000, { contador: 4, agotado: true }, c)
    expect(r.cambios).toEqual([{ tipo: 'inicio' }, { tipo: 'meta' }])
    expect(r.e.fase).toBe('jugando')
    r = correr(r.e, 1016, 1016 + ESPERA_META_MS, { contador: 4, agotado: true }, c)
    expect(r.e.fin).toBe('meta')
    // Sin el campo (los demás juegos) nada cambia.
    expect(correr(cicloInicial(), 0, 3000, { contador: 2 }, c).e.fase).toBe('jugando')
  })

  it('sin meta (0) no termina por contador; terminar a mano', () => {
    const r = correr(cicloInicial(), 0, 4000, { contador: 50 }, { duracionMs: 60_000, meta: 0 })
    expect(r.e.fase).toBe('jugando')
    const f = terminarCiclo(r.e)
    expect(f.estado.fin).toBe('manual')
    expect(terminarCiclo(f.estado).cambios).toEqual([])
  })

  it('un salto de reloj grande no cuenta como juego', () => {
    let r = correr(cicloInicial(), 0, 100)
    const antes = r.e.jugadoMs
    r = { e: pasoCiclo(r.e, { ...base, t: 60_000 }, { duracionMs: 600_000, meta: 0 }).estado, cambios: [] }
    expect(r.e.jugadoMs - antes).toBeLessThanOrEqual(250)
  })
})

describe('registro', () => {
  it('numera eventos desde seqInicial, los manda en lote y reintenta si falla', async () => {
    const enviados: EventoSesion[][] = []
    let fallar = true
    const repo = {
      agregarEventos: async (e: EventoSesion[]) => {
        if (fallar) throw new Error('sin red')
        enviados.push(e)
      },
    }
    const r = new RegistroSesion('S-1', repo, { seqInicial: 5 })
    r.evento(10.4, 'pausa', { datos: { motivo: 'manual' } })
    r.evento(20, 'reanudar')
    await expect(r.vaciar()).rejects.toThrow('sin red')
    expect(r.pendientes).toBe(2)
    fallar = false
    r.evento(30, 'agarre_inicio', { mano: 'derecha', objeto: 'esfera' })
    await r.vaciar()
    expect(r.pendientes).toBe(0)
    expect(enviados[0].map((e) => [e.seq, e.t, e.tipo])).toEqual([
      [5, 10, 'pausa'],
      [6, 20, 'reanudar'],
      [7, 30, 'agarre_inicio'],
    ])
    expect(enviados[0][2]).toMatchObject({ sesionId: 'S-1', mano: 'derecha', objeto: 'esfera', datos: null })
  })

  it('muestras a 10 Hz con canales alineados', () => {
    const r = new RegistroSesion('S-1', { agregarEventos: async () => {} })
    let n = 0
    for (let t = 0; t <= 1000; t += 16) if (r.muestra(t, 3.456, 70.04, t > 500 ? { giro: t / 10 } : undefined)) n++
    const m = r.muestras()
    expect(m.hz).toBe(10)
    expect(n).toBe(m.t.length)
    expect(m.t.length).toBeGreaterThanOrEqual(10)
    expect(m.t.length).toBeLessThanOrEqual(11)
    expect(m.apertura[0]).toBe(3.46)
    expect(m.flexIndice[0]).toBe(70)
    expect(m.canales!.giro.length).toBe(m.t.length)
    expect(m.canales!.giro[0]).toBeNull()
    expect(m.canales!.giro.at(-1)).not.toBeNull()
  })
})

describe('medidas y manos virtuales', () => {
  const abierta = manoSintetica({ ...POSE_BASE, x: 0.42, lado: 'derecha' })
  const puno = manoSintetica({ ...POSE_BASE, apertura: 0, lado: 'derecha' })

  it('medirMano: pinza en cm con la escala, apertura calibrada en 0..1', () => {
    const cal = { escalaCmPorUnidad: 100, rangoAbrirCerrar: { min: 0.1, max: 0.9 } } as never
    const a = medirMano(abierta, cal)
    const p = medirMano(puno, cal)
    expect(a.aperturaPinzaCm).toBeGreaterThan(5)
    expect(a.aperturaCalibrada).toBeGreaterThan(0.8)
    expect(p.aperturaCalibrada).toBeLessThan(0.3)
    expect(p.flexion.indice).toBeGreaterThan(a.flexion.indice + 60)
    expect(aperturaCalibrada(0.5, null)).toBeNull()
  })

  it('acumulador: calidad, máximos y suavidad solo con movimiento', () => {
    const acc = new AcumuladorBase()
    for (let i = 0; i < 90; i++) acc.agregar(i * 33, i % 10 === 0 ? null : medirMano(abierta, null), 30)
    const e = acc.entrada([], 3, 0)
    expect(e.cuadrosTotales).toBe(90)
    expect(e.cuadrosConMano).toBe(81)
    expect(e.suavidad).toBeNull() // mano quieta: no hay segmentos de movimiento
    expect(e.fpsMedio).toBe(30)
    const mov = new AcumuladorBase()
    for (let i = 0; i < 100; i++) {
      const u = i / 99
      const x = 0.3 + 0.4 * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5) // jerk mínimo
      mov.agregar(i * 30, { ...medirMano(abierta, null), muneca: { x, y: 0.5 } }, 30)
    }
    expect(mov.entrada([], 3, 0).suavidad).toBeGreaterThan(70)
  })

  it('máximo sostenido: un salto de uno o dos cuadros no fija el récord; un valor mantenido sí', () => {
    const mx = new MaximoSostenido()
    // 30 cuadros a 33 ms en 4 cm con un salto del seguimiento a 12 cm en dos cuadros seguidos.
    for (let i = 0; i < 30; i++) mx.agregar(i * 33, i === 10 || i === 11 ? 12 : 4)
    expect(mx.valor).toBe(4)
    // Sube de verdad a 7 cm y lo mantiene 200 ms: cuenta.
    for (let i = 30; i < 37; i++) mx.agregar(i * 33, 7)
    expect(mx.valor).toBe(7)
    // Tras un corte (mano perdida o pausa), dos cuadros sueltos no alcanzan a durar SOSTENIDO_MS.
    mx.cortar()
    mx.agregar(2000, 20)
    mx.agregar(2000 + SOSTENIDO_MS - 1, 20)
    expect(mx.valor).toBe(7)
    mx.agregar(2000 + SOSTENIDO_MS, 20)
    expect(mx.valor).toBe(20)
  })

  it('acumulador: los máximos de la sesión ignoran un salto aislado y no unen tramos separados por la pérdida de la mano', () => {
    const base = medirMano(abierta, null)
    const con = (cm: number, flexIndice: number) => ({ ...base, aperturaPinzaCm: cm, flexion: { ...base.flexion, indice: flexIndice } })
    const acc = new AcumuladorBase()
    for (let i = 0; i < 60; i++) acc.agregar(i * 33, i === 20 ? con(15, 170) : con(5, 40), 30)
    expect(acc.aperturaMaxCm).toBe(5)
    expect(acc.flexionMax.indice).toBe(40)
    // Un cuadro alto justo antes de perder la mano y otro justo al volver: no forman un tramo sostenido.
    acc.agregar(60 * 33, con(15, 170), 30)
    acc.agregar(61 * 33, null, 30)
    acc.agregar(62 * 33, con(15, 170), 30)
    for (let i = 63; i < 70; i++) acc.agregar(i * 33, con(5, 40), 30)
    const e = acc.entrada([], 3, 0)
    expect(e.aperturaMaxCm).toBe(5)
    expect(e.flexionMax.indice).toBe(40)
  })

  it('mapeo en espejo: la mano derecha (izquierda en la imagen cruda) queda a la derecha de la escena', () => {
    const c = centroPalma(abierta.landmarks)
    expect(c.x).toBeLessThan(0.5)
    const [x] = anclaEnEscena(c.x, c.y, 50)
    expect(x).toBeGreaterThan(0)
    // subir en la imagen = subir en la escena; acercar la mano a la cámara = meterla hacia el fondo de la mesa
    expect(anclaEnEscena(0.5, 0.2, 50)[1]).toBeGreaterThan(anclaEnEscena(0.5, 0.8, 50)[1])
    expect(anclaEnEscena(0.5, 0.5, 30)[2]).toBeLessThan(anclaEnEscena(0.5, 0.5, 65)[2])
    expect(anclaEnEscena(0, 0.5, null)[0]).toBe(ZONA_BASE.x[1])
  })

  it('puntosEnEscena: forma de la mano a escala, dedos arriba y hacia el fondo, pulgar hacia el centro', () => {
    const p = puntosEnEscena(abierta, 50)
    const largo = Math.hypot(p[12][0] - p[0][0], p[12][1] - p[0][1], p[12][2] - p[0][2])
    expect(largo).toBeGreaterThan(0.18 * ZONA_BASE.escala * 0.9)
    expect(largo).toBeLessThan(0.2 * ZONA_BASE.escala * 1.1)
    expect(p[12][1]).toBeGreaterThan(p[0][1]) // dedo medio más arriba que la muñeca
    expect(p[12][2]).toBeLessThan(p[0][2]) // y hacia el fondo
    expect(p[4][0]).toBeLessThan(p[20][0]) // mano derecha en espejo: pulgar a la izquierda del meñique
  })
})

describe('formato de métricas', () => {
  it('coma decimal y unidades', () => {
    expect(formatoMetrica({ unidad: 'cm' }, 2.14)).toBe('2,1 cm')
    expect(formatoMetrica({ unidad: '°' }, 67.6)).toBe('68°')
    expect(formatoMetrica({ unidad: '%' }, 86)).toBe('86%')
    expect(formatoMetrica({ unidad: 's', decimales: 1 }, 0.94)).toBe('0,9 s')
    expect(formatoMetrica({ unidad: '' }, 4)).toBe('4')
    expect(formatoMetrica({ unidad: 'cm' }, null)).toBe('—')
  })
})
