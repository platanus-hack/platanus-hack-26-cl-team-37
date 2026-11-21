// Versiones que se guardan en cada Sesion (versionApp, versionModelo) y descripción del dispositivo.
// VERSION_APP debe calzar con package.json (lo revisa version.test.ts).
import type { TipoFuente } from '../tracking/tipos'

export const VERSION_APP = '0.1.0'
/** Modelo de manos servido desde public/mediapipe/ con @mediapipe/tasks-vision. */
export const MODELO_MANOS = 'hand_landmarker.task · tasks-vision 1.2.3'

export function versionModelo(tipo: TipoFuente, delegado?: string | null): string {
  if (tipo === 'sintetica') return 'sintetica (sin modelo)'
  if (tipo === 'grabacion') return `grabacion (${MODELO_MANOS})`
  return delegado ? `${MODELO_MANOS} · ${delegado}` : MODELO_MANOS
}

const NAVEGADORES: [string, RegExp][] = [
  ['Edge', /EdgA?\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
  ['Safari', /Version\/(\d+).*Safari/],
]

function sistema(ua: string): string {
  const android = /Android [\d.]+/.exec(ua)
  if (android) return android[0]
  const ios = /(?:iPhone|iPad).*? OS (\d+)_(\d+)/.exec(ua)
  if (ios) return `iOS ${ios[1]}.${ios[2]}`
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Otro'
}

/** Resumen corto del sistema y navegador, sin identificadores (p. ej. "Android 14 · Chrome 131"). */
export function resumenDispositivo(ua: string): string {
  for (const [nombre, re] of NAVEGADORES) {
    const m = re.exec(ua)
    if (m) return `${sistema(ua)} · ${nombre} ${m[1]}`
  }
  return `${sistema(ua)} · Navegador`
}
