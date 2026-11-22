// Colores de objetos reales, la excepción del brandbook (brandbook/README.md §3): madera, fruta, jugo, vidrio, cuero, piedra y las
// bandas elásticas, cuyo color indica su resistencia como en las bandas de terapia reales. Todo lo demás de las
// escenas sale de la paleta (assets/colores.ts). Sin three.js: lo puede importar la lógica pura de un juego.
// Junto con colores.ts, es el único archivo de src/games con colores escritos a mano (lo comprueba colores.test.ts).

export const NATURAL = {
  madera: 0xc69463,
  maderaClara: 0xece2cf,
  maderaSombra: 0xd8c9ad,
  maderaBase: 0xe6d9bd,
  naranja: 0xf08a24,
  naranjaMitad: 0xe27a1c,
  naranjaExprimida: 0xc2570f,
  naranjaBrillo: 0x3a1500,
  hoja: 0x4fa05a,
  jugo: 0xf2a02a,
  jugoBrillo: 0x5a2a00,
  pulpa: 0xffd37a,
  pulpaBrillo: 0x7a4a00,
  vidrio: 0xcfe6f2,
  cuero: 0x7a4b2a,
  piedra: 0x8d8f99,
} as const

/** Vetas del lienzo de la mesa (madera natural). */
export const VETAS = { fondo: '#c69463', oscura: 'rgba(120, 72, 36, 0.06)', clara: 'rgba(255, 230, 190, 0.07)' } as const

/** Bandas elásticas de Banda (de la más suave a la más dura), con el color de las bandas de terapia. */
export const BANDAS = { amarilla: '#f2c230', roja: '#e5473f', verde: '#3aaa5c', azul: '#3d8fe0', negra: '#3a4350' } as const
