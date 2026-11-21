// Registro de juegos/ejercicios. Cada juego se declara en SU carpeta, en src/games/<juego>/juego.ts (export default de
// un `Juego`), y aquí se juntan solos: agregar un juego no toca este archivo ni ningún otro compartido.
// Juego nuevo: copia caja/juego.ts a tu carpeta y cambia los datos; `orden` fija su lugar en /ejercicios.
import { nivelesCaja, type Juego, type NivelJuego } from './tipos'

export { FILTROS, nivelesCaja, nivelesDesde } from './tipos'
export type { FiltroGesto, Gesto, Juego, NivelJuego } from './tipos'

const ARCHIVOS = import.meta.glob<{ default: Juego }>('./*/juego.ts', { eager: true })

export const JUEGOS: Juego[] = Object.values(ARCHIVOS)
  .map((m) => m.default)
  .sort((a, b) => a.orden - b.orden)

export function juegoPorId(id: string): Juego | undefined {
  return JUEGOS.find((j) => j.id === id)
}

export function nombreJuego(id: string): string {
  return juegoPorId(id)?.nombre ?? id
}

export function nivelDe(juegoId: string, nivel: number): NivelJuego {
  const j = juegoPorId(juegoId)
  const niveles = j?.niveles ?? nivelesCaja
  return niveles[Math.min(niveles.length, Math.max(1, nivel)) - 1]
}
