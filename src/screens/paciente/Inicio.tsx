// F04 · Inicio del paciente (docs/referencia/imagenes/02_inicio_paciente.png).
// Todo sale del Plan vigente, las Sesiones guardadas y la próxima Cita (vía repos); nada escrito a mano.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { repos } from '../../data/repos'
import type { Cita, Paciente, Plan, Sesion } from '../../domain/types'
import { juegoPorId, nombreJuego } from '../../games/registry'
import { diaSemana, fechaCorta, fechaLarga, hora, iniciales, LETRAS_DIA, pctCorto } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { adherencia, planDeHoy, racha, semana, type EstadoEjercicio } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { Anillo, Estados, Vacio } from '../../ui/piezas'

interface DatosInicio {
  paciente: Paciente | null
  plan: Plan | null
  sesiones: Sesion[]
  cita: Cita | null
}

async function cargarInicio(): Promise<DatosInicio> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return { paciente: null, plan: null, sesiones: [], cita: null }
  const [plan, sesiones, cita] = await Promise.all([
    repos.planes.vigente(paciente.id),
    repos.sesiones.listar(paciente.id),
    repos.citas.proxima(paciente.id),
  ])
  return { paciente, plan, sesiones, cita }
}

export default function Inicio() {
  const { usuario } = useAuth()
  const r = useCarga(cargarInicio, [])
  const [hoy] = useState(() => new Date())
  const nombre = usuario?.nombre ?? ''
  const primerNombre = nombre.split(/\s+/)[0] ?? ''

  return (
    <main className="pantalla con-barra inicio">
      <header className="fila entre inicio-cabeza">
        <div className="flex1">
          <p className="sobretitulo inicio-fecha">{fechaLarga(hoy)}</p>
          <h1>
            Hola, {primerNombre} <span aria-hidden="true">👋</span>
          </h1>
        </div>
        <div className="avatar acento inicio-avatar" aria-hidden="true">
          {iniciales(nombre)}
        </div>
      </header>
      <Estados r={r}>{(d) => <Contenido d={d} hoy={hoy} />}</Estados>
    </main>
  )
}

function Contenido({ d, hoy }: { d: DatosInicio; hoy: Date }) {
  const { paciente, plan, sesiones, cita } = d
  if (!paciente) return <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
  if (!plan || plan.items.length === 0)
    return (
      <>
        <Vacio
          titulo="Aún no tienes un plan"
          texto="Tu terapeuta te asignará los ejercicios. Mientras, puedes conocer los ejercicios disponibles."
          icono="planes"
          accion={
            <Link className="boton secundario chico" to="/ejercicios">
              Ver ejercicios
            </Link>
          }
        />
        {cita && <TarjetaCita cita={cita} />}
      </>
    )

  const deHoy = planDeHoy(plan.items, sesiones, hoy)
  const hechos = deHoy.filter((x) => x.estado === 'hecho').length
  const minutos = plan.items.reduce((a, it) => a + it.duracionMin, 0)
  const dias = racha(sesiones, hoy)
  const adh = adherencia(sesiones, plan, hoy)
  const tira = semana(sesiones, plan.items.length, hoy)
  const autor = plan.creadoPorNombre ?? 'tu terapeuta'

  return (
    <>
      <MensajeTerapeuta paciente={paciente} plan={plan} autor={autor} />

      <section className="tarjeta plan-hoy" aria-labelledby="plan-hoy-titulo">
        <Anillo valor={hechos / plan.items.length} tam={88} grosor={9}>
          <span className="anillo-cuenta" aria-label={`${hechos} de ${plan.items.length} ejercicios hechos`}>
            <b>{hechos}</b>/{plan.items.length}
          </span>
        </Anillo>
        <div className="flex1">
          <h2 id="plan-hoy-titulo">Plan de hoy</h2>
          <p className="plan-hoy-resumen">
            {plan.items.length} {plan.items.length === 1 ? 'ejercicio' : 'ejercicios'} · {minutos} min
          </p>
          <p className="plan-hoy-autor">
            <Icono nombre="candado" tam={15} /> Indicado por {autor}
          </p>
        </div>
      </section>

      <ul className="lista sin-vinetas" aria-label="Ejercicios de hoy">
        {deHoy.map(({ item, estado }, i) => (
          <li key={`${item.juego}-${i}`}>
            <FilaEjercicio juego={item.juego} duracionMin={item.duracionMin} estado={estado} />
          </li>
        ))}
      </ul>
      {hechos === plan.items.length && (
        <p className="tarjeta exito compacta" role="status">
          ¡Completaste el plan de hoy!
        </p>
      )}

      <div className="grid2">
        <div className="tarjeta dato-inicio">
          <p className="tenue">Racha</p>
          <p className="enorme" data-testid="racha">
            {dias} {dias === 1 ? 'día' : 'días'} {dias > 0 && <span aria-hidden="true">🔥</span>}
          </p>
        </div>
        <div className="tarjeta dato-inicio">
          <p className="tenue">Adherencia</p>
          <p className="enorme" data-testid="adherencia">
            {pctCorto(adh)}
          </p>
        </div>
      </div>

      <section className="tarjeta" aria-label="Esta semana">
        <ol className="tira-semana">
          {tira.map((dia, i) => (
            <li key={dia.clave} data-estado={dia.estado} data-hoy={dia.hoy || undefined} aria-label={`${NOMBRES_DIA[i]}: ${textoDia(dia.estado, dia.hoy)}`}>
              <span className={`letra ${dia.hoy ? 'acento' : ''}`} aria-hidden="true">
                {LETRAS_DIA[i]}
              </span>
              <PuntoDia estado={dia.estado} hoy={dia.hoy} fraccion={dia.hechas / plan.items.length} />
            </li>
          ))}
        </ol>
      </section>

      {cita && <TarjetaCita cita={cita} />}
    </>
  )
}

const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function textoDia(estado: string, hoy: boolean) {
  if (estado === 'cumplido') return 'cumplido'
  if (estado === 'parcial') return 'parcial'
  if (estado === 'futuro' || hoy) return 'por hacer'
  return 'sin práctica'
}

function PuntoDia({ estado, hoy, fraccion }: { estado: string; hoy: boolean; fraccion: number }) {
  if (estado === 'parcial') {
    const p = Math.round(Math.min(1, Math.max(0, fraccion)) * 100)
    return <span className="punto-dia parcial" style={{ background: `conic-gradient(var(--acento) 0 ${p}%, var(--tarjeta-2) ${p}% 100%)` }} />
  }
  const clase = estado === 'cumplido' ? 'cumplido' : estado === 'futuro' || hoy ? 'futuro' : 'pendiente'
  return <span className={`punto-dia ${clase}`} />
}

const ETIQUETA: Record<EstadoEjercicio, string> = { hecho: 'Hecho', siguiente: 'Siguiente', pendiente: 'Pendiente' }

function FilaEjercicio({ juego, duracionMin, estado }: { juego: string; duracionMin: number; estado: EstadoEjercicio }) {
  const j = juegoPorId(juego)
  const detalle = `${j?.categoria ?? j?.descripcionCorta ?? 'Ejercicio'} · ${duracionMin} min`
  const cuerpo = (
    <>
      <span className={`icono-caja ${estado === 'hecho' ? 'ok' : estado === 'siguiente' ? 'acento' : 'apagado'}`} aria-hidden="true">
        <Icono nombre={estado === 'hecho' ? 'check' : 'play'} tam={22} />
      </span>
      <span className="flex1">
        <span className="ejercicio-nombre">{nombreJuego(juego)}</span>
        <span className="ejercicio-detalle">{detalle}</span>
      </span>
      {estado === 'siguiente' ? <span className="insignia">Siguiente</span> : <span className="tenue">{ETIQUETA[estado]}</span>}
    </>
  )
  if (estado === 'siguiente')
    return (
      <Link to={`/sesion/${juego}/preparar`} className="tarjeta destacada tarjeta-boton ejercicio" data-estado={estado}>
        {cuerpo}
      </Link>
    )
  return (
    <div className={`tarjeta tarjeta-boton ejercicio ${estado}`} data-estado={estado}>
      {cuerpo}
    </div>
  )
}

function TarjetaCita({ cita }: { cita: Cita }) {
  return (
    <section className="tarjeta tarjeta-boton cita" aria-label="Próxima cita">
      <span className="icono-caja info" aria-hidden="true">
        <Icono nombre="perfil" tam={22} />
      </span>
      <span className="flex1">
        <span className="ejercicio-nombre">Control con {cita.terapeutaNombre ?? 'tu terapeuta'}</span>
        <span className="ejercicio-detalle">
          {diaSemana(cita.fecha)} {fechaCorta(cita.fecha)} · {hora(cita.fecha)} · {cita.modalidad}
        </span>
      </span>
    </section>
  )
}

/** Mensaje nuevo del terapeuta en el plan: se muestra una sola vez (se marca visto apenas aparece). */
function MensajeTerapeuta({ paciente, plan, autor }: { paciente: Paciente; plan: Plan; autor: string }) {
  const nuevo = !!plan.mensaje && plan.version > paciente.ultimoMensajeVisto
  const [cerrado, setCerrado] = useState(false)
  const marcado = useRef(false)
  useEffect(() => {
    if (!nuevo || marcado.current) return
    marcado.current = true
    repos.pacientes.marcarMensajeVisto(plan.version).catch(() => undefined)
  }, [nuevo, plan.version])
  if (!nuevo || cerrado) return null
  return (
    <section className="tarjeta mensaje-terapeuta mensaje-nuevo" role="status" aria-label="Mensaje de tu terapeuta">
      <span className="icono-caja info" aria-hidden="true">
        <Icono nombre="mensaje" tam={22} />
      </span>
      <div className="flex1">
        <p className="chico tenue">Mensaje de {autor}</p>
        <p className="mensaje-texto">{plan.mensaje}</p>
      </div>
      <button className="boton-icono" aria-label="Cerrar mensaje" onClick={() => setCerrado(true)}>
        <Icono nombre="cerrar" tam={18} />
      </button>
    </section>
  )
}
