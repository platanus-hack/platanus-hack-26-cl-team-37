// F16 (versión simple; la prescripción completa es F17): pacientes con el resumen de su plan vigente.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { iniciales } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Estados, Encabezado, Vacio } from '../../ui/piezas'
import { cargarPanel, type DatosPanel } from './datos'
import './terapeuta.css'

export default function Planes() {
  const r = useCarga(cargarPanel, [])
  return (
    <main className="pantalla con-barra terapeuta">
      <Encabezado titulo="Planes" subtitulo="Plan vigente de cada paciente" />
      <Estados r={r}>{(d) => <Lista d={d} />}</Estados>
    </main>
  )
}

function Lista({ d }: { d: DatosPanel }) {
  const pacientes = useMemo(() => [...d.pacientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [d.pacientes])
  if (pacientes.length === 0) return <Vacio titulo="Aún no ves pacientes" texto="Aparecen aquí quienes comparten sus métricas contigo." icono="planes" />
  return (
    <ul className="col sin-vinetas" aria-label="Planes">
      {pacientes.map((p) => {
        const plan = d.planes[p.id]
        return (
          <li key={p.id}>
            <Link to={`/terapeuta/pacientes/${p.id}/plan`} className="tarjeta ter-paciente" data-testid="fila-plan">
              <span className="avatar" aria-hidden="true">
                {iniciales(p.nombre)}
              </span>
              <span className="flex1 ter-textos">
                <strong className="ter-nombre">{p.nombre}</strong>
                {plan ? (
                  <>
                    <span className="ter-sub">
                      Versión {plan.version} · {plan.sesionesPorSemana} {plan.sesionesPorSemana === 1 ? 'día' : 'días'} por semana · {plan.items.length}{' '}
                      {plan.items.length === 1 ? 'ejercicio' : 'ejercicios'}
                    </span>
                    <span className="ter-sub">Aviso de dolor sobre {plan.umbralDolor}/10</span>
                  </>
                ) : (
                  <span className="ter-sub">Sin plan asignado</span>
                )}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
