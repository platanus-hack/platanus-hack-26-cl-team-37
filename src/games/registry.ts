// Registro de juegos/ejercicios. Cada juego declara qué gestos trabaja y qué cambia en cada nivel.
import { NIVELES_MOVILIDAD } from './movilidad/logica'
import { NIVELES_NARANJA } from './naranja/logica'
import { NIVELES_PIANO } from './piano/logica'
import { NIVELES_PINZA } from './pinza/logica'

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
  usaCamara: boolean
  ruta: string | null
  miniatura: string
  categoria?: string
  niveles: NivelJuego[]
}

const nivelesCaja: NivelJuego[] = [
  { nivel: 1, nombre: 'Objetos grandes', tamano: 1.35, cantidad: 4, distanciaCaja: 0.9, detalle: '4 objetos grandes, caja cerca' },
  { nivel: 2, nombre: 'Objetos medianos', tamano: 1.15, cantidad: 6, distanciaCaja: 1.1, detalle: '6 objetos medianos, caja a media distancia' },
  { nivel: 3, nombre: 'Objetos medianos, más lejos', tamano: 1.0, cantidad: 7, distanciaCaja: 1.35, detalle: '7 objetos medianos, caja más lejos' },
  { nivel: 4, nombre: 'Objetos pequeños', tamano: 0.85, cantidad: 8, distanciaCaja: 1.55, detalle: '8 objetos pequeños, caja lejos' },
  { nivel: 5, nombre: 'Objetos pequeños, lejos', tamano: 0.72, cantidad: 10, distanciaCaja: 1.75, detalle: '10 objetos pequeños, caja al fondo' },
]

// Movilidad guiada (F11): nombre, detalle y umbrales viven en src/games/movilidad/logica.ts. `cantidad` no se usa:
// la meta de ciclos viene del plan (metaAgarres).
const nivelesMovilidad: NivelJuego[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  nivel: n,
  nombre: NIVELES_MOVILIDAD[n].nombre,
  tamano: 1,
  cantidad: 0,
  distanciaCaja: 0,
  detalle: NIVELES_MOVILIDAD[n].detalle,
}))

// Pinza fina (F23): nombre, detalle y tiempo por toque viven en src/games/pinza/logica.ts. `cantidad` no se usa:
// la meta de toques viene del plan (metaAgarres).
const nivelesPinza: NivelJuego[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  nivel: n,
  nombre: NIVELES_PINZA[n].nombre,
  tamano: 1,
  cantidad: 0,
  distanciaCaja: 0,
  detalle: NIVELES_PINZA[n].detalle,
}))

// Exprime la naranja (F25): nombre, detalle y umbral de cada nivel viven en src/games/naranja/logica.ts. `cantidad` no se usa:
// la meta de cierres viene del plan (metaAgarres).
const nivelesNaranja: NivelJuego[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  nivel: n,
  nombre: NIVELES_NARANJA[n].nombre,
  tamano: 1,
  cantidad: 0,
  distanciaCaja: 0,
  detalle: NIVELES_NARANJA[n].detalle,
}))

// Piano de dedos (F27): nombre y detalle viven en src/games/piano/logica.ts. `cantidad` no se usa: la meta de notas viene del plan (metaAgarres).
const nivelesPiano: NivelJuego[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  nivel: n,
  nombre: NIVELES_PIANO[n].nombre,
  tamano: 1,
  cantidad: 0,
  distanciaCaja: 0,
  detalle: NIVELES_PIANO[n].detalle,
}))

export const JUEGOS: Juego[] = [
  {
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
  },
  {
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
    niveles: nivelesMovilidad,
  },
  {
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
  },
  {
    id: 'pinza-fina',
    nombre: 'Pinza fina',
    gestos: ['Oposición del pulgar'],
    filtros: ['Pinza'],
    descripcionCorta: 'Oposición del pulgar',
    disponible: true,
    usaCamara: true,
    ruta: null,
    miniatura: 'pinza',
    niveles: nivelesPinza,
  },
  {
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
  },
  {
    id: 'exprime-naranja',
    nombre: 'Exprime la naranja',
    gestos: ['Cierre de puño'],
    filtros: ['Agarre'],
    descripcionCorta: 'Cierre de puño',
    disponible: true,
    usaCamara: true,
    ruta: null,
    miniatura: 'naranja',
    niveles: nivelesNaranja,
  },
  {
    id: 'memoria-cartas',
    nombre: 'Memoria de cartas',
    gestos: ['Giro del antebrazo'],
    filtros: [],
    descripcionCorta: 'Giro del antebrazo',
    disponible: false,
    usaCamara: true,
    ruta: null,
    miniatura: 'memoria',
    niveles: nivelesCaja,
  },
  {
    id: 'piano-dedos',
    nombre: 'Piano de dedos',
    gestos: ['Independencia de dedos'],
    filtros: [],
    descripcionCorta: 'Independencia de dedos',
    disponible: true,
    usaCamara: true,
    ruta: null,
    miniatura: 'piano',
    niveles: nivelesPiano,
  },
]

export function juegoPorId(id: string): Juego | undefined {
  return JUEGOS.find((j) => j.id === id)
}

export function nombreJuego(id: string): string {
  return juegoPorId(id)?.nombre ?? id
}

export function nivelDe(juegoId: string, nivel: number): NivelJuego {
  const j = juegoPorId(juegoId)
  const niveles = j?.niveles ?? nivelesCaja
  return niveles[Math.min(niveles.length, Math.max(1, nivel)) - 1]
}
