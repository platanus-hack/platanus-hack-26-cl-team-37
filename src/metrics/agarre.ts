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

/** Umbrales ajustados a la línea base de la calibración (para manos con poca apertura). */
export function configDesdeCalibracion(aperturaMaxCm: number | null | undefined): ConfigAgarre {
  if (!aperturaMaxCm || aperturaMaxCm >= 7) return CONFIG_AGARRE
  const max = Math.max(3, aperturaMaxCm)
  return { umbralCierreCm: +(max * 0.35).toFixed(2), umbralAperturaCm: +(max * 0.55).toFixed(2) }
}
