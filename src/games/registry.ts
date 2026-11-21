// Registro de juegos/ejercicios. Cada juego declara qué gestos trabaja y qué cambia en cada nivel.
export type Gesto = 'Pinza' | 'Agarre' | 'Alcance' | 'Traslado' | 'Precisión' | 'Control' | 'Extensión' | 'Oposición del pulgar' | 'Apertura'

export interface NivelJuego {
  nivel: number
  nombre: string
  /** Escala de los objetos (1 = tamaño base). */
  tamano: number
  cantidad: number
  /** Distancia de la zona de juego a la caja, en unidades de escena. */
  distanciaCaja: number
}

export interface Juego {
  id: string
  nombre: string
  gestos: Gesto[]
  filtros: ('Pinza' | 'Agarre' | 'Alcance')[]
  descripcionCorta: string
  disponible: boolean
  usaCamara: boolean
  ruta: string | null
  miniatura: string
  categoria?: string
  niveles: NivelJuego[]
}

const nivelesCaja: NivelJuego[] = [
  { nivel: 1, nombre: 'Objetos grandes', tamano: 1.35, cantidad: 4, distanciaCaja: 0.9 },
  { nivel: 2, nombre: 'Objetos medianos', tamano: 1.15, cantidad: 6, distanciaCaja: 1.1 },
  { nivel: 3, nombre: 'Objetos medianos, más lejos', tamano: 1.0, cantidad: 7, distanciaCaja: 1.35 },
  { nivel: 4, nombre: 'Objetos pequeños', tamano: 0.85, cantidad: 8, distanciaCaja: 1.55 },
  { nivel: 5, nombre: 'Objetos pequeños, lejos', tamano: 0.72, cantidad: 10, distanciaCaja: 1.75 },
]

const nivelesMovilidad: NivelJuego[] = [1, 2, 3, 4, 5].map((n) => ({
  nivel: n,
  nombre: ['Rango cómodo', 'Rango medio', 'Rango amplio', 'Rango amplio y lento', 'Rango completo'][n - 1],
  tamano: 1,
  cantidad: 6 + n * 2,
  distanciaCaja: 0,
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
    filtros: ['Agarre'],
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
    disponible: false,
    usaCamara: true,
    ruta: null,
    miniatura: 'pinza',
    niveles: nivelesCaja,
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
