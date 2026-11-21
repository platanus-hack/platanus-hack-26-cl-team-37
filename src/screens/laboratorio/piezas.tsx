// Piezas de la pantalla del laboratorio de banda: el arco de carga, los pasos, el trazo en vivo, la curva de la banda,
// los picos por repetición y el editor de la calibración con pesos. Solo dibujan; el cálculo vive en src/banda/.
import { cargaEn, curvaDesdePesos, type CurvaBanda } from '../../banda/curva'
import { alcanzaMeta, type Repeticion } from '../../banda/medicion'
import { num } from '../../lib/formato'
import { Segmentos } from '../../ui/piezas'
import { TIRAS, aCalibracion, type PesosTexto } from './pesos'

// Misma geometría que el arco de la semana (src/ui/salud.tsx): 270°, radio 80, centro (105, 92) en 210×150.
const INICIO = 135
const BARRIDO = 270
const punto = (grados: number, r = 80) => {
  const a = (grados * Math.PI) / 180
  return { x: 105 + r * Math.cos(a), y: 92 + r * Math.sin(a) }
}
const tramo = (desde: number, hasta: number) => {
  const a = punto(desde)
  const b = punto(hasta)
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A80 80 0 ${hasta - desde > 180 ? 1 : 0} 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

/** La cifra principal: carga estimada en kg, con el arco lleno según cuánto de la escala se alcanzó y la meta marcada. */
export function ArcoCarga({ kg, tope, meta, rotulo }: { kg: number | null; tope: number; meta: number | null; rotulo: string }) {
  const lleno = kg == null || tope <= 0 ? 0 : Math.min(1, kg / tope)
  const angMeta = meta && tope > 0 ? INICIO + BARRIDO * Math.min(1, meta / tope) : null
  const enMeta = kg != null && meta != null && meta > 0 && alcanzaMeta({ picoKg: kg }, meta)
  return (
    <div className="arco lab-arco" data-meta={enMeta ? 'si' : undefined} role="img" aria-label={`${kg == null ? 'Sin medida todavía' : `${num(kg, 1)} kilos, aproximado`}${meta ? `; meta ${num(meta, 1)} kilos` : ''}`}>
      <svg viewBox="0 0 210 150" aria-hidden="true">
        <path className="vacio" d={tramo(INICIO, INICIO + BARRIDO)} />
        {lleno > 0.01 && <path className="hecho" d={tramo(INICIO, INICIO + BARRIDO * lleno)} />}
        {angMeta != null && (
          <line className="lab-marca-meta" x1={punto(angMeta, 66).x} y1={punto(angMeta, 66).y} x2={punto(angMeta, 94).x} y2={punto(angMeta, 94).y} />
        )}
      </svg>
      <div className="arco-centro" aria-hidden="true">
        <b data-testid="carga">{kg == null ? '—' : num(kg, 1)}</b>
        <span>{rotulo}</span>
      </div>
    </div>
  )
}

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente'

/** Los tres pasos del laboratorio, con el que toca resaltado. */
export function Pasos({ pasos }: { pasos: { texto: string; estado: EstadoPaso }[] }) {
  return (
    <ol className="lab-pasos" aria-label="Pasos">
      {pasos.map((p, i) => (
        <li key={p.texto} data-estado={p.estado} aria-current={p.estado === 'actual' ? 'step' : undefined}>
          <span className="lab-paso-num" aria-hidden="true">
            {p.estado === 'hecho' ? (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            ) : (
              i + 1
            )}
          </span>
          <span>{p.texto}</span>
          {p.estado === 'hecho' && <span className="sr-only">(hecho)</span>}
        </li>
      ))}
    </ol>
  )
}

export interface PuntoTrazo {
  t: number
  kg: number
}

/** Carga de los últimos segundos, con la meta como línea de referencia. */
export function Trazo({ puntos, ventanaMs, tope, meta }: { puntos: PuntoTrazo[]; ventanaMs: number; tope: number; meta: number | null }) {
  const W = 320
  const H = 72
  const y = (kg: number) => H - 4 - (Math.min(kg, tope) / (tope || 1)) * (H - 10)
  const fin = puntos.length ? puntos[puntos.length - 1].t : 0
  const linea = puntos.map((p) => `${(W - ((fin - p.t) / ventanaMs) * W).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')
  return (
    <svg className="lab-trazo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Carga de los últimos segundos">
      <line className="base" x1="0" y1={H - 4} x2={W} y2={H - 4} />
      {meta != null && meta > 0 && <line className="meta" x1="0" y1={y(meta)} x2={W} y2={y(meta)} />}
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
      <text x={M.izq - 6} y={M.arr + 10} textAnchor="end">
        {num(maxKg, 1)}
      </text>
      <text x={M.izq - 6} y={H - M.aba} textAnchor="end">
        0
      </text>
      <text x={M.izq} y={H - 6}>
        0 %
      </text>
      <text x={W - M.der} y={H - 6} textAnchor="end">
        {Math.round(maxE * 100)} % de estiramiento
      </text>
    </svg>
  )
}

/** Pico de cada una de las últimas repeticiones; amarillas las que llegaron a la meta. */
export function Picos({ repeticiones, meta }: { repeticiones: Repeticion[]; meta: number | null }) {
  const ultimas = repeticiones.slice(-14)
  const escala = Math.max(...ultimas.map((r) => r.picoKg), meta ?? 0, 0.01)
  const primera = repeticiones.length - ultimas.length
  return (
    <div className="lab-picos">
      {meta != null && meta > 0 && <span className="lab-picos-meta" style={{ bottom: `${(meta / escala) * 100}%` }} aria-hidden="true" />}
      <ol aria-label="Pico de cada repetición">
        {ultimas.map((r, i) => {
          const logra = meta == null || meta <= 0 || alcanzaMeta(r, meta)
          return (
            <li key={primera + i} data-meta={logra ? 'si' : 'no'} style={{ height: `${Math.max(8, (r.picoKg / escala) * 100)}%` }}>
              <span className="sr-only">
                Repetición {primera + i + 1}: {num(r.picoKg, 1)} kilos{meta ? (logra ? ', llegó a la meta' : ', bajo la meta') : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Calibración de la banda propia: se cuelga, se le agregan pesos conocidos y se anota el largo cada vez. */
export function EditorPesos({ valor, onCambio }: { valor: PesosTexto; onCambio: (v: PesosTexto) => void }) {
  const { avisos } = curvaDesdePesos(aCalibracion(valor))
  const hayDatos = valor.reposoCm !== '' || valor.filas.some((f) => f.kg !== '' || f.largoCm !== '')
  const fila = (i: number, cambio: Partial<PesosTexto['filas'][number]>) => onCambio({ ...valor, filas: valor.filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)) })
  return (
    <div className="lab-pesos">
      <ol className="lab-instrucciones">
        <li>Cuelga la banda de un gancho y marca el largo sin peso.</li>
        <li>Agrega botellas de agua de a una (1 litro pesa 1 kg) y mide el largo con huincha cada vez.</li>
        <li>Al menos tres pesos. Mide con la banda quieta.</li>
      </ol>
      <div className="campo">
        <span className="rotulo">Cómo la colgaste</span>
        <Segmentos opciones={TIRAS} valor={valor.tiras ?? 2} onCambio={(tiras) => onCambio({ ...valor, tiras })} etiqueta="Tiras que sostienen el peso" />
      </div>
      <div className="campo">
        <label htmlFor="lab-reposo">Largo sin peso (cm)</label>
        <input id="lab-reposo" className="entrada" inputMode="decimal" value={valor.reposoCm} onChange={(e) => onCambio({ ...valor, reposoCm: e.target.value })} placeholder="52" />
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
      {hayDatos &&
        avisos.map((a) => (
          <p key={a} className="lab-aviso">
            {a}
          </p>
        ))}
    </div>
  )
}
