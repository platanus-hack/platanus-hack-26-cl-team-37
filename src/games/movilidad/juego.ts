// F11 · Movilidad guiada: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_MOVILIDAD } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'movilidad-guiada',
  nombre: 'Movilidad guiada',
  gestos: ['Apertura', 'Extensión'],
  filtros: ['Agarre'],
  descripcionCorta: 'Calentamiento: abrir y cerrar',
  categoria: 'Calentamiento',
  disponible: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'movilidad',
  niveles: nivelesDesde(NIVELES_MOVILIDAD),
  orden: 20,
  crear: () => import('./modulo').then((m) => m.crearMovilidad),
}

export default juego
