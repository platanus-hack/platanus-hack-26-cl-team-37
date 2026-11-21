// Vista móvil o escritorio según el ancho de la ventana. Se recalcula sola al cambiar el tamaño (o al girar una tableta).
// El CSS usa la misma consulta en sus @media (src/index.css, «Escritorio»): si cambias el corte, cámbialo en los dos.
import { useEffect, useSyncExternalStore } from 'react'

/** Desde este ancho la app usa la disposición de escritorio (barra lateral, contenido ancho, columnas). */
export const ANCHO_ESCRITORIO = 1024
export const CONSULTA_ESCRITORIO = `(min-width: ${ANCHO_ESCRITORIO}px)`

export type Vista = 'movil' | 'escritorio'

function consulta(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_ESCRITORIO) : null
}

function suscribir(avisar: () => void): () => void {
  const mq = consulta()
  if (!mq) return () => undefined
  mq.addEventListener('change', avisar)
  return () => mq.removeEventListener('change', avisar)
}

export function vistaActual(): Vista {
  return consulta()?.matches ? 'escritorio' : 'movil'
}

/** Vista actual; el componente se vuelve a dibujar cuando la ventana cruza el corte. */
export function useVista(): Vista {
  return useSyncExternalStore(suscribir, vistaActual, () => 'movil')
}

/** Deja la vista en <html data-vista="…"> (para depurar y para las pruebas e2e). Se usa una vez, en App. */
export function useMarcarVista(): Vista {
  const vista = useVista()
  useEffect(() => {
    document.documentElement.dataset.vista = vista
  }, [vista])
  return vista
}
