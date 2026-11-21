// Cerrar sesión desde cualquier pantalla (paciente o terapeuta): sale, avisa y vuelve a /acceso sin dejar historial.
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { avisar } from '../ui/piezas'
import { useAuth } from './contexto'

export function useCerrarSesion() {
  const { salir } = useAuth()
  const nav = useNavigate()
  return useCallback(async () => {
    try {
      await salir()
      avisar('Sesión cerrada')
      nav('/acceso', { replace: true })
    } catch {
      avisar('No se pudo cerrar la sesión. Intenta de nuevo.', true)
    }
  }, [salir, nav])
}
