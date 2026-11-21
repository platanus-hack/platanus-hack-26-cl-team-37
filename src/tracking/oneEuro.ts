// Filtro One Euro (Casiez, Roussel y Vogel, CHI 2012): suaviza mucho cuando la mano está quieta
// y poco cuando se mueve rápido, así reduce el temblor sin agregar retraso visible.

function alfa(dtS: number, corte: number): number {
  const tau = 1 / (2 * Math.PI * corte)
  return 1 / (1 + tau / dtS)
}

export class FiltroOneEuro {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev: number | null = null
  private minCutoff: number
  private beta: number
  private dCutoff: number
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  filtrar(x: number, tMs: number): number {
    if (this.xPrev == null || this.tPrev == null) {
      this.xPrev = x
      this.tPrev = tMs
      return x
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000)
    const dx = (x - this.xPrev) / dt
    const aD = alfa(dt, this.dCutoff)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const corte = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = alfa(dt, corte)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    this.tPrev = tMs
    return xHat
  }

  reiniciar() {
    this.xPrev = null
    this.tPrev = null
    this.dxPrev = 0
  }
}

/** Filtra los 21 puntos × 3 coordenadas de una mano. */
export class FiltroMano {
  private filtros: FiltroOneEuro[]
  constructor(minCutoff = 1.0, beta = 0.02) {
    this.filtros = Array.from({ length: 21 * 3 }, () => new FiltroOneEuro(minCutoff, beta))
  }
  filtrar<T extends { x: number; y: number; z: number }>(puntos: T[], tMs: number): { x: number; y: number; z: number }[] {
    return puntos.map((p, i) => ({
      x: this.filtros[i * 3].filtrar(p.x, tMs),
      y: this.filtros[i * 3 + 1].filtrar(p.y, tMs),
      z: this.filtros[i * 3 + 2].filtrar(p.z, tMs),
    }))
  }
  reiniciar() {
    this.filtros.forEach((f) => f.reiniciar())
  }
}
