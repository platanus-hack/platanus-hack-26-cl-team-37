// Contrato de un juego sobre la base común (J0, docs/manoviva-spec.md §7).
//
// Un juego es un módulo (src/games/<juego>/modulo.ts) que exporta `crear(): ModuloJuego`; la base común
// (src/games/shell/) pone el canvas three.js con mesa, luces, cámara y manos virtuales, el HUD, el ciclo de sesión
// (inicio, pausas, término por tiempo o meta), el registro de eventos y muestras a 10 Hz, Wake Lock, "Gira tu
// teléfono", el límite de pixel ratio y los fps en depuración. El juego solo pone su lógica y sus objetos.
//
// Orden de llamadas: montar(ctx) una vez (await si devuelve promesa) → actualizar(manos, dt) en cada cuadro
// mientras la fase es 'jugando' (no en pausa) → hud() unas 5 veces por segundo → resumen(base) al terminar →
// desmontar(). La física (si usaFisica) la avanza la base a 60 Hz fijos ANTES de cada actualizar().
import type * as THREE from 'three'
import type { Gesto } from '../registry'
import type { Calibracion, FlexionDedos, LadoMano, ParametrosSesion, PlanItem, Sesion, TipoEvento } from '../../domain/types'
import { num } from '../../lib/formato'
import type { EntradaAgregados } from '../../metrics/sesion'
import type { FuenteManos, ManoSeguida } from '../../tracking/tipos'
import type { Fisica } from './fisica'
import type { ManosVirtuales, ZonaManos } from './manos3d'

export type NumeroNivel = 1 | 2 | 3 | 4 | 5

/** Qué cambia en un nivel. `nombre` y `detalle` se muestran al paciente; el resto lo define cada juego. */
export interface ParametrosNivelBase {
  nombre: string
  detalle: string
}
export type ParametrosNivel = ParametrosNivelBase & Record<string, string | number | boolean>

/** Lo que la meta puede leer: un ítem del plan o los parámetros congelados de la sesión (mismos campos). */
export type ParametrosMeta = Pick<PlanItem, 'nivel' | 'duracionMin' | 'metaAgarres' | 'metaPinzaCm'>

export interface MetaJuego {
  /** Rótulo del contador en la barra superior: "Agarres", "Burbujas", "Toques". */
  etiqueta: string
  /** Unidad en plural para textos: "agarres", "burbujas". */
  unidad: string
  /** Meta de la sesión. 0 = sin meta (práctica libre): la sesión termina solo por tiempo. */
  desdePlan: (p: ParametrosMeta) => number
}

/**
 * Métrica declarada por el juego. Los valores van SIEMPRE en la unidad que se muestra
 * (cm, grados, s, y % como 0..100). `formula` es el texto que documenta cómo se calcula.
 */
export interface DefMetrica {
  id: string
  nombre: string
  unidad: '' | 'cm' | '°' | '%' | 's' | 'ms' | 'kg'
  formula: string
  /** Decimales al mostrar (por defecto: 1 para cm, s y kg; 0 para el resto). */
  decimales?: number
  /** Medidas de cámara (cm, grados): se muestran como estimación ("aprox.") en el resumen. */
  aprox?: boolean
  /** Para comparar sesiones (resumen y progreso). */
  mejor?: 'mayor' | 'menor'
  /** Nombre corto para las tarjetas del resumen (F13), p. ej. "Tiempo por agarre". Por defecto `nombre`. */
  corto?: string
  /**
   * ¿Va como tarjeta en /sesion/:id/resumen (F13)? Por defecto sí si tiene unidad: los conteos sin unidad
   * (agarres, intentos, ciclos) ya se ven en el anillo. Se muestran hasta 5 + la tarjeta de dolor.
   */
  tarjeta?: boolean
}

/** Estado de una mano en el panel izquierdo: '—' (neutro), 'Abierta' (ok, verde), 'Agarrando' (acento, amarillo). */
export interface EstadoManoHud {
  texto: string
  tono: 'neutro' | 'ok' | 'acento'
}

/** Lo que el juego entrega al HUD (la base lo pide ~5 veces por segundo). */
export interface HudJuego {
  /** Contador contra la meta (agarres logrados, burbujas, etc.). */
  contador: number
  /** Valor actual de cada métrica en vivo, por id (null = sin dato). */
  vivo: Record<string, number | null>
  /** Estado por mano. Si falta un lado, la base muestra '—' sin mano, o 'Abierta'/'Cerrada' según la apertura. */
  manos?: Partial<Record<LadoMano, EstadoManoHud>>
  /** Pista dinámica (reemplaza a `pista` del módulo mientras exista). */
  pista?: string
  /**
   * Opcional: el juego ya no tiene nada más que ofrecer SIN haber cumplido la meta (p. ej. el Piano resolvió todas sus
   * notas y no todas fueron aciertos). La base termina la sesión como cuando se acaba el tiempo (motivoFin 'tiempo',
   * metaCumplida según el contador). Si no se entrega, la sesión termina solo por tiempo, por meta o a mano.
   */
  terminado?: boolean
}

/** Medidas de una mano en el cuadro actual (las calcula la base para la mano de la sesión y las demás). */
export interface MedidasMano {
  lado: LadoMano
  /** Distancia pulgar–índice (worldLandmarks × escala de la calibración), cm aprox. */
  aperturaPinzaCm: number
  /** Apertura de la mano normalizada (0 = puño, ~1 = abierta), sin calibrar. */
  apertura: number
  /** Apertura normalizada con el rango abrir/cerrar de la calibración (0..1, recortada); null sin calibración. */
  aperturaCalibrada: number | null
  /** Flexión MCP + PIP por dedo, grados aprox. */
  flexion: FlexionDedos
  /** Muñeca en la imagen cruda (0..1). */
  muneca: { x: number; y: number }
  /** Distancia cámara–palma, cm aprox. (null si no se pudo estimar). */
  distanciaCm: number | null
}

export interface OpcionesEvento {
  mano?: LadoMano | null
  objeto?: string | null
  datos?: Record<string, unknown> | null
}

/** Mesa base de la escena (unidades de escena ≈ 10 cm; la cara de arriba está en y = mesa.altura). */
export interface MesaEscena {
  ancho: number
  fondo: number
  altura: number
  /** Centro de la mesa en z. */
  z: number
  objeto: THREE.Mesh
}

export interface ContextoJuego<P extends ParametrosNivelBase = ParametrosNivel> {
  escena: THREE.Scene
  camara: THREE.PerspectiveCamera
  mesa: MesaEscena
  /** Manos virtuales: posiciones de cada landmark en la escena (`punto(lado, i)`), visibles o no. */
  manos: ManosVirtuales
  /** Mundo de Rapier (solo si usaFisica; si no, null). */
  fisica: Fisica | null
  sesion: Readonly<Sesion>
  parametros: Readonly<ParametrosSesion>
  /** Parámetros del nivel de la sesión (niveles[parametros.nivel]). */
  nivel: P
  /** Meta de la sesión ya calculada (0 = sin meta). */
  meta: number
  calibracion: Calibracion | null
  /** cm por unidad de worldLandmarks (calibración o 100). */
  escalaCm: number
  fuente: FuenteManos
  /** Anota un evento en EventoSesion (con seq y t automáticos). El tipo debe estar en tiposEvento. */
  registrar(tipo: TipoEvento, opciones?: OpcionesEvento): void
  /** Medidas del cuadro actual de esa mano (null si no se ve). */
  medidas(lado: LadoMano): MedidasMano | null
  /** Lado de la mano de la sesión que se ve en este cuadro (la de parametros.mano, o la de mayor confianza). */
  manoPrincipal(): LadoMano | null
  /** ms de juego activo (sin pausas) desde el inicio. */
  ahora(): number
  /** Cambia la zona donde se mueven las manos virtuales (por defecto: sobre toda la mesa). */
  configurarManos(zona: Partial<ZonaManos>): void
  /**
   * F35 · Guarda una pose clave de esa mano con el cuadro actual (21 puntos 3D, sin imagen) en muestras.poses, para
   * dibujar la mano real al comparar sesiones. Una por etiqueta: gana la de mayor `valor` (o la última sin valor).
   * Máximo 24 por sesión. Devuelve false si esa mano no se ve o no se guardó.
   */
  guardarPose(etiqueta: string, lado: LadoMano, valor?: number | null): boolean
}

export interface ModuloJuego<P extends ParametrosNivelBase = ParametrosNivel> {
  id: string
  nombre: string
  gestos: Gesto[]
  /** Clave de la miniatura SVG (src/games/Miniatura.tsx). */
  miniatura: string
  niveles: Record<NumeroNivel, P>
  meta: MetaJuego
  /** Tipos de evento que anota el juego. Deben existir en el check de eventos_sesion (migración nueva si no). */
  tiposEvento: TipoEvento[]
  /** Hasta 3; la primera va con minigráfico. */
  metricasVivo: DefMetrica[]
  /** Métricas de resumen propias (las calcula `resumen`). */
  metricasResumen: DefMetrica[]
  /** true = la base carga Rapier (import diferido) antes de montar y avanza el mundo. */
  usaFisica: boolean
  /** Pista fija del panel izquierdo ("Guarda los juguetes en la caja"). */
  pista: string
  /** Texto del botón amarillo del panel ("Reiniciar objetos"); sin `reiniciar` no se muestra. */
  textoReiniciar?: string

  montar(ctx: ContextoJuego<P>): void | Promise<void>
  actualizar(manos: ManoSeguida[], dt: number): void
  hud(): HudJuego
  reiniciar?(): void
  /** Señales propias a 10 Hz (se guardan en muestras.canales[nombre]). */
  muestra?(): Record<string, number | null>
  /**
   * Métricas de resumen propias, por id de metricasResumen. `base` trae lo que mide la base (eventos, apertura
   * máx., flexión máx., suavidad, calidad, duración, fps) por si el juego quiere reusarlo. Se guarda en
   * metricas.juego; si trae la clave `suavidad`, además reemplaza a la suavidad de la base en metricas.suavidad.
   */
  resumen?(base: EntradaAgregados): Record<string, number | null>
  desmontar(): void
}

/** Fábrica: cada sesión crea una instancia nueva (el estado del juego vive en el cierre de `crear`). */
export type CrearJuego = () => ModuloJuego<ParametrosNivel>

export function decimalesDe(def: Pick<DefMetrica, 'unidad' | 'decimales'>): number {
  return def.decimales ?? (def.unidad === 'cm' || def.unidad === 's' || def.unidad === 'kg' ? 1 : 0)
}

/** Formatea un valor de métrica con su unidad (es-CL, coma decimal): "2,1 cm", "68°", "86%", "0,9 s". */
export function formatoMetrica(def: Pick<DefMetrica, 'unidad' | 'decimales'>, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const t = num(v, decimalesDe(def))
  if (def.unidad === '°' || def.unidad === '%') return `${t}${def.unidad}`
  return def.unidad ? `${t} ${def.unidad}` : t
}
