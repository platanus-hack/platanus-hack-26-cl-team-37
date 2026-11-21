// F17 · /terapeuta/pacientes/:id/plan (docs/referencia/imagenes/12_prescripcion.png).
// El plan nunca se edita: "Enviar plan" crea una versión NUEVA (RPC crear_version_plan, que también escribe la auditoría).
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Paciente, Plan, Sesion } from '../../domain/types'
import { nombreJuego } from '../../games/registry'
import { iniciales, num } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { semanaTratamiento } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { BarraAccion, Estados, Hoja, Sparkline, Stepper, Vacio, avisar } from '../../ui/piezas'
import { condicionOMano } from './panel'
import {
  META_PINZA_MAX,
  META_PINZA_MIN,
  META_PINZA_PASO,
  MENSAJE_MAX,
  NIVEL_MAX,
  NIVEL_MIN,
  SESIONES_MAX,
  SESIONES_MIN,
  UMBRAL_MAX,
  UMBRAL_MIN,
  borradorDe,
  cambiado,
  cambios,
  datosDeEnvio,
  juegosDelPlan,
  tendenciaPinza,
  validar,
  type Borrador,
  type Campo,
  type Tendencia,
} from './edicionPlan'
import './prescripcion.css'

interface Datos {
  paciente: Paciente
  plan: Plan
  sesiones: Sesion[]
}

async function cargar(id: string): Promise<Datos | null> {
  const paciente = (await repos.pacientes.deTerapeuta()).find((p) => p.id === id && p.compartirMetricas)
  if (!paciente) return null
  const [plan, sesiones] = await Promise.all([repos.planes.vigente(id), repos.sesiones.listar(id)])
  if (!plan) return null
  return { paciente, plan, sesiones }
}

export default function Prescripcion() {
  const { id = '' } = useParams()
  const r = useCarga(() => cargar(id), [id])
  return (
    <main className="pantalla prescripcion">
      {r.estado === 'listo' && r.datos === null ? (
        <>
          <Cabecera />
          <Vacio titulo="No hay un plan para mostrar" texto="El paciente no existe, no comparte sus métricas contigo o aún no tiene plan." icono="planes" />
        </>
      ) : (
        <Estados r={r}>{(d) => <Editor key={id} inicial={d!} />}</Estados>
      )}
    </main>
  )
}

function Cabecera({ paciente, semana }: { paciente?: Paciente; semana?: number }) {
  const nav = useNavigate()
  const volver = () => (window.history.state?.idx > 0 ? nav(-1) : nav('/terapeuta/pacientes'))
  return (
    <header className="encabezado presc-cabecera">
      <button className="boton-icono" aria-label="Volver" onClick={volver}>
        <Icono nombre="atras" />
      </button>
      {paciente ? (
        <>
          <span className="avatar presc-avatar" aria-hidden="true">
            {iniciales(paciente.nombre)}
          </span>
          <div className="textos">
            <h1 style={{ fontSize: 22 }}>{paciente.nombre}</h1>
            <p className="subtitulo">
              {condicionOMano(paciente)} · semana {semana}
            </p>
          </div>
        </>
      ) : (
        <div className="textos">
          <h1 style={{ fontSize: 22 }}>Plan del paciente</h1>
        </div>
      )}
    </header>
  )
}

function Editor({ inicial }: { inicial: Datos }) {
  const { paciente, sesiones } = inicial
  const [plan, setPlan] = useState(inicial.plan)
  const [b, setB] = useState<Borrador>(() => borradorDe(inicial.plan))
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const [hoy] = useState(() => new Date())
  const tendencia = tendenciaPinza(sesiones, plan, hoy)
  const lista = cambios(plan, b)
  const invalido = validar(plan, b)
  const marca = (campo: Campo, juego?: string) => cambiado(plan, b, campo, juego)
  const poner = (parcial: Partial<Borrador>) => setB((x) => ({ ...x, ...parcial }))

  async function enviar() {
    if (enviando || invalido || lista.length === 0) return
    setEnviando(true)
    setErrorEnvio(null)
    try {
      const nuevo = await repos.planes.crearVersion(paciente.id, datosDeEnvio(plan, b))
      setPlan(nuevo)
      setB(borradorDe(nuevo))
      setConfirmando(false)
      avisar('Plan actualizado')
    } catch {
      setErrorEnvio('No se pudo enviar el plan. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Cabecera paciente={paciente} semana={semanaTratamiento(paciente.fechaInicio, hoy)} />

      <TarjetaTendencia t={tendencia} />

      <h2 className="seccion">Plan semanal</h2>
      <p className="presc-version" data-testid="version-plan">
        Versión {plan.version} del plan
      </p>
      <ul className="col sin-vinetas" aria-label="Plan semanal">
        {juegosDelPlan(plan).map((j) => (
          <Fila key={j} titulo={nombreJuego(j)} detalle="Nivel de dificultad" cambiado={marca('nivel', j)} testid={`fila-nivel-${j}`}>
            <Stepper
              valor={b.niveles[j] ?? NIVEL_MIN}
              min={NIVEL_MIN}
              max={NIVEL_MAX}
              onCambio={(v) => poner({ niveles: { ...b.niveles, [j]: v } })}
              etiqueta={`nivel de ${nombreJuego(j)}`}
              cambiado={marca('nivel', j)}
            />
          </Fila>
        ))}
        <Fila titulo="Frecuencia" detalle="Sesiones por semana" cambiado={marca('sesiones')} testid="fila-sesiones">
          <Stepper valor={b.sesionesPorSemana} min={SESIONES_MIN} max={SESIONES_MAX} onCambio={(v) => poner({ sesionesPorSemana: v })} etiqueta="sesiones por semana" cambiado={marca('sesiones')} />
        </Fila>
        <Fila titulo="Meta de pinza" detalle="Apertura máxima (aprox. en cm)" cambiado={marca('metaPinza')} testid="fila-meta">
          <Stepper
            valor={b.metaPinzaCm}
            min={META_PINZA_MIN}
            max={META_PINZA_MAX}
            paso={META_PINZA_PASO}
            onCambio={(v) => poner({ metaPinzaCm: v })}
            formato={(v) => num(v, 1)}
            etiqueta="meta de pinza en centímetros"
            cambiado={marca('metaPinza')}
          />
        </Fila>
        <Fila titulo="Aviso por dolor" detalle="Alertarme si EVA es ≥" cambiado={marca('umbral')} testid="fila-umbral">
          <Stepper valor={b.umbralDolor} min={UMBRAL_MIN} max={UMBRAL_MAX} onCambio={(v) => poner({ umbralDolor: v })} etiqueta="aviso por dolor" cambiado={marca('umbral')} />
        </Fila>
      </ul>

      <section className={`tarjeta presc-mensaje ${marca('mensaje') ? 'cambiado' : ''}`} data-cambiado={marca('mensaje') ? 'si' : 'no'}>
        <label htmlFor="presc-mensaje">Mensaje para el paciente</label>
        <textarea
          id="presc-mensaje"
          className="presc-texto"
          rows={2}
          maxLength={MENSAJE_MAX}
          placeholder="Escribe un mensaje opcional"
          value={b.mensaje}
          onChange={(e) => poner({ mensaje: e.target.value })}
        />
        <span className="presc-contador">
          {b.mensaje.length}/{MENSAJE_MAX}
        </span>
      </section>

      <BarraAccion>
        {invalido && (
          <p className="presc-error" role="alert">
            {invalido}
          </p>
        )}
        <button className="boton primario bloque" disabled={lista.length === 0 || !!invalido} onClick={() => setConfirmando(true)}>
          Enviar plan
        </button>
      </BarraAccion>

      <Hoja abierta={confirmando} onCerrar={() => !enviando && setConfirmando(false)} titulo="Confirmar plan nuevo">
        <div className="col">
          <h2 style={{ fontSize: 20 }}>Confirmar plan nuevo</h2>
          <p className="sobretitulo">
            Se creará la versión {plan.version + 1}. La versión {plan.version} queda guardada tal como está.
          </p>
          <ul className="col sin-vinetas presc-resumen" aria-label="Cambios del plan">
            {lista.map((c) => (
              <li key={`${c.campo}-${c.juego ?? ''}`} className="presc-cambio" data-testid="cambio">
                <span className="presc-cambio-nombre">{c.etiqueta}</span>
                {c.campo === 'mensaje' ? (
                  <span className="presc-cambio-mensaje">«{c.despues}»</span>
                ) : (
                  <span className="presc-cambio-valor">
                    {c.antes} → <strong>{c.despues}</strong>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {errorEnvio && (
            <p className="presc-error" role="alert">
              {errorEnvio}
            </p>
          )}
          <button className="boton primario bloque" onClick={enviar} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Confirmar y enviar'}
          </button>
          <button className="boton secundario bloque" onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </Hoja>
    </>
  )
}

function TarjetaTendencia({ t }: { t: Tendencia }) {
  const hay = t.primero != null && t.ultimo != null && t.valores.length >= 2
  return (
    <section className="tarjeta presc-tendencia" aria-label="Tendencia de apertura de pinza" data-testid="tendencia">
      <div className="flex1">
        <p className="sobretitulo">Apertura de pinza · 4 semanas</p>
        {hay ? (
          <p className="presc-tendencia-valor">
            {num(t.primero, 1)} → {num(t.ultimo, 1)} cm
            {t.pct != null && Math.round(t.pct) !== 0 && (
              <span className={`presc-pct ${t.pct > 0 ? 'sube' : 'baja'}`}>
                {' '}
                {t.pct > 0 ? '▲' : '▼'} {Math.abs(Math.round(t.pct))}%
              </span>
            )}
          </p>
        ) : (
          <p className="presc-tendencia-vacio">Aún no hay sesiones suficientes en las últimas 4 semanas.</p>
        )}
      </div>
      {hay && <Sparkline valores={t.valores} ancho={190} alto={56} color="var(--acento)" />}
    </section>
  )
}

function Fila({ titulo, detalle, cambiado, testid, children }: { titulo: string; detalle: string; cambiado: boolean; testid: string; children: ReactNode }) {
  return (
    <li className={`tarjeta presc-fila ${cambiado ? 'cambiado' : ''}`} data-testid={testid} data-cambiado={cambiado ? 'si' : 'no'}>
      <div className="flex1 presc-textos">
        <strong className="presc-titulo">{titulo}</strong>
        <span className="presc-detalle">{detalle}</span>
      </div>
      {children}
    </li>
  )
}
