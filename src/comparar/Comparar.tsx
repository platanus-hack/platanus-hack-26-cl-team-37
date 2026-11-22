// F38 · Comparar sesiones en 3D. Una sola pantalla para el terapeuta (/terapeuta/pacientes/:id/comparar) y el paciente
// (/progreso/comparar): pestañas por juego, dos sesiones a elegir (por defecto la primera y la última válidas), la vista 3D
// con manos grandes, indicadores con su diferencia, flexión por dedo (o máximos por dirección) y la evolución.
// Solo describe lo registrado: sin diagnósticos ni recomendaciones. Medidas de cámara como estimación («aprox.»).
import { lazy, Suspense, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { repos } from '../data/repos'
import type { EventoSesion, Paciente, Sesion } from '../domain/types'
import { cargarModulo } from '../games/shell/modulos'
import { fechaCorta, hora } from '../lib/formato'
import { useCarga } from '../lib/useCarga'
import { Cargando, Encabezado, Estados, Vacio } from '../ui/piezas'
import './comparar.css'
import { agarresDe, repsDeBanda, tirosDeHonda } from './eventos'
import { BarrasPar, Evolucion, RepsBanda, TiraAgarres } from './graficos'
import { DIRECCIONES_MUNECA, decimalesKpi, formatoKpi, kpisDe, listaKpis, tieneListaFija, type DefKpi, type KpiValor } from './kpis'
import { ajustarSeleccion, juegosComparables, type GrupoJuego } from './sesiones'
import { DEDOS_ORDEN } from './mano'

const Estadio = lazy(() => import('./Estadio'))

const JUEGOS_CON_EVENTOS = ['caja-juguetes', 'banda-elastica', 'honda']
const NOMBRE_DEDO: Record<string, string> = { pulgar: 'Pulgar', indice: 'Índice', medio: 'Medio', anular: 'Anular', menique: 'Meñique' }

interface Datos {
  paciente: Paciente | null
  sesiones: Sesion[]
}

async function cargar(rol: 'paciente' | 'terapeuta', id: string | undefined): Promise<Datos> {
  const paciente = rol === 'terapeuta' ? (id ? await repos.pacientes.porId(id) : null) : await repos.pacientes.miPaciente()
  if (!paciente) return { paciente: null, sesiones: [] }
  let sesiones = await repos.sesiones.listar(paciente.id)
  // Solo en desarrollo: ?demo=muneca-3d | banda-elastica | honda agrega sesiones ilustrativas para ver el diseño antes de que existan.
  if (import.meta.env.DEV) {
    const demo = new URLSearchParams(location.search).get('demo')
    if (demo) sesiones = [...sesiones, ...(await import('./demo')).sesionesDemo(demo, paciente.id)]
  }
  return { paciente, sesiones }
}

export function CompararPaciente() {
  return <Pantalla rol="paciente" />
}

export function CompararTerapeuta() {
  const { id } = useParams()
  return <Pantalla rol="terapeuta" pacienteId={id} />
}

function Pantalla({ rol, pacienteId }: { rol: 'paciente' | 'terapeuta'; pacienteId?: string }) {
  const r = useCarga(() => cargar(rol, pacienteId), [rol, pacienteId])
  const terapeuta = rol === 'terapeuta'
  return (
    <main className={`pantalla comparar${terapeuta ? '' : ' con-barra'}`}>
      <Encabezado titulo="Comparar sesiones" subtitulo={terapeuta ? r.datos?.paciente?.nombre : 'Elige dos sesiones y mira tu mano antes y después'} atras={terapeuta ? '/terapeuta/pacientes' : '/progreso'} />
      <Estados r={r} vacio={<Vacio titulo="No encontramos al paciente" texto="Puede que ya no exista o que no comparta sus métricas contigo." icono="pacientes" />}>
        {(d) =>
          !d.paciente ? (
            <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
          ) : (
            <Contenido d={d} paciente={d.paciente} terapeuta={terapeuta} />
          )
        }
      </Estados>
    </main>
  )
}

function Contenido({ d, paciente, terapeuta }: { d: Datos; paciente: Paciente; terapeuta: boolean }) {
  const grupos = useMemo(() => juegosComparables(d.sesiones), [d.sesiones])
  // ?juego=<id> (o ?demo=<id> en desarrollo) abre directo esa pestaña
  const [juegoElegido, setJuegoElegido] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search)
    return q.get('juego') ?? q.get('demo')?.replace(/-modelo$/, '') ?? null
  })
  const [sel, setSel] = useState<Record<string, { antes: string; despues: string }>>({})

  if (grupos.length === 0)
    return (
      <Vacio
        titulo="Aún no hay sesiones para comparar"
        texto={
          terapeuta
            ? `Cuando ${paciente.nombre} tenga al menos 2 sesiones completas del mismo ejercicio, podrás ver aquí su mano antes y después.`
            : 'Con al menos 2 sesiones completas del mismo ejercicio verás aquí tu mano antes y después.'
        }
        icono="mano"
      />
    )

  const grupo = grupos.find((g) => g.juego === juegoElegido) ?? grupos[0]!
  const actual = ajustarSeleccion(grupo.validas, sel[grupo.juego]?.antes ?? null, sel[grupo.juego]?.despues ?? null)!
  const cambiar = (k: 'antes' | 'despues', id: string) => setSel({ ...sel, [grupo.juego]: { ...actual, [k]: id } })

  return (
    <>
      <div className="cmp-pestanas" role="tablist" aria-label="Ejercicio">
        {grupos.map((g) => (
          <button key={g.juego} type="button" role="tab" className="chip" aria-selected={g.juego === grupo.juego} onClick={() => setJuegoElegido(g.juego)}>
            {g.nombre}
            <small>{g.validas.length} sesiones</small>
          </button>
        ))}
      </div>
      <Juego key={grupo.juego} grupo={grupo} antesId={actual.antes} despuesId={actual.despues} onCambio={cambiar} paciente={paciente} />
    </>
  )
}

function Juego({ grupo, antesId, despuesId, onCambio, paciente }: { grupo: GrupoJuego; antesId: string; despuesId: string; onCambio: (k: 'antes' | 'despues', id: string) => void; paciente: Paciente }) {
  const antes = grupo.validas.find((s) => s.id === antesId)!
  const despues = grupo.validas.find((s) => s.id === despuesId)!
  const conEventos = JUEGOS_CON_EVENTOS.includes(grupo.juego)
  const ev = useCarga(
    async (): Promise<[EventoSesion[], EventoSesion[]]> => (conEventos ? Promise.all([repos.sesiones.eventos(antesId), repos.sesiones.eventos(despuesId)]) : [[], []]),
    [conEventos, antesId, despuesId],
  )
  const mod = useCarga(
    async () => {
      if (tieneListaFija(grupo.juego)) return null
      const crear = await cargarModulo(grupo.juego).catch(() => null)
      return crear?.().metricasResumen ?? null
    },
    [grupo.juego],
  )
  const defs = useMemo(() => listaKpis(grupo.juego, mod.datos, grupo.validas), [grupo, mod.datos])
  const kpis = useMemo(() => kpisDe(defs, antes, despues), [defs, antes, despues])
  const [evAntes, evDespues] = ev.datos ?? [EVACIO, EVACIO]
  const esperaEventos = grupo.juego === 'caja-juguetes' && ev.estado !== 'listo'
  const largoMano = paciente.largoManoCm ?? 18.4

  return (
    <>
      <div className="cmp-selectores">
        <Selector k="antes" etiqueta="Antes" validas={grupo.validas} valor={antesId} onCambio={onCambio} />
        <Selector k="despues" etiqueta="Después" validas={grupo.validas} valor={despuesId} onCambio={onCambio} />
      </div>

      {esperaEventos ? (
        <div className="cmp-estadio cmp-cargando">
          <Cargando texto="Preparando la vista 3D…" />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="cmp-estadio cmp-cargando">
              <Cargando texto="Preparando la vista 3D…" />
            </div>
          }
        >
          <Estadio juego={grupo.juego} antes={antes} despues={despues} largoManoCm={largoMano} eventosAntes={evAntes} eventosDespues={evDespues} />
        </Suspense>
      )}

      <section className="cmp-kpis" aria-label="Indicadores">
        {kpis.map((k) => (
          <TarjetaKpi key={k.def.id} k={k} />
        ))}
      </section>

      <div className="cmp-paneles">
        <PanelDetalle juego={grupo.juego} antes={antes} despues={despues} evAntes={evAntes} evDespues={evDespues} />
        {defs.length > 0 && <Evolucion defs={defs} sesiones={grupo.validas} antesId={antesId} despuesId={despuesId} />}
      </div>

      <p className="cmp-aviso">
        Solo describe lo registrado en cada sesión; no es un diagnóstico. Las medidas de cámara son estimaciones (aprox.): sirven para seguir la evolución, no son una medición clínica.
      </p>
    </>
  )
}

const EVACIO: EventoSesion[] = []

function etiquetaSesion(s: Sesion, conNivel: boolean): string {
  const f = new Date(s.inicio!)
  return `${fechaCorta(f)} ${hora(f)}${conNivel ? ` · N${s.parametros?.nivel ?? 1}` : ''}`
}

function Selector({ k, etiqueta, validas, valor, onCambio }: { k: 'antes' | 'despues'; etiqueta: string; validas: Sesion[]; valor: string; onCambio: (k: 'antes' | 'despues', id: string) => void }) {
  const conNivel = new Set(validas.map((s) => s.parametros?.nivel ?? 1)).size > 1
  return (
    <label className={`cmp-selector ${k}`}>
      <span className="cmp-selector-etq">
        <span className="cmp-punto" aria-hidden="true" />
        {etiqueta}
      </span>
      <select className="entrada" value={valor} onChange={(e) => onCambio(k, e.target.value)} data-testid={`sel-${k}`}>
        {validas.map((s) => (
          <option key={s.id} value={s.id}>
            {etiquetaSesion(s, conNivel)}
          </option>
        ))}
      </select>
    </label>
  )
}

function nombreKpi(d: DefKpi): string {
  return d.aprox && !/aprox/i.test(d.nombre) ? `${d.nombre} (aprox.)` : d.nombre
}

function TarjetaKpi({ k }: { k: KpiValor }) {
  const { def, antes, despues, dif } = k
  const flecha = dif?.direccion === 'sube' ? '▲' : dif?.direccion === 'baja' ? '▼' : '='
  return (
    <div className="tarjeta cmp-kpi" data-testid={`kpi-${def.id}`}>
      <p className="cmp-kpi-nombre">{nombreKpi(def)}</p>
      <p className="cmp-kpi-valores">
        <span className="antes">{formatoKpi({ unidad: def.unidad === '°' || def.unidad === '%' ? def.unidad : '', decimales: decimalesKpi(def) }, antes)}</span>
        <span className="flecha" aria-hidden="true">
          →
        </span>
        <span className="despues">{formatoKpi(def, despues)}</span>
      </p>
      {dif ? (
        <span className={`cmp-delta ${dif.tono}`} data-testid={`delta-${def.id}`}>
          <span aria-hidden="true">{flecha}</span> {dif.texto}
          <span className="sr-only">
            {dif.tono === 'mejor' ? ' (mejor)' : dif.tono === 'otro' ? ' (menor que antes en lo que se busca)' : ''}. Antes {formatoKpi(def, antes)}, después {formatoKpi(def, despues)}.
          </span>
        </span>
      ) : (
        <span className="cmp-delta neutro">sin datos para comparar</span>
      )}
    </div>
  )
}

function PanelDetalle({ juego, antes, despues, evAntes, evDespues }: { juego: string; antes: Sesion; despues: Sesion; evAntes: EventoSesion[]; evDespues: EventoSesion[] }) {
  if (juego === 'muneca-3d') {
    const filas = DIRECCIONES_MUNECA.map((d) => ({ id: d.id, nombre: d.nombre, antes: d.leer(antes), despues: d.leer(despues) }))
    if (filas.every((f) => f.antes == null && f.despues == null)) return null
    return <BarrasPar titulo="Máximos por dirección" nota="Grados aprox. respecto de la mano neutra de cada sesión." filas={filas} unidad="°" />
  }
  if (juego === 'honda') {
    const a = tirosDeHonda(evAntes)
    const b = tirosDeHonda(evDespues)
    return a.length || b.length ? <RepsBanda antes={a} despues={b} /> : null
  }
  if (juego === 'banda-elastica') {
    const a = repsDeBanda(evAntes)
    const b = repsDeBanda(evDespues)
    return a.length || b.length ? <RepsBanda antes={a} despues={b} /> : null
  }
  const fa = antes.metricas?.flexionMax
  const fd = despues.metricas?.flexionMax
  if (!fa && !fd) return null
  const filas = DEDOS_ORDEN.map((id) => ({ id, nombre: NOMBRE_DEDO[id]!, antes: fa?.[id] ?? null, despues: fd?.[id] ?? null }))
  return (
    <>
      <BarrasPar titulo="Flexión máxima por dedo" nota="MCP + PIP, grados aprox. La mano 3D modelo se dobla con estos valores." filas={filas} unidad="°" />
      {juego === 'caja-juguetes' && <TiraAgarres antes={agarresDe(evAntes)} despues={agarresDe(evDespues)} />}
    </>
  )
}
