// Provisoria (F02): logo y título. El formulario de ingreso lo construye el feature F03.
import { LogoMano } from '../../ui/Icono'
import { Vacio } from '../../ui/piezas'

export default function Acceso() {
  return (
    <main className="pantalla" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 72 }}>
      <div className="logo">
        <LogoMano tam={44} />
      </div>
      <h1>ManoViva</h1>
      <p className="tenue">Rehabilitación que se juega</p>
      <Vacio titulo="Acceso en construcción" texto="El ingreso con rol y código de clínica estará listo pronto." icono="candado" />
    </main>
  )
}
