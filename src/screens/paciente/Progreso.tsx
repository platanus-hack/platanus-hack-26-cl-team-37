// F14 · Progreso (docs/referencia/imagenes/09_progreso.png).
// Lee paciente, plan y sesiones vía repos; los cálculos son puros (src/metrics/progreso.ts). Solo describe datos.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { repos } from '../../data/repos'
import type { Plan, Sesion } from '../../domain/types'
import { nombreJuego } from '../../games/registry'
import { entero, fechaCorta, num } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { calcularProgreso, esRango, marcasFechas, RANGOS, type ProgresoCalculado, type Rango } from '../../metrics/progreso'
import { UMBRAL_CALIDAD } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { Estados, Vacio } from '../../ui/piezas'
import './progreso.css'

interface Datos {
  hayPaciente: boolean
  plan: Plan | null
  inicioPlan: Date | null
  sesiones: Sesion[]
}

async function cargar(): Promise<Datos> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return { hayPaciente: false, plan: null, inicioPlan: null, sesiones: [] }
  const [plan, versiones, sesiones] = await Promise.all([repos.planes.vigente(paciente.id), repos.planes.versiones(paciente.id), repos.sesiones.listar(paciente.id)])
  const primera = versiones.map((v) => v.vigenteDesde).sort()[0] ?? plan?.vigenteDesde ?? null
  return { hayPaciente: true, plan, inicioPlan: primera ? new Date(primera) : null, sesiones }
}

export default function Progreso() {
  const r = useCarga(cargar, [])
  const [params, setParams] = useSearchParams()
  const [hoy] = useState(() => new Date())
  const pedido = params.get('rango')
  const rango: Rango = esRango(pedido) ? pedido : '4s'

  return (
    <main className="pantalla con-barra progreso">
      <h1>Progreso</h1>
      <div className="chips filtros" role="group" aria-label="Período">
        {RANGOS.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={rango === x.id} onClick={() => setParams({ rango: x.id }, { replace: true })}>
            {x.texto}
          </button>
        ))}
      </div>
      <Link to="/progreso/comparar" className="boton secundario chico progreso-comparar" data-testid="ir-comparar">
        <Icono nombre="tendencia" tam={20} />
        Comparar sesiones
      </Link>
      <Estados r={r}>
        {(d) =>
          d.hayPaciente ? (
            <Contenido d={d} rango={rango} hoy={hoy} />
          ) : (
            <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
          )
        }
      </Estados>
    </main>
  )
}

function Contenido({ d, rango, hoy }: { d: Datos; rango: Rango; hoy: Date }) {
  const p = useMemo(() => calcularProgreso(d.sesiones, d.plan, d.inicioPlan, rango, hoy), [d, rango, hoy])
  const nota = p.excluidas > 0 && (
    <p className="nota-pie" data-testid="nota-calidad">
      {p.excluidas === 1 ? 'Se excluyó 1 sesión' : `Se excluyeron ${p.excluidas} sesiones`} de los gráficos por registro de baja calidad (menos de {Math.round(UMBRAL_CALIDAD * 100)} % de los
      cuadros con mano detectada).
    </p>
  )

  if (p.vacio)
    return (
      <>
        <Vacio
          titulo="Aún no hay suficientes sesiones"
          texto={
            p.hechas >= 2
              ? 'Las sesiones de este período no tienen el registro necesario para graficarlas. Prueba con otro período.'
              : 'Con al menos 2 sesiones en este período verás aquí cómo van tus medidas. Prueba con otro período o completa tu próxima sesión.'
          }
          icono="progreso"
        />
        {nota}
      </>
    )

  return (
    <>
      <TarjetaApertura p={p} />
      <TarjetaDedos p={p} />
      <div className="progreso-par">
        <TarjetaTiempo p={p} />
        <section className="tarjeta" aria-labelledby="prog-ses">
          <h2 id="prog-ses" className="progreso-etiqueta">
            Sesiones
          </h2>
          <p className="progreso-valor" data-testid="sesiones">
            {p.planificadas != null ? `${entero(p.hechas)} de ${entero(Math.max(p.planificadas, p.hechas))}` : entero(p.hechas)}
          </p>
        </section>
      </div>
      {nota}
    </>
  )
}

function TarjetaApertura({ p }: { p: ProgresoCalculado }) {
  const ultimo = p.puntos[p.puntos.length - 1]!
  const primero = p.puntos[0]!
  const v = p.variacionPct
  const valores = p.puntos.map((x) => x.cm)
  const lo = Math.max(0, Math.floor(Math.min(...valores) - 1))
  const hi = Math.ceil(Math.max(...valores, p.metaPinzaCm ?? 0) + 0.5)
  const marcas = marcasFechas(p.desde, p.hasta)
  const resumen = `Apertura de pinza máxima por sesión, de ${num(primero.cm)} cm el ${fechaCorta(new Date(primero.t))} a ${num(ultimo.cm)} cm el ${fechaCorta(new Date(ultimo.t))}${p.metaPinzaCm ? `; meta ${num(p.metaPinzaCm)} cm` : ''}.`
  return (
    <section className="tarjeta progreso-apertura" aria-labelledby="prog-ap">
      <div className="fila entre progreso-cabeza">
        <div>
          <h2 id="prog-ap" className="progreso-etiqueta">
            Apertura de pinza (aprox.)
          </h2>
          <p className="progreso-valor" data-testid="apertura-valor">
            {num(ultimo.cm)} cm
            {v != null && Math.round(v) !== 0 && (
              <span className={`progreso-var ${v > 0 ? 'sube' : 'baja'}`} data-testid="apertura-variacion">
                <span aria-hidden="true">{v > 0 ? '▲' : '▼'}</span> {Math.abs(Math.round(v))}%
                <span className="sr-only">{v > 0 ? ' más' : ' menos'} que al inicio del período</span>
              </span>
            )}
          </p>
        </div>
        {p.metaPinzaCm != null && (
          <p className="progreso-meta" data-testid="apertura-meta">
            <svg width="22" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="22" y2="2" stroke="currentColor" strokeWidth="3" strokeDasharray="6 4" />
            </svg>
            Meta {num(p.metaPinzaCm)} cm
          </p>
        )}
      </div>
      <div className="progreso-grafico" role="img" aria-label={resumen} data-puntos={p.puntos.length}>
        <ResponsiveContainer width="100%" height={165} initialDimension={{ width: 320, height: 165 }}>
          <AreaChart data={p.puntos} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="prog-relleno" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffc83d" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#ffc83d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[p.desde, p.hasta]}
              ticks={marcas}
              tickFormatter={(t: number) => fechaCorta(new Date(t))}
              tickLine={false}
              axisLine={{ stroke: '#e6e6e2' }}
              tick={<EtiquetaFecha ultimo={marcas.length - 1} />}
              interval={0}
              tickMargin={8}
            />
            <YAxis hide domain={[lo, hi]} />
            {p.metaPinzaCm != null && <ReferenceLine y={p.metaPinzaCm} stroke="#7c7c76" strokeWidth={1.5} strokeDasharray="6 6" ifOverflow="extendDomain" />}
            <Area
              type="monotone"
              dataKey="cm"
              stroke="#16171a"
              strokeWidth={2}
              fill="url(#prog-relleno)"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === p.puntos.length - 1 && props.cx != null && props.cy != null ? (
                  <circle key="ultimo" cx={props.cx} cy={props.cy} r={6} fill="#16171a" stroke="#ffffff" strokeWidth={2} />
                ) : (
                  <g key={`p${props.index}`} />
                )
              }
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** Etiqueta del eje de fechas: la primera se alinea a la izquierda y la última a la derecha para que no se corten. */
function EtiquetaFecha({ x, y, payload, index, ultimo }: { x?: number; y?: number; payload?: { value: number }; index?: number; ultimo: number }) {
  if (x == null || y == null || !payload) return <g />
  const ancla = index === 0 ? 'start' : index === ultimo ? 'end' : 'middle'
  return (
    <text x={x} y={y + 10} textAnchor={ancla} fill="#5f5f59" fontSize={13}>
      {fechaCorta(new Date(payload.value))}
    </text>
  )
}

function TarjetaDedos({ p }: { p: ProgresoCalculado }) {
  const escala = Math.max(100, ...p.dedos.map((x) => x.grados ?? 0)) // en grados la barra se mide sobre 100° como mínimo
  return (
    <section className="tarjeta progreso-dedos" aria-labelledby="prog-ded">
      <div className="fila entre">
        <h2 id="prog-ded" className="progreso-titulo">
          Rango de movimiento por dedo
        </h2>
        <span className="progreso-unidad">{p.dedosEnPct ? '% de la meta' : 'grados'}</span>
      </div>
      <ul className="sin-vinetas progreso-barras">
        {p.dedos.map((x) => {
          const ancho = p.dedosEnPct ? (x.pct ?? 0) : ((x.grados ?? 0) / escala) * 100
          const bajo = p.dedosEnPct && x.pct != null && x.pct < 70
          const valor = x.grados == null ? '—' : p.dedosEnPct ? String(Math.round(x.pct ?? 0)) : `${Math.round(x.grados)}°`
          return (
            <li key={x.id} className="progreso-barra" data-dedo={x.id}>
              <span className="progreso-dedo">{x.nombre}</span>
              <span className="progreso-pista" aria-hidden="true">
                <span className={`progreso-relleno${bajo ? ' bajo' : ''}`} style={{ width: `${Math.max(0, Math.min(100, ancho))}%` }} />
              </span>
              <span className="progreso-numero" data-testid={`dedo-${x.id}`}>
                {valor}
                {x.grados != null && <span className="sr-only">{p.dedosEnPct ? ' % de la meta' : ' grados'}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="progreso-nota">Máximo del período, medida aproximada{p.dedosEnPct ? '' : '. Tu plan aún no tiene una meta de rango por dedo'}.</p>
    </section>
  )
}

function TarjetaTiempo({ p }: { p: ProgresoCalculado }) {
  const t = p.tiempo
  return (
    <section className="tarjeta" aria-labelledby="prog-t">
      <h2 id="prog-t" className="progreso-etiqueta">
        Tiempo por agarre
      </h2>
      {t ? (
        <>
          <p className="progreso-valor" data-testid="tiempo">
            {num(t.primero)} <span aria-hidden="true">→</span>
            <span className="sr-only"> a </span>{' '}
            <span className={t.ultimo < t.primero ? 'progreso-baja-tiempo' : undefined}>{num(t.ultimo)} s</span>
          </p>
          <p className="progreso-nota">Primera y última sesión de {nombreJuego(t.juego)}</p>
        </>
      ) : (
        <p className="progreso-valor" data-testid="tiempo">
          —
        </p>
      )}
    </section>
  )
}
