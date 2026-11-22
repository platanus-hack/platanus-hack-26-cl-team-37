// Ciclo de una sesión de juego (pura, con pruebas en ciclo.test.ts).
//
// Fases: 'esperando' (todavía no se ha visto la mano: el tiempo no corre) → 'jugando' ⇄ 'pausa' → 'terminada'.
// Pausa si hay al menos un motivo activo:
//   - 'manual'      el paciente tocó Menú;
//   - 'orientacion' el teléfono está en vertical ("Gira tu teléfono");
//   - 'oculta'      la pestaña/app pasó a segundo plano;
//   - 'sin-mano'    no se ve ninguna mano hace más de 2 s (pausa automática). Se reanuda sola al volver la mano.
// Termina por tiempo (tiempo de juego activo ≥ duración) o por meta (contador ≥ meta > 0; se deja ver el aviso
// "Meta cumplida" ESPERA_META_MS antes de terminar), o a mano con terminarCiclo(). Un juego que se queda sin nada
// que ofrecer sin cumplir la meta (entrada `agotado`) termina igual que por tiempo.

export type FaseCiclo = 'esperando' | 'jugando' | 'pausa' | 'terminada'
export type MotivoPausa = 'manual' | 'orientacion' | 'oculta' | 'sin-mano'
export type MotivoFin = 'tiempo' | 'meta' | 'manual'

export const UMBRAL_SIN_MANO_MS = 2000
export const ESPERA_META_MS = 2500
/** Un salto de reloj mayor a esto (pestaña congelada, depurador) no cuenta como tiempo jugado. */
export const DT_MAX_MS = 250

export interface EstadoCiclo {
  fase: FaseCiclo
  motivos: MotivoPausa[]
  /** ms de juego activo (solo en 'jugando'). */
  jugadoMs: number
  /** Reloj de pared (ms) del último paso. */
  ultimoT: number | null
  /** ms de reloj de pared en que empezó a jugarse por primera vez. */
  inicioT: number | null
  vioMano: boolean
  /** ms (reloj de pared) en que se cumplió la meta. */
  metaT: number | null
  fin: MotivoFin | null
}

export interface EntradaCiclo {
  /** Reloj de pared en ms (performance.now()). */
  t: number
  /** ms desde la última detección de una mano (null = nunca se ha visto). */
  sinManoMs: number | null
  manual: boolean
  vertical: boolean
  oculta: boolean
  contador: number
  /** Opcional: el juego avisó que no le queda nada por hacer (HudJuego.terminado). Termina como por tiempo. */
  agotado?: boolean
}

export interface ConfigCiclo {
  duracionMs: number
  /** 0 = sin meta. */
  meta: number
}

export type CambioCiclo =
  | { tipo: 'inicio' }
  | { tipo: 'pausa'; motivo: MotivoPausa }
  | { tipo: 'reanudar' }
  | { tipo: 'perdida' }
  | { tipo: 'meta' }
  | { tipo: 'fin'; motivo: MotivoFin }

export function cicloInicial(): EstadoCiclo {
  return { fase: 'esperando', motivos: [], jugadoMs: 0, ultimoT: null, inicioT: null, vioMano: false, metaT: null, fin: null }
}

/** Motivos de pausa activos, en orden de prioridad (el primero es el que se muestra). */
export function motivosPausa(e: Pick<EstadoCiclo, 'vioMano'>, x: Pick<EntradaCiclo, 'manual' | 'vertical' | 'oculta' | 'sinManoMs'>): MotivoPausa[] {
  const m: MotivoPausa[] = []
  if (x.oculta) m.push('oculta')
  if (x.vertical) m.push('orientacion')
  if (x.manual) m.push('manual')
  if (e.vioMano && (x.sinManoMs == null || x.sinManoMs > UMBRAL_SIN_MANO_MS)) m.push('sin-mano')
  return m
}

export function pasoCiclo(e: EstadoCiclo, x: EntradaCiclo, cfg: ConfigCiclo): { estado: EstadoCiclo; cambios: CambioCiclo[] } {
  if (e.fase === 'terminada') return { estado: e, cambios: [] }
  const cambios: CambioCiclo[] = []
  const dt = e.ultimoT == null ? 0 : Math.min(DT_MAX_MS, Math.max(0, x.t - e.ultimoT))
  const s: EstadoCiclo = { ...e, ultimoT: x.t }
  if (e.fase === 'jugando') s.jugadoMs += dt

  const manoReciente = x.sinManoMs != null && x.sinManoMs <= UMBRAL_SIN_MANO_MS
  s.vioMano = e.vioMano || manoReciente
  s.motivos = motivosPausa(s, x)

  const siguiente: FaseCiclo = s.motivos.some((m) => m !== 'sin-mano') ? 'pausa' : !s.vioMano ? 'esperando' : s.motivos.length ? 'pausa' : 'jugando'
  if (siguiente !== e.fase) {
    if (siguiente === 'jugando' && s.inicioT == null) {
      s.inicioT = x.t
      cambios.push({ tipo: 'inicio' })
    } else if (siguiente === 'jugando' && e.fase === 'pausa') {
      cambios.push({ tipo: 'reanudar' })
    } else if (siguiente === 'pausa' && e.fase === 'jugando') {
      if (s.motivos[0] === 'sin-mano') cambios.push({ tipo: 'perdida' })
      cambios.push({ tipo: 'pausa', motivo: s.motivos[0] })
    }
    s.fase = siguiente
  }

  // Meta: aviso y, tras ESPERA_META_MS, fin.
  if (cfg.meta > 0 && x.contador >= cfg.meta && s.metaT == null) {
    s.metaT = x.t
    cambios.push({ tipo: 'meta' })
  }
  if (s.metaT != null && x.t - s.metaT >= ESPERA_META_MS) return terminar(s, 'meta', cambios)
  // El juego se agotó sin cumplir la meta (si la cumplió, manda el aviso de meta de arriba): no hay nada que esperar.
  if (x.agotado && s.metaT == null && s.inicioT != null) return terminar(s, 'tiempo', cambios)
  if (s.jugadoMs >= cfg.duracionMs) {
    s.jugadoMs = cfg.duracionMs
    return terminar(s, 'tiempo', cambios)
  }
  return { estado: s, cambios }
}

function terminar(s: EstadoCiclo, motivo: MotivoFin, cambios: CambioCiclo[]) {
  return { estado: { ...s, fase: 'terminada' as const, fin: motivo }, cambios: [...cambios, { tipo: 'fin' as const, motivo }] }
}

/** Fin a pedido del paciente ("Terminar sesión" en el menú). */
export function terminarCiclo(e: EstadoCiclo): { estado: EstadoCiclo; cambios: CambioCiclo[] } {
  if (e.fase === 'terminada') return { estado: e, cambios: [] }
  return terminar(e, 'manual', [])
}

/** Segundos que quedan (para el HUD si un juego prefiere cuenta regresiva). */
export function restanteS(e: EstadoCiclo, cfg: ConfigCiclo): number {
  return Math.max(0, (cfg.duracionMs - e.jugadoMs) / 1000)
}
