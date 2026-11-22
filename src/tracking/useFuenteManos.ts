// Hook para pantallas: crea la fuente según ?fuente= (o `config`), la inicia al montar y la detiene al
// desmontar. Devuelve la fuente y su estado; los cuadros se leen con fuente.alCuadro(...) o fuente.ultimo
// (no se re-renderiza en cada cuadro). `reintentar` vuelve a crear la fuente: sirve cuando ni siquiera se pudo crear (p. ej.
// no bajó el código de la cámara), caso en que no hay `fuente` a la que pedirle iniciar().

import { useCallback, useEffect, useState } from 'react'
import { configDesdeUrl, crearFuente, type ConfigFuente } from './fuentes'
import type { EstadoSeguimiento, FuenteManos } from './tipos'

export function useFuenteManos(search: string, config: Partial<ConfigFuente> = {}) {
  const [fuente, setFuente] = useState<FuenteManos | null>(null)
  const [estado, setEstado] = useState<EstadoSeguimiento>('iniciando')
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const clave = JSON.stringify({ ...configDesdeUrl(search), ...config })

  useEffect(() => {
    let vivo = true
    let f: FuenteManos | null = null
    let quitar = () => {}
    crearFuente(JSON.parse(clave) as ConfigFuente)
      .then((nueva) => {
        if (!vivo) return
        f = nueva
        quitar = nueva.alEstado(setEstado)
        setFuente(nueva)
        return nueva.iniciar()
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setError(e instanceof Error ? e.message : String(e))
        setEstado('error')
      })
    return () => {
      vivo = false
      quitar()
      f?.detener()
    }
  }, [clave, vuelta])

  const reintentar = useCallback(() => {
    setError(null)
    setEstado('iniciando')
    setVuelta((v) => v + 1)
  }, [])

  return { fuente, estado, error, reintentar }
}
