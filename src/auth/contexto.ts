// Contexto de sesión: quién está dentro y con qué rol. El proveedor está en AuthProvider.tsx.
import { createContext, useContext } from 'react'
import type { Rol, Usuario } from '../domain/types'

export interface DatosIngreso {
  email: string
  password: string
  rol: Rol
  codigoClinica: string
}

export interface EstadoAuth {
  usuario: Usuario | null
  /** true solo mientras se resuelve la sesión inicial (al abrir o recargar la app). */
  cargando: boolean
  ingresar(datos: DatosIngreso): Promise<Usuario>
  salir(): Promise<void>
}

export const AuthContext = createContext<EstadoAuth | null>(null)

export function useAuth(): EstadoAuth {
  const c = useContext(AuthContext)
  if (!c) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return c
}

/** Pantalla de inicio de cada rol (destino después de ingresar o al abrir una ruta de otro rol). */
export function inicioDe(rol: Rol): string {
  return rol === 'terapeuta' ? '/terapeuta/pacientes' : '/inicio'
}
