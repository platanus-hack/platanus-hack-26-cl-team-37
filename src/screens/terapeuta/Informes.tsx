// F17 · Pestaña Informes: el terapeuta elige un paciente y un período y descarga un PDF o CSV de sus sesiones cerradas.
// Usa la misma exportación del historial (src/historial/exportar.ts): cada archivo queda anotado en Auditoría ANTES de
// entregarse. Solo ve a quienes comparten sus métricas (RLS). Abajo, el resumen por paciente. Solo describe datos.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { repos } from '../../data/repos'
import type { Paciente, Sesion } from '../../domain/types'
import { exportarCsv, exportarPdf, type ContextoExport } from '../../historial/exportar'
import { nombrePeriodo, RANGOS, sesionesDelPeriodo, type Rango } from '../../historial/periodo'
import { fechaCorta, iniciales } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Encabezado, Estados, Vacio, avisar } from '../../ui/piezas'
import { cargarPanel, filasDe, type DatosPanel } from './datos'
import { DIAS_SIN_SESION_DEFECTO } from './panel'
import './terapeuta.css'
import './informes.css'

export default function Informes() {
  const r = useCarga(cargarPanel, [])
  const [hoy] = useState(() => new Date())
  return (
    <main className="pantalla con-barra terapeuta informes">
      <Encabezado titulo="Informes" subtitulo="Exporta las sesiones de un paciente" />
      <Estados r={r}>{(d) => <Contenido d={d} hoy={hoy} />}</Estados>
    </main>
  )
}

const textoSesiones = (n: number) => `${n} ${n === 1 ? 'sesión cerrada' : 'sesiones cerradas'}`

function Contenido({ d, hoy }: { d: DatosPanel; hoy: Date }) {
  const [params, setParams] = useSearchParams()
  const [rango, setRango] = useState<Rango>('4s')
  const filas = useMemo(() => filasDe(d, hoy, DIAS_SIN_SESION_DEFECTO).sort((a, b) => a.paciente.nombre.localeCompare(b.paciente.nombre, 'es')), [d, hoy])
  if (filas.length === 0) return <Vacio titulo="Aún no ves pacientes" texto="Aparecen aquí quienes comparten sus métricas contigo." icono="informes" />

  // El paciente elegido va en la URL (?paciente=<id>): se puede enlazar y sobrevive a recargar.
  const pedido = params.get('paciente')
  const elegido = filas.find((f) => f.paciente.id === pedido)?.paciente ?? filas[0]!.paciente
  const elegir = (id: string) => setParams({ paciente: id }, { replace: true })

  return (
    <div className="informes-columnas">
      <section className="tarjeta informes-exportar col" aria-labelledby="t-exportar">
        <h2 id="t-exportar">Exportar informe</h2>
        <div className="campo">
          <label htmlFor="informe-paciente">Paciente</label>
          <select id="informe-paciente" className="entrada" value={elegido.id} onChange={(e) => elegir(e.target.value)}>
            {filas.map((f) => (
              <option key={f.paciente.id} value={f.paciente.id}>
                {f.paciente.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <span className="rotulo" id="t-periodo">
            Período
          </span>
          <div className="chips en-tarjeta" role="group" aria-labelledby="t-periodo">
            {RANGOS.map((x) => (
              <button key={x.id} type="button" className="chip" aria-pressed={rango === x.id} onClick={() => setRango(x.id)}>
                {x.texto}
              </button>
            ))}
          </div>
        </div>
        <Exportador key={elegido.id} paciente={elegido} rango={rango} hoy={hoy} />
      </section>

      <section className="col" aria-labelledby="t-resumen">
        <h2 id="t-resumen" className="seccion">
          Resumen por paciente
        </h2>
        <ul className="col sin-vinetas" aria-label="Pacientes">
          {filas.map((f) => (
            <li key={f.paciente.id}>
              <button
                type="button"
                className="tarjeta ter-paciente informes-fila"
                aria-pressed={f.paciente.id === elegido.id}
                aria-label={`Elegir a ${f.paciente.nombre} para exportar`}
                onClick={() => elegir(f.paciente.id)}
                data-testid="fila-informe"
              >
                <span className="avatar" aria-hidden="true">
                  {iniciales(f.paciente.nombre)}
                </span>
                <span className="flex1 ter-textos">
                  <strong className="ter-nombre">{f.paciente.nombre}</strong>
                  <span className="ter-sub">
                    {textoSesiones(f.sesiones.length)}
                    {f.sesiones[0]?.inicio ? ` · última el ${fechaCorta(f.sesiones[0].inicio)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

interface DatosExport {
  sesiones: Sesion[]
  terapeuta: string | null
}

/** Sesiones completas del paciente (con muestras y hash: el archivo incluye su integridad) y el nombre de su terapeuta. */
async function cargarExport(p: Paciente): Promise<DatosExport> {
  const [sesiones, terapeuta] = await Promise.all([
    repos.sesiones.listar(p.id),
    p.terapeutaId ? repos.perfiles.nombre(p.terapeutaId).catch(() => null) : Promise.resolve(null),
  ])
  return { sesiones, terapeuta }
}

function Exportador({ paciente, rango, hoy }: { paciente: Paciente; rango: Rango; hoy: Date }) {
  const { usuario } = useAuth()
  const r = useCarga(() => cargarExport(paciente), [paciente.id])
  return (
    <Estados r={r} cargando={<p className="ayuda-campo informes-estado">Cargando sesiones…</p>}>
      {(d) => <Botones ctx={usuario ? { paciente, terapeuta: d.terapeuta, usuario } : null} sesiones={d.sesiones} rango={rango} hoy={hoy} />}
    </Estados>
  )
}

function Botones({ ctx, sesiones, rango, hoy }: { ctx: ContextoExport | null; sesiones: Sesion[]; rango: Rango; hoy: Date }) {
  const [ocupado, setOcupado] = useState<'pdf' | 'csv' | null>(null)
  const periodo = useMemo(() => sesionesDelPeriodo(sesiones, rango, hoy), [sesiones, rango, hoy])
  const vacio = periodo.length === 0

  async function exportar(tipo: 'pdf' | 'csv') {
    if (ocupado || vacio || !ctx) return
    setOcupado(tipo)
    try {
      const nombre = nombrePeriodo(rango, hoy)
      if (tipo === 'pdf') avisar(`PDF listo: ${await exportarPdf(ctx, periodo, nombre)}`)
      else avisar(`CSV listo: ${(await exportarCsv(ctx, periodo, nombre)).join(' y ')}`)
    } catch (e) {
      avisar(!navigator.onLine ? 'Sin conexión: no se pudo exportar. Intenta de nuevo cuando vuelva la red.' : e instanceof Error ? `No se pudo exportar: ${e.message}` : 'No se pudo exportar. Intenta de nuevo.', true)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <p className={vacio ? 'error-campo informes-estado' : 'ayuda-campo informes-estado'} data-testid="cantidad-informe" role="status">
        {vacio ? 'No hay sesiones cerradas en este período. Elige otro período u otro paciente.' : `${textoSesiones(periodo.length)} en este período`}
      </p>
      <div className="informes-acciones">
        <button type="button" className="boton primario" onClick={() => exportar('pdf')} disabled={vacio || !!ocupado || !ctx} data-testid="informe-pdf">
          {ocupado === 'pdf' ? 'Preparando…' : 'Exportar PDF'}
        </button>
        <button type="button" className="boton secundario" onClick={() => exportar('csv')} disabled={vacio || !!ocupado || !ctx} data-testid="informe-csv">
          {ocupado === 'csv' ? 'Preparando…' : 'CSV'}
        </button>
      </div>
      <p className="ayuda-campo">
        El CSV trae dos archivos: uno con una fila por sesión y otro con los eventos. Cada exportación queda anotada en la auditoría. Mediciones estimadas con cámara; no reemplazan la evaluación
        clínica.
      </p>
    </>
  )
}
