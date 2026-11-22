// Base común de los juegos (J0): monta la escena three.js, el módulo del juego, la fuente de manos y el HUD, y
// maneja el ciclo de la sesión. Contrato en ./contrato.ts; spec §7.
//
// Al montar: crea la escena, carga Rapier si el juego usaFisica, llama montar(ctx) y pasa la Sesion a 'en curso'.
// En cada cuadro (requestAnimationFrame): manos virtuales desde el último cuadro de la fuente, paso del ciclo
// (pausas, meta, tiempo), física + actualizar() del juego solo jugando, acumulado de medidas, muestras a 10 Hz y
// dibujo. Los eventos se mandan en lotes cada 3 s. Al terminar: agregados → Sesion (sigue 'en curso': el cierre
// con hash es de /resumen, F13) → /sesion/:id/sensacion conservando el query (?fuente=…).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { LadoMano, MetricasSesion, Sesion } from '../../domain/types'
import { entero } from '../../lib/formato'
import { VERSION_APP } from '../../lib/version'
import { elegirMano } from '../../metrics/calibracion'
import { agregarSesion } from '../../metrics/sesion'
import { EstimadorDistancia } from '../../tracking/distancia'
import type { CuadroManos, FuenteManos } from '../../tracking/tipos'
import { useFuenteManos } from '../../tracking/useFuenteManos'
import { dibujarManos } from '../../ui/dibujoMano'
import { Icono } from '../../ui/Icono'
import { avisar } from '../../ui/piezas'
import { cicloInicial, pasoCiclo, terminarCiclo, type CambioCiclo, type EstadoCiclo, type MotivoPausa } from './ciclo'
import type { ContextoJuego, CrearJuego, EstadoManoHud, HudJuego, MedidasMano, ModuloJuego, NumeroNivel } from './contrato'
import { DURACION_MAX } from '../preparar'
import { EscenaBase } from './escena'
import { cargarFisica, type Fisica } from './fisica'
import { AvisoCentral, BarraSuperior, CapaPausa, GiraTelefono, MetricasVivo, MiniaturaCamara, PanelJuego } from './Hud'
import { AcumuladorBase, escalaDeCalibracion, medirMano } from './medidas'
import { RegistroSesion } from './registro'

const MS_HUD = 200
const MS_MINIATURA = 66
const MS_ENVIO_EVENTOS = 3000
const LARGO_HISTORIA = 40
/** Sin cuadros nuevos de la fuente durante este tiempo (reloj de pared) cuenta como "sin mano". */
const MS_FUENTE_DETENIDA = 1000

type EstadoGuardado = 'no' | 'guardando' | 'error'

interface Vista {
  fase: EstadoCiclo['fase']
  motivo: MotivoPausa | null
  segundos: number
  hud: HudJuego
  manos: Record<LadoMano, EstadoManoHud>
  historia: number[]
  meta: boolean
  fps: number
  calidad: number
}

const SIN_MANO: EstadoManoHud = { texto: '—', tono: 'neutro' }
const VISTA_INICIAL: Vista = {
  fase: 'esperando',
  motivo: null,
  segundos: 0,
  hud: { contador: 0, vivo: {} },
  manos: { izquierda: SIN_MANO, derecha: SIN_MANO },
  historia: [],
  meta: false,
  fps: 0,
  calidad: 0,
}

declare global {
  interface Window {
    /** Solo lectura para e2e y depuración. */
    __manovivaJuego?: {
      fase: EstadoCiclo['fase']
      motivo: MotivoPausa | null
      fps: number
      calidad: number
      pixelRatio: number
      jugadoMs: number
      contador: number
      eventos: number
      muestras: number
      fisica: boolean
      vivo: Record<string, number | null>
    }
  }
}

const esVertical = () => typeof window !== 'undefined' && window.matchMedia?.('(orientation: portrait)').matches === true

export function JuegoShell({ sesion, crear, seqInicial }: { sesion: Sesion; crear: CrearJuego; seqInicial: number }) {
  const nav = useNavigate()
  const { search } = useLocation()
  const depuracion = new URLSearchParams(search).get('depuracion') === '1'
  const { fuente, estado } = useFuenteManos(search)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const mini = useRef<HTMLCanvasElement>(null)
  const miniVideo = useRef<HTMLDivElement>(null)
  // `modulo` = declaraciones para el HUD; cada montaje del efecto crea su propia instancia (montar se llama una
  // sola vez por instancia, también con el doble montaje de StrictMode en desarrollo).
  const [modulo] = useState<ModuloJuego>(() => crear())
  const enJuego = useRef<ModuloJuego | null>(null)
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const [vertical, setVertical] = useState(esVertical)
  const [listo, setListo] = useState(false)
  const [errorMontaje, setErrorMontaje] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<EstadoGuardado>('no')
  const manual = useRef(false)
  const [menu, setMenu] = useState(false)
  const terminarRef = useRef<() => void>(() => {})
  const guardarRef = useRef<() => void>(() => {})

  const meta = modulo.meta.desdePlan(sesion.parametros)
  // Tope DURACION_MAX también aquí (sesiones preparadas antes del límite); el mínimo bajo es para las pruebas.
  const duracionMs = Math.min(DURACION_MAX, Math.max(0.05, sesion.parametros.duracionMin)) * 60_000

  // Orientación.
  useEffect(() => {
    const mq = window.matchMedia?.('(orientation: portrait)')
    if (!mq) return
    const f = () => setVertical(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])

  // Wake Lock: la pantalla no se apaga mientras se juega (se vuelve a pedir al volver a la app).
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null
    let vivo = true
    const pedir = () => {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
      if (!wl || document.visibilityState !== 'visible') return
      wl.request('screen')
        .then((l) => (vivo ? (lock = l) : void l.release()))
        .catch(() => undefined)
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', pedir)
      void lock?.release().catch(() => undefined)
    }
  }, [])

  // Video de la cámara en la miniatura (solo fuente cámara; nunca se guarda ni se envía).
  useEffect(() => {
    const v = fuente?.video
    const c = miniVideo.current
    if (!v || !c) return
    c.replaceChildren(v)
    return () => c.replaceChildren()
  }, [fuente, estado])

  // Escena + juego + bucle.
  useEffect(() => {
    const canvas = lienzo.current
    if (!fuente || !canvas) return
    let vivo = true
    let raf = 0
    const modulo = crear()
    enJuego.current = modulo
    let escena: EscenaBase | null = null
    let fisica: Fisica | null = null
    let montado = false
    const registro = new RegistroSesion(sesion.id, repos.sesiones, { seqInicial })
    const acumulador = new AcumuladorBase()
    const estimadores: Record<LadoMano, EstimadorDistancia> = {
      izquierda: new EstimadorDistancia({ largoReglaCm: sesion.calibracion?.largoManoFuente === 'regla' ? sesion.calibracion.largoManoCm : null }),
      derecha: new EstimadorDistancia({ largoReglaCm: sesion.calibracion?.largoManoFuente === 'regla' ? sesion.calibracion.largoManoCm : null }),
    }
    let medidas: Partial<Record<LadoMano, MedidasMano>> = {}
    let principal: LadoMano | null = null
    let ciclo = cicloInicial()
    let ultimoCuadro: CuadroManos | null = null
    let ultimoCuadroPared = performance.now()
    let anterior = performance.now()
    let ultimoHud = -Infinity
    let ultimaMini = -Infinity
    let hud: HudJuego = { contador: 0, vivo: {} }
    let historia: number[] = []
    let metaVista = false
    let terminado = false
    const tEvento = (ahora: number) => Math.max(0, ahora - (ciclo.inicioT ?? ahora))

    const ctx: ContextoJuego = {
      escena: null as never,
      camara: null as never,
      mesa: null as never,
      manos: null as never,
      fisica: null,
      sesion,
      parametros: sesion.parametros,
      nivel: modulo.niveles[Math.min(5, Math.max(1, Math.round(sesion.parametros.nivel))) as NumeroNivel],
      meta,
      calibracion: sesion.calibracion,
      escalaCm: escalaDeCalibracion(sesion.calibracion),
      fuente,
      registrar(tipo, o) {
        if (!modulo.tiposEvento.includes(tipo)) console.warn(`[juego] evento '${tipo}' no declarado en tiposEvento de ${modulo.id}`)
        registro.evento(tEvento(performance.now()), tipo, o)
      },
      medidas: (lado) => medidas[lado] ?? null,
      manoPrincipal: () => principal,
      ahora: () => ciclo.jugadoMs,
      configurarManos(z) {
        if (escena) escena.manos.zona = { ...escena.manos.zona, ...z }
      },
      guardarPose(etiqueta, lado, valor = null) {
        const m = ultimoCuadro?.manos.find((x) => x.lado === lado)
        if (!m) return false
        const c = m.landmarks.reduce((s, p) => [s[0] + p.x / 21, s[1] + p.y / 21], [0, 0]) as [number, number]
        return registro.pose(ciclo.jugadoMs, etiqueta, lado, m.worldLandmarks, valor, c)
      },
    }

    const aplicarCambios = (cambios: CambioCiclo[], ahora: number) => {
      for (const c of cambios) {
        if (c.tipo === 'perdida') registro.evento(tEvento(ahora), 'perdida_seguimiento', { datos: { sinManoMs: Math.round(ahora - ultimoCuadroPared) } })
        else if (c.tipo === 'pausa') {
          registro.evento(tEvento(ahora), 'pausa', { datos: { motivo: c.motivo } })
          acumulador.cortar()
        } else if (c.tipo === 'reanudar') registro.evento(tEvento(ahora), 'reanudar')
        else if (c.tipo === 'meta') metaVista = true
        else if (c.tipo === 'fin') void terminar()
      }
    }

    async function terminar() {
      if (terminado) return
      terminado = true
      ciclo = terminarCiclo(ciclo).estado
      setGuardado('guardando')
      publicarVista(performance.now(), true)
      const base = acumulador.entrada(registro.eventos, ciclo.jugadoMs / 1000, meta)
      const propio = modulo.resumen?.(base) ?? {}
      // Si el juego calcula su propia suavidad (p. ej. por agarre), reemplaza la de la base.
      const metricas: MetricasSesion = {
        ...agregarSesion('suavidad' in propio ? { ...base, suavidad: propio.suavidad } : base),
        metaCumplida: meta > 0 && hud.contador >= meta,
        juego: propio,
        contador: hud.contador,
        meta,
        motivoFin: ciclo.fin ?? 'manual',
      }
      const guardar = async () => {
        setGuardado('guardando')
        try {
          await registro.vaciar()
          await repos.sesiones.actualizar(sesion.id, { estado: 'en curso', metricas, muestras: registro.muestras(), fin: new Date().toISOString() })
          if (vivo) nav(`/sesion/${sesion.id}/sensacion${search}`)
        } catch (e) {
          if (!vivo) return
          setGuardado('error')
          avisar(`No pudimos guardar la sesión: ${e instanceof Error ? e.message : e}`, true)
        }
      }
      guardarRef.current = () => void guardar()
      await guardar()
    }
    terminarRef.current = () => {
      const r = terminarCiclo(ciclo)
      ciclo = r.estado
      void terminar()
    }

    function estadoManos(): Record<LadoMano, EstadoManoHud> {
      const out = { izquierda: SIN_MANO, derecha: SIN_MANO }
      for (const l of ['izquierda', 'derecha'] as LadoMano[]) {
        const m = medidas[l]
        if (m) out[l] = hud.manos?.[l] ?? ((m.aperturaCalibrada ?? m.apertura) >= 0.5 ? { texto: 'Abierta', tono: 'ok' } : { texto: 'Cerrada', tono: 'acento' })
      }
      return out
    }

    function publicarVista(ahora: number, forzar = false) {
      if (!forzar && ahora - ultimoHud < MS_HUD) return
      ultimoHud = ahora
      if (montado && !terminado) hud = modulo.hud()
      const primera = modulo.metricasVivo[0]
      const v = primera ? hud.vivo[primera.id] : null
      if (ciclo.fase === 'jugando' && v != null && Number.isFinite(v)) historia = [...historia, v].slice(-LARGO_HISTORIA)
      setVista({
        fase: ciclo.fase,
        motivo: ciclo.motivos[0] ?? null,
        segundos: ciclo.jugadoMs / 1000,
        hud,
        manos: estadoManos(),
        historia,
        meta: metaVista,
        fps: escena?.fps ?? 0,
        calidad: escena?.calidad ?? 0,
      })
      window.__manovivaJuego = {
        fase: ciclo.fase,
        motivo: ciclo.motivos[0] ?? null,
        fps: Math.round((escena?.fps ?? 0) * 10) / 10,
        calidad: escena?.calidad ?? 0,
        pixelRatio: escena?.renderer.getPixelRatio() ?? 0,
        jugadoMs: Math.round(ciclo.jugadoMs),
        contador: hud.contador,
        eventos: registro.eventos.length,
        muestras: registro.muestras().t.length,
        fisica: !!fisica,
        vivo: hud.vivo,
      }
    }

    function cuadro(ahora: number) {
      if (!vivo || !escena) return
      raf = requestAnimationFrame(cuadro)
      const dt = Math.min(0.1, Math.max(0, (ahora - anterior) / 1000))
      anterior = ahora
      const f = fuente as FuenteManos
      const c = f.ultimo
      const nuevo = !!c && c !== ultimoCuadro
      if (nuevo && c) {
        ultimoCuadro = c
        ultimoCuadroPared = ahora
        const distancias: Partial<Record<LadoMano, number | null>> = {}
        medidas = {}
        for (const m of c.manos) {
          if (medidas[m.lado]) continue
          const d = estimadores[m.lado].estimar(m, c.ancho, c.alto, c.t)?.cm ?? null
          distancias[m.lado] = d
          medidas[m.lado] = medirMano(m, sesion.calibracion, d)
        }
        principal = elegirMano(c.manos, sesion.parametros.mano)?.lado ?? null
        escena.manos.actualizar(c.manos, distancias)
      }

      if (!terminado) {
        const detenida = ahora - ultimoCuadroPared > MS_FUENTE_DETENIDA ? ahora - ultimoCuadroPared : 0
        const sinManoMs = f.ultimaDeteccion == null || !c ? null : Math.max(0, c.t - f.ultimaDeteccion) + detenida
        const r = pasoCiclo(
          ciclo,
          { t: ahora, sinManoMs: f.ultimaDeteccion == null ? null : sinManoMs, manual: manual.current, vertical: esVertical(), oculta: document.hidden, contador: hud.contador, agotado: hud.terminado === true },
          { duracionMs, meta },
        )
        ciclo = r.estado
        if (ciclo.fase === 'jugando' && montado) {
          fisica?.avanzar(dt)
          modulo.actualizar(c?.manos ?? [], dt)
          if (nuevo) {
            const m = principal ? (medidas[principal] ?? null) : null
            acumulador.agregar(ciclo.jugadoMs, m, f.fps)
            registro.muestra(ciclo.jugadoMs, m?.aperturaPinzaCm ?? null, m?.flexion.indice ?? null, modulo.muestra?.())
          }
        }
        aplicarCambios(r.cambios, ahora)
      }

      escena.dibujar(ahora)
      if (mini.current && ahora - ultimaMini >= MS_MINIATURA) {
        ultimaMini = ahora
        const el = c && principal ? (c.manos.find((m) => m.lado === principal) ?? null) : null
        dibujarManos(mini.current, c ?? null, el, { silueta: f.tipo !== 'camara' })
      }
      publicarVista(ahora)
    }

    ;(async () => {
      try {
        escena = new EscenaBase(canvas)
        Object.assign(ctx, { escena: escena.escena, camara: escena.camara, mesa: escena.mesa, manos: escena.manos })
        if (modulo.usaFisica) {
          const cargada = await cargarFisica(escena.mesa)
          if (!vivo) {
            // Se desmontó mientras cargaba Rapier: la limpieza ya corrió (y no vio este mundo), así que se libera aquí.
            cargada.liberar()
            return
          }
          fisica = cargada
          ctx.fisica = fisica
        }
        await modulo.montar(ctx)
        if (!vivo) return
        montado = true
        setListo(true)
        raf = requestAnimationFrame(cuadro)
        repos.sesiones
          .actualizar(sesion.id, {
            estado: 'en curso',
            inicio: sesion.inicio ?? new Date().toISOString(),
            versionApp: sesion.versionApp ?? VERSION_APP,
          })
          .catch((e: unknown) => avisar(`No pudimos marcar la sesión en curso: ${e instanceof Error ? e.message : e}`, true))
      } catch (e) {
        if (vivo) setErrorMontaje(e instanceof Error ? e.message : String(e))
      }
    })()

    const envio = setInterval(() => void registro.vaciar().catch(() => undefined), MS_ENVIO_EVENTOS)

    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      clearInterval(envio)
      void registro.vaciar().catch(() => undefined)
      if (montado) modulo.desmontar()
      fisica?.liberar()
      escena?.liberar()
      delete window.__manovivaJuego
    }
    // La sesión y el módulo no cambian durante el juego; el efecto depende de la fuente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente])

  const continuar = useCallback(() => {
    manual.current = false
    setMenu(false)
  }, [])
  const pausar = useCallback(() => {
    manual.current = true
    setMenu(true)
  }, [])
  const pantallaCompleta = useCallback(() => {
    const el = document.documentElement
    const lock = (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock
    Promise.resolve(el.requestFullscreen?.())
      .then(() => lock?.call(screen.orientation, 'landscape'))
      .catch(() => undefined)
  }, [])

  const problema = estado === 'sin permiso' || estado === 'sin camara' || estado === 'error'
  const motivo = vista.motivo
  const terminada = vista.fase === 'terminada' || guardado !== 'no'

  return (
    <div className="juego-vista" data-fase={vista.fase} data-testid="juego">
      <canvas ref={lienzo} className="juego-lienzo" aria-label={`Escena 3D de ${modulo.nombre}`} />

      <PanelJuego
        titulo={modulo.nombre}
        manos={vista.manos}
        pista={vista.hud.pista ?? modulo.pista}
        textoReiniciar={modulo.textoReiniciar}
        onReiniciar={modulo.reiniciar ? () => enJuego.current?.reiniciar?.() : undefined}
      />
      <BarraSuperior segundos={vista.segundos} etiqueta={modulo.meta.etiqueta} contador={vista.hud.contador} meta={meta} />
      <button type="button" className="juego-menu juego-caja" onClick={pausar} disabled={terminada}>
        <Icono nombre="atras" tam={18} />
        Menú
      </button>
      <MetricasVivo defs={modulo.metricasVivo} valores={vista.hud.vivo} historia={vista.historia} />
      <MiniaturaCamara lienzo={mini} video={miniVideo} conVideo={fuente?.tipo === 'camara'} />

      {depuracion && (
        <p className="juego-depuracion mono" data-testid="fps">
          {entero(vista.fps)} fps · seguimiento {entero(fuente?.fps ?? 0)} fps · calidad {vista.calidad}
        </p>
      )}

      <div className="juego-centro">
        {vista.meta && (
          <AvisoCentral tono="exito" testid="meta-cumplida">
            🎉 ¡Meta cumplida! {entero(vista.hud.contador)}/{entero(meta)}
          </AvisoCentral>
        )}
        {!listo && !errorMontaje && !problema && <AvisoCentral>Preparando el ejercicio…</AvisoCentral>}
        {listo && vista.fase === 'esperando' && !problema && (
          <AvisoCentral testid="esperando">{estado === 'iniciando' ? 'Preparando la cámara…' : 'Muestra tu mano a la cámara para empezar'}</AvisoCentral>
        )}
        {vista.fase === 'pausa' && motivo === 'sin-mano' && <CapaPausa motivo="sin-mano" onContinuar={continuar} onTerminar={() => terminarRef.current()} terminando={terminada} />}
        {guardado === 'guardando' && <AvisoCentral testid="guardando">Guardando la sesión…</AvisoCentral>}
        {guardado === 'error' && (
          <div className="juego-dialogo juego-caja" role="alert">
            <h2>No se guardó la sesión</h2>
            <p className="tenue">Revisa tu conexión e intenta de nuevo. Tus datos siguen en este teléfono.</p>
            <button type="button" className="boton primario bloque" onClick={() => guardarRef.current()}>
              <Icono nombre="reiniciar" />
              Reintentar
            </button>
          </div>
        )}
        {(errorMontaje || problema) && (
          <div className="juego-dialogo juego-caja" role="alert">
            <h2>{problema ? 'No pudimos usar la cámara' : 'No pudimos iniciar el ejercicio'}</h2>
            <p className="tenue">{problema ? 'Revisa el permiso de cámara del navegador e intenta de nuevo.' : 'Cierra otras apps y vuelve a intentarlo.'}</p>
            <p className="muy-tenue chico">Detalle: {errorMontaje ?? fuente?.detalleError ?? estado}</p>
            <button type="button" className="boton primario bloque" onClick={() => location.reload()}>
              <Icono nombre="reiniciar" />
              Reintentar
            </button>
          </div>
        )}
      </div>

      {menu && !vertical && !terminada && (
        <CapaPausa motivo="manual" onContinuar={continuar} onTerminar={() => terminarRef.current()} terminando={terminada} />
      )}
      {vertical && <GiraTelefono onPantallaCompleta={pantallaCompleta} />}
    </div>
  )
}
