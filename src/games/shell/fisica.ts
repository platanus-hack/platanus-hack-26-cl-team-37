// Física con Rapier, cargada SOLO si el juego declara usaFisica (import diferido: el paquete trae el wasm en
// base64, ~2 MB, y no debe entrar al bundle del juego ni de la app si no se usa).
// La base crea el mundo con gravedad, el piso de la mesa como colisionador fijo, y lo avanza a 60 Hz fijos
// (acumulador) antes de cada actualizar() del juego, solo mientras se juega.
import type RAPIER_NS from '@dimforge/rapier3d-compat'

export type Rapier = typeof RAPIER_NS

export interface Fisica {
  RAPIER: Rapier
  mundo: RAPIER_NS.World
  /** Paso fijo en segundos (1/60). */
  paso: number
  /** Avanza el mundo `dt` segundos en pasos fijos (máx. 4 pasos por cuadro). */
  avanzar(dt: number): void
  liberar(): void
}

export const PASO_FISICA = 1 / 60

export async function cargarFisica(mesa: { ancho: number; fondo: number; altura: number; z: number }): Promise<Fisica> {
  const mod = await import('@dimforge/rapier3d-compat')
  const RAPIER = (mod.default ?? mod) as Rapier
  await RAPIER.init()
  const mundo = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  // Escena en unidades de ~10 cm: la gravedad se deja en 9,81 u/s² (caída algo más lenta que la real, más fácil de seguir).
  const piso = RAPIER.ColliderDesc.cuboid(mesa.ancho / 2, 0.05, mesa.fondo / 2).setTranslation(0, mesa.altura - 0.05, mesa.z).setFriction(0.9)
  mundo.createCollider(piso)
  let acumulado = 0
  return {
    RAPIER,
    mundo,
    paso: PASO_FISICA,
    avanzar(dt: number) {
      acumulado = Math.min(acumulado + dt, PASO_FISICA * 4)
      while (acumulado >= PASO_FISICA) {
        mundo.step()
        acumulado -= PASO_FISICA
      }
    },
    liberar() {
      mundo.free()
    },
  }
}
