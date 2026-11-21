// F38 · Gráficos de Comparar en SVG propio (sin dependencias): barras antes/después, evolución sesión a sesión,
// repeticiones de la banda y tira de agarres de la Caja de juguetes. Colores por clase (CSP: sin estilos en línea).
import { useState } from 'react'
import type { Sesion } from '../domain/types'
import { fechaCorta, num } from '../lib/formato'
import type { Agarre, RepBanda } from './eventos'
import { decimalesKpi, formatoKpi, serieDe, type DefKpi } from './kpis'

export interface FilaPar {
  id: string
  nombre: string
  antes: number | null
  despues: number | null
}

/** Barras dobles (antes arriba, después abajo) con el valor de cada una. */
export function BarrasPar({ titulo, nota, filas, unidad }: { titulo: string; nota: string; filas: FilaPar[]; unidad: string }) {
  const tope = Math.max(90, ...filas.flatMap((f) => [f.antes ?? 0, f.despues ?? 0]))
  const ancho = (v: number | null) => `${Math.max(0, Math.min(100, ((v ?? 0) / tope) * 100))}%`
  return (
    <section className="tarjeta cmp-panel" aria-label={titulo}>
      <h2>{titulo}</h2>
      <p className="cmp-nota">{nota}</p>
      <ul className="sin-vinetas cmp-barras">
        {filas.map((f) => (
          <li key={f.id} className="cmp-barra-fila" data-testid={`barra-${f.id}`}>
            <span className="cmp-barra-nombre">{f.nombre}</span>
            <span className="cmp-barras-par" aria-hidden="true">
              <span className="cmp-pista">
                <span className="antes" style={{ width: ancho(f.antes) }} />
              </span>
              <span className="cmp-pista">
                <span className="despues" style={{ width: ancho(f.despues) }} />
              </span>
            </span>
            <span className="cmp-barra-num">
              <b className="despues">{f.despues == null ? '—' : `${num(f.despues, 0)}${unidad}`}</b>
              <small className="antes">{f.antes == null ? '—' : `${num(f.antes, 0)}${unidad}`}</small>
              <span className="sr-only">
                Antes {f.antes == null ? 'sin dato' : `${num(f.antes, 0)} grados`}, después {f.despues == null ? 'sin dato' : `${num(f.despues, 0)} grados`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const W = 420
const H = 240
const PL = 40
const PB = 30

/** Evolución de un indicador en todas las sesiones válidas; los aros marcan las dos sesiones comparadas. */
export function Evolucion({ defs, sesiones, antesId, despuesId }: { defs: DefKpi[]; sesiones: Sesion[]; antesId: string; despuesId: string }) {
  const [id, setId] = useState(defs[0]!.id)
  const def = defs.find((d) => d.id === id) ?? defs[0]!
  const pts = serieDe(def, sesiones)
  const dec = decimalesKpi(def)
  const vs = pts.map((p) => p.v)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const pad = (hi - lo) * 0.2 || 1
  const y0 = Math.max(0, lo - pad)
  const y1 = hi + pad
  const x = (i: number) => PL + (i / Math.max(1, pts.length - 1)) * (W - PL - 16)
  const y = (v: number) => H - PB - ((v - y0) / (y1 - y0)) * (H - PB - 14)
  const paso = Math.ceil(pts.length / 6)
  const resumen = pts.length >= 2 ? `${def.nombre} en ${pts.length} sesiones, de ${formatoKpi(def, pts[0]!.v)} a ${formatoKpi(def, pts[pts.length - 1]!.v)}.` : `${def.nombre}: sin suficientes sesiones con este dato.`
  const aros = [
    { id: antesId, clase: 'antes' },
    { id: despuesId, clase: 'despues' },
  ]
  return (
    <section className="tarjeta cmp-panel" aria-label="Evolución sesión a sesión">
      <h2>Evolución sesión a sesión</h2>
      <p className="cmp-nota">Todas las sesiones válidas del ejercicio; los aros marcan las dos que estás comparando.</p>
      <div className="chips cmp-chips-met" role="group" aria-label="Indicador del gráfico">
        {defs.map((d) => (
          <button key={d.id} type="button" className="chip" aria-pressed={d.id === def.id} onClick={() => setId(d.id)}>
            {d.nombre}
          </button>
        ))}
      </div>
      {pts.length >= 2 ? (
        <svg className="cmp-grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resumen} data-testid="grafico-evolucion" data-puntos={pts.length}>
          {[0, 1, 2, 3, 4].map((i) => {
            const v = y0 + ((y1 - y0) * i) / 4
            return (
              <g key={i}>
                <line className="g-grilla" x1={PL} x2={W} y1={y(v)} y2={y(v)} />
                <text className="g-eje" x={PL - 6} y={y(v) + 4} textAnchor="end">
                  {num(v, dec)}
                </text>
              </g>
            )
          })}
          {pts.map((p, i) =>
            i % paso === 0 || i === pts.length - 1 ? (
              <text key={p.id} className="g-eje" x={x(i)} y={H - 8} textAnchor="middle">
                {fechaCorta(new Date(p.t))}
              </text>
            ) : null,
          )}
          <polyline className="g-linea" points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" />
          {pts.map((p, i) => (
            <circle key={p.id} className="g-punto" cx={x(i)} cy={y(p.v)} r={3.5} />
          ))}
          {aros.map((a) => {
            const i = pts.findIndex((p) => p.id === a.id)
            if (i < 0) return null
            return (
              <g key={a.clase} className={a.clase}>
                <circle className="g-aro" cx={x(i)} cy={y(pts[i]!.v)} r={8} fill="none" />
                <text className="g-valor" x={a.clase === 'antes' ? x(i) + 8 : x(i)} y={y(pts[i]!.v) - 14} textAnchor={a.clase === 'antes' ? 'start' : 'middle'}>
                  {num(pts[i]!.v, dec)}
                </text>
              </g>
            )
          })}
        </svg>
      ) : (
        <p className="cmp-nota" role="status">
          Este indicador aún no tiene datos en al menos 2 sesiones.
        </p>
      )}
    </section>
  )
}

/** Pico de cada repetición de la banda (carga aprox. o, si no hay, estiramiento aprox.). */
export function RepsBanda({ antes, despues }: { antes: RepBanda[]; despues: RepBanda[] }) {
  const usaKg = [...antes, ...despues].some((r) => r.cargaKg != null)
  const valor = (r: RepBanda) => (usaKg ? r.cargaKg : r.estiramientoCm)
  const n = Math.max(antes.length, despues.length)
  const top = Math.max(1, ...[...antes, ...despues].map((r) => valor(r) ?? 0)) * 1.15
  const y = (v: number) => H - PB - (v / top) * (H - PB - 14)
  const gw = (W - PL) / Math.max(1, n)
  const bw = Math.min(40, gw / 3)
  const unidad = usaKg ? 'kg' : 'cm'
  return (
    <section className="tarjeta cmp-panel" aria-label="Repeticiones">
      <h2>Repeticiones</h2>
      <p className="cmp-nota">{usaKg ? 'Carga aprox. del pico de cada repetición.' : 'Estiramiento aprox. del pico de cada repetición.'} Si baja al repetir, se ve aquí.</p>
      <svg className="cmp-grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pico por repetición en ${unidad}: antes ${antes.length} repeticiones, después ${despues.length}.`} data-testid="grafico-reps">
        {[0, 1, 2, 3].map((i) => {
          const v = (top * i) / 3
          return (
            <g key={i}>
              <line className="g-grilla" x1={PL} x2={W} y1={y(v)} y2={y(v)} />
              <text className="g-eje" x={PL - 6} y={y(v) + 4} textAnchor="end">
                {num(v, 1)}
              </text>
            </g>
          )
        })}
        {Array.from({ length: n }, (_, i) => {
          const cx = PL + gw * (i + 0.5)
          return (
            <g key={i}>
              {(
                [
                  ['antes', antes[i], -1],
                  ['despues', despues[i], 1],
                ] as const
              ).map(([k, r, lado]) => {
                const v = r ? valor(r) : null
                if (v == null) return null
                const bx = cx + lado * (bw / 2 + 2) - bw / 2
                return (
                  <g key={k} className={k}>
                    <rect className="g-barra" x={bx} y={y(v)} width={bw} height={H - PB - y(v)} rx={5} />
                    <text className="g-valor" x={bx + bw / 2} y={y(v) - 6} textAnchor="middle">
                      {num(v, 1)}
                    </text>
                  </g>
                )
              })}
              <text className="g-eje" x={cx} y={H - 8} textAnchor="middle">
                Rep {i + 1}
              </text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

/** Cada agarre de la Caja de juguetes: ancho = lo que tardó; verde entró a la caja, rojo quedó fuera. */
export function TiraAgarres({ antes, despues }: { antes: Agarre[]; despues: Agarre[] }) {
  if (!antes.length && !despues.length) return null
  const dur = (l: Agarre[]) => l.reduce((s, a) => s + Math.max(1, a.t1 - a.t0), 0)
  const max = Math.max(dur(antes), dur(despues), 1)
  const fila = (k: 'antes' | 'despues', l: Agarre[]) => (
    <div className="cmp-tira-fila" data-testid={`tira-${k}`}>
      <span className={`cmp-tira-nombre ${k}`}>{k === 'antes' ? 'Antes' : 'Después'}</span>
      <div className="cmp-bloques">
        {l.map((a, i) => (
          <span key={i} className={a.enCaja ? 'dentro' : 'fuera'} title={`${a.objeto}: ${num(Math.max(1, a.t1 - a.t0) / 1000)} s · ${a.enCaja ? 'entró' : 'quedó fuera'}`} style={{ flexGrow: Math.max(1, a.t1 - a.t0) }} />
        ))}
        <span className="resto" style={{ flexGrow: Math.max(0, max - dur(l)) }} />
      </div>
    </div>
  )
  return (
    <section className="tarjeta cmp-panel" aria-label="Cada agarre">
      <h2>Cada agarre</h2>
      <p className="cmp-nota">Ancho = lo que tardó · verde entró a la caja, rojo quedó fuera.</p>
      <div className="cmp-tira">
        {fila('antes', antes)}
        {fila('despues', despues)}
      </div>
    </section>
  )
}
