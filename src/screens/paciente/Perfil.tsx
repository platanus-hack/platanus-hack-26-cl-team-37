// Provisoria (F02): solo permite cerrar sesión. La construye el feature F19.
import { useAuth } from '../../auth/contexto'
import { useCerrarSesion } from '../../auth/useCerrarSesion'
import { Icono } from '../../ui/Icono'
import { Encabezado, Vacio } from '../../ui/piezas'

export default function Perfil() {
  const { usuario } = useAuth()
  const cerrar = useCerrarSesion()
  return (
    <main className="pantalla con-barra">
      <Encabezado titulo="Perfil" subtitulo={usuario?.nombre} />
      <Vacio titulo="En construcción" texto="Esta pantalla estará lista pronto." />
      <button className="boton secundario bloque" onClick={cerrar}>
        <Icono nombre="salir" />
        Cerrar sesión
      </button>
    </main>
  )
}
