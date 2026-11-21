// Piezas de la pantalla del laboratorio de banda: el arco de carga, el trazo en vivo, la curva de la banda y el
// editor de la calibración con pesos. Solo dibujan; el cálculo vive en src/banda/.
import { cargaEn, curvaDesdePesos, type CurvaBanda } from '../../banda/curva'
import type { Repeticion } from '../../banda/medicion'
import { num } from '../../lib/formato'
import { aCalibracion, type PesosTexto } from './pesos'

// Misma geometría que el arco de la semana (src/ui/salud.tsx): 270°, radio 80, centro (105, 92) en 210×150.
const punto = (grados: number) => {
  const r = (grados * Math.PI) / 180
  return `${(105 + 80 * Math.cos(r)).toFixed(1)} ${(92 + 80 * Math.sin(r)).toFixed(1)}`
}
const tramo = (desde: number, hasta: number) => `M${punto(desde)}A80 80 0 ${hasta - desde > 180 ? 1 : 0} 1 ${punto(hasta)}`

/** La cifra principal: carga estimada en kg, con el arco lleno según cuánto de la curva se alcanzó. */
export function ArcoCarga({ kg, tope, rotulo }: { kg: number | null; tope: number; rotulo: string }) {
  const lleno = kg == null || tope <= 0 ? 0 : Math.min(1, kg / tope)
  return (
    <div className="arco" role="img" aria-label={kg == null ? 'Sin medida todavía' : `${num(kg, 1)} kilos, aproximado`}>
      <svg viewBox="0 0 210 150" aria-hidden="true">
        <path className="vacio" d={tramo(135, 405)} />
        {lleno > 0.01 && <path className="hecho" d={tramo(135, 135 + 270 * lleno)} />}
      </svg>
      <div className="arco-centro" aria-hidden="true">
        <b data-testid="carga">{kg == null ? '—' : num(kg, 1)}</b>
        <span>{rotulo}</span>
      </div>
    </div>
  )
}

export interface PuntoTrazo {
  t: number
  kg: number
}

/** Carga de los últimos segundos. */
export function Trazo({ puntos, ventanaMs, tope }: { puntos: PuntoTrazo[]; ventanaMs: number; tope: number }) {
  const W = 320
  const H = 72
  const fin = puntos.length ? puntos[puntos.length - 1].t : 0
  const linea = puntos.map((p) => `${(W - ((fin - p.t) / ventanaMs) * W).toFixed(1)},${(H - 4 - (Math.min(p.kg, tope) / (tope || 1)) * (H - 10)).toFixed(1)}`).join(' ')
  return (
    <svg className="lab-trazo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Carga de los últimos segundos">
      <line x1="0" y1={H - 4} x2={W} y2={H - 4} />
      {puntos.length > 1 && <polyline points={linea} />}
    </svg>
  )
}

/** La curva de la banda elegida, con el punto donde está ahora. Muestra que no es una recta. */
export function CurvaMini({ curva, estiramiento }: { curva: CurvaBanda; estiramiento: number | null }) {
  const W = 320
  const H = 132
  const M = { izq: 34, der: 8, arr: 8, aba: 24 }
  const ultimo = curva.puntos[curva.puntos.length - 1]
  const maxE = ultimo?.estiramiento ?? 1
  const maxKg = ultimo?.kg ?? 1
  const x = (e: number) => M.izq + (Math.min(e, maxE) / maxE) * (W - M.izq - M.der)
  const y = (kg: number) => H - M.aba - (Math.min(kg, maxKg) / maxKg) * (H - M.arr - M.aba)
  const linea = [{ estiramiento: 0, kg: 0 }, ...curva.puntos].map((p) => `${x(p.estiramiento).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')
  const ahora = estiramiento != null && estiramiento > 0 ? { e: estiramiento, kg: cargaEn(curva, estiramiento).kg } : null
  return (
    <svg className="lab-curva" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva de ${curva.nombre}: hasta ${num(maxKg, 1)} kilos al ${Math.round(maxE * 100)} % de estiramiento`}>
      <line className="eje" x1={M.izq} y1={H - M.aba} x2={W - M.der} y2={H - M.aba} />
      <line className="eje" x1={M.izq} y1={M.arr} x2={M.izq} y2={H - M.aba} />
      <polyline points={linea} />
      {curva.origen === 'medida' && curva.puntos.map((p) => <circle key={p.estiramiento} className="medida" cx={x(p.estiramiento)} cy={y(p.kg)} r="3.5" />)}
      {ahora && <circle className="ahora" cx={x(ahora.e)} cy={y(ahora.kg)} r="6" />}
      <text x={M.izq - 6} y={M.arr + 10} textAnchor="end">{num(maxKg, 1)}</text>
      <text x={M.izq - 6} y={H - M.aba} textAnchor="end">0</text>
      <text x={M.izq} y={H - 6}>0 %</text>
      <text x={W - M.der} y={H - 6} textAnchor="end">{Math.round(maxE * 100)} % de estiramiento</text>
    </svg>
  )
}

/** Picos de las últimas repeticiones, una columna por repetición. */
export function Picos({ repeticiones }: { repeticiones: Repeticion[] }) {
  const ultimas = repeticiones.slice(-12)
  const mejor = Math.max(...ultimas.map((r) => r.picoKg), 0.01)
  return (
    <ol className="lab-picos" aria-label="Pico de cada repetición">
      {ultimas.map((r, i) => (
        <li key={repeticiones.length - ultimas.length + i} style={{ height: `${Math.max(8, (r.picoKg / mejor) * 100)}%` }}>
          <span className="sr-only">
            Repetición {repeticiones.length - ultimas.length + i + 1}: {num(r.picoKg, 1)} kilos
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Calibración de la banda propia: se cuelga, se le agregan pesos conocidos y se anota el largo cada vez. */
export function EditorPesos({ valor, onCambio }: { valor: PesosTexto; onCambio: (v: PesosTexto) => void }) {
  const { avisos } = curvaDesdePesos(aCalibracion(valor))
  const hayDatos = valor.reposoCm !== '' || valor.filas.some((f) => f.kg !== '' || f.largoCm !== '')
  const fila = (i: number, cambio: Partial<PesosTexto['filas'][number]>) => onCambio({ ...valor, filas: valor.filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)) })
  return (
    <div className="lab-pesos">
      <p className="tenue chico">Cuelga la banda, agrégale botellas de agua (1 litro pesa 1 kg) y mide el largo con huincha cada vez.</p>
      <div className="campo">
        <label htmlFor="lab-reposo">Largo sin peso (cm)</label>
        <input id="lab-reposo" className="entrada" inputMode="decimal" value={valor.reposoCm} onChange={(e) => onCambio({ ...valor, reposoCm: e.target.value })} placeholder="104" />
      </div>
      <div className="lab-filas" role="group" aria-label="Pesos colgados">
        <span className="rotulo">Peso (kg)</span>
        <span className="rotulo">Largo (cm)</span>
        <span />
        {valor.filas.map((f, i) => (
          <div className="lab-fila" key={i}>
            <input className="entrada" inputMode="decimal" aria-label={`Peso ${i + 1}, en kilos`} value={f.kg} onChange={(e) => fila(i, { kg: e.target.value })} placeholder={String(i + 1)} />
            <input className="entrada" inputMode="decimal" aria-label={`Largo con el peso ${i + 1}, en centímetros`} value={f.largoCm} onChange={(e) => fila(i, { largoCm: e.target.value })} />
            <button type="button" className="lab-quitar" aria-label={`Quitar el peso ${i + 1}`} disabled={valor.filas.length <= 1} onClick={() => onCambio({ ...valor, filas: valor.filas.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="boton secundario chico" onClick={() => onCambio({ ...valor, filas: [...valor.filas, { kg: '', largoCm: '' }] })}>
        Agregar peso
      </button>
      {hayDatos && avisos.map((a) => (
        <p key={a} className="lab-aviso">
          {a}
        </p>
      ))}
    </div>
  )
}
