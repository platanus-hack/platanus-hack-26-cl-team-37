// Detección de agarre (pinza) con histéresis.
// Cierra cuando la apertura pulgar–índice baja de `umbralCierreCm` Y hay un objeto cerca;
// se abre solo cuando vuelve a superar `umbralAperturaCm` (mayor). Así se evita el parpadeo.

export interface ConfigAgarre {
  umbralCierreCm: number
  umbralAperturaCm: number
}

export const CONFIG_AGARRE: ConfigAgarre = { umbralCierreCm: 2.5, umbralAperturaCm: 4.0 }

export type CambioAgarre = 'inicio' | 'fin' | null

export interface EstadoAgarre {
  agarrando: boolean
  /** Solo pasoAgarreTolerante: ms seguidos sin ver la mano mientras agarra. */
  sinManoMs?: number
}

export function pasoAgarre(
  estado: EstadoAgarre,
  aperturaCm: number | null,
  objetoCerca: boolean,
  cfg: ConfigAgarre = CONFIG_AGARRE,
): { estado: EstadoAgarre; cambio: CambioAgarre } {
  if (aperturaCm == null) {
    // sin mano: si estaba agarrando, se suelta
    return estado.agarrando ? { estado: { agarrando: false }, cambio: 'fin' } : { estado, cambio: null }
  }
  if (!estado.agarrando) {
    if (aperturaCm < cfg.umbralCierreCm && objetoCerca) return { estado: { agarrando: true }, cambio: 'inicio' }
    return { estado, cambio: null }
  }
  if (aperturaCm > cfg.umbralAperturaCm) return { estado: { agarrando: false }, cambio: 'fin' }
  return { estado, cambio: null }
}

/** Hueco de seguimiento (ms) que se tolera mientras se sostiene un objeto: un parpadeo más corto no suelta el agarre. */
export const GRACIA_SIN_MANO_MS = 350

/**
 * pasoAgarre que no le cobra al paciente un parpadeo del seguimiento. Con la mano a la vista es idéntico a pasoAgarre.
 * Si la mano deja de verse MIENTRAS agarra, el agarre se mantiene hasta `graciaMs`; pasado ese tiempo termina con
 * `perdida: true`: no fue el paciente quien soltó, y quien llama no debe contarlo como un objeto bien colocado.
 * `dtMs` = ms de juego desde el cuadro anterior.
 */
export function pasoAgarreTolerante(
  estado: EstadoAgarre,
  aperturaCm: number | null,
  objetoCerca: boolean,
  dtMs: number,
  cfg: ConfigAgarre = CONFIG_AGARRE,
  graciaMs: number = GRACIA_SIN_MANO_MS,
): { estado: EstadoAgarre; cambio: CambioAgarre; perdida: boolean } {
  if (aperturaCm == null && estado.agarrando) {
    const sinManoMs = (estado.sinManoMs ?? 0) + Math.max(0, dtMs)
    if (sinManoMs < graciaMs) return { estado: { agarrando: true, sinManoMs }, cambio: null, perdida: false }
    return { estado: { agarrando: false }, cambio: 'fin', perdida: true }
  }
  // Con la mano a la vista (o sin agarrar) no hay hueco que contar.
  const r = pasoAgarre({ agarrando: estado.agarrando }, aperturaCm, objetoCerca, cfg)
  return { ...r, perdida: false }
}

/** Umbrales ajustados a la línea base de la calibración (para manos con poca apertura). */
export function configDesdeCalibracion(aperturaMaxCm: number | null | undefined): ConfigAgarre {
  if (!aperturaMaxCm || aperturaMaxCm >= 7) return CONFIG_AGARRE
  const max = Math.max(3, aperturaMaxCm)
  return { umbralCierreCm: +(max * 0.35).toFixed(2), umbralAperturaCm: +(max * 0.55).toFixed(2) }
}
