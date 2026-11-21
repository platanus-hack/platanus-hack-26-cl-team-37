// F22 · Torre de cubos: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
// Aún "Próximamente": al cerrar su feature, `disponible: true`, sus niveles y `crear` (como en caja/juego.ts).
import { nivelesCaja, type Juego } from '../tipos'

const juego: Juego = {
  id: 'torre-cubos',
  nombre: 'Torre de cubos',
  gestos: ['Precisión', 'Control'],
  filtros: ['Pinza', 'Agarre'],
  descripcionCorta: 'Precisión y control',
  disponible: false,
  usaCamara: true,
  ruta: null,
  miniatura: 'torre',
  niveles: nivelesCaja,
  orden: 30,
}

export default juego
