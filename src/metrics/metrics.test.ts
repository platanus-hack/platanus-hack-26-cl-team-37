import { describe, expect, it } from 'vitest'
import {
  aperturaMano,
  aperturaPinzaCm,
  clasificarLuz,
  distanciaAproxCm,
  escalaCm,
  flexionArticulacion,
  flexionDedo,
  largoMano,
  luminanciaMedia,
  type P3,
} from './geometria'
import { configDesdeCalibracion, pasoAgarre } from './agarre'
import { sparc, sparcAPuntaje, suavidadSegmento, type PuntoTrayectoria } from './suavidad'
import { adherencia, agregarSesion, contarAgarres, planDeHoy, racha, semana, sesionAnterior, variacionPct } from './sesion'
import type { EventoSesion, Sesion } from '../domain/types'
import { FiltroOneEuro } from '../tracking/oneEuro'

const p = (x: number, y: number, z = 0): P3 => ({ x, y, z })

/** Mano plana y estirada en el plano XY (metros), dedos hacia +y. */
function manoRecta(): P3[] {
  const pts: P3[] = Array.from({ length: 21 }, () => p(0, 0))
  pts[0] = p(0, 0)
  // pulgar hacia +x
  pts[1] = p(0.02, 0.01); pts[2] = p(0.04, 0.02); pts[3] = p(0.06, 0.03); pts[4] = p(0.08, 0.04)
  const bases = [5, 9, 13, 17]
  const xs = [0.02, 0.0, -0.02, -0.04]
  bases.forEach((b, i) => {
    pts[b] = p(xs[i], 0.09)
    pts[b + 1] = p(xs[i], 0.13)
    pts[b + 2] = p(xs[i], 0.155)
    pts[b + 3] = p(xs[i], 0.175)
  })
  return pts
}

describe('geometría', () => {
  it('flexión de articulación: 0° recta y 90° en ángulo recto', () => {
    expect(flexionArticulacion(p(0, 0), p(0, 1), p(0, 2))).toBeCloseTo(0)
    expect(flexionArticulacion(p(0, 0), p(0, 1), p(1, 1))).toBeCloseTo(90)
  })

  it('flexión del índice suma MCP y PIP', () => {
    const m = manoRecta()
    // el dedo medio está alineado con la muñeca: recto = 0°
    expect(flexionDedo(m, 'medio')).toBeCloseTo(0, 5)
    const baseIndice = flexionDedo(m, 'indice') // MCP con leve desvío lateral (metacarpiano 0-5)
    // doblar PIP 90°: 7 y 8 hacia +z
    m[7] = p(0.02, 0.13, 0.025)
    m[8] = p(0.02, 0.13, 0.045)
    expect(flexionDedo(m, 'indice') - baseIndice).toBeCloseTo(90, 1)
  })

  it('largo de mano suma 0-9-10-11-12', () => {
    expect(largoMano(manoRecta()) * 100).toBeCloseTo(17.5, 5)
  })

  it('escala: sin regla asume metros; con regla usa la medida real', () => {
    expect(escalaCm(0.175, null)).toBe(100)
    expect(escalaCm(0.175, 18.4)).toBeCloseTo(105.14, 2)
  })

  it('apertura de pinza en cm (puntos 4 y 8)', () => {
    const m = manoRecta()
    // 4 = (0.08,0.04) 8 = (0.02,0.175) → 0.1477 m
    expect(aperturaPinzaCm(m, 100)).toBeCloseTo(14.77, 1)
  })

  it('apertura de mano normalizada: abierta > cerrada', () => {
    const abierta = manoRecta()
    const cerrada = manoRecta()
    ;[8, 12, 16, 20].forEach((i) => (cerrada[i] = p(cerrada[i].x, 0.08)))
    expect(aperturaMano(abierta)).toBeGreaterThan(aperturaMano(cerrada))
  })

  it('distancia pinhole y luminancia', () => {
    expect(distanciaAproxCm(160, 640, 18)).toBeCloseTo(57.6)
    expect(distanciaAproxCm(0, 640, 18)).toBeNull()
    const blanco = new Uint8ClampedArray(64 * 4).fill(255)
    expect(luminanciaMedia(blanco, 1)).toBeCloseTo(255)
    expect(clasificarLuz(30)).toBe('poca')
    expect(clasificarLuz(120)).toBe('buena')
  })
})

describe('agarre con histéresis', () => {
  it('cierra bajo el umbral solo con objeto cerca y abre sobre el umbral mayor', () => {
    let e = { agarrando: false }
    let r = pasoAgarre(e, 2.0, false)
    expect(r.cambio).toBeNull()
    r = pasoAgarre(e, 2.0, true)
    expect(r.cambio).toBe('inicio')
    e = r.estado
    // entre umbrales: sigue agarrando (histéresis)
    r = pasoAgarre(e, 3.2, true)
    expect(r.cambio).toBeNull()
    expect(r.estado.agarrando).toBe(true)
    r = pasoAgarre(e, 4.5, true)
    expect(r.cambio).toBe('fin')
  })

  it('perder la mano suelta el objeto', () => {
    expect(pasoAgarre({ agarrando: true }, null, true).cambio).toBe('fin')
  })

  it('ajusta umbrales a manos con poca apertura', () => {
    const c = configDesdeCalibracion(4)
    expect(c.umbralCierreCm).toBeLessThan(c.umbralAperturaCm)
    expect(c.umbralAperturaCm).toBeLessThan(4)
  })
})

describe('suavidad (SPARC)', () => {
  it('perfil de jerk mínimo es más suave que uno con temblor', () => {
    const fs = 60
    const n = 60
    const suave: number[] = []
    const tembloroso: number[] = []
    for (let i = 0; i < n; i++) {
      const tau = i / (n - 1)
      const v = 30 * tau ** 2 - 60 * tau ** 3 + 30 * tau ** 4
      suave.push(v)
      tembloroso.push(Math.max(0, v + 0.5 * Math.sin(2 * Math.PI * 6 * (i / fs))))
    }
    const sSuave = sparc(suave, fs)
    const sTemb = sparc(tembloroso, fs)
    expect(sSuave).toBeGreaterThan(sTemb)
    expect(sSuave).toBeGreaterThan(-2)
    expect(sparcAPuntaje(sSuave)).toBeGreaterThan(sparcAPuntaje(sTemb))
  })

  it('escala 0–100 acotada', () => {
    expect(sparcAPuntaje(-1)).toBe(100)
    expect(sparcAPuntaje(-20)).toBe(0)
  })

  it('segmentos cortos no se puntúan', () => {
    const tray: PuntoTrayectoria[] = [
      { t: 0, x: 0, y: 0 },
      { t: 50, x: 0.1, y: 0 },
    ]
    expect(suavidadSegmento(tray)).toBeNull()
  })
})

function ev(seq: number, t: number, tipo: EventoSesion['tipo'], mano: 'izquierda' | 'derecha', objeto: string, enCaja?: boolean): EventoSesion {
  return { sesionId: 'S', seq, t, tipo, mano, objeto, datos: enCaja == null ? null : { enCaja } }
}

describe('agregados de sesión', () => {
  const eventos: EventoSesion[] = [
    ev(1, 1000, 'agarre_inicio', 'derecha', 'cubo'),
    ev(2, 4000, 'soltar', 'derecha', 'cubo', true),
    ev(3, 5000, 'agarre_inicio', 'izquierda', 'esfera'),
    ev(4, 6000, 'soltar', 'izquierda', 'esfera', false),
    ev(5, 7000, 'agarre_inicio', 'izquierda', 'esfera'),
    ev(6, 12000, 'soltar', 'izquierda', 'esfera', true),
  ]

  it('cuenta intentos, éxitos por mano y tiempo medio', () => {
    const c = contarAgarres(eventos)
    expect(c).toMatchObject({ intentos: 3, exitosos: 2, izq: 1, der: 1 })
    expect(c.tiempoMedio).toBeCloseTo(4)
  })

  it('con agarre_fin, el tiempo del agarre termina al abrir la pinza (no al quedar quieto el objeto)', () => {
    const c = contarAgarres([
      ev(1, 1000, 'agarre_inicio', 'derecha', 'cubo-1'),
      ev(2, 2500, 'agarre_fin', 'derecha', 'cubo-1'),
      ev(3, 3200, 'soltar', 'derecha', 'cubo-1', true),
      ev(4, 4000, 'agarre_inicio', 'derecha', 'esfera-2'),
      ev(5, 4500, 'agarre_fin', 'derecha', 'esfera-2'),
      ev(6, 5000, 'soltar', 'derecha', 'esfera-2', false),
      ev(7, 6000, 'agarre_inicio', 'derecha', 'esfera-2'),
      ev(8, 8500, 'agarre_fin', 'derecha', 'esfera-2'),
      ev(9, 9000, 'soltar', 'derecha', 'esfera-2', true),
    ])
    expect(c).toMatchObject({ intentos: 3, exitosos: 2, der: 2 })
    expect(c.tiempoMedio).toBeCloseTo(2)
  })

  it('agrega la sesión', () => {
    const m = agregarSesion({
      eventos,
      aperturaMaxCm: 6.14,
      flexionMax: { pulgar: 40, indice: 68.4, medio: 70, anular: 60, menique: 50 },
      suavidad: 86,
      cuadrosConMano: 90,
      cuadrosTotales: 100,
      duracionS: 360,
      fpsMedio: 29.6,
      metaAgarres: 2,
    })
    expect(m.precision).toBeCloseTo(0.667, 3)
    expect(m.aperturaMaxCm).toBe(6.1)
    expect(m.flexionIndiceMax).toBe(68)
    expect(m.calidadRegistro).toBe(0.9)
    expect(m.metaCumplida).toBe(true)
  })
})

function ses(id: string, inicio: string, extra: Partial<Sesion> = {}): Sesion {
  return {
    id, pacienteId: 'p', planVersion: 1, juego: 'caja-juguetes',
    parametros: { mano: 'ambas', nivel: 2, duracionMin: 6, metaAgarres: 12, metaPinzaCm: 7, prescritoPor: null },
    inicio, fin: inicio, estado: 'cerrada', calibracion: null, metricas: null, muestras: null,
    dolorEVA: 2, esfuerzo: 'Moderado', nota: null, dispositivo: null, versionApp: null, versionModelo: null, hash: 'x',
    ...extra,
  }
}

describe('adherencia, racha y semana', () => {
  const hoy = new Date(2026, 10, 21, 12, 0)
  const sesiones = [
    ses('a', new Date(2026, 10, 21, 10).toISOString()),
    ses('b', new Date(2026, 10, 20, 10).toISOString()),
    ses('c', new Date(2026, 10, 19, 10).toISOString()),
    ses('d', new Date(2026, 10, 17, 10).toISOString()),
    ses('e', new Date(2026, 10, 10, 10).toISOString()), // fuera de los 7 días
    ses('f', new Date(2026, 10, 18, 10).toISOString(), { estado: 'preparada' }), // no cuenta
  ]

  it('adherencia = hechas / planificadas en 7 días, con tope 1', () => {
    expect(adherencia(sesiones, { sesionesPorSemana: 5 }, hoy)).toBeCloseTo(0.8)
    expect(adherencia(sesiones, { sesionesPorSemana: 2 }, hoy)).toBe(1)
    expect(adherencia(sesiones, null, hoy)).toBeNull()
    // 2 ejercicios × 5 días = 10 planificadas
    expect(adherencia(sesiones, { sesionesPorSemana: 5, items: [1, 2] }, hoy)).toBeCloseTo(0.4)
  })

  it('racha cuenta días consecutivos', () => {
    expect(racha(sesiones, hoy)).toBe(3)
    // si hoy no hay sesión, cuenta desde ayer
    expect(racha(sesiones.slice(1), hoy)).toBe(2)
  })

  it('semana de lunes a domingo', () => {
    const s = semana(sesiones, 1, hoy) // 21-11-2026 es sábado
    expect(s).toHaveLength(7)
    expect(s[0].clave).toBe('2026-11-16')
    expect(s[5].hoy).toBe(true)
    expect(s[5].estado).toBe('cumplido')
    expect(s[6].estado).toBe('futuro')
    expect(s[0].estado).toBe('pendiente')
  })

  it('semana cuenta sesiones por día y marca parcial', () => {
    const s = semana(sesiones, 2, hoy)
    expect(s[5].hechas).toBe(1)
    expect(s[5].estado).toBe('parcial')
    expect(s[1].hechas).toBe(1) // martes 17
  })

  it('plan de hoy: hecho, siguiente y pendiente', () => {
    const items = [{ juego: 'movilidad-guiada' }, { juego: 'caja-juguetes' }, { juego: 'pinza-fina' }]
    const deHoy = [ses('m', new Date(2026, 10, 21, 9).toISOString(), { juego: 'movilidad-guiada' })]
    expect(planDeHoy(items, deHoy, hoy).map((x) => x.estado)).toEqual(['hecho', 'siguiente', 'pendiente'])
    // sesiones de otros días o no cerradas no cuentan
    const otras = [
      ses('y', new Date(2026, 10, 20, 9).toISOString(), { juego: 'movilidad-guiada' }),
      ses('p', new Date(2026, 10, 21, 9).toISOString(), { juego: 'movilidad-guiada', estado: 'preparada' }),
    ]
    expect(planDeHoy(items, otras, hoy).map((x) => x.estado)).toEqual(['siguiente', 'pendiente', 'pendiente'])
    // una sesión cubre un solo ítem aunque el juego se repita en el plan
    const repetido = [{ juego: 'caja-juguetes' }, { juego: 'caja-juguetes' }]
    expect(planDeHoy(repetido, sesiones, hoy).map((x) => x.estado)).toEqual(['hecho', 'siguiente'])
    expect(planDeHoy([], sesiones, hoy)).toEqual([])
  })

  it('sesión anterior del mismo juego y nivel', () => {
    const anterior = sesionAnterior(sesiones[0], sesiones)
    expect(anterior?.id).toBe('b')
  })

  it('variación porcentual', () => {
    expect(variacionPct(4.2, 6.1)).toBeCloseTo(45.24, 1)
    expect(variacionPct(0, 3)).toBeNull()
  })
})

describe('filtro One Euro', () => {
  it('reduce el ruido de una señal quieta', () => {
    const f = new FiltroOneEuro(1, 0.02)
    let maxDesv = 0
    for (let i = 0; i < 120; i++) {
      const ruido = i % 2 ? 0.01 : -0.01
      const y = f.filtrar(0.5 + ruido, i * 33)
      if (i > 20) maxDesv = Math.max(maxDesv, Math.abs(y - 0.5))
    }
    expect(maxDesv).toBeLessThan(0.01)
  })
})
