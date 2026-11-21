// F05 · Catálogo de ejercicios (docs/referencia/imagenes/03_ejercicios.png).
// Juegos del registro (src/games/registry.ts); "Asignado" y nivel salen del Plan vigente y las Sesiones (vía repos).
import { Link, useSearchParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Plan, Sesion } from '../../domain/types'
import { catalogo, NIVEL_MAX, type EntradaCatalogo } from '../../games/catalogo'
import { Miniatura } from '../../games/Miniatura'
import { FILTROS, JUEGOS, type FiltroGesto } from '../../games/registry'
import { useCarga } from '../../lib/useCarga'
import { Estados, Vacio } from '../../ui/piezas'

interface DatosEjercicios {
  plan: Plan | null
  sesiones: Sesion[]
}

async function cargarEjercicios(): Promise<DatosEjercicios> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return { plan: null, sesiones: [] }
  const [plan, sesiones] = await Promise.all([repos.planes.vigente(paciente.id), repos.sesiones.listar(paciente.id)])
  return { plan, sesiones }
}

const esFiltro = (v: string | null): v is FiltroGesto => !!v && (FILTROS as string[]).includes(v)

export default function Ejercicios() {
  const r = useCarga(cargarEjercicios, [])
  const [params, setParams] = useSearchParams()
  const g = params.get('gesto')
  const filtro = esFiltro(g) ? g : null

  const elegir = (f: FiltroGesto | null) => setParams(f ? { gesto: f } : {}, { replace: true })

  return (
    <main className="pantalla con-barra ejercicios">
      <h1>Ejercicios</h1>
      <div className="chips filtros" role="group" aria-label="Filtrar por gesto">
        <button type="button" className="chip" aria-pressed={filtro === null} onClick={() => elegir(null)}>
          Todos
        </button>
        {FILTROS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filtro === f} onClick={() => elegir(f)}>
            {f}
          </button>
        ))}
      </div>
      <Estados r={r}>
        {(d) => {
          const lista = catalogo(JUEGOS, d.plan?.items ?? [], d.sesiones, filtro)
          if (lista.length === 0) return <Vacio titulo="Sin ejercicios para este gesto" texto="Prueba con otro filtro." icono="ejercicios" />
          return (
            <ul className="lista sin-vinetas" aria-label="Catálogo de ejercicios">
              {lista.map((e) => (
                <li key={e.juego.id}>
                  <TarjetaJuego e={e} />
                </li>
              ))}
            </ul>
          )
        }}
      </Estados>
    </main>
  )
}

function TarjetaJuego({ e }: { e: EntradaCatalogo }) {
  const { juego, asignado, nivel } = e
  const cuerpo = (
    <>
      <span className={`miniatura-caja ${juego.disponible ? '' : 'apagada'}`}>
        <Miniatura clave={juego.miniatura} />
      </span>
      <span className="flex1 juego-textos">
        <span className="juego-nombre">{juego.nombre}</span>
        <span className="juego-gestos">{juego.gestos.join(' · ')}</span>
        <span className="juego-nivel">
          <span className="segmentos-nivel" aria-hidden="true">
            {Array.from({ length: NIVEL_MAX }, (_, i) => (
              <span key={i} className={i < nivel ? 'lleno' : ''} />
            ))}
          </span>
          <span data-testid="nivel">Nivel {nivel}</span>
        </span>
      </span>
      <span className="juego-insignias">
        {asignado && <span className="insignia">Asignado</span>}
        {!juego.disponible && <span className="insignia gris">Próximamente</span>}
      </span>
    </>
  )
  const datos = { 'data-juego': juego.id, 'data-asignado': asignado || undefined, 'data-disponible': juego.disponible }
  if (!juego.disponible)
    return (
      <div className="tarjeta tarjeta-juego no-disponible" aria-disabled="true" {...datos}>
        {cuerpo}
      </div>
    )
  return (
    <Link to={`/sesion/${juego.id}/preparar`} className="tarjeta tarjeta-juego" {...datos}>
      {cuerpo}
    </Link>
  )
}
