// Candado entre procesos para los e2e que cambian el estado del paciente de PRUEBA (privacidad F18, prescripción F17) o
// necesitan que el panel del terapeuta vea solo a los 4 pacientes demo. Playwright corre los archivos en paralelo (y
// las líneas de trabajo en worktrees distintos comparten la misma BD), así que el candado vive en la carpeta temporal
// del sistema: un directorio creado de forma atómica. Un candado de más de 10 minutos se considera abandonado.
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RUTA = join(tmpdir(), 'manoviva-bloqueo-paciente-prueba')
const OBSOLETO_MS = 10 * 60_000
let mio = false // este proceso tiene el candado (si tomarBloqueo falló, soltarBloqueo no toca el de otro)

export async function tomarBloqueo(esperaMaxMs = 240_000): Promise<void> {
  const limite = Date.now() + esperaMaxMs
  for (;;) {
    try {
      mkdirSync(RUTA)
      mio = true
      return
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      try {
        if (Date.now() - statSync(RUTA).mtimeMs > OBSOLETO_MS) rmSync(RUTA, { recursive: true, force: true })
      } catch {
        /* otro proceso lo soltó entre medio */
      }
      if (Date.now() > limite) throw new Error('No se pudo tomar el candado del paciente de prueba (otro e2e lo tiene).')
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

export function soltarBloqueo(): void {
  if (!mio) return
  mio = false
  rmSync(RUTA, { recursive: true, force: true })
}
