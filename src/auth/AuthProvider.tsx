import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { repos } from '../data/repos'
import type { Usuario } from '../domain/types'
import { AuthContext, type DatosIngreso, type EstadoAuth } from './contexto'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const turno = useRef(0)
  // Mientras ingresar() corre, la sesión puede abrirse y cerrarse (rol o clínica equivocados): no se publica a medias.
  const ingresando = useRef(false)

  const cargar = useCallback(() => {
    // Solo vale la respuesta de la última consulta (los cambios de sesión pueden llegar seguidos).
    if (ingresando.current) return
    const t = ++turno.current
    repos.auth
      .usuarioActual()
      .catch(() => null)
      .then((u) => {
        if (t !== turno.current) return
        setUsuario((antes) => (antes && u && antes.id === u.id && antes.rol === u.rol ? antes : u))
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    cargar()
    // Supabase recomienda no llamar a la API dentro del callback de cambio de sesión: se difiere.
    const quitar = repos.auth.alCambiar(() => setTimeout(cargar, 0))
    return quitar
  }, [cargar])

  const ingresar = useCallback(async (datos: DatosIngreso) => {
    ingresando.current = true
    try {
      const u = await repos.auth.ingresar(datos)
      turno.current++
      setUsuario(u)
      setCargando(false)
      return u
    } finally {
      ingresando.current = false
    }
  }, [])

  const salir = useCallback(async () => {
    turno.current++
    await repos.auth.salir()
    setUsuario(null)
  }, [])

  const valor = useMemo<EstadoAuth>(() => ({ usuario, cargando, ingresar, salir }), [usuario, cargando, ingresar, salir])
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
