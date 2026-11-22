// /laboratorio: prueba interna para estimar la carga de una banda elástica tomada entre las dos manos.
// Sin sesión, sin base de datos y sin 3D: cámara → puntos de las manos → largo de la banda → estiramiento → carga.
// El cálculo está en src/banda/ (con pruebas); aquí solo se conecta con la cámara y se muestra.
// Sin cámara: /laboratorio?fuente=sintetica&guion=banda. Una prueba grabada (solo puntos, nunca video) se repite con
// el botón «Abrir grabación». El video no se guarda ni se envía.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { leerCamara, textoReporte, type ReporteCamara } from '../../banda/camara'
import { LectorMarcas } from '../../banda/lectorMarcas'
import { MODOS, colorUtil, type Hsv, type ModoMedida } from '../../banda/marcas'
import { CORENGTH_5KG, CURVAS_PUBLICADAS, cargaEn, conTiras, curvaPropia, type CurvaBanda } from '../../banda/curva'
import { AGARRE_POR_DEFECTO, AGARRES, DESNIVEL_MAX, PALMA_MIN, REPOSO_CORTO_CM, TOLERANCIA_META, medirBanda, textoResumen, totales, type Agarre, type MedidaBanda, type Repeticion } from '../../banda/medicion'
import { SeguidorBanda } from '../../banda/seguidor'
import { num } from '../../lib/formato'
import { aVista } from '../../metrics/calibracion'
import { CONEXIONES, clasificarLuz } from '../../metrics/geometria'
import { descargarJson } from '../../tracking/fuentes'
import { GrabadorLandmarks } from '../../tracking/grabacion'
import type { CuadroManos, EstadoSeguimiento, TipoFuente } from '../../tracking/tipos'
import { useFuenteManos } from '../../tracking/useFuenteManos'
import { Segmentos, Stepper, avisar } from '../../ui/piezas'
import { Marca } from '../../ui/salud'
import { PESOS_VACIOS, TIRAS, aCalibracion, type PesosTexto } from './pesos'
import { ArcoCarga, CurvaMini, EditorPesos, Pasos, Picos, Trazo, type EstadoPaso, type PuntoTrazo } from './piezas'
import { useGuardado } from './useGuardado'
import './laboratorio.css'

const MS_REFRESCO = 100
const MS_TRAZO = 12000

interface Vista {
  manos: number
  /** Estiramiento del cuadro, ya con la zona muerta (null sin reposo o mientras se marca). */
  e: number | null
  medida: Pick<MedidaBanda, 'largoCm' | 'desnivel' | 'alBorde' | 'palma'> | null
  progresoReposo: number
  repeticiones: Repeticion[]
  estirando: boolean
  trazo: PuntoTrazo[]
  /** ms grabados en la grabación en curso (null = no se está grabando). */
  grabandoMs: number | null
  /** Hace rato que no se ven las dos manos: decir qué revisar (luz, encuadre). */
  sinManos: boolean
  /** La banda lleva rato «estirada» y quieta: quizá está en reposo y el cero quedó mal. */
  sospechaReposo: boolean
  /** Estado de las marcas pintadas (solo en ese modo). */
  marcas: 'sin-camara' | 'sin-color' | 'no-vistas' | 'sin-escala' | 'ok' | null
}
const VISTA_INICIAL: Vista = { manos: 0, e: null, medida: null, progresoReposo: 0, repeticiones: [], estirando: false, trazo: [], grabandoMs: null, sinManos: false, sospechaReposo: false, marcas: null }
/**
 * Se dice qué revisar tras este tiempo sin ver las dos manos y con al menos estos cuadros procesados. Se piden los dos:
 * al iniciar, MediaPipe puede congelar la página varios segundos (Chromium sin GPU: unos 5 s) y ese tiempo no cuenta.
 */
const MS_AYUDA_SIN_MANOS = 4000
const CUADROS_AYUDA_SIN_MANOS = 24

const ETIQUETA_ORIGEN: Record<CurvaBanda['origen'], string> = { medida: 'Calibrada por ti', publicada: 'Medida publicada', etiqueta: 'Referencia sin medir' }
const NOMBRE_FUENTE: Record<TipoFuente, string | null> = { camara: null, sintetica: 'Manos simuladas', grabacion: 'Grabación' }

function indicacion(estado: EstadoSeguimiento, error: string | null, v: Vista, reposoCm: number | null, capturando: boolean, luz: number | null): string {
  if (error) return 'No se pudo abrir la grabación. Vuelve a elegir el archivo.'
  if (estado === 'iniciando') return 'Preparando la cámara…'
  if (estado === 'sin permiso') return 'Permite el uso de la cámara para medir.'
  if (estado === 'sin camara') return 'No encontramos una cámara en este equipo.'
  if (estado === 'error') return 'No pudimos abrir la cámara. Recarga la página.'
  // MediaPipe deja de detectar manos con poca luz o mucho ruido de imagen (probado con video: con ruido fuerte no ve
  // ninguna mano aunque se vean claras a simple vista), así que la luz es lo primero que hay que revisar.
  if (v.manos < 2 && luz != null && clasificarLuz(luz) === 'poca') return 'Hay poca luz: enciende una luz frente a ti o acércate a una ventana.'
  if (v.marcas === 'sin-camara') return 'Las marcas en la banda necesitan la cámara.'
  if (v.marcas === 'sin-color') return 'Toca una de las marcas en el video para que aprenda su color.'
  if (v.marcas === 'sin-escala') return 'Muestra también las dos manos un momento: con ellas se pasa a centímetros.'
  if (v.marcas === 'no-vistas') return 'No vemos las dos marcas: deja la banda de frente a la cámara, sin taparlas.'
  if (v.manos < 2 && v.sinManos) return 'No vemos las dos manos: que se vean enteras en el cuadro y con buena luz de frente.'
  if (v.manos < 2 && v.marcas !== 'ok') return 'Muestra las dos manos sosteniendo la banda.'
  if (v.medida?.alBorde) return 'Una mano se sale del cuadro: aléjate un poco o toma la banda más corta.'
  if (v.medida && v.medida.palma < PALMA_MIN) return 'Acércate al teléfono: las manos se ven pequeñas y se miden peor.'
  if (v.medida && v.medida.desnivel > DESNIVEL_MAX) return 'Pon las dos manos a la misma distancia del teléfono.'
  if (capturando || (reposoCm == null && v.progresoReposo > 0.25)) return 'Quieto un segundo…'
  if (reposoCm == null) return 'Sostén la banda recta, sin estirarla, y quédate quieto: el cero se marca solo.'
  if (v.sospechaReposo) return '¿Estás en reposo? Si no estás estirando, toca «Poner en cero».'
  return 'Estira despacio y vuelve. Cada ida y vuelta cuenta una repetición.'
}

const reloj = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface GrabacionHecha {
  url: string
  segundos: number
  json: string
}

/**
 * Cada fuente (cámara, simulada o grabación) es una prueba nueva: al cambiar la URL se parte de cero. La última
 * grabación vive aquí arriba para sobrevivir a ese cambio (la prueba que la reproduce la lee de su URL).
 */
export default function Laboratorio() {
  const { search } = useLocation()
  const [ultimaGrabacion, setUltimaGrabacion] = useState<GrabacionHecha | null>(null)
  const guardarGrabacion = (g: GrabacionHecha) => {
    if (ultimaGrabacion) URL.revokeObjectURL(ultimaGrabacion.url)
    setUltimaGrabacion(g)
  }
  return <Prueba key={search} search={search} ultimaGrabacion={ultimaGrabacion} onGrabacion={guardarGrabacion} />
}

function Prueba({ search, ultimaGrabacion, onGrabacion }: { search: string; ultimaGrabacion: GrabacionHecha | null; onGrabacion: (g: GrabacionHecha) => void }) {
  const navegar = useNavigate()
  const { fuente, estado, error } = useFuenteManos(search)
  const fondo = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const archivo = useRef<HTMLInputElement>(null)

  const [agarre, setAgarre] = useGuardado<Agarre>('agarre-v2', AGARRE_POR_DEFECTO)
  const [modo, setModo] = useGuardado<ModoMedida>('modo', 'manos')
  const [colorMarca, setColorMarca] = useGuardado<Hsv | null>('colorMarca', null)
  const [curvaId, setCurvaId] = useGuardado('curva', CORENGTH_5KG.id)
  const [tiras, setTiras] = useGuardado('tiras', 2)
  const [meta, setMeta] = useGuardado('meta', 0)
  const [pesos, setPesos] = useGuardado<PesosTexto>('pesos', PESOS_VACIOS)
  const [reposoCm, setReposoCm] = useState<number | null>(null)
  const [capturando, setCapturando] = useState(false)
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const [camara, setCamara] = useState<ReporteCamara | null>(null)

  const propia = useMemo(() => curvaPropia(aCalibracion(pesos)), [pesos])
  const curvas = useMemo(() => [...(propia ? [propia] : []), CORENGTH_5KG, ...CURVAS_PUBLICADAS], [propia])
  const base = curvas.find((c) => c.id === curvaId) ?? CORENGTH_5KG
  // La curva se lleva a las tiras que hay entre las manos (tiras en paralelo suman su carga).
  const curva = useMemo(() => conTiras(base, tiras), [base, tiras])
  const tope = curva.puntos[curva.puntos.length - 1]?.kg ?? 1
  const metaKg = meta > 0 ? meta : null

  // Lo que el bucle de cuadros necesita leer sin volver a suscribirse.
  const config = useRef({ agarre, curva, modo, colorMarca })
  useEffect(() => {
    config.current = { agarre, curva, modo, colorMarca }
  }, [agarre, curva, modo, colorMarca])
  const lector = useRef<LectorMarcas | null>(null)
  const seguidor = useRef(new SeguidorBanda())
  const grabador = useRef<GrabadorLandmarks | null>(null)

  // El <video> lo crea la fuente de cámara (nunca se guarda ni se envía): se monta de fondo, en espejo (CSS).
  useEffect(() => {
    const v = fuente?.video
    const f = fondo.current
    if (!v || !f) return
    f.replaceChildren(v)
    return () => f.replaceChildren()
  }, [fuente, estado])

  // Cada cuadro: medir la banda y pasar el largo al seguidor (src/banda/seguidor.ts: suavizado, huecos breves, reposo y
  // repeticiones, con pruebas y validado con una grabación real). Aquí solo se dibuja y se muestra; la vista de React se
  // refresca cada MS_REFRESCO.
  useEffect(() => {
    if (!fuente) return
    const s = seguidor.current
    let ultimaMedida: MedidaBanda | null = null
    let escalaUltima: number | null = null
    let trazo: PuntoTrazo[] = []
    let ultimo = -Infinity
    let t0Grabacion: number | null = null
    let sinManosDesde: number | null = null
    let cuadrosSinManos = 0
    return fuente.alCuadro((c) => {
      const g = grabador.current
      if (g) {
        g.agregar(c)
        t0Grabacion ??= c.t
      } else t0Grabacion = null
      if (c.manos.length >= 2) {
        sinManosDesde = null
        cuadrosSinManos = 0
      } else {
        sinManosDesde ??= c.t
        cuadrosSinManos++
      }
      const cfg = config.current
      const deManos = medirBanda(c, cfg.agarre)
      if (deManos) escalaUltima = deManos.escalaPxPorM
      let cruda: MedidaBanda | null = deManos
      let marcas: Vista['marcas'] = null
      if (cfg.modo === 'marcas') {
        // El largo sale de las dos marcas pintadas; las manos solo dan la escala para pasar a centímetros.
        const video = fuente.video
        if (!video) marcas = 'sin-camara'
        else if (!cfg.colorMarca) marcas = 'sin-color'
        else {
          lector.current ??= new LectorMarcas()
          const l = lector.current.leer(video, cfg.colorMarca)
          if (!l) marcas = 'no-vistas'
          else if (escalaUltima == null) marcas = 'sin-escala'
          else {
            marcas = 'ok'
            cruda = {
              largoCm: (l.distanciaPx / escalaUltima) * 100,
              extremos: [l.a, l.b],
              desnivel: deManos?.desnivel ?? 0,
              alBorde: deManos?.alBorde ?? false,
              palma: deManos?.palma ?? 1,
              escalaPxPorM: escalaUltima,
            }
          }
        }
        if (marcas !== 'ok') cruda = null
      }

      const p = s.paso(c.t, cruda?.largoCm ?? null, cfg.curva)
      // Un hueco breve (una mano no detectada unos cuadros) no corta nada: se sigue con la última medida en pantalla.
      if (p.estado === 'hueco') {
        if (lienzo.current) dibujar(lienzo.current, c, ultimaMedida, null, fuente.tipo !== 'camara')
        return
      }
      const medida = cruda && p.largoCm != null ? { ...cruda, largoCm: p.largoCm } : null
      ultimaMedida = medida
      if (p.evento) {
        setReposoCm(p.reposoCm)
        if (p.evento === 'marcado') trazo = []
        if (p.evento === 'marcado' || p.evento === 'pedido') setCapturando(false)
        if (p.evento === 'bajado') avisar('Reposo corregido: la banda estaba estirada al marcarlo.')
      }
      if (p.kg != null) trazo.push({ t: c.t, kg: p.kg })
      trazo = trazo.filter((q) => c.t - q.t <= MS_TRAZO)
      if (lienzo.current) dibujar(lienzo.current, c, medida, p.e, fuente.tipo !== 'camara')
      if (c.t - ultimo < MS_REFRESCO && !p.evento) return
      ultimo = c.t
      setVista({
        manos: c.manos.length,
        medida,
        e: p.e,
        progresoReposo: p.progresoReposo,
        repeticiones: [...s.contador.repeticiones],
        estirando: s.contador.estirando,
        trazo: [...trazo],
        grabandoMs: g && t0Grabacion != null ? c.t - t0Grabacion : null,
        sospechaReposo: p.sospecha,
        marcas,
        sinManos: sinManosDesde != null && c.t - sinManosDesde > MS_AYUDA_SIN_MANOS && cuadrosSinManos >= CUADROS_AYUDA_SIN_MANOS,
      })
    })
  }, [fuente])

  // Reporte de la cámara: cambia poco, basta con leerlo cada segundo.
  useEffect(() => {
    if (!fuente) return
    const leer = () => setCamara(leerCamara(fuente))
    leer()
    const id = setInterval(leer, 1000)
    return () => clearInterval(id)
  }, [fuente])

  const e = capturando ? null : vista.e
  const carga = e == null ? null : cargaEn(curva, e)
  const t = totales(vista.repeticiones, metaKg)
  const fuenteNombre = fuente ? NOMBRE_FUENTE[fuente.tipo] : null
  // El recuadro toma la proporción del video, así no se recorta lo que mide (en un teléfono vertical el video es 3:4).
  const proporcion = camara?.ancho && camara?.alto ? `${camara.ancho} / ${camara.alto}` : null
  const vertical = !!camara?.ancho && !!camara?.alto && camara.alto > camara.ancho
  const grabando = vista.grabandoMs != null

  const pasos: { texto: string; estado: EstadoPaso }[] = [
    { texto: 'Toma la banda con las dos manos', estado: vista.manos >= 2 || reposoCm != null ? 'hecho' : 'actual' },
    { texto: 'Sostenla quieta en reposo', estado: reposoCm != null ? 'hecho' : vista.manos >= 2 ? 'actual' : 'pendiente' },
    { texto: 'Estira y vuelve', estado: reposoCm == null ? 'pendiente' : t.n > 0 ? 'hecho' : 'actual' },
  ]

  const borrarReps = () => {
    seguidor.current.contador.reiniciar()
    setVista((v) => ({ ...v, repeticiones: [], estirando: false }))
  }
  const copiarResumen = async () => {
    try {
      await navigator.clipboard.writeText(textoResumen(vista.repeticiones, { banda: base.nombre, tiras, metaKg, reposoCm }))
      avisar('Resumen copiado')
    } catch {
      avisar('No se pudo copiar.', true)
    }
  }
  const copiarReporte = async () => {
    if (!camara) return
    try {
      await navigator.clipboard.writeText(textoReporte(camara))
      avisar('Reporte copiado')
    } catch {
      avisar('No se pudo copiar. Selecciona el texto a mano.', true)
    }
  }
  const alternarGrabacion = () => {
    if (!fuente) return
    const g = grabador.current
    if (!g) {
      grabador.current = new GrabadorLandmarks(fuente.tipo)
      setVista((v) => ({ ...v, grabandoMs: 0 }))
      return
    }
    grabador.current = null
    setVista((v) => ({ ...v, grabandoMs: null }))
    const datos = g.grabacion()
    if (datos.cuadros.length < 2) {
      avisar('La grabación quedó vacía.', true)
      return
    }
    const json = g.json()
    onGrabacion({ url: URL.createObjectURL(new Blob([json], { type: 'application/json' })), segundos: (datos.cuadros.at(-1)?.t ?? 0) / 1000, json })
  }
  // En el modo marcas, tocar el video elige el color de las marcas (se pasa del punto en pantalla, en espejo y
  // recortado como object-fit: cover, al punto en la imagen cruda).
  const tocarVideo = (ev: React.MouseEvent<HTMLDivElement>) => {
    const video = fuente?.video
    if (modo !== 'marcas' || !video?.videoWidth) return
    const caja = ev.currentTarget.getBoundingClientRect()
    const s = Math.max(caja.width / video.videoWidth, caja.height / video.videoHeight)
    const ox = (caja.width - video.videoWidth * s) / 2
    const oy = (caja.height - video.videoHeight * s) / 2
    const x = 1 - (ev.clientX - caja.left - ox) / (video.videoWidth * s)
    const y = (ev.clientY - caja.top - oy) / (video.videoHeight * s)
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    lector.current ??= new LectorMarcas()
    const c = lector.current.colorEn(video, x, y)
    if (!c || !colorUtil(c)) {
      avisar('Ese color no se distingue del fondo: toca justo encima de una marca.', true)
      return
    }
    lector.current.reiniciar()
    setColorMarca(c)
    avisar('Color de las marcas guardado')
  }
  const reproducir = (url: string) => navegar(`/laboratorio?fuente=grabacion&grabacion=${encodeURIComponent(url)}`)

  return (
    <main className="laboratorio" data-testid="laboratorio">
      <header className="lab-cabeza">
        <Marca />
        <span className="lab-interno">Prueba interna</span>
      </header>
      <div className="lab-titulo">
        <h1 className="titulo-pantalla">Laboratorio de banda</h1>
        <p className="tenue">Estima la carga de una banda elástica a partir de cuánto se estira entre tus manos.</p>
      </div>
      <Pasos pasos={pasos} />

      <div className="lab-grilla">
        <section className="lab-escena" aria-label="Cámara">
          <div className={`lab-camara${vertical ? ' vertical' : ''}${modo === 'marcas' ? ' eligiendo' : ''}`} style={proporcion ? { aspectRatio: proporcion } : undefined} onClick={tocarVideo}>
            <div className="lab-fondo" ref={fondo} />
            <canvas ref={lienzo} className="lab-lienzo" />
            <div className="lab-chips">
              {fuenteNombre && <span className="lab-chip">{fuenteNombre}</span>}
              {grabando && (
                <span className="lab-chip grabando" data-testid="grabando">
                  <span className="lab-punto" aria-hidden="true" />
                  Grabando {reloj(vista.grabandoMs ?? 0)}
                </span>
              )}
            </div>
            {reposoCm != null && !capturando && (
              <div className="lab-hud" data-meta={metaKg && carga && carga.kg >= metaKg * TOLERANCIA_META ? 'si' : undefined} aria-hidden="true">
                <b>{carga ? num(carga.kg, 1) : '—'}</b>
                <span>kg aprox.</span>
                <span className="lab-hud-reps">
                  {t.n} {t.n === 1 ? 'repetición' : 'repeticiones'}
                </span>
              </div>
            )}
            <p className="lab-indicacion" role="status" data-testid="indicacion">
              {indicacion(estado, error, vista, reposoCm, capturando, camara?.luz ?? null)}
            </p>
            {(capturando || reposoCm == null) && vista.progresoReposo > 0 && <span className="lab-avance" style={{ scale: `${vista.progresoReposo} 1` }} />}
          </div>
          <div className="lab-barra">
            <button type="button" className="lab-boton-grabar" aria-pressed={grabando} disabled={!fuente} onClick={alternarGrabacion}>
              <span className="lab-icono-grabar" aria-hidden="true" />
              {grabando ? 'Detener' : 'Grabar prueba'}
            </button>
            {ultimaGrabacion && !grabando && (
              <>
                <button type="button" className="lab-enlace" onClick={() => reproducir(ultimaGrabacion.url)}>
                  Repetir ({num(ultimaGrabacion.segundos, 0)} s)
                </button>
                <button type="button" className="lab-enlace" onClick={() => descargarJson(ultimaGrabacion.json, `banda-${new Date().toISOString().slice(0, 19)}.json`)}>
                  Descargar
                </button>
              </>
            )}
            <span className="lab-barra-fin">
              {fuente && fuente.tipo !== 'camara' ? (
                <button type="button" className="lab-enlace" onClick={() => navegar('/laboratorio')}>
                  Usar la cámara
                </button>
              ) : (
                <button type="button" className="lab-enlace" onClick={() => archivo.current?.click()}>
                  Abrir grabación
                </button>
              )}
              <input
                ref={archivo}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(ev) => {
                  const f = ev.target.files?.[0]
                  if (f) reproducir(URL.createObjectURL(f))
                  ev.target.value = ''
                }}
              />
            </span>
          </div>
          {vertical && (
            <p className="lab-girar">
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="6" y="2.5" width="8" height="13" rx="1.6" />
                <path d="M3 13.5a7 7 0 0 0 7 4.5M16.5 6.5a7 7 0 0 0-3-3" />
              </svg>
              Gira el teléfono: en horizontal caben mejor las dos manos estiradas.
            </p>
          )}
          <p className="lab-privado">Al grabar se guardan solo los 21 puntos de cada mano, nunca el video.</p>
        </section>

        <section className="tarjeta lab-lectura" aria-label="Carga estimada">
          <ArcoCarga kg={carga?.kg ?? null} tope={tope} meta={metaKg} rotulo="kg aprox." />
          <dl className="lab-datos">
            <div>
              <dt>Estiramiento</dt>
              <dd data-testid="estiramiento">{e == null ? '—' : `${Math.round(e * 100)} %`}</dd>
            </div>
            <div>
              <dt>Largo</dt>
              <dd data-testid="largo">{vista.medida ? `${num(vista.medida.largoCm, 0)} cm` : '—'}</dd>
            </div>
            <div>
              <dt>Reposo</dt>
              <dd data-testid="reposo">{reposoCm == null ? '—' : `${num(reposoCm, 0)} cm`}</dd>
            </div>
          </dl>
          {carga?.fueraDeRango && <p className="lab-aviso">Pasaste el último punto de la curva: el valor es una prolongación.</p>}
          {reposoCm != null && reposoCm < (modo === 'marcas' ? REPOSO_CORTO_CM / 2 : REPOSO_CORTO_CM) && <p className="lab-aviso">{modo === 'marcas' ? 'Marcas muy juntas: sepáralas unos 15 cm para medir mejor.' : 'Reposo corto: con las manos más separadas el estiramiento se mide mejor.'}</p>}
          {reposoCm != null && <Trazo puntos={vista.trazo} ventanaMs={MS_TRAZO} tope={tope} meta={metaKg} />}
          {capturando ? (
            <button
              type="button"
              className="boton secundario"
              onClick={() => {
                seguidor.current.cancelarCero()
                setCapturando(false)
              }}
            >
              Cancelar
            </button>
          ) : (
            <button type="button" className={`boton ${vista.sospechaReposo ? 'primario' : reposoCm == null ? 'primario' : 'secundario'}`} disabled={vista.manos < 2 && vista.marcas !== 'ok'}
              onClick={() => {
                seguidor.current.pedirCero()
                setCapturando(true)
              }}
            >
              Poner en cero
            </button>
          )}
        </section>

        <section className="tarjeta lab-reps" aria-label="Repeticiones">
          <div className="fila entre">
            <h2>Repeticiones</h2>
            <span className="lab-acciones">
              <button type="button" className="lab-enlace" disabled={t.n === 0} onClick={copiarResumen}>
                Copiar
              </button>
              <button type="button" className="lab-enlace" disabled={t.n === 0} onClick={borrarReps}>
                Borrar
              </button>
            </span>
          </div>
          <div className="lab-meta">
            <span className="rotulo">Meta por repetición</span>
            <Stepper valor={meta} min={0} max={Math.max(1, Math.ceil(tope * 2) / 2)} paso={0.5} onCambio={setMeta} etiqueta="la meta por repetición" formato={(v) => (v > 0 ? `${num(v, 1)} kg` : 'Sin meta')} />
          </div>
          <dl className="lab-cifras">
            <div>
              <dt>{metaKg ? `hechas · ${t.enMeta} en la meta` : vista.estirando ? 'hechas · una en curso' : 'hechas'}</dt>
              <dd data-testid="repeticiones">{t.n}</dd>
            </div>
            <div>
              <dt>kg en el mejor pico</dt>
              <dd>{t.mejorKg == null ? '—' : num(t.mejorKg, 1)}</dd>
            </div>
            <div>
              <dt>constancia entre repeticiones</dt>
              <dd data-testid="constancia">{t.constancia == null ? '—' : `${Math.round(t.constancia * 100)} %`}</dd>
            </div>
            <div>
              <dt>s con la banda estirada</dt>
              <dd>{num(t.tensionS, 0)}</dd>
            </div>
          </dl>
          {t.n > 0 && <Picos repeticiones={vista.repeticiones} meta={metaKg} />}
          {t.n > 0 && (
            <p className="lab-nota">
              Trabajo total {num(t.trabajoJ, 1)} J
              {t.rapidas > 0 && ` · ${t.rapidas === 1 ? 'una repetición fue rápida' : `${t.rapidas} repeticiones fueron rápidas`}: más lento se mide mejor`}
            </p>
          )}
        </section>

        <section className="tarjeta lab-banda" aria-label="Banda">
          <h2>Banda</h2>
          <div className="campo">
            <label htmlFor="lab-curva">Curva que se usa</label>
            <select id="lab-curva" className="entrada" value={base.id} onChange={(ev) => setCurvaId(ev.target.value)}>
              {curvas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="lab-origen" data-origen={base.origen}>
            <span>{ETIQUETA_ORIGEN[base.origen]}</span>
            {base.fuente}
          </p>
          <CurvaMini curva={curva} estiramiento={e} />
          <div className="campo">
            <span className="rotulo">Tiras entre las manos</span>
            <Segmentos opciones={TIRAS} valor={tiras} onCambio={setTiras} etiqueta="Tiras entre las manos" />
            <p className="tenue chico">
              Cuenta cuántas veces va la banda de una mano a la otra: un lazo tomado entero son 2 y doblado otra vez son 4. Cada tira se estira lo mismo y suma su carga.
            </p>
          </div>
          <div className="campo">
            <span className="rotulo">Cómo la tomas</span>
            <Segmentos opciones={AGARRES} valor={agarre} onCambio={setAgarre} etiqueta="Cómo tomas la banda" />
          </div>
          <div className="campo">
            <span className="rotulo">Cómo se mide el largo</span>
            <Segmentos opciones={MODOS} valor={modo} onCambio={setModo} etiqueta="Cómo se mide el largo" />
          </div>
          {modo === 'marcas' && (
            <div className="lab-marcas">
              <p className="tenue chico">Pinta dos puntos verdes o rosados a unos 15 cm, en el tramo de banda entre las manos, y toca uno en el video.</p>
              <div className="fila entre">
                <span className="lab-color">
                  <span className="lab-muestra" style={colorMarca ? { background: `hsl(${Math.round(colorMarca.h)} ${Math.round(Math.min(1, colorMarca.s + 0.2) * 100)}% 50%)` } : undefined} aria-hidden="true" />
                  {colorMarca ? 'Color guardado' : 'Sin color todavía'}
                </span>
                {colorMarca && (
                  <button type="button" className="lab-enlace" onClick={() => setColorMarca(null)}>
                    Elegir otro
                  </button>
                )}
              </div>
            </div>
          )}
          <details className="lab-detalle">
            <summary>Calibrar mi banda con pesos</summary>
            <EditorPesos valor={pesos} onCambio={setPesos} />
            {propia && base.id !== propia.id && (
              <button type="button" className="boton primario chico" onClick={() => setCurvaId(propia.id)}>
                Usar mi calibración
              </button>
            )}
          </details>
        </section>

        <section className="tarjeta lab-reporte" aria-label="Cámara de este equipo">
          <div className="fila entre">
            <h2>Cámara de este equipo</h2>
            <button type="button" className="lab-enlace" disabled={!camara} onClick={copiarReporte}>
              Copiar
            </button>
          </div>
          {camara && (
            <dl className="lab-tabla">
              <dt>Video</dt>
              <dd>{camara.ancho && camara.alto ? `${camara.ancho} × ${camara.alto}` : 'Sin dato'}</dd>
              <dt>Cuadros de la cámara</dt>
              <dd>{camara.cuadrosCamara == null ? 'Sin dato' : `${Math.round(camara.cuadrosCamara)} por segundo`}</dd>
              <dt>Cuadros del seguimiento</dt>
              <dd data-testid="cuadros">{`${Math.round(camara.cuadrosSeguimiento)} por segundo`}</dd>
              <dt>Modelo de manos</dt>
              <dd>{camara.delegado ?? (camara.fuente === 'camara' ? 'Cargando' : 'Simulado')}</dd>
              <dt>Luz</dt>
              <dd>{camara.luz == null ? 'Sin dato' : { poca: 'Poca', buena: 'Buena', excesiva: 'Excesiva' }[clasificarLuz(camara.luz)]}</dd>
              <dt>Máximo de la cámara</dt>
              <dd>{camara.anchoMax && camara.altoMax ? `${camara.anchoMax} × ${camara.altoMax}${camara.cuadrosMax ? ` a ${Math.round(camara.cuadrosMax)}` : ''}` : 'Sin dato'}</dd>
              <dt>Ajustes que deja controlar</dt>
              <dd>{camara.controles.length ? camara.controles.join(', ') : 'Ninguno'}</dd>
            </dl>
          )}
        </section>

        <section className="tarjeta lab-como" aria-label="Cómo se calcula">
          <h2>Cómo se calcula</h2>
          <ol className="lab-formula">
            <li>
              <b>Largo.</b> La distancia entre los dos puntos de agarre (o entre dos marcas pintadas en la banda) se pasa a centímetros con el tamaño de cada mano, que está en el mismo plano que la banda. Así no depende del lente ni de la distancia al teléfono. Con marcas se mide la banda misma, como un extensómetro de video, y no influye cómo la tomas.
            </li>
            <li>
              <b>Estiramiento.</b> Largo ÷ largo en reposo − 1. Es una razón: el tamaño real de tu mano se cancela. El reposo se marca solo cuando la banda queda quieta 2,5 s (o al tocar «Poner en cero»), y se corrige si se marcó estirada.
            </li>
            <li>
              <b>Carga.</b> Se lee en la curva de la banda, que no es una recta: el primer cuarto de estiramiento ya da cerca del 40 % de la carga al doble de largo. Las tiras en paralelo suman.
            </li>
          </ol>
          <p className="tenue chico">
            La carga depende del porcentaje de estiramiento y no del largo de la banda (Müller y Busse, J Sports Med Phys Fitness 2005). Las curvas de Thera-Band son medidas de laboratorio (Uchida y otros, J Phys Ther Sci 2016) y salen hasta 44 % bajo lo que publica el fabricante: por eso conviene calibrar la banda propia. MediaPipe mide bien el ritmo, pero su error crece con la velocidad (Sensors 2025): las repeticiones lentas se miden mejor.
          </p>
        </section>
      </div>

      <p className="lab-pie">La carga es una estimación a partir de cuánto se estira la banda. No mide a la persona ni reemplaza una evaluación. El video no se guarda ni se envía.</p>
    </main>
  )
}

/** Las manos como esqueleto fino y, encima, la banda entre los dos puntos de agarre con el estiramiento. */
function dibujar(lienzo: HTMLCanvasElement, cuadro: CuadroManos, medida: MedidaBanda | null, e: number | null, sinVideo: boolean) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const vista = { ancho: lienzo.clientWidth, alto: lienzo.clientHeight }
  if (lienzo.width !== Math.round(vista.ancho * dpr) || lienzo.height !== Math.round(vista.alto * dpr)) {
    lienzo.width = Math.round(vista.ancho * dpr)
    lienzo.height = Math.round(vista.alto * dpr)
  }
  const g = lienzo.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, vista.ancho, vista.alto)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const mano of cuadro.manos) {
    const p = mano.landmarks.map((q) => aVista(q, cuadro, vista))
    // Sin video detrás (fuente simulada o grabación) la mano se dibuja más gruesa para que se entienda sola.
    g.strokeStyle = sinVideo ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.8)'
    g.lineWidth = sinVideo ? 7 : 2
    g.beginPath()
    for (const [a, b] of CONEXIONES) {
      g.moveTo(p[a].x, p[a].y)
      g.lineTo(p[b].x, p[b].y)
    }
    g.stroke()
  }
  if (!medida) return
  const [a, b] = medida.extremos.map((p) => aVista(p, cuadro, vista))
  const trazar = (color: string, ancho: number) => {
    g.strokeStyle = color
    g.lineWidth = ancho
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
  }
  trazar('rgba(16, 22, 28, 0.6)', 10)
  trazar(e == null ? '#ffffff' : '#ffc83d', 6)
  for (const p of [a, b]) {
    g.beginPath()
    g.arc(p.x, p.y, 8, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 3
    g.strokeStyle = '#16171a'
    g.stroke()
  }
  // Rótulo sobre el centro de la banda: el estiramiento, o el largo mientras no hay reposo.
  const texto = e == null ? `${Math.round(medida.largoCm)} cm` : `${Math.round(e * 100)} %`
  g.font = '600 15px system-ui, -apple-system, sans-serif'
  const w = g.measureText(texto).width + 22
  const cx = (a.x + b.x) / 2
  const cy = Math.max(22, (a.y + b.y) / 2 - 28)
  g.fillStyle = 'rgba(16, 22, 28, 0.82)'
  g.beginPath()
  g.roundRect(cx - w / 2, cy - 14, w, 28, 14)
  g.fill()
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(texto, cx, cy + 1)
}
