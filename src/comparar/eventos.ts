// F38 · Lo que se puede reconstruir de los eventos de una sesión para la repetición en 3D y los gráficos.
import type { EventoSesion } from '../domain/types'

export interface Agarre {
  objeto: string
  /** ms desde el inicio. */
  t0: number
  t1: number
  /** Apertura pulgar–índice al tomar el objeto (cm aprox.), si se registró. */
  aperturaCm: number | null
  enCaja: boolean
}

/** Agarres de la Caja de juguetes en orden: cada `agarre_inicio` se cierra con el `soltar` del mismo objeto. */
export function agarresDe(eventos: EventoSesion[]): Agarre[] {
  const abiertos: { objeto: string; t0: number; ap: number | null; cerrado: boolean; enCaja: boolean; t1: number }[] = []
  for (const e of eventos) {
    if (e.tipo === 'agarre_inicio') {
      const ap = e.datos?.aperturaCm
      abiertos.push({ objeto: e.objeto ?? 'objeto', t0: e.t, ap: typeof ap === 'number' ? ap : null, cerrado: false, enCaja: false, t1: e.t })
    } else if (e.tipo === 'soltar') {
      const a = [...abiertos].reverse().find((x) => x.objeto === (e.objeto ?? 'objeto') && !x.cerrado)
      if (a) {
        a.cerrado = true
        a.enCaja = Boolean(e.datos?.enCaja)
        a.t1 = e.t
      }
    }
  }
  return abiertos.filter((a) => a.cerrado).map((a) => ({ objeto: a.objeto, t0: a.t0, t1: a.t1, aperturaCm: a.ap, enCaja: a.enCaja }))
}

export interface RepBanda {
  rep: number
  /** ms desde el inicio. */
  t: number
  estiramientoCm: number | null
  cargaKg: number | null
}

/** Picos por repetición de la banda: eventos `umbral_alcanzado` con { estiramientoCm, cargaKg, rep }. */
export function repsDeBanda(eventos: EventoSesion[]): RepBanda[] {
  const out: RepBanda[] = []
  for (const e of eventos) {
    if (e.tipo !== 'umbral_alcanzado' || !e.datos) continue
    const d = e.datos as Record<string, unknown>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    out.push({ rep: num(d.rep) ?? out.length + 1, t: e.t, estiramientoCm: num(d.estiramientoCm), cargaKg: num(d.cargaKg) })
  }
  return out.sort((a, b) => a.rep - b.rep)
}
