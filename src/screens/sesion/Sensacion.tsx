// F12 · Dolor y esfuerzo (docs/referencia/imagenes/07_dolor_y_esfuerzo.png).
// Llega desde /jugar con la Sesion 'en curso'. Guarda dolor EVA (obligatorio), esfuerzo y nota con repos (no cierra:
// el cierre con hash es de /resumen, F13). Dolor ≥ umbral del plan de la sesión → Alerta para el terapeuta.
import { useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import { EVA_MAX, EVA_MIN, NOTA_MAX, pasoEva, planDeSesion, requiereAlerta, sensacionAGuardar } from '../../domain/sensacion'
import { ESFUERZOS, type Esfuerzo, type Sesion } from '../../domain/types'
import { useCarga } from '../../lib/useCarga'
import { Icono } from '../../ui/Icono'
import { avisar, BarraAccion, Encabezado, Estados, Vacio } from '../../ui/piezas'

interface DatosSensacion {
  sesion: Sesion
  umbral: number | null
}

// Siempre devuelve un objeto (Estados trata `null` como "cargando").
async function cargarSensacion(id: string): Promise<{ datos: DatosSensacion | null }> {
  const sesion = await repos.sesiones.obtener(id)
  if (!sesion) return { datos: null }
  const [versiones, vigente] = await Promise.all([
    sesion.planVersion != null ? repos.planes.versiones(sesion.pacienteId) : Promise.resolve([]),
    repos.planes.vigente(sesion.pacienteId),
  ])
  return { datos: { sesion, umbral: planDeSesion(sesion, versiones, vigente)?.umbralDolor ?? null } }
}

export default function Sensacion() {
  const { id = '' } = useParams()
  const { search } = useLocation()
  const r = useCarga(() => cargarSensacion(id), [id])
  const s = r.datos?.datos?.sesion
  const lista = r.estado === 'listo' && s?.estado === 'en curso'

  return (
    <main className={`pantalla sensacion ${lista ? 'con-boton' : ''}`}>
      {lista ? (
        <header className="sensacion-cabeza">
          <span className="sensacion-emoji" aria-hidden="true">
            🎉
          </span>
          <h1>¡Sesión completada!</h1>
          <p className="tenue">Cuéntanos cómo te sentiste</p>
        </header>
      ) : (
        <Encabezado titulo="¿Cómo te sentiste?" />
      )}
      <Estados r={r}>
        {({ datos: d }) =>
          !d ? (
            <Vacio titulo="No encontramos esta sesión" texto="Prepárala de nuevo desde tus ejercicios." icono="ejercicios" accion={<Link to="/ejercicios" className="boton secundario chico">Ver ejercicios</Link>} />
          ) : d.sesion.estado === 'cerrada' ? (
            <Vacio titulo="Esta sesión ya está cerrada" texto="Lo que sentiste ya quedó registrado." icono="historial" accion={<Link to={`/sesion/${id}/resumen${search}`} className="boton secundario chico">Ver resumen</Link>} />
          ) : d.sesion.estado === 'preparada' ? (
            <Vacio titulo="Esta sesión todavía no se juega" texto="Primero calibra y juega; al terminar te preguntamos cómo te sentiste." icono="ejercicios" accion={<Link to={`/sesion/${id}/calibrar${search}`} className="boton secundario chico">Ir a calibrar</Link>} />
          ) : (
            <Formulario datos={d} />
          )
        }
      </Estados>
    </main>
  )
}

function Formulario({ datos }: { datos: DatosSensacion }) {
  const nav = useNavigate()
  const { search } = useLocation()
  const { sesion, umbral } = datos
  // Sin valor preseleccionado; si ya se había guardado (volvió desde el resumen), se muestra lo guardado.
  const [dolor, setDolor] = useState<number | null>(sesion.dolorEVA)
  const [esfuerzo, setEsfuerzo] = useState<Esfuerzo | null>(sesion.esfuerzo)
  const [nota, setNota] = useState(sesion.nota ?? '')
  const [guardando, setGuardando] = useState(false)
  const alerta = requiereAlerta(dolor, umbral)
  const marcado = dolor !== null
  const posicion = ((dolor ?? 5) / EVA_MAX) * 100

  async function guardar() {
    const cambios = sensacionAGuardar(dolor, esfuerzo, nota)
    if (!cambios) return
    setGuardando(true)
    try {
      await repos.sesiones.actualizar(sesion.id, cambios)
      if (requiereAlerta(cambios.dolorEVA, umbral)) {
        // Una alerta de dolor por sesión: si ya existe (guardó dos veces), no se repite.
        const previas = await repos.alertas.deSesion(sesion.id)
        if (!previas.some((a) => a.tipo === 'dolor')) await repos.alertas.crear({ pacienteId: sesion.pacienteId, sesionId: sesion.id, tipo: 'dolor', valor: cambios.dolorEVA })
        avisar('Avisamos a tu terapeuta de tu dolor.')
      }
      nav(`/sesion/${sesion.id}/resumen${search}`)
    } catch (e) {
      setGuardando(false)
      avisar(!navigator.onLine ? 'Sin conexión: no pudimos guardar. Intenta de nuevo.' : `No pudimos guardar: ${e instanceof Error ? e.message : e}`, true)
    }
  }

  return (
    <>
      <section className="tarjeta sensacion-tarjeta" aria-labelledby="t-dolor">
        <div className="fila entre">
          <h2 id="t-dolor">Dolor durante la sesión</h2>
          <span className={`sensacion-valor ${marcado ? '' : 'vacio'}`} data-testid="eva" aria-live="polite">
            <b>{marcado ? dolor : '–'}</b>/{EVA_MAX}
          </span>
        </div>
        <div className="fila sensacion-eva">
          <button type="button" className="boton-paso" aria-label="Menos dolor" disabled={dolor === null || dolor <= EVA_MIN} onClick={() => setDolor((v) => pasoEva(v, -1))}>
            <Icono nombre="menos" />
          </button>
          <input
            type="range"
            className={`deslizador eva flex1 ${marcado ? '' : 'sin-valor'}`}
            min={EVA_MIN}
            max={EVA_MAX}
            step={1}
            value={dolor ?? 5}
            aria-label="Dolor durante la sesión, de 0 a 10"
            aria-valuetext={marcado ? `${dolor} de 10` : 'Sin marcar'}
            style={{ '--p': `${posicion}%` } as CSSProperties}
            onChange={(e) => setDolor(Number(e.target.value))}
            // Sin valor, tocar justo donde está el punto (5) no dispara onChange: el clic también marca.
            onClick={(e) => setDolor(Number(e.currentTarget.value))}
          />
          <button type="button" className="boton-paso" aria-label="Más dolor" disabled={dolor !== null && dolor >= EVA_MAX} onClick={() => setDolor((v) => pasoEva(v, 1))}>
            <Icono nombre="mas" />
          </button>
        </div>
        <div className="sensacion-etiquetas tenue" aria-hidden="true">
          <span>Sin dolor</span>
          <span>Moderado</span>
          <span>Máximo</span>
        </div>
        {alerta && (
          <p className="sensacion-aviso" role="status">
            <Icono nombre="campana" tam={18} />
            Tu terapeuta será avisado de este dolor al guardar.
          </p>
        )}
      </section>

      <section className="tarjeta sensacion-tarjeta" aria-labelledby="t-esfuerzo">
        <h2 id="t-esfuerzo">Esfuerzo percibido</h2>
        <div className="chips en-tarjeta sensacion-chips" role="group" aria-labelledby="t-esfuerzo">
          {ESFUERZOS.map((op) => (
            <button key={op} type="button" className="chip" aria-pressed={esfuerzo === op} onClick={() => setEsfuerzo((v) => (v === op ? null : op))}>
              {op}
            </button>
          ))}
        </div>
      </section>

      <section className="tarjeta sensacion-tarjeta" aria-labelledby="t-nota">
        <div className="fila entre">
          <h2 id="t-nota">Nota para tu terapeuta</h2>
          <span className="tenue chico" data-testid="contador-nota">
            {nota.length}/{NOTA_MAX}
          </span>
        </div>
        <textarea
          className="entrada sensacion-nota"
          aria-labelledby="t-nota"
          maxLength={NOTA_MAX}
          rows={2}
          placeholder="Opcional: algo que quieras contarle"
          value={nota}
          onChange={(e) => setNota(e.target.value.slice(0, NOTA_MAX))}
        />
      </section>

      <BarraAccion>
        {!marcado && <p className="tenue chico centro">Marca tu dolor (toca la barra o +) para guardar</p>}
        <button type="button" className="boton primario bloque grande-accion" disabled={!marcado || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar y ver resumen'}
        </button>
      </BarraAccion>
    </>
  )
}
