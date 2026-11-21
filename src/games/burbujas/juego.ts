// F24 · Atrapa burbujas: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
// Aún "Próximamente": al cerrar su feature, `disponible: true`, sus niveles y `crear` (como en caja/juego.ts).
import { nivelesCaja, type Juego } from '../tipos'

const juego: Juego = {
  id: 'atrapa-burbujas',
  nombre: 'Atrapa burbujas',
  gestos: ['Alcance', 'Extensión'],
  filtros: ['Alcance'],
  descripcionCorta: 'Alcance y extensión',
  disponible: false,
  usaCamara: true,
  ruta: null,
  miniatura: 'burbujas',
  niveles: nivelesCaja,
  orden: 50,
}

export default juego
