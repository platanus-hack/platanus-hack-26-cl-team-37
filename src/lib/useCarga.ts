// Carga asíncrona con estados (cargando / listo / error) y recarga. Se usa con <Estados r={...}> de ui/piezas.
import { useCallback, useEffect, useState } from 'react'

export interface Carga<T> {
  estado: 'cargando' | 'listo' | 'error'
  datos: T | null
  error: unknown
  recargar: () => void
}

export function useCarga<T>(cargar: () => Promise<T>, deps: unknown[]): Carga<T> {
  const [vuelta, setVuelta] = useState(0)
  const [r, setR] = useState<Omit<Carga<T>, 'recargar'>>({ estado: 'cargando', datos: null, error: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(cargar, deps)
  useEffect(() => {
    let vivo = true
    setR((x) => ({ ...x, estado: 'cargando', error: null }))
    fn().then(
      (datos) => vivo && setR({ estado: 'listo', datos, error: null }),
      (error) => vivo && setR({ estado: 'error', datos: null, error }),
    )
    return () => {
      vivo = false
    }
  }, [fn, vuelta])
  const recargar = useCallback(() => setVuelta((v) => v + 1), [])
  return { ...r, recargar }
}
