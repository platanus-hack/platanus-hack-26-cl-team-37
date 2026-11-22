// F17 · /terapeuta/pacientes/:id/plan (docs/referencia/imagenes/12_prescripcion.png).
// El plan nunca se edita: «Enviar plan» crea una versión NUEVA (RPC crear_version_plan, que también escribe la
// auditoría con el antes y el después). La lógica de edición es pura y vive en edicionPlan.ts. Solo describe datos.
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Paciente, Plan, Sesion } from '../../domain/types'
import { juegoPorId, nivelDe, nombreJuego } from '../../games/registry'
import type { MetaJuego } from '../../games/shell/contrato'
import { fechaCorta, iniciales, num } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { semanaTratamiento } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { BarraAccion, Estados, Hoja, Sparkline, Stepper, Vacio, avisar } from '../../ui/piezas'
import { condicionOMano } from './panel'
import {
  META_JUEGO_MAX,
  META_JUEGO_MIN,
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
  agregarJuego,
  cambios,
  datosDeEnvio,
  ejerciciosEnPantalla,
  estadoEjercicio,
  itemNuevo,
  juegosParaAgregar,
  quitarJuego,
  tendenciaPinza,
  textoMetaJuego,
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

/** null = el paciente no existe, no comparte sus métricas con este terapeuta o aún no tiene plan. */
async function cargar(id: string): Promise<Datos | null> {
  // Se busca en la lista del terapeuta (la BD ya oculta a quien no comparte): un id cualquiera no llega a consultarse.
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
    <main className="pantalla prescripcion ancha">
      {!r.datos && <Cabecera />}
      <Estados
        r={r}
        vacio={
          <Vacio
            titulo="No hay un plan para mostrar"
            texto="El paciente no existe, no comparte sus métricas contigo o aún no tiene un plan."
            icono="planes"
            accion={
              <Link to="/terapeuta/pacientes" className="boton secundario chico">
                Ver pacientes
              </Link>
            }
          />
        }
      >
        {(d) => <Editor key={d.paciente.id} inicial={d} />}
      </Estados>
    </main>
  )
}

function Cabecera({ paciente, semana }: { paciente?: Paciente; semana?: number }) {
  const nav = useNavigate()
  // Volver: atrás en el historial si se llegó navegando; si se abrió directo, a la lista de pacientes.
  const volver = () => (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? nav(-1) : nav('/terapeuta/pacientes'))
  return (
    <header className="encabezado con-atras presc-cabecera">
      <button type="button" className="boton-icono" aria-label="Volver" onClick={volver}>
        <Icono nombre="atras" />
      </button>
      {paciente && (
        <span className="avatar acento presc-avatar" aria-hidden="true">
          {iniciales(paciente.nombre)}
        </span>
      )}
      <div className="textos">
        <h1>{paciente ? paciente.nombre : 'Plan del paciente'}</h1>
        {paciente && (
          <p className="subtitulo">
            {condicionOMano(paciente)} · semana {semana}
          </p>
        )}
      </div>
    </header>
  )
}

/** Rótulo y unidad de la meta de cada juego (viven en su módulo, que se carga aparte). Si no cargan, queda un texto general. */
function useMetasJuego(ids: string[]): Record<string, MetaJuego> {
  const [metas, setMetas] = useState<Record<string, MetaJuego>>({})
  const clave = ids.join(',')
  useEffect(() => {
    let vivo = true
    for (const id of clave.split(',').filter(Boolean)) {
      const cargarModulo = juegoPorId(id)?.crear
      if (!cargarModulo) continue
      cargarModulo()
        .then((crear) => {
          const meta = crear().meta
          if (vivo) setMetas((m) => ({ ...m, [id]: meta }))
        })
        .catch(() => undefined)
    }
    return () => {
      vivo = false
    }
  }, [clave])
  return metas
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function Editor({ inicial }: { inicial: Datos }) {
  const { paciente, sesiones } = inicial
  const [plan, setPlan] = useState(inicial.plan)
  const [b, setB] = useState<Borrador>(() => borradorDe(inicial.plan))
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [hoy] = useState(() => new Date())

  const juegos = ejerciciosEnPantalla(plan, b)
  const metas = useMetasJuego(juegos)
  const paraAgregar = juegosParaAgregar(plan, b)
  const [aAgregar, setAAgregar] = useState('')
  const elegido = paraAgregar.includes(aAgregar) ? aAgregar : (paraAgregar[0] ?? '')
  const tendencia = tendenciaPinza(sesiones, plan, hoy)
  const lista = cambios(plan, b)
  const invalido = validar(plan, b)
  const marca = (campo: Campo, juego?: string) => cambiado(plan, b, campo, juego)
  const poner = (parcial: Partial<Borrador>) => setB((x) => ({ ...x, ...parcial }))
  const primerNombre = paciente.nombre.trim().split(/\s+/)[0] || 'el paciente'

  /** Qué significa la meta de ese juego con los valores del borrador (0 = práctica libre). */
  function detalleMeta(juego: string): string {
    const valor = b.metas[juego] ?? 0
    if (valor <= 0) return 'Práctica libre: termina por tiempo'
    const meta = metas[juego]
    const item = plan.items.find((it) => it.juego === juego) ?? itemNuevo(plan, b, juego)
    if (!meta) return 'Repeticiones por sesión'
    const enJuego = meta.desdePlan({ nivel: b.niveles[juego] ?? item.nivel, duracionMin: item.duracionMin, metaAgarres: valor, metaPinzaCm: item.metaPinzaCm })
    return enJuego > 0 && enJuego !== valor ? `En el juego: ${enJuego} ${meta.unidad}` : `${mayuscula(meta.unidad)} por sesión`
  }

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
      setErrorEnvio(!navigator.onLine ? 'Sin conexión: el plan no se envió. Inténtalo de nuevo cuando vuelva la red.' : 'No se pudo enviar el plan. Inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Cabecera paciente={paciente} semana={semanaTratamiento(paciente.fechaInicio, hoy)} />

      {/* En móvil las dos columnas no existen (display: contents); en escritorio van lado a lado. */}
      <div className="presc-columna">
        <TarjetaTendencia t={tendencia} />
        <div className="presc-enlaces">
          <Link to={`/historial?paciente=${encodeURIComponent(paciente.id)}`} className="boton secundario chico" data-testid="ir-historial">
            <Icono nombre="historial" tam={20} />
            Ver historial
          </Link>
          <Link to={`/terapeuta/pacientes/${paciente.id}/comparar`} className="boton secundario chico">
            <Icono nombre="tendencia" tam={20} />
            Comparar sesiones
          </Link>
        </div>

        <section className="col" aria-labelledby="t-plan">
          <div className="presc-titulo-seccion">
            <h2 id="t-plan" className="seccion">
              Plan semanal
            </h2>
            <span className="presc-version" data-testid="version-plan">
              Versión {plan.version} · desde el {fechaCorta(plan.vigenteDesde)}
            </span>
          </div>
          <ul className="col sin-vinetas" aria-label="Plan semanal">
            <Fila tarjeta titulo="Frecuencia" detalle="Sesiones por semana" cambiado={marca('sesiones')} testid="fila-sesiones">
              <Stepper valor={b.sesionesPorSemana} min={SESIONES_MIN} max={SESIONES_MAX} onCambio={(v) => poner({ sesionesPorSemana: v })} etiqueta="sesiones por semana" cambiado={marca('sesiones')} />
            </Fila>
            {b.juegos.length > 0 && (
              <Fila tarjeta titulo="Meta de pinza" detalle="Apertura aprox. (cm)" cambiado={marca('metaPinza')} testid="fila-pinza">
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
            )}
            <Fila tarjeta titulo="Aviso por dolor" detalle={'Alertarme si EVA es\u00a0≥'} cambiado={marca('umbral')} testid="fila-umbral">
              <Stepper valor={b.umbralDolor} min={UMBRAL_MIN} max={UMBRAL_MAX} onCambio={(v) => poner({ umbralDolor: v })} etiqueta="aviso por dolor" cambiado={marca('umbral')} />
            </Fila>
          </ul>
        </section>
      </div>

      <div className="presc-columna">
        <section className="col" aria-labelledby="t-ejercicios">
          <h2 id="t-ejercicios" className="seccion">
            Ejercicios del plan
          </h2>
          {juegos.length === 0 ? (
            <p className="tarjeta presc-sin-ejercicios">Este plan no tiene ejercicios asignados.</p>
          ) : (
            <ul className="col sin-vinetas" aria-label="Ejercicios del plan">
              {juegos.map((j) => {
                const nombre = nombreJuego(j)
                const estado = estadoEjercicio(plan, b, j)
                if (estado === 'quitado')
                  return (
                    <li key={j} className="tarjeta presc-juego" data-testid={`juego-${j}`} data-estado={estado}>
                      <div className="presc-juego-cabeza">
                        <h3 className="presc-juego-nombre">{nombre}</h3>
                        <span className="presc-etiqueta">Se quita</span>
                      </div>
                      <p className="presc-detalle">Al enviar, sale del plan. Sus sesiones anteriores se conservan.</p>
                      <button type="button" className="boton secundario chico presc-juego-accion" onClick={() => setB((x) => agregarJuego(plan, x, j))}>
                        Deshacer
                      </button>
                    </li>
                  )
                return (
                  <li key={j} className="tarjeta presc-juego" data-testid={`juego-${j}`} data-estado={estado}>
                    <div className="presc-juego-cabeza">
                      <h3 className="presc-juego-nombre">{nombre}</h3>
                      {estado === 'nuevo' && <span className="presc-etiqueta">Nuevo</span>}
                    </div>
                    <Fila titulo="Nivel de dificultad" detalle={nivelDe(j, b.niveles[j] ?? NIVEL_MIN).nombre} cambiado={marca('nivel', j)} testid={`fila-nivel-${j}`}>
                      <Stepper
                        valor={b.niveles[j] ?? NIVEL_MIN}
                        min={NIVEL_MIN}
                        max={NIVEL_MAX}
                        onCambio={(v) => poner({ niveles: { ...b.niveles, [j]: v } })}
                        etiqueta={`nivel de ${nombre}`}
                        cambiado={marca('nivel', j)}
                      />
                    </Fila>
                    <Fila titulo="Meta por sesión" detalle={detalleMeta(j)} cambiado={marca('meta', j)} testid={`fila-meta-${j}`}>
                      <Stepper
                        valor={b.metas[j] ?? META_JUEGO_MIN}
                        min={META_JUEGO_MIN}
                        max={META_JUEGO_MAX}
                        onCambio={(v) => poner({ metas: { ...b.metas, [j]: v } })}
                        formato={textoMetaJuego}
                        etiqueta={`meta de ${nombre}`}
                        cambiado={marca('meta', j)}
                      />
                    </Fila>
                    <button
                      type="button"
                      className="boton texto presc-juego-accion"
                      disabled={b.juegos.length <= 1}
                      onClick={() => setB((x) => quitarJuego(x, j))}
                      aria-label={`Quitar ${nombre} del plan`}
                    >
                      {estado === 'nuevo' ? 'No agregar' : 'Quitar del plan'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {b.juegos.length <= 1 && <p className="ayuda-campo">El plan necesita al menos un ejercicio.</p>}
          {paraAgregar.length > 0 && (
            <div className="campo presc-agregar">
              <label htmlFor="presc-agregar">Agregar un ejercicio</label>
              <div className="presc-agregar-fila">
                <select id="presc-agregar" className="entrada" value={elegido} onChange={(e) => setAAgregar(e.target.value)}>
                  {paraAgregar.map((id) => (
                    <option key={id} value={id}>
                      {nombreJuego(id)}
                    </option>
                  ))}
                </select>
                <button type="button" className="boton secundario" disabled={!elegido} onClick={() => elegido && setB((x) => agregarJuego(plan, x, elegido))}>
                  Agregar
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="campo presc-mensaje" data-cambiado={marca('mensaje') ? 'si' : 'no'}>
          <label htmlFor="presc-mensaje">Mensaje para {primerNombre} (opcional)</label>
          <textarea
            id="presc-mensaje"
            className="entrada"
            rows={3}
            maxLength={MENSAJE_MAX}
            placeholder="Lo verá en su inicio junto al plan nuevo"
            aria-describedby="presc-mensaje-ayuda"
            value={b.mensaje}
            onChange={(e) => poner({ mensaje: e.target.value })}
          />
          <p id="presc-mensaje-ayuda" className="ayuda-campo presc-contador">
            {b.mensaje.length}/{MENSAJE_MAX}
          </p>
        </div>
      </div>

      <BarraAccion>
        <p className={invalido ? 'error-campo presc-estado' : 'ayuda-campo presc-estado'} role={invalido ? 'alert' : 'status'} data-testid="estado-cambios">
          {invalido ?? (lista.length === 0 ? 'Sin cambios por enviar' : `${lista.length} ${lista.length === 1 ? 'cambio' : 'cambios'} por enviar`)}
        </p>
        <button type="button" className="boton primario bloque" disabled={lista.length === 0 || !!invalido} onClick={() => setConfirmando(true)}>
          Enviar plan
        </button>
      </BarraAccion>

      <Hoja abierta={confirmando} onCerrar={() => !enviando && setConfirmando(false)} titulo="Confirmar plan nuevo">
        <div className="col">
          <h2 className="presc-hoja-titulo">Confirmar plan nuevo</h2>
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
            <p className="error-campo" role="alert">
              {errorEnvio}
            </p>
          )}
          <button type="button" className="boton primario bloque" onClick={enviar} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Confirmar y enviar'}
          </button>
          <button type="button" className="boton secundario bloque" onClick={() => setConfirmando(false)} disabled={enviando}>
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
              <span className="presc-pct">
                <span aria-hidden="true">{t.pct > 0 ? '▲' : '▼'}</span> {Math.abs(Math.round(t.pct))}%<span className="sr-only">{t.pct > 0 ? ' más' : ' menos'} que hace 4 semanas</span>
              </span>
            )}
          </p>
        ) : (
          <p className="presc-tendencia-vacio">Aún no hay sesiones suficientes en las últimas 4 semanas.</p>
        )}
        {hay && <p className="presc-nota">Medidas aproximadas, tomadas con la cámara.</p>}
      </div>
      {hay && <Sparkline valores={t.valores} ancho={112} alto={48} color="var(--tinta)" />}
    </section>
  )
}

/** Una fila editable: título, detalle y su control. `tarjeta` = fila suelta (si no, va dentro de la tarjeta del juego). */
function Fila({ titulo, detalle, cambiado, testid, tarjeta, children }: { titulo: string; detalle: string; cambiado: boolean; testid: string; tarjeta?: boolean; children: ReactNode }) {
  const contenido = (
    <>
      <div className="flex1 presc-textos">
        <strong className="presc-titulo">{titulo}</strong>
        <span className="presc-detalle">{detalle}</span>
      </div>
      {children}
    </>
  )
  const props = { className: `${tarjeta ? 'tarjeta ' : ''}presc-fila`, 'data-testid': testid, 'data-cambiado': cambiado ? 'si' : 'no' }
  return tarjeta ? <li {...props}>{contenido}</li> : <div {...props}>{contenido}</div>
}
