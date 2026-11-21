// F24 · Atrapa burbujas: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
// Nombre, detalle, tamaño y vida de las burbujas viven en logica.ts; la meta de burbujas viene del plan (metaAgarres).
import { NIVELES_BURBUJAS } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'atrapa-burbujas',
  nombre: 'Atrapa burbujas',
  gestos: ['Alcance', 'Extensión'],
  filtros: ['Alcance'],
  descripcionCorta: 'Alcance y extensión',
  disponible: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'burbujas',
  niveles: nivelesDesde(NIVELES_BURBUJAS),
  orden: 50,
  crear: () => import('./modulo').then((m) => m.crearBurbujas),
}

export default juego
