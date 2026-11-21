// F23 · Pinza fina: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_PINZA } from './logica'
import { nivelesDesde, type Juego } from '../tipos'

const juego: Juego = {
  id: 'pinza-fina',
  nombre: 'Pinza fina',
  gestos: ['Oposición del pulgar'],
  filtros: ['Pinza'],
  descripcionCorta: 'Oposición del pulgar',
  disponible: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'pinza',
  niveles: nivelesDesde(NIVELES_PINZA),
  orden: 40,
  crear: () => import('./modulo').then((m) => m.crearPinza),
}

export default juego
