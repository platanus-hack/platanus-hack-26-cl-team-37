// Dibujo de los 21 puntos y sus conexiones sobre un <canvas> (en espejo, ajustado como object-fit: cover).
// Lo usa la calibración (F08); la miniatura de cámara de los juegos puede reutilizarlo.
import { CONEXIONES } from '../metrics/geometria'
import { aVista } from '../metrics/calibracion'
import type { CuadroManos, ManoSeguida } from '../tracking/tipos'

/** Color por punto: muñeca roja; pulgar, índice, medio, anular y meñique como en 05_calibracion.png. */
export const COLOR_DEDO = ['#ff5f5f', '#ffa86b', '#b48cff', '#ffd23f', '#4fd1a1', '#5ab0ff']
export function colorPunto(i: number): string {
  return i === 0 ? COLOR_DEDO[0] : COLOR_DEDO[1 + Math.floor((i - 1) / 4)]
}

const DEDOS_SILUETA = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]
const PALMA = [0, 1, 5, 9, 13, 17]

type Pt = { x: number; y: number }

/** Silueta de la mano (solo fuentes simuladas, que no tienen video detrás). */
function silueta(g: CanvasRenderingContext2D, p: Pt[]) {
  const largoPalma = Math.hypot(p[9].x - p[0].x, p[9].y - p[0].y)
  const anchoDedo = Math.max(8, largoPalma * 0.32)
  const dir = { x: (p[0].x - p[9].x) / (largoPalma || 1), y: (p[0].y - p[9].y) / (largoPalma || 1) }
  const trazos: Pt[][] = [...DEDOS_SILUETA.map((d) => d.map((i) => p[i])), [p[0], { x: p[0].x + dir.x * largoPalma * 4, y: p[0].y + dir.y * largoPalma * 4 }]]
  const anchos = [...DEDOS_SILUETA.map(() => anchoDedo), largoPalma * 0.85]
  const pintar = (color: string, extra: number) => {
    g.strokeStyle = color
    g.fillStyle = color
    g.lineCap = 'round'
    g.lineJoin = 'round'
    trazos.forEach((t, k) => {
      g.lineWidth = anchos[k] + extra
      g.beginPath()
      t.forEach((q, j) => (j ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)))
      g.stroke()
    })
    g.lineWidth = anchoDedo + extra
    g.beginPath()
    PALMA.forEach((i, j) => (j ? g.lineTo(p[i].x, p[i].y) : g.moveTo(p[i].x, p[i].y)))
    g.closePath()
    g.fill()
    g.stroke()
  }
  pintar('#8394a8', 5)
  pintar('#c6d1de', 0)
}

/**
 * Dibuja las manos del cuadro. `elegida` va con colores por dedo; las demás, en gris.
 * `vista` = tamaño CSS del lienzo; el lienzo se ajusta a devicePixelRatio.
 */
export function dibujarManos(lienzo: HTMLCanvasElement, cuadro: CuadroManos | null, elegida: ManoSeguida | null, opciones: { silueta: boolean }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = lienzo.clientWidth
  const H = lienzo.clientHeight
  if (lienzo.width !== Math.round(W * dpr) || lienzo.height !== Math.round(H * dpr)) {
    lienzo.width = Math.round(W * dpr)
    lienzo.height = Math.round(H * dpr)
  }
  const g = lienzo.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)
  if (!cuadro) return
  const radio = Math.max(4, Math.min(8, W / 55))
  for (const mano of cuadro.manos) {
    const p = mano.landmarks.map((q) => aVista(q, cuadro, { ancho: W, alto: H }))
    const color = mano === elegida
    if (opciones.silueta) silueta(g, p)
    g.strokeStyle = color ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)'
    g.lineWidth = 2.5
    g.lineCap = 'round'
    g.beginPath()
    for (const [a, b] of CONEXIONES) {
      g.moveTo(p[a].x, p[a].y)
      g.lineTo(p[b].x, p[b].y)
    }
    g.stroke()
    p.forEach((q, i) => {
      g.beginPath()
      g.arc(q.x, q.y, radio, 0, Math.PI * 2)
      g.fillStyle = color ? colorPunto(i) : '#9fb0bf'
      g.fill()
      g.lineWidth = 2
      g.strokeStyle = '#16202a'
      g.stroke()
    })
  }
}
