// Tipos del registro de juegos y ayudas comunes. Cada juego se declara en su carpeta (src/games/<juego>/juego.ts) y
// el registro (registry.ts) los junta solo. Este archivo no importa juegos, así cada juego.ts lo usa sin ciclos.
import type { CrearJuego } from './shell/contrato'

export type Gesto =
  | 'Pinza'
  | 'Agarre'
  | 'Alcance'
  | 'Traslado'
  | 'Precisión'
  | 'Control'
  | 'Extensión'
  | 'Oposición del pulgar'
  | 'Apertura'
  | 'Cierre de puño'
  | 'Giro del antebrazo'
  | 'Independencia de dedos'

/** Filtros del catálogo /ejercicios (Prompt 3). */
export type FiltroGesto = 'Pinza' | 'Agarre' | 'Alcance'
export const FILTROS: FiltroGesto[] = ['Pinza', 'Agarre', 'Alcance']

export interface NivelJuego {
  nivel: number
  nombre: string
  /** Escala de los objetos (1 = tamaño base). */
  tamano: number
  cantidad: number
  /** Distancia de la zona de juego a la caja, en unidades de escena. */
  distanciaCaja: number
  /** Qué significa el nivel para el paciente (se muestra en /sesion/:juego/preparar). */
  detalle: string
}

export interface Juego {
  id: string
  nombre: string
  gestos: Gesto[]
  /** En qué filtros del catálogo aparece (además de "Todos"). */
  filtros: FiltroGesto[]
  descripcionCorta: string
  /** false = "Próximamente" en /ejercicios (no se puede abrir). Pasa a true cuando su feature esté done. */
  disponible: boolean
  /** true = no aparece en el catálogo /ejercicios (el código y las sesiones guardadas siguen; se puede abrir por URL). */
  oculto?: boolean
  usaCamara: boolean
  /** true = se juega con las dos manos a la vez (banda): la preparación no pregunta qué mano trabajar y guarda 'ambas'. */
  dosManos?: boolean
  /** true = la carga sale de la banda real: la preparación pregunta cuántas tiras hay entre las manos (src/banda/tiras.ts). */
  tirasBanda?: boolean
  ruta: string | null
  miniatura: string
  categoria?: string
  niveles: NivelJuego[]
  /** Posición en el catálogo /ejercicios (menor primero). Van de 10 en 10 para insertar sin mover a nadie. */
  orden: number
  /** Carga el módulo del juego con import() (su código, y Rapier si lo usa, no entran al bundle de la app). Sin esto
   *  el juego no se puede jugar (los "Próximamente"). */
  crear?: () => Promise<CrearJuego>
}

// Niveles de la Caja de juguetes (F10); también los usan los juegos aún sin niveles propios.
export const nivelesCaja: NivelJuego[] = [
  { nivel: 1, nombre: 'Objetos grandes', tamano: 1.35, cantidad: 4, distanciaCaja: 0.9, detalle: '4 objetos grandes, caja cerca' },
  { nivel: 2, nombre: 'Objetos medianos', tamano: 1.15, cantidad: 6, distanciaCaja: 1.1, detalle: '6 objetos medianos, caja a media distancia' },
  { nivel: 3, nombre: 'Objetos medianos, más lejos', tamano: 1.0, cantidad: 7, distanciaCaja: 1.35, detalle: '7 objetos medianos, caja más lejos' },
  { nivel: 4, nombre: 'Objetos pequeños', tamano: 0.85, cantidad: 8, distanciaCaja: 1.55, detalle: '8 objetos pequeños, caja lejos' },
  { nivel: 5, nombre: 'Objetos pequeños, lejos', tamano: 0.72, cantidad: 10, distanciaCaja: 1.75, detalle: '10 objetos pequeños, caja al fondo' },
]

/** Niveles de un juego cuyos nombre y detalle viven en su logica.ts (`cantidad` y `distanciaCaja` no se usan: la meta
 *  viene del plan). */
export function nivelesDesde(tabla: Record<1 | 2 | 3 | 4 | 5, { nombre: string; detalle: string }>): NivelJuego[] {
  return ([1, 2, 3, 4, 5] as const).map((n) => ({ nivel: n, nombre: tabla[n].nombre, tamano: 1, cantidad: 0, distanciaCaja: 0, detalle: tabla[n].detalle }))
}
