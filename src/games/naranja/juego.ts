// F25 · Exprime la naranja: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_NARANJA } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'exprime-naranja',
  nombre: 'Exprime la naranja',
  gestos: ['Cierre de puño'],
  filtros: ['Agarre'],
  descripcionCorta: 'Cierre de puño',
  disponible: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'naranja',
  niveles: nivelesDesde(NIVELES_NARANJA),
  orden: 60,
  crear: () => import('./modulo').then((m) => m.crearNaranja),
}

export default juego
