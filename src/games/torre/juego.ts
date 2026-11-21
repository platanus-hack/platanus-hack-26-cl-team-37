// F22 · Torre de cubos: su entrada en el catálogo. El registro (src/games/registry.ts) la carga sola.
import { NIVELES_TORRE } from './logica'
import type { Juego, NivelJuego } from '../tipos'

// Nombre, detalle, cubos (= meta de altura), lado y tolerancia viven en logica.ts.
// `tamano` = lado del cubo en cm, `cantidad` = cubos de la torre; `distanciaCaja` no se usa.
const nivelesTorre: NivelJuego[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  nivel: n,
  nombre: NIVELES_TORRE[n].nombre,
  tamano: NIVELES_TORRE[n].ladoCm,
  cantidad: NIVELES_TORRE[n].cubos,
  distanciaCaja: 0,
  detalle: NIVELES_TORRE[n].detalle,
}))

const juego: Juego = {
  id: 'torre-cubos',
  nombre: 'Torre de cubos',
  gestos: ['Precisión', 'Control'],
  filtros: ['Pinza', 'Agarre'],
  descripcionCorta: 'Precisión y control',
  disponible: true,
  usaCamara: true,
  ruta: null,
  miniatura: 'torre',
  niveles: nivelesTorre,
  orden: 30,
  crear: () => import('./modulo').then((m) => m.crearTorre),
}

export default juego
