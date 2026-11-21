// Suavidad del movimiento con SPARC (Spectral Arc Length; Balasubramanian et al., 2012/2015).
//
// Fórmula elegida:
//   1. Trayectoria de la muñeca en el plano de la imagen, remuestreada a 60 Hz.
//   2. Perfil de rapidez v(t). Se normaliza por su máximo.
//   3. Espectro de magnitud |V(f)| con FFT (relleno con ceros a 2^k ≥ 4·N), normalizado por |V(0)|.
//   4. Se conserva la banda 0..fc con fc adaptativa: la frecuencia más alta ≤ 10 Hz donde |V̂| ≥ 0,05.
//   5. SPARC = −Σ sqrt( (Δf / fc)² + (Δ|V̂|)² )  (largo de arco del espectro). Más cercano a 0 = más suave.
// SPARC es adimensional e invariante a la escala, por eso basta la posición normalizada de la imagen.
//
// Escala 0–100 para la pantalla: lineal entre SPARC = −6 (0 puntos) y SPARC = −1,6 (100 puntos).
// Un movimiento de jerk mínimo da ≈ −1,6. Se calcula por segmento (desde que se toma un objeto
// hasta que se suelta) y la sesión reporta el promedio.

export function fftMagnitud(senal: number[]): number[] {
  let n = 1
  while (n < senal.length) n <<= 1
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < senal.length; i++) re[i] = senal[i]
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = Math.hypot(re[i], im[i])
  return out
}

/** SPARC de un perfil de rapidez muestreado a `fs` Hz. */
export function sparc(rapidez: number[], fs: number, fcMax = 10, umbral = 0.05): number {
  if (rapidez.length < 4) return 0
  const max = Math.max(...rapidez)
  if (max <= 0) return 0
  const v = rapidez.map((x) => x / max)
  let nfft = 1
  while (nfft < v.length * 4) nfft <<= 1
  const relleno = v.concat(new Array(nfft - v.length).fill(0))
  const mag = fftMagnitud(relleno)
  const df = fs / nfft
  const kMax = Math.min(Math.floor(fcMax / df), nfft / 2)
  const m0 = mag[0] || 1
  const espectro: number[] = []
  for (let k = 0; k <= kMax; k++) espectro.push(mag[k] / m0)
  // corte adaptativo: último índice con magnitud ≥ umbral
  let kc = 0
  for (let k = 0; k < espectro.length; k++) if (espectro[k] >= umbral) kc = k
  const fc = Math.max(kc * df, df)
  let largo = 0
  for (let k = 1; k <= kc; k++) {
    largo += Math.sqrt((df / fc) ** 2 + (espectro[k] - espectro[k - 1]) ** 2)
  }
  return -largo
}

export function sparcAPuntaje(s: number): number {
  const p = ((s - -6) / (-1.6 - -6)) * 100
  return Math.round(Math.min(100, Math.max(0, p)))
}

export interface PuntoTrayectoria {
  t: number // ms
  x: number
  y: number
}

/** Remuestrea por interpolación lineal y devuelve la rapidez (unidades/s) a `fs` Hz. */
export function rapidezRemuestreada(tray: PuntoTrayectoria[], fs = 60): number[] {
  if (tray.length < 2) return []
  const t0 = tray[0].t
  const tf = tray[tray.length - 1].t
  const dt = 1000 / fs
  const xs: number[] = []
  const ys: number[] = []
  let j = 0
  for (let t = t0; t <= tf; t += dt) {
    while (j < tray.length - 2 && tray[j + 1].t < t) j++
    const a = tray[j]
    const b = tray[j + 1]
    const span = b.t - a.t || 1
    const u = Math.min(1, Math.max(0, (t - a.t) / span))
    xs.push(a.x + (b.x - a.x) * u)
    ys.push(a.y + (b.y - a.y) * u)
  }
  const v: number[] = []
  for (let i = 1; i < xs.length; i++) v.push(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) * fs)
  return v
}

/** Puntaje de suavidad 0–100 de un segmento de trayectoria; null si es demasiado corto. */
export function suavidadSegmento(tray: PuntoTrayectoria[]): number | null {
  if (tray.length < 6 || tray[tray.length - 1].t - tray[0].t < 300) return null
  const v = rapidezRemuestreada(tray, 60)
  if (v.length < 10) return null
  return sparcAPuntaje(sparc(v, 60))
}

export function suavidadSesion(segmentos: PuntoTrayectoria[][]): number | null {
  const puntajes = segmentos.map(suavidadSegmento).filter((x): x is number => x != null)
  if (!puntajes.length) return null
  return Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length)
}
