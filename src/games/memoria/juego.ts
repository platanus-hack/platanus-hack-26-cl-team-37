// F26 · Memoria de cartas: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_CARTAS } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'memoria-cartas',
  nombre: 'Memoria de cartas',
  gestos: ['Giro del antebrazo'],
  filtros: [],
  descripcionCorta: 'Giro del antebrazo',
  disponible: true,
  // Oculto del catálogo por ahora (pedido del equipo, 2026-11-21): no se borra.
  oculto: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'memoria',
  niveles: nivelesDesde(NIVELES_CARTAS),
  orden: 70,
  crear: () => import('./modulo').then((m) => m.crearMemoria),
}

export default juego
