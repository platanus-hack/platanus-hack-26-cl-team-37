// Qué módulo de juego monta /sesion/:id/jugar según `sesion.juego`. Cada juego se carga con import() (su código,
// y Rapier si lo usa, no entran al bundle de la app). Para agregar un juego (F10, F11, F22–F27):
//   'caja-juguetes': () => import('../caja/modulo').then((m) => m.crearCaja),
// y poner `disponible: true` en src/games/registry.ts al cerrar su feature.
import type { CrearJuego } from './contrato'

export const MODULOS: Record<string, () => Promise<CrearJuego>> = {
  'caja-juguetes': () => import('../caja/modulo').then((m) => m.crearCaja),
  'movilidad-guiada': () => import('../movilidad/modulo').then((m) => m.crearMovilidad),
  'pinza-fina': () => import('../pinza/modulo').then((m) => m.crearPinza),
  'piano-dedos': () => import('../piano/modulo').then((m) => m.crearPiano),
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
