// Fábrica de fuentes de manos. Se elige con ?fuente=camara|sintetica|grabacion (por defecto camara).
//   ?fuente=sintetica&guion=<preset>&lado=derecha|izquierda   (presets: GUIONES_PRESET en sintetica.ts)
//   ?fuente=grabacion&grabacion=/grabaciones/demo.json         (por defecto la demo de public/grabaciones/)
//   ?lateralidad=invertida                                     (solo cámara: invierte izquierda/derecha)
//   ?delegado=cpu|gpu                                          (solo cámara: fuerza el delegado de MediaPipe)
// Las fuentes simuladas quedan en window.__manoviva.fuente para que los e2e las manejen.

import { leerGrabacion } from './grabacion'
import { FuenteGrabacion, FuenteSintetica } from './fuenteSimulada'
import { GUIONES_PRESET, guionPreset, type GuionSintetico, type NombreGuion } from './sintetica'
import { TIPOS_FUENTE, type FuenteManos, type LadoMano, type TipoFuente } from './tipos'

export const GRABACION_DEMO = `${import.meta.env.BASE_URL ?? '/'}grabaciones/demo.json`

export interface ConfigFuente {
  tipo: TipoFuente
  guion: NombreGuion
  lado: LadoMano
  grabacion: string
  invertirLateralidad: boolean
  delegado: 'GPU' | 'CPU' | null
  /** Cámara: cuántas manos entregar, las más cercanas (2 en juegos por defecto; 1 en la calibración). */
  maxManos?: number
}

/** Lee la configuración de la fuente desde el query string. Pura. */
export function configDesdeUrl(search: string): ConfigFuente {
  const q = new URLSearchParams(search)
  const tipo = q.get('fuente') as TipoFuente
  const guion = q.get('guion') as NombreGuion
  const lado = q.get('lado') === 'izquierda' ? 'izquierda' : 'derecha'
  return {
    tipo: TIPOS_FUENTE.includes(tipo) ? tipo : 'camara',
    guion: GUIONES_PRESET.includes(guion) ? guion : 'calibracion',
    lado,
    grabacion: q.get('grabacion') || GRABACION_DEMO,
    invertirLateralidad: q.get('lateralidad') === 'invertida',
    delegado: q.get('delegado') === 'cpu' ? 'CPU' : q.get('delegado') === 'gpu' ? 'GPU' : null,
  }
}

declare global {
  interface Window {
    __manoviva?: { fuente?: FuenteManos; guion?: GuionSintetico; /** Estado del juego para e2e (p. ej. Caja: src/games/caja). */ juego?: { estado(): unknown } }
  }
}

/**
 * Crea (sin iniciar) la fuente pedida. La cámara y MediaPipe se cargan de forma diferida.
 * Para e2e, un guion puesto antes de cargar en window.__manoviva.guion reemplaza al preset.
 */
export async function crearFuente(config: Partial<ConfigFuente> = {}): Promise<FuenteManos> {
  const c = { ...configDesdeUrl(''), ...config }
  let fuente: FuenteManos
  if (c.tipo === 'sintetica') {
    const inyectado = typeof window !== 'undefined' ? window.__manoviva?.guion : undefined
    fuente = new FuenteSintetica(inyectado ?? guionPreset(c.guion, c.lado))
  } else if (c.tipo === 'grabacion') {
    const r = await fetch(c.grabacion)
    if (!r.ok) throw new Error(`no se pudo cargar la grabación ${c.grabacion} (${r.status})`)
    fuente = new FuenteGrabacion(leerGrabacion(await r.text()))
  } else {
    const { FuenteCamara } = await import('./camara')
    fuente = new FuenteCamara({ invertirLateralidad: c.invertirLateralidad, delegado: c.delegado, maxManos: c.maxManos ?? 2 })
  }
  if (typeof window !== 'undefined' && c.tipo !== 'camara') {
    window.__manoviva = { ...window.__manoviva, fuente }
  }
  return fuente
}

/** Descarga una grabación JSON (solo landmarks) como archivo. */
export function descargarJson(texto: string, nombre = `landmarks-${new Date().toISOString().slice(0, 19)}.json`) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre.replace(/:/g, '-') })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
