// Torre de cubos (F22, J1): reglas puras, sin three.js ni Rapier (con pruebas en torre.test.ts).
//
// Escena en unidades de ~10 cm (1 unidad = 10 cm). La torre se arma sobre una base redonda al centro de la mesa;
// la silueta amarilla marca dónde va el cubo siguiente: sobre el eje de la torre, justo encima del último cubo.
// - Desvío al soltar: distancia HORIZONTAL entre el centro del cubo y el centro de la silueta (cm aprox.).
// - Colocado: el cubo queda quieto 1 s (REPOSO_MS) con el centro dentro de la tolerancia del nivel y a la altura
//   de la silueta (±40 % de su lado). Quieto pero fuera de tolerancia sobre la torre = no cuenta y vuelve a la mesa.
// - Caída: un cubo colocado se corre más de medio lado, o baja más de 40 % de su lado, de donde se colocó.
// - Estabilidad: variación (desviación estándar) de la posición del punto de pinza durante el último segundo antes
//   de soltar, en cm: 0 cm = 100, STD_MAX_CM o más = 0.
// - Apertura de pinza al tomar: la mayor apertura pulgar–índice de los últimos 1,5 s antes de cerrar la pinza.
import { kuwuNum } from '../../ui/paleta'

export interface V3 {
  x: number
  y: number
  z: number
}

export interface NivelTorre {
  nombre: string
  detalle: string
  /** Cubos de la torre = meta de altura. */
  cubos: number
  /** Lado del cubo en cm. */
  ladoCm: number
  /** Tolerancia al soltar (radio horizontal en cm): más nivel = más estrecha. */
  toleranciaCm: number
  [k: string]: string | number | boolean
}

export const NIVELES_TORRE: Record<1 | 2 | 3 | 4 | 5, NivelTorre> = {
  1: { nombre: 'Cubos grandes', detalle: 'Torre de 3 cubos grandes · tolerancia amplia', cubos: 3, ladoCm: 4.5, toleranciaCm: 2.0 },
  2: { nombre: 'Cubos grandes, torre más alta', detalle: 'Torre de 4 cubos grandes · tolerancia amplia', cubos: 4, ladoCm: 4.0, toleranciaCm: 1.7 },
  3: { nombre: 'Cubos medianos', detalle: 'Torre de 5 cubos medianos · tolerancia media', cubos: 5, ladoCm: 3.5, toleranciaCm: 1.4 },
  4: { nombre: 'Cubos medianos, más precisión', detalle: 'Torre de 5 cubos medianos · tolerancia ajustada', cubos: 5, ladoCm: 3.0, toleranciaCm: 1.2 },
  5: { nombre: 'Cubos pequeños', detalle: 'Torre de 6 cubos pequeños · tolerancia estrecha', cubos: 6, ladoCm: 2.6, toleranciaCm: 1.0 },
}

export function nivelTorre(n: number): NivelTorre {
  const k = Math.min(5, Math.max(1, Math.round(n || 1))) as 1 | 2 | 3 | 4 | 5
  return NIVELES_TORRE[k]
}

/** Unidades de escena por cm. */
export const U_POR_CM = 0.1

/** Base redonda: centro en la mesa, radio y grosor (unidades). */
export const BASE = { x: 0, z: -0.3, radio: 0.62, grosor: 0.06 }

/** Tiempo quieto sobre la torre para dar el cubo por colocado (ms). */
export const REPOSO_MS = 1000
/** Espera máxima tras soltar antes de evaluar aunque se mueva (ms). */
export const MS_MAX_ASENTAR = 6000
/** Ventanas de las métricas (ms). */
export const VENTANA_ESTABILIDAD_MS = 1000
export const VENTANA_APERTURA_MS = 1500
/** Variación de posición (cm) que da estabilidad 0. */
export const STD_MAX_CM = 5

export const QUIETO_LIN = 0.06
export const QUIETO_ANG = 0.5
/** Por debajo de esta altura un cubo cayó de la mesa y vuelve a su lugar. */
export const Y_CAIDA = -1

/** Torres completas tras las que termina la sesión, si el plan no fija otra cantidad (metaAgarres). */
export const TORRES_POR_SESION = 2

/** Meta de la sesión en torres completas: la del plan, o TORRES_POR_SESION si el plan no fija. */
export const metaTorres = (metaPlan: number) => (metaPlan > 0 ? Math.round(metaPlan) : TORRES_POR_SESION)

/** Colores de los cubos: los pastel del brandbook. */
export const COLORES = (['rojo', 'amarillo', 'azul', 'menta'] as const).map(kuwuNum)

const cm = (u: number) => u / U_POR_CM
const r1 = (x: number) => Math.round(x * 10) / 10

/** Lado del cubo en unidades de escena. */
export const ladoUnidades = (n: NivelTorre) => n.ladoCm * U_POR_CM

/** Altura (centro) de la silueta del piso `k` (0 = el de abajo), con la cara de arriba de la mesa en `alturaMesa`. */
export function alturaSilueta(k: number, lado: number, alturaMesa = 0): number {
  return alturaMesa + BASE.grosor + (k + 0.5) * lado
}

/** ¿El punto (x, z) está sobre la base redonda (donde se arma la torre)? */
export function sobreLaBase(x: number, z: number, lado: number, base = BASE): boolean {
  return Math.hypot(x - base.x, z - base.z) < base.radio + lado * 0.5
}

/**
 * Altura mínima del centro de un cubo SOSTENIDO (cinemático: para Rapier tiene masa infinita y empujaría lo que toque).
 * Nunca se hunde en la mesa; sobre la base tampoco en la base ni en los `colocados` ya apilados: el piso es la altura de la
 * silueta (cubo justo encima del último). Se aplica al seguir la mano y a la posición con que se suelta.
 */
export function alturaMinimaSostenido(x: number, z: number, colocados: number, lado: number, alturaMesa = 0, base = BASE): number {
  const sobre = sobreLaBase(x, z, lado, base)
  const mesa = alturaMesa + lado / 2 + 0.02 + (sobre ? base.grosor : 0)
  return sobre ? Math.max(mesa, alturaSilueta(colocados, lado, alturaMesa)) : mesa
}

/** Desvío horizontal (cm) entre el centro del cubo y el eje de la silueta/torre. */
export function desvioCm(p: V3, base = BASE): number {
  return r1(cm(Math.hypot(p.x - base.x, p.z - base.z)))
}

export interface Colocacion {
  desvioCm: number
  /** Diferencia de altura con la silueta, en lados de cubo (+ = más alto). */
  dy: number
  /** Cuenta como colocado: dentro de la tolerancia y a la altura de la silueta. */
  valida: boolean
  /** Está sobre la torre (estorbaría al piso siguiente) aunque no cuente. */
  enHuella: boolean
}

export function evaluarColocacion(p: V3, piso: number, lado: number, toleranciaCm: number, alturaMesa = 0, base = BASE): Colocacion {
  const d = desvioCm(p, base)
  const dy = (p.y - alturaSilueta(piso, lado, alturaMesa)) / lado
  const valida = d <= toleranciaCm && Math.abs(dy) <= 0.4
  const enHuella = cm(Math.hypot(p.x - base.x, p.z - base.z)) <= lado / U_POR_CM * 1.15 && p.y > alturaMesa + BASE.grosor - 0.05
  return { desvioCm: d, dy: +dy.toFixed(2), valida, enHuella }
}

/**
 * Colocación de un cubo que NO soltó el paciente: el agarre terminó porque se dejó de ver la mano (pérdida de
 * seguimiento). Nunca cuenta como colocado; si quedó sobre la torre estorba al piso siguiente, así que vuelve a la mesa.
 */
export function colocacionSinMano(ev: Colocacion): Colocacion {
  return { ...ev, valida: false, enHuella: ev.enHuella || ev.valida }
}

export interface CuboColocado {
  /** Donde quedó al colocarse. */
  x0: number
  y0: number
  z0: number
  /** Ahora. */
  x: number
  y: number
  z: number
  lado: number
}

/** La torre cayó si algún cubo colocado se corrió más de medio lado o bajó más de 0,4 lados. */
export function torreCaida(cubos: CuboColocado[]): boolean {
  return cubos.some((c) => Math.hypot(c.x - c.x0, c.z - c.z0) > c.lado * 0.5 || c.y0 - c.y > c.lado * 0.4)
}

export function estaQuieto(linvel: V3, angvel: V3): boolean {
  return Math.hypot(linvel.x, linvel.y, linvel.z) < QUIETO_LIN && Math.hypot(angvel.x, angvel.y, angvel.z) < QUIETO_ANG
}

/** Detección de reposo: devuelve desde cuándo está quieto (null si se mueve) y si ya cumplió REPOSO_MS. */
export function pasoReposo(desde: number | null, t: number, quieto: boolean, reposoMs = REPOSO_MS): { desde: number | null; listo: boolean } {
  if (!quieto) return { desde: null, listo: false }
  const d = desde ?? t
  return { desde: d, listo: t - d >= reposoMs }
}

// ── Métricas de la mano ───────────────────────────────────────────────────────────────────────

export interface MuestraMano {
  t: number
  /** Punto de pinza en unidades de escena. */
  x: number
  y: number
  z: number
}

/** Estabilidad 0–100 del último segundo antes de `ahora`: 100 = mano quieta; null si hay menos de 3 muestras. */
export function estabilidad(muestras: MuestraMano[], ahora: number, ventanaMs = VENTANA_ESTABILIDAD_MS): number | null {
  const v = muestras.filter((m) => m.t >= ahora - ventanaMs && m.t <= ahora)
  if (v.length < 3) return null
  const n = v.length
  const mx = v.reduce((a, m) => a + m.x, 0) / n
  const my = v.reduce((a, m) => a + m.y, 0) / n
  const mz = v.reduce((a, m) => a + m.z, 0) / n
  const varianza = v.reduce((a, m) => a + (m.x - mx) ** 2 + (m.y - my) ** 2 + (m.z - mz) ** 2, 0) / n
  const std = cm(Math.sqrt(varianza))
  return Math.round(100 * (1 - Math.min(1, std / STD_MAX_CM)))
}

/** Cuánto antes de abrir la pinza se toma la posición del cubo: al abrir los dedos el punto medio se corre (ms). */
export const MS_ANTES_SOLTAR = 150

/** Posición del último rastro con t <= ahora - msAntes (o la más antigua si no hay tan atrás); null sin rastro. */
export function posicionAntes(rastro: MuestraMano[], ahora: number, msAntes = MS_ANTES_SOLTAR): V3 | null {
  if (!rastro.length) return null
  let elegida = rastro[0]
  for (const m of rastro) {
    if (m.t <= ahora - msAntes) elegida = m
    else break
  }
  return { x: elegida.x, y: elegida.y, z: elegida.z }
}

export interface MuestraApertura {
  t: number
  cm: number
}

/** Mayor apertura de pinza (cm) de los últimos `ventanaMs` antes de cerrar; null sin muestras. */
export function aperturaAlTomar(muestras: MuestraApertura[], ahora: number, ventanaMs = VENTANA_APERTURA_MS): number | null {
  const v = muestras.filter((m) => m.t >= ahora - ventanaMs && m.t <= ahora)
  return v.length ? r1(Math.max(...v.map((m) => m.cm))) : null
}

// ── Agregados de la sesión ────────────────────────────────────────────────────────────────────

/** Máximo de pisos que lleva la lista de desvíos por cubo (el nivel más alto tiene 6). */
export const MAX_PISOS = 6

export interface RegistroTorre {
  /** Desvío al soltar de cada cubo que quedó colocado, por piso (índice 0 = el de abajo); el último intento de cada piso. */
  desvioPorPiso: (number | null)[]
  /** Desvíos de todos los cubos que se colocaron (en orden, incluidas las torres reconstruidas). */
  desviosColocados: number[]
  aperturas: number[]
  estabilidades: number[]
  alturaMax: number
  caidas: number
}

export function registroVacio(): RegistroTorre {
  return { desvioPorPiso: Array<number | null>(MAX_PISOS).fill(null), desviosColocados: [], aperturas: [], estabilidades: [], alturaMax: 0, caidas: 0 }
}

const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

/** Métricas de resumen (`metricas.juego`): medias, altura máxima, caídas y el desvío de cada cubo (desvioCubo1..6). */
export function resumenTorre(r: RegistroTorre): Record<string, number | null> {
  const redondea = (v: number | null, d = 1) => (v == null ? null : +v.toFixed(d))
  const out: Record<string, number | null> = {
    desvioMedio: redondea(media(r.desviosColocados)),
    aperturaPinza: redondea(media(r.aperturas)),
    estabilidad: redondea(media(r.estabilidades), 0),
    alturaMax: r.alturaMax,
    caidas: r.caidas,
  }
  for (let i = 0; i < MAX_PISOS; i++) out[`desvioCubo${i + 1}`] = r.desvioPorPiso[i] ?? null
  return out
}

/** Posiciones (x, z) de partida de los cubos sueltos: a los dos lados de la torre, en filas hacia adelante. */
export function posicionesCubos(cantidad: number, base = BASE): { x: number; z: number }[] {
  const n = Math.max(0, Math.round(cantidad))
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const lado = i % 2 === 0 ? -1 : 1
    const fila = Math.floor(i / 2)
    const z = base.z + 0.55 - fila * 0.5
    const x = base.x + lado * (1.45 + (fila % 2) * 0.3)
    out.push({ x: +x.toFixed(3), z: +z.toFixed(3) })
  }
  return out
}

/**
 * Punto de pinza cerca de un cubo suelto para poder tomarlo (misma tolerancia que la Caja: radio + 0,3 en el plano
 * y hasta 0,7 sobre su cara de arriba). Devuelve la distancia o null.
 */
export function distanciaToma(pinza: V3, centro: V3, lado: number): number | null {
  const dxz = Math.hypot(pinza.x - centro.x, pinza.z - centro.z)
  const arriba = centro.y + lado / 2
  const sobre = pinza.y - arriba
  if (dxz > lado * 0.6 + 0.3) return null
  if (sobre > 0.7) return null
  if (pinza.y < centro.y - lado / 2 - 0.3) return null
  return Math.hypot(dxz, Math.max(0, sobre) * 0.5)
}
