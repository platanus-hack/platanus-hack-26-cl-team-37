// Registro de lo que crea un asset para poder liberarlo (dispose) al desmontar el juego o rearmar la escena.
// Cada juego ya guarda sus arreglos de materiales, geometrías y texturas: se los pasa a los assets como `Recursos`.
import * as THREE from 'three'

export interface Recursos {
  materiales: THREE.Material[]
  geometrias: THREE.BufferGeometry[]
  texturas: THREE.Texture[]
}

export function nuevosRecursos(): Recursos {
  return { materiales: [], geometrias: [], texturas: [] }
}

/** Registra un material (o varios) y lo devuelve. */
export function material<M extends THREE.Material>(r: Recursos, m: M): M {
  r.materiales.push(m)
  return m
}

/** Registra una geometría y la devuelve. */
export function geometria<G extends THREE.BufferGeometry>(r: Recursos, g: G): G {
  r.geometrias.push(g)
  return g
}

/** Registra una textura y la devuelve. */
export function textura<T extends THREE.Texture>(r: Recursos, t: T): T {
  r.texturas.push(t)
  return t
}

/** Material estándar registrado (atajo de los juegos): estandar(r, color, { roughness: 0.4 }). */
export function estandar(r: Recursos, color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return material(r, new THREE.MeshStandardMaterial({ color, ...extra }))
}

/** Libera todo lo registrado y vacía los arreglos. */
export function liberar(r: Recursos) {
  for (const m of r.materiales) m.dispose()
  for (const g of r.geometrias) g.dispose()
  for (const t of r.texturas) t.dispose()
  r.materiales.length = 0
  r.geometrias.length = 0
  r.texturas.length = 0
}
