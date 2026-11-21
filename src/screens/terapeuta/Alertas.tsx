// F16 · Pestaña Alertas: lista las abiertas y permite marcar las de dolor como revisadas (queda en Auditoría por RPC).
// "Sin sesiones hace N días" se calcula con las sesiones: se quita sola cuando el paciente vuelve a entrenar.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { repos } from '../../data/repos'
import { fechaCorta } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Estados, Encabezado, Stepper, Vacio, avisar } from '../../ui/piezas'
import { cargarPanel, filasDe, useDiasSinSesion, type DatosPanel } from './datos'
import { DIAS_SIN_SESION_MAX, DIAS_SIN_SESION_MIN, textoDolor, textoSinSesiones } from './panel'
import './terapeuta.css'

export default function Alertas() {
  const r = useCarga(cargarPanel, [])
  const [hoy] = useState(() => new Date())
  return (
    <main className="pantalla con-barra terapeuta">
      <Encabezado titulo="Alertas" subtitulo="Pacientes que comparten sus métricas contigo" />
      <Estados r={r}>{(d) => <Lista d={d} hoy={hoy} recargar={r.recargar} />}</Estados>
    </main>
  )
}

function Lista({ d, hoy, recargar }: { d: DatosPanel; hoy: Date; recargar: () => void }) {
  const [dias, setDias] = useDiasSinSesion()
  const [ocupada, setOcupada] = useState<string | null>(null)
  const nombres = useMemo(() => new Map(d.pacientes.map((p) => [p.id, p.nombre])), [d.pacientes])
  const filas = useMemo(() => filasDe(d, hoy, dias), [d, hoy, dias])
  const dolor = d.alertas.filter((a) => a.tipo === 'dolor' && a.estado === 'abierta' && nombres.has(a.pacienteId))
  const inactivos = filas.filter((f) => f.sinSesiones != null)

  async function revisar(id: string) {
    setOcupada(id)
    try {
      await repos.alertas.revisar(id)
      avisar('Alerta marcada como revisada.')
      recargar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo marcar la alerta. Intenta de nuevo.', true)
    } finally {
      setOcupada(null)
    }
  }

  return (
    <>
      <div className="tarjeta compacta fila entre ter-config">
        <span className="flex1">
          <strong>Avisar sin sesiones desde</strong>
          <span className="ter-sub">Días seguidos sin entrenar</span>
        </span>
        <Stepper valor={dias} min={DIAS_SIN_SESION_MIN} max={DIAS_SIN_SESION_MAX} onCambio={setDias} formato={(v) => `${v} ${v === 1 ? 'día' : 'días'}`} etiqueta="días sin sesiones" />
      </div>

      {dolor.length === 0 && inactivos.length === 0 ? (
        <Vacio titulo="Sin alertas abiertas" texto="Cuando un paciente supere su umbral de dolor o pase varios días sin sesiones, aparecerá aquí." icono="alerta" />
      ) : (
        <ul className="col sin-vinetas" aria-label="Alertas abiertas">
          {dolor.map((a) => (
            <li key={a.id} className="tarjeta peligro ter-alerta" data-testid="alerta-dolor">
              <div className="flex1 ter-textos">
                <Link to={`/terapeuta/pacientes/${a.pacienteId}/plan`} className="ter-nombre ter-enlace">
                  {nombres.get(a.pacienteId)}
                </Link>
                <span className="ter-aviso">{textoDolor(a.valor ?? 0)}</span>
                <span className="ter-sub">Registrada el {fechaCorta(a.creada)}</span>
              </div>
              <button type="button" className="boton secundario chico" disabled={ocupada === a.id} onClick={() => revisar(a.id)}>
                Marcar revisada
              </button>
            </li>
          ))}
          {inactivos.map((f) => (
            <li key={f.paciente.id} className="tarjeta peligro ter-alerta" data-testid="alerta-inactividad">
              <div className="flex1 ter-textos">
                <Link to={`/terapeuta/pacientes/${f.paciente.id}/plan`} className="ter-nombre ter-enlace">
                  {f.paciente.nombre}
                </Link>
                <span className="ter-aviso">{textoSinSesiones(f.sinSesiones!)}</span>
                <span className="ter-sub">Se quita sola cuando vuelva a entrenar</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
