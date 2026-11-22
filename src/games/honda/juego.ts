// F39 · Honda: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_HONDA } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'honda',
  nombre: 'Honda',
  gestos: ['Agarre'],
  filtros: ['Agarre'],
  descripcionCorta: 'Carga la honda con la banda y da en el blanco',
  disponible: true,
  usaCamara: true,
  dosManos: true,
  ruta: null,
  miniatura: 'honda',
  niveles: nivelesDesde(NIVELES_HONDA),
  orden: 120,
  crear: () => import('./modulo').then((m) => m.crearHonda),
}

export default juego
