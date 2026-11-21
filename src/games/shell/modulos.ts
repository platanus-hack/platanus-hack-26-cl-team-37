// Qué módulo de juego monta /sesion/:id/jugar según `sesion.juego`. Sale del registro: cada juego declara `crear` en
// su src/games/<juego>/juego.ts (import() de su modulo.ts, que así no entra al bundle de la app). Agregar un juego
// no toca este archivo.
import { JUEGOS } from '../registry'
import type { CrearJuego } from './contrato'

export const MODULOS: Record<string, () => Promise<CrearJuego>> = {
  ...Object.fromEntries(JUEGOS.flatMap((j) => (j.crear ? [[j.id, j.crear] as const] : []))),
  // Juegos de prueba de la base (F09): solo se llega con una sesión creada por e2e o scripts/crear-preparada.ts.
  'prueba-shell': () => import('../prueba/modulo').then((m) => m.crearPruebaShell),
  'prueba-fisica': () => import('../prueba/modulo').then((m) => m.crearPruebaFisica),
}

export function tieneModulo(juego: string): boolean {
  return juego in MODULOS
}

export async function cargarModulo(juego: string): Promise<CrearJuego | null> {
  const cargar = MODULOS[juego]
  return cargar ? cargar() : null
}
