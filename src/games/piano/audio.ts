// Sonido del Piano de dedos (WebAudio, un tono sintético corto por dedo). Nada depende de que suene: sin AudioContext,
// con el contexto suspendido o con el sonido silenciado, `tocar` no hace nada y no lanza errores.
// El contexto se crea en el primer `tocar` o en `desbloquear` (el paciente ya tocó "Comenzar", así que el navegador lo permite).
import type { LadoMano } from '../../domain/types'
import { frecuenciaNota, type Dedo } from './logica'

const CLAVE_SILENCIO = 'manoviva.piano.silencio'

export function leerSilencio(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_SILENCIO) === '1'
  } catch {
    return false
  }
}
function guardarSilencio(v: boolean) {
  try {
    globalThis.localStorage?.setItem(CLAVE_SILENCIO, v ? '1' : '0')
  } catch {
    /* sin almacenamiento: el silencio vale solo en esta sesión */
  }
}

/**
 * Qué muestra el botón: sonido solo si el paciente no lo silenció Y el contexto está corriendo. En iOS Safari el contexto
 * creado fuera de un toque queda `suspended` y `resume()` falla sin avisar: ahí el botón debe verse silenciado.
 */
export function botonSilenciado(silencio: boolean, estadoContexto: string | null): boolean {
  return silencio || estadoContexto !== 'running'
}

/**
 * Qué hace un toque en el botón. Silenciado por el paciente → activa y desbloquea; sonido activo pero contexto aún sin correr
 * → solo desbloquea (el toque es el gesto que iOS exige); sonando → silencia.
 */
export function accionToqueSonido(silencio: boolean, estadoContexto: string | null): { silencio: boolean; desbloquear: boolean } {
  if (silencio) return { silencio: false, desbloquear: true }
  if (estadoContexto !== 'running') return { silencio: false, desbloquear: true }
  return { silencio: true, desbloquear: false }
}

export class SonidoPiano {
  private ac: AudioContext | null = null
  private falla = false
  silencio: boolean

  constructor(silencio = leerSilencio()) {
    this.silencio = silencio
  }

  fijarSilencio(v: boolean) {
    this.silencio = v
    guardarSilencio(v)
  }

  private contexto(): AudioContext | null {
    if (this.falla) return null
    if (!this.ac) {
      try {
        const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) {
          this.falla = true
          return null
        }
        this.ac = new Ctor()
      } catch {
        this.falla = true
        return null
      }
    }
    if (this.ac.state === 'suspended') void this.ac.resume().catch(() => undefined)
    return this.ac
  }

  /** Para llamarlo desde un toque del paciente (p. ej. el botón de sonido): deja el contexto listo. */
  desbloquear() {
    this.contexto()
  }

  /** Estado del AudioContext ('running', 'suspended'…), o null si aún no existe o no hay WebAudio. */
  estado(): string | null {
    return this.ac?.state ?? null
  }

  tocar(dedo: Dedo, lado: LadoMano) {
    if (this.silencio) return
    const ac = this.contexto()
    if (!ac || ac.state !== 'running') return
    try {
      const t = ac.currentTime
      const osc = ac.createOscillator()
      const g = ac.createGain()
      osc.type = 'triangle'
      osc.frequency.value = frecuenciaNota(dedo, lado)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
      osc.connect(g).connect(ac.destination)
      osc.start(t)
      osc.stop(t + 0.6)
      osc.onended = () => {
        osc.disconnect()
        g.disconnect()
      }
    } catch {
      /* el sonido es un extra: si falla, el juego sigue */
    }
  }

  cerrar() {
    const ac = this.ac
    this.ac = null
    if (ac && ac.state !== 'closed') void ac.close().catch(() => undefined)
  }
}
