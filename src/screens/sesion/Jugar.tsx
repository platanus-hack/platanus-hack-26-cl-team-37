// F09 · /sesion/:id/jugar: carga la Sesion y el módulo de su juego (src/games/shell/modulos.ts) y monta la base
// común (src/games/shell/JuegoShell.tsx). Pantalla completa horizontal, sin barra ni banner.
// Estados: sesión inexistente, sesión cerrada, juego sin módulo todavía (F10/F11/F22+ los agregan).
import { Link, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Sesion } from '../../domain/types'
import { nombreJuego } from '../../games/registry'
import type { CrearJuego } from '../../games/shell/contrato'
import { JuegoShell } from '../../games/shell/JuegoShell'
import { cargarModulo } from '../../games/shell/modulos'
import { useCarga } from '../../lib/useCarga'
import { Encabezado, Estados, Vacio } from '../../ui/piezas'

interface DatosJugar {
  sesion: Sesion | null
  crear: CrearJuego | null
  seqInicial: number
}

async function cargarJugar(id: string): Promise<DatosJugar> {
  const sesion = await repos.sesiones.obtener(id)
  if (!sesion || sesion.estado === 'cerrada') return { sesion, crear: null, seqInicial: 1 }
  const [crear, eventos] = await Promise.all([cargarModulo(sesion.juego), repos.sesiones.eventos(id)])
  // Si la sesión ya tenía eventos (se volvió a abrir el juego), se sigue la numeración.
  const seqInicial = eventos.reduce((m, e) => Math.max(m, e.seq), 0) + 1
  return { sesion, crear, seqInicial }
}

export default function Jugar() {
  const { id = '' } = useParams()
  const r = useCarga(() => cargarJugar(id), [id])
  const d = r.datos
  if (r.estado === 'listo' && d?.sesion && d.sesion.estado !== 'cerrada' && d.crear) {
    return (
      <main className="juego">
        <JuegoShell sesion={d.sesion} crear={d.crear} seqInicial={d.seqInicial} />
      </main>
    )
  }
  return (
    <main className="pantalla">
      <Encabezado titulo="Juego" atras="/inicio" />
      <Estados r={r}>
        {(x) =>
          !x.sesion ? (
            <Vacio titulo="No encontramos esta sesión" texto="Prepárala de nuevo desde tus ejercicios." icono="ejercicios" accion={<Link to="/ejercicios" className="boton secundario chico">Ver ejercicios</Link>} />
          ) : x.sesion.estado === 'cerrada' ? (
            <Vacio titulo="Esta sesión ya terminó" texto="Puedes revisarla en tu historial." icono="historial" accion={<Link to="/inicio" className="boton secundario chico">Volver al inicio</Link>} />
          ) : (
            <Vacio
              titulo={`${nombreJuego(x.sesion.juego)} todavía no está listo`}
              texto="Este ejercicio aún no se puede jugar en la app."
              icono="ejercicios"
              accion={<Link to="/ejercicios" className="boton secundario chico">Ver ejercicios</Link>}
            />
          )
        }
      </Estados>
    </main>
  )
}
