// Protección de rutas por sesión y rol (se usan como rutas "layout" en App.tsx).
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Rol } from '../domain/types'
import { Marco, PantallaCargando } from '../ui/Marco'
import { avisar } from '../ui/piezas'
import { inicioDe, useAuth } from './contexto'

/** Exige sesión y uno de los roles. Sin sesión → /acceso (recordando a dónde iba). Otro rol → su inicio. */
export function Protegida({ roles, barra }: { roles: Rol[]; barra?: boolean }) {
  const { usuario, cargando } = useAuth()
  const loc = useLocation()
  if (cargando) return <PantallaCargando texto="Abriendo tu sesión…" />
  if (!usuario) return <Navigate to="/acceso" replace state={{ desde: loc.pathname + loc.search }} />
  if (!roles.includes(usuario.rol)) return <FueraDeRol destino={inicioDe(usuario.rol)} />
  return <Marco barra={barra} />
}

function FueraDeRol({ destino }: { destino: string }) {
  useEffect(() => avisar('Esa sección no está disponible para tu cuenta.', true), [])
  return <Navigate to={destino} replace />
}

/** Rutas públicas (/acceso): con sesión abierta se va directo al inicio del rol. */
export function SoloPublica() {
  const { usuario, cargando } = useAuth()
  if (cargando) return <PantallaCargando />
  if (usuario) return <Navigate to={inicioDe(usuario.rol)} replace />
  // Mismo contenedor que las pantallas con sesión (.app, 520 px centrados): sin él, en computador /acceso se estiraba
  // a todo el ancho de la ventana.
  return (
    <div className="app">
      <Outlet />
    </div>
  )
}

/** "/" y rutas desconocidas: al inicio del rol o a /acceso. */
export function AlInicio() {
  const { usuario, cargando } = useAuth()
  if (cargando) return <PantallaCargando />
  return <Navigate to={usuario ? inicioDe(usuario.rol) : '/acceso'} replace />
}
