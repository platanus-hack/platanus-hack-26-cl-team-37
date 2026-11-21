// F37 · Muñeca 3D: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_MUNECA } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'muneca-3d',
  nombre: 'Muñeca 3D',
  gestos: ['Control'],
  filtros: [],
  descripcionCorta: 'Flexión y desviación de la muñeca',
  disponible: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'muneca',
  niveles: nivelesDesde(NIVELES_MUNECA),
  orden: 100,
  crear: () => import('./modulo').then((m) => m.crearMuneca),
}

export default juego
