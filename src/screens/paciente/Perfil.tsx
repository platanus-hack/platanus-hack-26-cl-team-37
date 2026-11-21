// Provisoria (F02): solo permite cerrar sesión. La construye el feature F19.
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { Icono } from '../../ui/Icono'
import { avisar, Encabezado, Vacio } from '../../ui/piezas'

export default function Perfil() {
  const { usuario, salir } = useAuth()
  const nav = useNavigate()
  const cerrar = async () => {
    try {
      await salir()
      avisar('Sesión cerrada')
      nav('/acceso', { replace: true })
    } catch {
      avisar('No se pudo cerrar la sesión. Intenta de nuevo.', true)
    }
  }
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
