// F27 · Piano de dedos: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_PIANO } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'piano-dedos',
  nombre: 'Piano de dedos',
  gestos: ['Independencia de dedos'],
  filtros: [],
  descripcionCorta: 'Independencia de dedos',
  disponible: true,
  // Oculto del catálogo por ahora (pedido del equipo, 2026-11-21): no se borra.
  oculto: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'piano',
  niveles: nivelesDesde(NIVELES_PIANO),
  orden: 80,
  crear: () => import('./modulo').then((m) => m.crearPiano),
}

export default juego
