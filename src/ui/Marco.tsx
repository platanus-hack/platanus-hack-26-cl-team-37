// Marco común de las pantallas con sesión: contenido y barra de navegación según el rol.
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/contexto'
import { BarraPaciente, BarraTerapeuta, Cargando } from './piezas'

export function Marco({ barra = false }: { barra?: boolean }) {
  const { usuario } = useAuth()
  return (
    <div className={barra ? 'app con-nav' : 'app'}>
      <Suspense fallback={<PantallaCargando />}>
        <Outlet />
      </Suspense>
      {barra && (usuario?.rol === 'terapeuta' ? <BarraTerapeuta /> : <BarraPaciente />)}
    </div>
  )
}

export function PantallaCargando({ texto }: { texto?: string }) {
  return (
    <main className="pantalla" style={{ justifyContent: 'center' }}>
      <Cargando texto={texto} />
    </main>
  )
}
