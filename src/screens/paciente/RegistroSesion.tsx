// F15 · /historial/:id = la lista con la hoja "Registro de sesión" abierta (docs/referencia/imagenes/10b_registro_sesion.png).
import { useParams } from 'react-router-dom'
import HistorialPantalla from './HistorialPantalla'

export default function RegistroSesion() {
  const { id } = useParams()
  return <HistorialPantalla idAbierto={id} />
}
