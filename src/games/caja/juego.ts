// F10 · Caja de juguetes: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { nivelesCaja, type Juego } from '../tipos'

const juego: Juego = {
  id: 'caja-juguetes',
  nombre: 'Caja de juguetes',
  gestos: ['Pinza', 'Agarre', 'Traslado'],
  filtros: ['Pinza', 'Agarre', 'Alcance'],
  descripcionCorta: 'Pinza y agarre',
  disponible: true,
  usaCamara: true,
  ruta: '/juguetes',
  miniatura: 'caja',
  niveles: nivelesCaja,
  orden: 10,
  crear: () => import('./modulo').then((m) => m.crearCaja),
}

export default juego
