// Estado que se recuerda en este navegador (preferencias del laboratorio). Si el almacenamiento falla, sigue en memoria.
import { useCallback, useState } from 'react'

const PREFIJO = 'manoviva.laboratorio.'

export function useGuardado<T>(clave: string, inicial: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const texto = localStorage.getItem(PREFIJO + clave)
      return texto == null ? inicial : (JSON.parse(texto) as T)
    } catch {
      return inicial
    }
  })
  const guardar = useCallback(
    (v: T) => {
      setValor(v)
      try {
        localStorage.setItem(PREFIJO + clave, JSON.stringify(v))
      } catch {
        // Modo privado o sin espacio: la preferencia vale solo para esta visita.
      }
    },
    [clave],
  )
  return [valor, guardar]
}
