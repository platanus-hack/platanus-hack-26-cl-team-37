// F04 · Inicio del paciente con el sistema de diseño «Salud»: arco de la semana (la firma), la tarjeta Ahora con la
// escena del juego, lo de hoy en una lista y una sola acción, Empezar.
// Todo sale del Plan vigente, las Sesiones guardadas y la próxima Cita (vía repos); nada escrito a mano.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { repos } from '../../data/repos'
import type { Cita, Paciente, Plan, Sesion } from '../../domain/types'
import { juegoPorId, nombreJuego } from '../../games/registry'
import { diaSemana, fechaCorta, hora, iniciales, LETRAS_DIA } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { planDeHoy, semana, type EstadoEjercicio } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { BarraAccion, Estados, Vacio } from '../../ui/piezas'
import { escenaDe } from '../../ui/escenas'
import { Ahora, ArcoSemana, EncabezadoMarca } from '../../ui/salud'

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
    <main className="pantalla con-barra con-boton inicio">
      <EncabezadoMarca titulo={`Hola, ${primerNombre}`} iniciales={iniciales(nombre)} />
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
        {cita && <NotaCita cita={cita} />}
      </>
    )

  const deHoy = planDeHoy(plan.items, sesiones, hoy)
  const minutos = plan.items.reduce((a, it) => a + it.duracionMin, 0)
  const tira = semana(sesiones, plan.items.length, hoy)
  const hechasSemana = tira.filter((x) => x.estado === 'cumplido').length
  const autor = plan.creadoPorNombre ?? 'tu terapeuta'
  const ahora = deHoy.find((x) => x.estado === 'siguiente')
  const resto = deHoy.filter((x) => x.estado !== 'siguiente')
  const todoHecho = deHoy.every((x) => x.estado === 'hecho')
  const dias = tira.map((dia, i) => ({ letra: LETRAS_DIA[i], nombre: NOMBRES_DIA[i], estado: dia.estado === 'cumplido' ? ('hecha' as const) : ('pendiente' as const), hoy: dia.hoy }))

  return (
    <>
      <MensajeTerapeuta paciente={paciente} plan={plan} autor={autor} />

      <ArcoSemana hechas={hechasSemana} total={plan.sesionesPorSemana} dias={dias} />

      {ahora && (
        <Ahora
          juego={ahora.item.juego}
          nombre={nombreJuego(ahora.item.juego)}
          detalle={detalleEjercicio(ahora.item.juego, ahora.item.duracionMin)}
          to={`/sesion/${ahora.item.juego}/preparar`}
        />
      )}

      <section className="tarjeta lista-hoy" aria-labelledby="hoy-titulo">
        <h2 id="hoy-titulo" className="lista-hoy-rotulo">
          Hoy
        </h2>
        <p className="lista-hoy-resumen">
          {plan.items.length} {plan.items.length === 1 ? 'ejercicio' : 'ejercicios'}, {minutos} minutos.
          <span>
            <Icono nombre="candado" tam={14} /> Indicado por {autor}
          </span>
        </p>
        {todoHecho && (
          <p className="lista-hoy-resumen" role="status">
            Completaste el plan de hoy.
          </p>
        )}
        {resto.length > 0 && (
          <ul aria-label="Ejercicios de hoy">
            {resto.map(({ item, estado }, i) => (
              <li key={`${item.juego}-${i}`}>
                <FilaEjercicio juego={item.juego} duracionMin={item.duracionMin} estado={estado} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {cita && <NotaCita cita={cita} />}

      {ahora && (
        <BarraAccion>
          <Link className="boton primario bloque" to={`/sesion/${ahora.item.juego}/preparar`}>
            Empezar
          </Link>
        </BarraAccion>
      )}
    </>
  )
}

const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function detalleEjercicio(juego: string, duracionMin: number) {
  const j = juegoPorId(juego)
  const que = (j?.categoria ?? j?.descripcionCorta ?? '').toLowerCase()
  return `${duracionMin} minutos${que ? `, ${que}` : ''}`
}

function FilaEjercicio({ juego, duracionMin, estado }: { juego: string; duracionMin: number; estado: EstadoEjercicio }) {
  const escena = escenaDe(juego)
  return (
    <div className="fila-hoy" data-estado={estado}>
      {escena ? <img className="miniatura" src={escena} alt="" /> : <span className="miniatura" aria-hidden="true" />}
      <span className="fila-hoy-quien">
        <b>{nombreJuego(juego)}</b>
        <span>{duracionMin} minutos</span>
      </span>
      {estado === 'hecho' ? (
        <span className="visto" role="img" aria-label="Hecho">
          ✓
        </span>
      ) : (
        <span className="despues">Después</span>
      )}
    </div>
  )
}

function NotaCita({ cita }: { cita: Cita }) {
  return (
    <section className="nota" aria-label="Próxima cita">
      <span>
        <b>Control con {cita.terapeutaNombre ?? 'tu terapeuta'}</b> el {diaSemana(cita.fecha).toLowerCase()} {fechaCorta(cita.fecha)}, {hora(cita.fecha)}, {cita.modalidad}.
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
