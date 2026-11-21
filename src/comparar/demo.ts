// F38 · SOLO DESARROLLO (se descarta del build): sesiones ilustrativas para ver la vista Comparar de la muñeca 3D y la
// banda elástica antes de que existan sesiones reales. Se activan con ?demo=muneca-3d | muneca-3d-modelo | banda-elastica.
import type { LadoMano, MetricasSesion, PoseClave, Sesion } from '../domain/types'
import { poseModelo, poseMunecaModelo, type V3 } from './mano'

const cam = (p: V3[]): [number, number, number][] => p.map((q) => [q[0], -q[1], -q[2]])

function base(id: string, pacienteId: string, juego: string, dia: number, juegoMetricas: Record<string, number | null>, extra: Partial<Sesion> = {}): Sesion {
  const inicio = new Date(Date.UTC(2026, 10, dia, 15, 0, 0)).toISOString()
  const metricas: MetricasSesion = {
    agarres: 0,
    agarresIzq: 0,
    agarresDer: 0,
    intentos: 0,
    precision: 0,
    tiempoMedioAgarreS: null,
    aperturaMaxCm: 0,
    flexionMax: { pulgar: 0, indice: 0, medio: 0, anular: 0, menique: 0 },
    flexionIndiceMax: 0,
    suavidad: null,
    calidadRegistro: 0.9,
    duracionS: 45,
    fpsMedio: 30,
    metaCumplida: true,
    juego: juegoMetricas,
    contador: 8,
  }
  return {
    id,
    pacienteId,
    planVersion: 1,
    juego,
    parametros: { mano: 'derecha', nivel: 1, duracionMin: 1, metaAgarres: 8, metaPinzaCm: 6, prescritoPor: null },
    inicio,
    fin: inicio,
    estado: 'cerrada',
    calibracion: null,
    metricas,
    muestras: null,
    dolorEVA: dia > 12 ? 1 : 3,
    esfuerzo: null,
    nota: null,
    dispositivo: null,
    versionApp: null,
    versionModelo: null,
    hash: null,
    ...extra,
  }
}

function pose(etiqueta: string, lado: LadoMano, puntos: V3[], valor: number | null, centro?: [number, number]): PoseClave {
  return { etiqueta, t: 1000, lado, valor, puntos: cam(puntos), ...(centro ? { centro } : {}) }
}

export function sesionesDemo(demo: string, pacienteId: string): Sesion[] {
  if (demo === 'muneca-3d' || demo === 'muneca-3d-modelo') {
    const real = demo === 'muneca-3d'
    // [flexión, extensión, radial, cubital] de «antes» y «después»
    const valores = [
      [38, 32, 14, 22],
      [56, 49, 19, 31],
    ]
    return valores.map(([fl, ex, ra, cu], i) => {
      const poses: PoseClave[] = real
        ? [
            pose('neutro', 'derecha', poseMunecaModelo(0, 0), null),
            pose('flexion-max', 'derecha', poseMunecaModelo(fl!, 0), fl!),
            pose('extension-max', 'derecha', poseMunecaModelo(-ex!, 0), ex!),
            pose('radial-max', 'derecha', poseMunecaModelo(0, ra!), ra!),
            pose('cubital-max', 'derecha', poseMunecaModelo(0, -cu!), cu!),
          ]
        : []
      const juego = { flexionMax: fl!, extensionMax: ex!, radialMax: ra!, cubitalMax: cu!, giroPosMax: 12 + i * 8, giroNegMax: 10 + i * 6, conoMax: 30 + i * 14, movimientos: 14 + i * 5 }
      return base(`DEMO-M-${i}`, pacienteId, 'muneca-3d', 3 + i * 14, juego, { muestras: { hz: 10, t: [], apertura: [], flexIndice: [], poses } })
    })
  }
  if (demo === 'banda-elastica') {
    const puno = poseModelo({ pulgar: 50, indice: 110, medio: 115, anular: 110, menique: 105 }, 0.7)
    return [0, 1].map((i) => {
      const est = [24, 33][i]!
      const n = 60
      const estCh = Array.from({ length: n }, (_, k) => Math.max(0, Math.sin((k / n) * Math.PI * 6)) * est)
      const poses = (['reposo', 'pico'] as const).flatMap((et) => [
        pose(et, 'derecha', puno, null, [et === 'pico' ? 0.15 : 0.35, 0.5]),
        pose(et, 'izquierda', puno, null, [et === 'pico' ? 0.85 : 0.65, 0.5]),
      ])
      const juego = { estiramientoMaxCm: est, estiramientoMaxPct: Math.round((est / 40) * 100), repeticiones: 6 + i * 2, cargaMaxKg: [3.4, 4.9][i]!, tiempoBajoTensionS: 18 + i * 6, cambioPicoPct: [-18, -9][i]!, reposoCm: 40, kgBanda: 10 }
      return base(`DEMO-B-${i}`, pacienteId, 'banda-elastica', 3 + i * 14, juego, {
        muestras: { hz: 10, t: estCh.map((_, k) => k * 100), apertura: [], flexIndice: [], poses, canales: { estiramientoCm: estCh, cargaKg: estCh.map((v) => (v / est) * [3.4, 4.9][i]!) } },
      })
    })
  }
  return []
}
