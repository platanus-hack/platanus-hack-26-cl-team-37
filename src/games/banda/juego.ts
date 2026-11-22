// F36 · Banda elástica: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_BANDA } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'banda-elastica',
  nombre: 'Banda elástica',
  gestos: ['Agarre'],
  filtros: ['Agarre'],
  descripcionCorta: 'Estirar una banda con ambas manos',
  disponible: true,
  usaCamara: true,
  dosManos: true,
  tirasBanda: true,
  ruta: null,
  miniatura: 'banda',
  niveles: nivelesDesde(NIVELES_BANDA),
  orden: 100,
  crear: () => import('./modulo').then((m) => m.crearBanda),
}

export default juego
