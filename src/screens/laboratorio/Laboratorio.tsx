// /laboratorio: prueba interna para estimar la carga de una banda elástica tomada entre las dos manos.
// Sin sesión, sin base de datos y sin 3D: cámara → puntos de las manos → largo de la banda → estiramiento → carga.
// El cálculo está en src/banda/ (con pruebas); aquí solo se conecta con la cámara y se muestra.
// Sin cámara: /laboratorio?fuente=sintetica&guion=banda. El video no se guarda ni se envía.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { leerCamara, textoReporte, type ReporteCamara } from '../../banda/camara'
import { CORENGTH_5KG, CURVAS_PUBLICADAS, cargaEn, curvaPropia, type CurvaBanda } from '../../banda/curva'
import { AGARRES, CapturaReposo, ContadorReps, DESNIVEL_MAX, estiramiento, medirBanda, totales, type Agarre, type MedidaBanda, type Repeticion } from '../../banda/medicion'
import { num } from '../../lib/formato'
import { aVista } from '../../metrics/calibracion'
import { CONEXIONES, clasificarLuz } from '../../metrics/geometria'
import { FiltroOneEuro } from '../../tracking/oneEuro'
import type { CuadroManos, EstadoSeguimiento } from '../../tracking/tipos'
import { useFuenteManos } from '../../tracking/useFuenteManos'
import { Segmentos, avisar } from '../../ui/piezas'
import { Marca } from '../../ui/salud'
import { PESOS_VACIOS, aCalibracion, type PesosTexto } from './pesos'
import { ArcoCarga, CurvaMini, EditorPesos, Picos, Trazo, type PuntoTrazo } from './piezas'
import { useGuardado } from './useGuardado'
import './laboratorio.css'

const MS_REFRESCO = 100
const MS_TRAZO = 12000

interface Vista {
  manos: number
  medida: Pick<MedidaBanda, 'largoCm' | 'desnivel'> | null
  progresoReposo: number
  repeticiones: Repeticion[]
  estirando: boolean
  trazo: PuntoTrazo[]
}
const VISTA_INICIAL: Vista = { manos: 0, medida: null, progresoReposo: 0, repeticiones: [], estirando: false, trazo: [] }

const ETIQUETA_ORIGEN: Record<CurvaBanda['origen'], string> = { medida: 'Calibrada por ti', publicada: 'Medida publicada', etiqueta: 'Referencia sin medir' }

function indicacion(estado: EstadoSeguimiento, v: Vista, reposoCm: number | null, capturando: boolean): string {
  if (estado === 'iniciando') return 'Preparando la cámara…'
  if (estado === 'sin permiso') return 'Permite el uso de la cámara para medir.'
  if (estado === 'sin camara') return 'No encontramos una cámara en este equipo.'
  if (estado === 'error') return 'No pudimos abrir la cámara. Recarga la página.'
  if (v.manos < 2) return 'Muestra las dos manos sosteniendo la banda.'
  if (v.medida && v.medida.desnivel > DESNIVEL_MAX) return 'Pon las dos manos a la misma distancia del teléfono.'
  if (capturando) return 'Quieto un segundo…'
  if (reposoCm == null) return 'Sostén la banda tensa, sin estirar, y marca el reposo.'
  return 'Estira y vuelve. Cada ida y vuelta cuenta una repetición.'
}

export default function Laboratorio() {
  const { search } = useLocation()
  const { fuente, estado } = useFuenteManos(search)
  const fondo = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)

  const [agarre, setAgarre] = useGuardado<Agarre>('agarre', 'pinza')
  const [curvaId, setCurvaId] = useGuardado('curva', CORENGTH_5KG.id)
  const [pesos, setPesos] = useGuardado<PesosTexto>('pesos', PESOS_VACIOS)
  const [reposoCm, setReposoCm] = useState<number | null>(null)
  const [capturando, setCapturando] = useState(false)
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const [camara, setCamara] = useState<ReporteCamara | null>(null)

  const propia = useMemo(() => curvaPropia(aCalibracion(pesos)), [pesos])
  const curvas = useMemo(() => [...(propia ? [propia] : []), CORENGTH_5KG, ...CURVAS_PUBLICADAS], [propia])
  const curva = curvas.find((c) => c.id === curvaId) ?? CORENGTH_5KG
  const tope = curva.puntos[curva.puntos.length - 1]?.kg ?? 1

  // Lo que el bucle de cuadros necesita leer sin volver a suscribirse.
  const config = useRef({ agarre, curva, reposoCm, capturando })
  useEffect(() => {
    config.current = { agarre, curva, reposoCm, capturando }
  }, [agarre, curva, reposoCm, capturando])
  const contador = useRef(new ContadorReps())

  // El <video> lo crea la fuente de cámara (nunca se guarda ni se envía): se monta de fondo, en espejo (CSS).
  useEffect(() => {
    const v = fuente?.video
    const f = fondo.current
    if (!v || !f) return
    f.replaceChildren(v)
    return () => f.replaceChildren()
  }, [fuente, estado])

  // Cada cuadro: medir la banda, dibujarla y contar. La vista de React se refresca cada MS_REFRESCO.
  useEffect(() => {
    if (!fuente) return
    const captura = new CapturaReposo()
    const filtro = new FiltroOneEuro(1.2, 0.05)
    let trazo: PuntoTrazo[] = []
    let ultimo = -Infinity
    return fuente.alCuadro((c) => {
      const cfg = config.current
      const cruda = medirBanda(c, cfg.agarre)
      const medida = cruda && { ...cruda, largoCm: filtro.filtrar(cruda.largoCm, c.t) }
      let kg: number | null = null
      if (!medida) {
        filtro.reiniciar()
        captura.cortar()
        contador.current.cortar()
      } else {
        if (cfg.capturando) {
          const reposo = captura.agregar(c.t, medida.largoCm)
          if (reposo != null) {
            // Se actualiza al tiro para los cuadros que lleguen antes del próximo render.
            config.current = { ...cfg, reposoCm: reposo, capturando: false }
            contador.current.reiniciar()
            trazo = []
            setReposoCm(reposo)
            setCapturando(false)
          }
        } else captura.cortar()
        if (cfg.reposoCm != null && !cfg.capturando) {
          contador.current.agregar(c.t, medida.largoCm, cfg.reposoCm, cfg.curva)
          kg = cargaEn(cfg.curva, estiramiento(medida.largoCm, cfg.reposoCm)).kg
          trazo.push({ t: c.t, kg })
        }
      }
      trazo = trazo.filter((p) => c.t - p.t <= MS_TRAZO)
      if (lienzo.current) dibujar(lienzo.current, c, medida, kg, fuente.tipo !== 'camara')
      if (c.t - ultimo < MS_REFRESCO) return
      ultimo = c.t
      setVista({
        manos: c.manos.length,
        medida,
        progresoReposo: cfg.capturando ? captura.progreso(c.t) : 0,
        repeticiones: [...contador.current.repeticiones],
        estirando: contador.current.estirando,
        trazo: [...trazo],
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

  const e = vista.medida && reposoCm != null && !capturando ? estiramiento(vista.medida.largoCm, reposoCm) : null
  const carga = e == null ? null : cargaEn(curva, e)
  const t = totales(vista.repeticiones)
  const listoParaMarcar = vista.manos >= 2 && !capturando

  const borrarReps = () => {
    contador.current.reiniciar()
    setVista((v) => ({ ...v, repeticiones: [], estirando: false }))
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

  return (
    <main className="laboratorio" data-testid="laboratorio">
      <header className="lab-cabeza">
        <Marca />
        <span className="lab-interno">Prueba interna</span>
      </header>
      <h1 className="titulo-pantalla">Laboratorio de banda</h1>

      <div className="lab-grilla">
        <section className="lab-camara" aria-label="Cámara">
          <div className="lab-fondo" ref={fondo} />
          <canvas ref={lienzo} className="lab-lienzo" />
          <p className="lab-indicacion" role="status" data-testid="indicacion">
            {indicacion(estado, vista, reposoCm, capturando)}
          </p>
          {capturando && <span className="lab-avance" style={{ scale: `${vista.progresoReposo} 1` }} />}
        </section>

        <section className="tarjeta lab-lectura" aria-label="Carga estimada">
          <ArcoCarga kg={carga?.kg ?? null} tope={tope} rotulo="kg aprox." />
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
          {reposoCm != null && <Trazo puntos={vista.trazo} ventanaMs={MS_TRAZO} tope={tope} />}
          <button type="button" className="boton primario" disabled={!listoParaMarcar} onClick={() => setCapturando(true)}>
            {capturando ? 'Midiendo…' : reposoCm == null ? 'Marcar reposo' : 'Volver a marcar reposo'}
          </button>
        </section>

        <section className="tarjeta lab-reps" aria-label="Repeticiones">
          <div className="fila entre">
            <h2>Repeticiones</h2>
            <button type="button" className="lab-enlace" disabled={t.n === 0} onClick={borrarReps}>
              Borrar
            </button>
          </div>
          <dl className="lab-cifras">
            <div>
              <dd data-testid="repeticiones">{t.n}</dd>
              <dt>{vista.estirando ? 'y una en curso' : 'hechas'}</dt>
            </div>
            <div>
              <dd>{t.mejorKg == null ? '—' : num(t.mejorKg, 1)}</dd>
              <dt>kg en el mejor pico</dt>
            </div>
            <div>
              <dd>{num(t.tensionS, 0)}</dd>
              <dt>s con la banda estirada</dt>
            </div>
            <div>
              <dd>{num(t.trabajoJ, 1)}</dd>
              <dt>joules de trabajo</dt>
            </div>
          </dl>
          {t.n > 0 && <Picos repeticiones={vista.repeticiones} />}
        </section>

        <section className="tarjeta lab-banda" aria-label="Banda">
          <h2>Banda</h2>
          <div className="campo">
            <label htmlFor="lab-curva">Curva que se usa</label>
            <select id="lab-curva" className="entrada" value={curva.id} onChange={(ev) => setCurvaId(ev.target.value)}>
              {curvas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="lab-origen" data-origen={curva.origen}>
            <span>{ETIQUETA_ORIGEN[curva.origen]}</span>
            {curva.fuente}
          </p>
          <CurvaMini curva={curva} estiramiento={e} />
          <div className="campo">
            <span className="rotulo">Cómo tomas la banda</span>
            <Segmentos opciones={AGARRES} valor={agarre} onCambio={setAgarre} etiqueta="Cómo tomas la banda" />
          </div>
          <details className="lab-detalle">
            <summary>Calibrar mi banda con pesos</summary>
            <EditorPesos valor={pesos} onCambio={setPesos} />
            {propia && curva.id !== propia.id && (
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
      </div>

      <p className="lab-pie">
        La carga es una estimación a partir de cuánto se estira la banda. No mide a la persona ni reemplaza una evaluación. El video no se guarda ni se envía.
      </p>
    </main>
  )
}

/** Las manos como esqueleto fino y, encima, la banda entre los dos puntos de agarre. */
function dibujar(lienzo: HTMLCanvasElement, cuadro: CuadroManos, medida: MedidaBanda | null, kg: number | null, sinVideo: boolean) {
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
    // Sin video detrás (fuente simulada) la mano se dibuja más gruesa para que se entienda sola.
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
  trazar(kg == null ? '#ffffff' : '#ffc83d', 6)
  for (const p of [a, b]) {
    g.beginPath()
    g.arc(p.x, p.y, 8, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 3
    g.strokeStyle = '#16171a'
    g.stroke()
  }
}
