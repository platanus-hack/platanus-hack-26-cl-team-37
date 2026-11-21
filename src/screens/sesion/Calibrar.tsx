// F08 · Calibración (docs/referencia/imagenes/05_calibracion.png, Prompt 5).
// Video en espejo (o mano simulada) con los 21 puntos, marco guía, pasos guiados (abierta 2 s, abrir/cerrar ×3,
// pinza), checklist en vivo y línea base guardada en la Sesion vía repos. Al terminar sigue a /sesion/:id/jugar
// conservando ?fuente=. Lógica pura en src/metrics/calibracion.ts; fuente de manos con useFuenteManos (F07).
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Sesion } from '../../domain/types'
import { entero, num, pctCorto } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { resumenDispositivo, VERSION_APP, versionModelo } from '../../lib/version'
import {
  aVista,
  avanzarCalibracion,
  calibracionInicial,
  chequeoConfianza,
  chequeoDistancia,
  chequeoLuz,
  elegirMano,
  estadoPinza,
  medidasMano,
  numeroPaso,
  puntosDentro,
  resultadoCalibracion,
  UMBRALES,
  type NivelChequeo,
  type PasoCalibracion,
} from '../../metrics/calibracion'
import { EstimadorDistancia } from '../../tracking/distancia'
import type { EstadoSeguimiento, FuenteManos } from '../../tracking/tipos'
import { useFuenteManos } from '../../tracking/useFuenteManos'
import { dibujarManos } from '../../ui/dibujoMano'
import { Icono } from '../../ui/Icono'
import { avisar, BarraProgreso, Encabezado, Estados, Vacio } from '../../ui/piezas'
import './calibrar.css'

interface DatosCalibrar {
  sesion: Sesion | null
  largoReglaCm: number | null
}

async function cargarCalibrar(id: string): Promise<DatosCalibrar> {
  const [sesion, paciente] = await Promise.all([repos.sesiones.obtener(id), repos.pacientes.miPaciente()])
  return { sesion, largoReglaCm: paciente?.largoManoCm ?? null }
}

export default function Calibrar() {
  const { id = '' } = useParams()
  const r = useCarga(() => cargarCalibrar(id), [id])
  const s = r.datos?.sesion
  if (r.estado === 'listo' && s && s.estado !== 'cerrada') {
    return (
      <main className="calibrar kuwu-noche">
        <Calibracion sesion={s} largoReglaCm={r.datos?.largoReglaCm ?? null} />
      </main>
    )
  }
  return (
    <main className="calibrar kuwu-noche">
      <div className="pantalla">
        <Encabezado titulo="Calibración" />
        <Estados r={r}>
          {(d) =>
            !d.sesion ? (
              <Vacio titulo="No encontramos esta sesión" texto="Prepárala de nuevo desde tus ejercicios." icono="ejercicios" accion={<Link to="/ejercicios" className="boton secundario chico">Ver ejercicios</Link>} />
            ) : (
              <Vacio titulo="Esta sesión ya terminó" texto="Puedes revisarla en tu historial." icono="historial" accion={<Link to="/inicio" className="boton secundario chico">Volver al inicio</Link>} />
            )
          }
        </Estados>
      </div>
    </main>
  )
}

interface Vista {
  paso: PasoCalibracion
  repeticiones: number
  progreso: number
  hayMano: boolean
  puntos: number
  dentro: boolean
  luminancia: number | null
  distanciaCm: number | null
  confianza: number | null
  largoCm: number | null
  fps: number
  /** Cercanía pulgar–índice (para guiar el paso 3). */
  pinza: 'junta' | 'casi' | 'lejos' | null
}

const VISTA_INICIAL: Vista = { paso: 'abierta', repeticiones: 0, progreso: 0, hayMano: false, puntos: 0, dentro: false, luminancia: null, distanciaCm: null, confianza: null, largoCm: null, fps: 0, pinza: null }
const MS_REFRESCO = 150
const MS_CONTINUAR = 2000
const NOMBRE_FUENTE = { camara: 'Cámara frontal', sintetica: 'Mano simulada', grabacion: 'Grabación' } as const

function Calibracion({ sesion, largoReglaCm }: { sesion: Sesion; largoReglaCm: number | null }) {
  const nav = useNavigate()
  const { search } = useLocation()
  const { fuente, estado } = useFuenteManos(search)
  const raiz = useRef<HTMLDivElement>(null)
  const fondo = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const marco = useRef<HTMLDivElement>(null)
  const calib = useRef(calibracionInicial())
  const inicio = useRef<string | null>(null)
  const alCompletar = useRef(() => {})
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const [guardado, setGuardado] = useState<'no' | 'guardando' | 'ok' | 'error'>('no')

  // La sesión empieza al abrir la calibración (si no tenía inicio).
  useEffect(() => {
    inicio.current ??= new Date().toISOString()
  }, [])

  // El <video> lo crea la fuente de cámara (nunca se guarda ni se envía): se monta de fondo, en espejo (CSS).
  useEffect(() => {
    const v = fuente?.video
    const f = fondo.current
    if (!v || !f) return
    f.replaceChildren(v)
    return () => f.replaceChildren()
  }, [fuente, estado])

  // Cada cuadro: dibujar, medir, avanzar los pasos. La vista de React se refresca cada ~150 ms.
  useEffect(() => {
    if (!fuente) return
    const estimador = new EstimadorDistancia({ largoReglaCm })
    let ultimo = -Infinity
    return fuente.alCuadro((c) => {
      const lz = lienzo.current
      const r = raiz.current
      const mr = marco.current
      if (!lz || !r || !mr) return
      const mano = elegirMano(c.manos, sesion.parametros.mano)
      dibujarManos(lz, c, mano, { silueta: fuente.tipo !== 'camara' })
      const caja = r.getBoundingClientRect()
      const m = mr.getBoundingClientRect()
      const rect = { x: m.left - caja.left, y: m.top - caja.top, ancho: m.width, alto: m.height }
      const puntos = mano ? puntosDentro(mano.landmarks.map((p) => aVista(p, c, { ancho: caja.width, alto: caja.height })), rect) : 0
      const dentro = !!mano && puntos === mano.landmarks.length
      const med = mano ? medidasMano(mano, largoReglaCm) : { apertura: 0, pinzaCm: 0, largoCm: 0 }
      const antes = calib.current
      const e = avanzarCalibracion(antes, { t: c.t, mano: !!mano, dentro, ...med, confianza: mano?.confianza ?? 0, fps: fuente.fps })
      calib.current = e
      if (e.paso === 'lista' && antes.paso !== 'lista') alCompletar.current()
      const distanciaCm = mano ? (estimador.estimar(mano, c.ancho, c.alto, c.t)?.cm ?? null) : null
      if (e.paso === antes.paso && c.t - ultimo < MS_REFRESCO) return
      ultimo = c.t
      setVista({
        paso: e.paso,
        repeticiones: e.repeticiones,
        progreso: e.progreso,
        hayMano: !!mano,
        puntos,
        dentro,
        luminancia: fuente.luminancia,
        distanciaCm,
        confianza: mano?.confianza ?? null,
        largoCm: e.n > 0 ? e.sumaLargo / e.n : mano ? med.largoCm : null,
        fps: fuente.fps,
        pinza: mano ? estadoPinza(med) : null,
      })
    })
  }, [fuente, largoReglaCm, sesion.parametros.mano])

  // Guarda la línea base en la Sesion (vía repos) al completar el paso 3, o al tocar Reintentar.
  async function guardar() {
    if (!fuente) return
    setGuardado('guardando')
    const cal = resultadoCalibracion(calib.current, largoReglaCm)
    const c = fuente.ultimo
    try {
      await repos.sesiones.actualizar(sesion.id, {
        calibracion: cal,
        inicio: sesion.inicio ?? inicio.current ?? new Date().toISOString(),
        dispositivo: {
          modelo: resumenDispositivo(navigator.userAgent),
          camara: fuente.tipo === 'camara' ? `frontal ${c?.ancho ?? '?'}×${c?.alto ?? '?'}` : fuente.tipo,
          fps: cal.fps,
        },
        versionApp: VERSION_APP,
        versionModelo: versionModelo(fuente.tipo, (fuente as FuenteManos & { delegado?: string | null }).delegado),
      })
      setGuardado('ok')
    } catch (e) {
      setGuardado('error')
      avisar(`No pudimos guardar la calibración: ${e instanceof Error ? e.message : e}`, true)
    }
  }
  useEffect(() => {
    alCompletar.current = () => void guardar()
  })

  useEffect(() => {
    if (guardado !== 'ok') return
    const t = setTimeout(() => nav(`/sesion/${sesion.id}/jugar${search}`), MS_CONTINUAR)
    return () => clearTimeout(t)
  }, [guardado, nav, search, sesion.id])

  const problema = estado === 'sin permiso' || estado === 'sin camara' || estado === 'error'
  const luz = chequeoLuz(vista.luminancia)
  const distancia = chequeoDistancia(vista.distanciaCm)
  const lista = vista.paso === 'lista'
  const indicacion = textoIndicacion(vista, estado)
  const consejo = lista
    ? guardado === 'error'
      ? 'No se guardó la calibración'
      : guardado === 'ok'
        ? 'Continuando al ejercicio…'
        : 'Guardando…'
    : luz.luz === 'poca'
      ? 'Hay poca luz: busca un lugar más iluminado'
      : luz.luz === 'excesiva'
        ? 'Hay demasiada luz detrás: evita ventanas de frente'
        : vista.hayMano && vista.dentro && distancia.consejo
          ? distancia.consejo
          : vista.paso === 'pinza' && vista.dentro && vista.pinza === 'casi'
            ? 'Casi: acerca un poco más las puntas'
            : vista.paso === 'pinza' && vista.dentro && vista.pinza === 'junta'
              ? 'Así, mantén los dedos juntos'
              : `Paso ${numeroPaso(vista.paso)} de 3`

  return (
    <div className={`calibrar-vista ${fuente?.tipo === 'camara' ? 'con-video' : ''}`} ref={raiz}>
      <div ref={fondo} className="calibrar-fondo" aria-hidden="true" />
      <canvas ref={lienzo} className="calibrar-lienzo" aria-hidden="true" />
      <header className="calibrar-cabeza">
        <h1>Calibración</h1>
        <span className="calibrar-camara" data-testid="fuente">
          <span className="punto-vivo" aria-hidden="true" />
          {NOMBRE_FUENTE[fuente?.tipo ?? 'camara']}
          {vista.fps > 0 && ` · ${entero(vista.fps)} fps`}
        </span>
      </header>

      {problema ? (
        <Problema estado={estado} detalle={fuente?.detalleError ?? null} reintentar={() => void fuente?.iniciar()} />
      ) : (
        <>
          <div className="calibrar-indicacion">
            <p className={`calibrar-pildora ${lista ? 'lista' : ''}`} role="status" aria-live="polite" data-testid="indicacion">
              {indicacion}
            </p>
            <p className="calibrar-consejo" data-testid="consejo">
              {consejo}
            </p>
            {guardado === 'error' && (
              <button type="button" className="boton primario chico" onClick={() => void guardar()}>
                Reintentar
              </button>
            )}
          </div>

          <div className={`calibrar-marco ${vista.dentro ? 'dentro' : ''}`} ref={marco} data-testid="marco">
            <span className="calibrar-puntos" data-testid="puntos">
              {vista.puntos}/21 puntos
            </span>
          </div>

          <section className="calibrar-chequeo" aria-label="Lista de chequeo">
            <Fila nombre="Iluminación" nivel={luz.nivel} valor={luz.texto} />
            <Fila nombre="Distancia" nivel={distancia.nivel} valor={vista.distanciaCm == null ? '—' : `${entero(vista.distanciaCm)} cm aprox.`} />
            <Fila nombre="Confianza de detección" nivel={chequeoConfianza(vista.confianza)} valor={pctCorto(vista.confianza)} />
            <Fila
              nombre="Largo de la mano"
              nivel={largoReglaCm || vista.largoCm != null ? 'ok' : 'nada'}
              valor={largoReglaCm ? `${num(largoReglaCm)} cm` : vista.largoCm == null ? '—' : `${num(vista.largoCm)} cm aprox.`}
              nota={largoReglaCm ? `Regla · cámara ${vista.largoCm == null ? '—' : num(vista.largoCm)} aprox.` : undefined}
            />
            <BarraProgreso valor={vista.progreso} color="var(--acento)" />
          </section>
        </>
      )}
    </div>
  )
}

function textoIndicacion(v: Vista, estado: EstadoSeguimiento): string {
  if (v.paso === 'lista') return '¡Calibración lista!'
  if (estado === 'iniciando') return 'Preparando la cámara…'
  if (!v.hayMano) return 'Muestra tu mano a la cámara'
  if (!v.dentro) return 'Pon la mano dentro del marco'
  if (v.paso === 'abierta') return 'Mantén la mano abierta'
  if (v.paso === 'abrir-cerrar') return `Abre y cierra la mano · ${v.repeticiones}/${UMBRALES.repeticiones}`
  return 'Junta el pulgar y el índice'
}

function Fila({ nombre, nivel, valor, nota }: { nombre: string; nivel: NivelChequeo; valor: string; nota?: string }) {
  return (
    <div className="calibrar-fila" data-nivel={nivel}>
      <span className={`calibrar-icono ${nivel}`} aria-hidden="true">
        {nivel === 'ok' ? <Icono nombre="check" tam={18} /> : nivel === 'mal' ? '!' : ''}
      </span>
      <span className="flex1">
        {nombre}
        {nota && <span className="calibrar-nota">{nota}</span>}
      </span>
      <strong>{valor}</strong>
      <span className="sr-only">{nivel === 'ok' ? 'correcto' : nivel === 'mal' ? 'revisar' : 'sin dato'}</span>
    </div>
  )
}

function Problema({ estado, detalle, reintentar }: { estado: EstadoSeguimiento; detalle: string | null; reintentar: () => void }) {
  return (
    <div className="calibrar-problema tarjeta col" role="alert">
      {estado === 'sin permiso' ? (
        <>
          <h2>Necesitamos permiso para usar la cámara</h2>
          <p className="tenue">La imagen se procesa solo en tu teléfono: no se guarda ni se envía. Para activarla:</p>
          <ul className="calibrar-pasos">
            <li>
              <strong>Android (Chrome):</strong> toca el candado junto a la dirección, luego <em>Permisos</em> → <em>Cámara</em> → <em>Permitir</em>.
            </li>
            <li>
              <strong>iPhone (Safari):</strong> toca <em>aA</em> en la barra de dirección, luego <em>Configuración del sitio web</em> → <em>Cámara</em> → <em>Permitir</em>.
            </li>
            <li>Si usas la app instalada, revisa también Ajustes del teléfono → Apps → navegador → Cámara.</li>
          </ul>
        </>
      ) : estado === 'sin camara' ? (
        <>
          <h2>No encontramos una cámara</h2>
          <p className="tenue">Revisa que tu teléfono tenga cámara frontal y que otra app no la esté usando. La cámara necesita una conexión segura (https).</p>
        </>
      ) : (
        <>
          <h2>No pudimos iniciar el seguimiento de la mano</h2>
          <p className="tenue">Cierra otras apps que usen la cámara e intenta de nuevo.</p>
        </>
      )}
      {detalle && <p className="muy-tenue chico">Detalle: {detalle}</p>}
      <button type="button" className="boton primario bloque" onClick={reintentar}>
        <Icono nombre="reiniciar" />
        Reintentar
      </button>
      <Link to="/inicio" className="boton secundario bloque">
        Volver al inicio
      </Link>
    </div>
  )
}
