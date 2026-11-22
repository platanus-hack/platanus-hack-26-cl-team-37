// Cuántas tiras de banda hay entre las manos: se guarda en este navegador, en la misma clave que usa el laboratorio
// (/laboratorio), y la leen los juegos de banda que calculan la carga con la curva (Honda). Las tiras en paralelo suman
// su carga: con el doble de tiras, el mismo estiramiento carga el doble.
const CLAVE = 'manoviva.laboratorio.tiras'
export const TIRAS_POR_DEFECTO = 2

/** Opciones para elegir al preparar un juego, con la forma de tomar la banda que corresponde a cada una. */
export const OPCIONES_TIRAS: { v: number; n: string }[] = [
  { v: 1, n: '1 · abierta' },
  { v: 2, n: '2 · lazo' },
  { v: 4, n: '4 · doblado' },
]

export function leerTiras(): number {
  try {
    const n = Number(JSON.parse(localStorage.getItem(CLAVE) ?? 'null'))
    return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.round(n) : TIRAS_POR_DEFECTO
  } catch {
    return TIRAS_POR_DEFECTO
  }
}

export function guardarTiras(n: number) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(n))
  } catch {
    // Modo privado o sin espacio: vale solo para esta visita.
  }
}
