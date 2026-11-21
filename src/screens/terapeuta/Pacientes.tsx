// F16 · Pacientes del terapeuta (docs/referencia/imagenes/11_terapeuta_pacientes.png).
// Solo pacientes que comparten métricas (RLS). Alertas: dolor sobre el umbral del plan y días sin sesiones.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { useCerrarSesion } from '../../auth/useCerrarSesion'
import { iniciales, pctCorto } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Icono } from '../../ui/Icono'
import { Estados, Sparkline, Vacio } from '../../ui/piezas'
import { cargarPanel, filasDe, useDiasSinSesion, type DatosPanel } from './datos'
import { condicionOMano, filtrarPorNombre, indicadores, ordenar, textoDolor, textoSinSesiones, type FilaPaciente } from './panel'
import './terapeuta.css'

export default function Pacientes() {
  const { usuario } = useAuth()
  const r = useCarga(cargarPanel, [])
  const [hoy] = useState(() => new Date())
  const nombre = usuario?.nombre ?? ''
  const cerrar = useCerrarSesion()
  return (
    <main className="pantalla con-barra terapeuta">
      <header className="fila entre">
        <div className="flex1">
          <p className="sobretitulo">{[usuario?.titulo, nombre].filter(Boolean).join(' ')}</p>
          <h1>Mis pacientes</h1>
        </div>
        <button type="button" className="boton secundario ter-salir" onClick={cerrar} aria-label="Cerrar sesión">
          <Icono nombre="salir" />
          Salir
        </button>
        <div className="avatar acento ter-avatar" aria-hidden="true">
          {iniciales(nombre)}
        </div>
      </header>
      <Estados r={r}>{(d) => <Contenido d={d} hoy={hoy} />}</Estados>
    </main>
  )
}

function Contenido({ d, hoy }: { d: DatosPanel; hoy: Date }) {
  const [dias] = useDiasSinSesion()
  const [texto, setTexto] = useState('')
  const filas = useMemo(() => filasDe(d, hoy, dias), [d, hoy, dias])
  const ind = useMemo(() => indicadores(filas, d.alertas), [filas, d.alertas])
  const visibles = useMemo(() => ordenar(filtrarPorNombre(filas, texto)), [filas, texto])

  if (filas.length === 0)
    return (
      <Vacio
        titulo="Aún no ves pacientes"
        texto="Aparecen aquí quienes tienen activado «Compartir métricas con mi terapeuta»."
        icono="pacientes"
      />
    )
  return (
    <>
      <div className="grid3 ter-indicadores" role="group" aria-label="Resumen">
        <div className="tarjeta compacta">
          <p className="ter-cifra" data-testid="ind-activos">{ind.activos}</p>
          <p className="ter-etiqueta">{ind.activos === 1 ? 'activo' : 'activos'}</p>
        </div>
        <div className="tarjeta compacta">
          <p className={`ter-cifra ${ind.alertas > 0 ? 'alerta' : ''}`} data-testid="ind-alertas">{ind.alertas}</p>
          <p className="ter-etiqueta">{ind.alertas === 1 ? 'alerta' : 'alertas'}</p>
        </div>
        <div className="tarjeta compacta">
          <p className="ter-cifra" data-testid="ind-adherencia">{pctCorto(ind.adherenciaMedia)}</p>
          <p className="ter-etiqueta">adherencia</p>
        </div>
      </div>

      <label className="ter-buscar">
        <Icono nombre="buscar" tam={20} />
        <input
          type="search"
          className="entrada"
          placeholder="Buscar por nombre"
          aria-label="Buscar paciente por nombre"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>

      {visibles.length === 0 ? (
        <Vacio titulo="Sin resultados" texto={`Ningún paciente coincide con «${texto.trim()}».`} icono="buscar" />
      ) : (
        <ul className="col sin-vinetas" aria-label="Pacientes">
          {visibles.map((f) => (
            <li key={f.paciente.id}>
              <FilaPacienteVista f={f} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function FilaPacienteVista({ f }: { f: FilaPaciente }) {
  const p = f.paciente
  return (
    <Link to={`/terapeuta/pacientes/${p.id}/plan`} className={`tarjeta ter-paciente ${f.conAlerta ? 'con-alerta' : ''}`} data-testid="fila-paciente">
      <span className="avatar" aria-hidden="true">
        {iniciales(p.nombre)}
      </span>
      <span className="flex1 ter-textos">
        <strong className="ter-nombre">{p.nombre}</strong>
        <span className="ter-sub">
          {condicionOMano(p)} · semana {f.semana}
        </span>
        {f.dolor && (
          <span className="ter-aviso" data-testid="aviso-dolor">
            <Icono nombre="alerta" tam={16} /> {textoDolor(f.dolor.valor)}
          </span>
        )}
        {f.sinSesiones != null && (
          <span className="ter-aviso" data-testid="aviso-inactividad">
            <Icono nombre="alerta" tam={16} /> {textoSinSesiones(f.sinSesiones)}
          </span>
        )}
      </span>
      <span className="ter-lado">
        <span role="img" aria-label={f.serie.length > 1 ? `Apertura de pinza en las últimas ${f.serie.length} sesiones` : 'Sin datos suficientes de apertura de pinza'}>
          <Sparkline valores={f.serie} ancho={74} alto={30} color={f.conAlerta ? 'var(--alerta)' : 'var(--exito)'} />
        </span>
        <strong className="ter-adh" aria-label={f.adherencia == null ? 'Sin plan' : `Adherencia ${pctCorto(f.adherencia)}`}>
          {pctCorto(f.adherencia)}
        </strong>
      </span>
    </Link>
  )
}
