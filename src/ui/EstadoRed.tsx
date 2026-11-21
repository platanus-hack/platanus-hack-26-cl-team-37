// Aviso discreto cuando no hay conexión (F20): la sesión se puede completar igual y se sube sola al volver la red.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
// Solo para reintentar la cola al abrir la app (la cola vive en la capa de datos, no en las pantallas).
import { sincronizarCola } from '../data/supabaseRepos'

export function EstadoRed() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const { pathname } = useLocation()
  useEffect(() => {
    const subir = () => setEnLinea(true)
    const bajar = () => setEnLinea(false)
    window.addEventListener('online', subir)
    window.addEventListener('offline', bajar)
    if (navigator.onLine) void sincronizarCola()
    return () => {
      window.removeEventListener('online', subir)
      window.removeEventListener('offline', bajar)
    }
  }, [])
  // En el juego el HUD ocupa todo: ahí no se muestra (el juego sigue guardando igual).
  if (enLinea || /\/jugar$/.test(pathname)) return null
  return (
    <div className="estado-red" role="status" aria-live="polite" data-testid="estado-red">
      Sin conexión · tus datos se guardan en el teléfono
    </div>
  )
}
