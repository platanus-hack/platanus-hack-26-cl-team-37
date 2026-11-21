// Paleta del brandbook para lo que se dibuja fuera del CSS (lienzos 2D de los juegos, gráficos SVG). Única fuente de verdad:
// brandbook/paleta.json (la genera brandbook/herramientas/generar_brandbook.py). En CSS se usan las variables --kuwu-*.
import paleta from '../../brandbook/paleta.json'

type Nombre = keyof typeof paleta.colores | keyof typeof paleta.derivados

export const KUWU = Object.fromEntries(
  [...Object.entries(paleta.colores), ...Object.entries(paleta.derivados)].map(([n, c]) => [n, c.hex]),
) as Record<Nombre, string>

/** Color de la paleta con transparencia, para lienzos: kuwuAlfa('marino', 0.9) → 'rgba(36, 40, 59, 0.9)'. */
export function kuwuAlfa(nombre: Nombre, alfa: number): string {
  const h = KUWU[nombre]
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alfa})`
}

/** Color de la paleta como número, para three.js. */
export function kuwuNum(nombre: Nombre): number {
  return parseInt(KUWU[nombre].slice(1), 16)
}

/** Fuente de la interfaz (brandbook §5) para lienzos: fuenteKuwu(800, 30) → '800 30px Nunito, system-ui, sans-serif'. */
export function fuenteKuwu(peso: number, px: number): string {
  return `${peso} ${px}px Nunito, system-ui, sans-serif`
}
