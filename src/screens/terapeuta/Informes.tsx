// F16 (versión simple): lista de pacientes con datos de resumen. La exportación de informes llega en un feature posterior.
import { useMemo, useState } from 'react'
import { fechaCorta, iniciales } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Estados, Encabezado, Vacio } from '../../ui/piezas'
import { cargarPanel, filasDe, type DatosPanel } from './datos'
import { DIAS_SIN_SESION_DEFECTO } from './panel'
import './terapeuta.css'

export default function Informes() {
  const r = useCarga(cargarPanel, [])
  const [hoy] = useState(() => new Date())
  return (
    <main className="pantalla con-barra terapeuta">
      <Encabezado titulo="Informes" subtitulo="Resumen por paciente" />
      <Estados r={r}>{(d) => <Lista d={d} hoy={hoy} />}</Estados>
    </main>
  )
}

function Lista({ d, hoy }: { d: DatosPanel; hoy: Date }) {
  const filas = useMemo(() => filasDe(d, hoy, DIAS_SIN_SESION_DEFECTO).sort((a, b) => a.paciente.nombre.localeCompare(b.paciente.nombre, 'es')), [d, hoy])
  return (
    <>
      <p className="tarjeta compacta ter-sub" data-testid="aviso-informes">
        Aún no se pueden exportar informes: esa función llegará más adelante. Mientras, aquí ves cuántas sesiones cerradas tiene cada paciente.
      </p>
      {filas.length === 0 ? (
        <Vacio titulo="Aún no ves pacientes" texto="Aparecen aquí quienes comparten sus métricas contigo." icono="informes" />
      ) : (
        <ul className="col sin-vinetas" aria-label="Pacientes">
          {filas.map((f) => (
            <li key={f.paciente.id} className="tarjeta ter-paciente">
              <span className="avatar" aria-hidden="true">
                {iniciales(f.paciente.nombre)}
              </span>
              <span className="flex1 ter-textos">
                <strong className="ter-nombre">{f.paciente.nombre}</strong>
                <span className="ter-sub">
                  {f.sesiones.length} {f.sesiones.length === 1 ? 'sesión cerrada' : 'sesiones cerradas'}
                  {f.sesiones[0]?.inicio ? ` · última el ${fechaCorta(f.sesiones[0].inicio)}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
