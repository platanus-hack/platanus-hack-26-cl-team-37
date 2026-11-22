// F38 · Estadio 3D de Comparar. Se carga a demanda (lazy desde Comparar.tsx): aquí entran three.js, OrbitControls y
// RoomEnvironment, así que no pesan en el resto de la app.
import { useEffect, useRef, useState } from 'react'
import type { EventoSesion, Sesion } from '../domain/types'
import { Icono } from '../ui/Icono'
import { montarBanda } from './escena/banda'
import { montarCaja } from './escena/caja'
import { montarManoModelo } from './escena/manoModelo'
import { crearMotor, type EscenaJuego, type Motor } from './escena/motor'
import { montarMuneca } from './escena/muneca'

export interface PropsEstadio {
  juego: string
  antes: Sesion
  despues: Sesion
  largoManoCm: number
  eventosAntes: EventoSesion[]
  eventosDespues: EventoSesion[]
}

function armar(m: Motor, p: PropsEstadio): EscenaJuego {
  const base = { antes: p.antes, despues: p.despues, largoManoCm: p.largoManoCm }
  switch (p.juego) {
    case 'muneca-3d':
      return montarMuneca(m, base)
    case 'banda-elastica':
    case 'honda':
      // La honda guarda las mismas poses ('reposo' y 'pico' de ambas manos) y métricas de la banda.
      return montarBanda(m, base)
    case 'caja-juguetes':
      return montarCaja(m, { ...base, eventosAntes: p.eventosAntes, eventosDespues: p.eventosDespues })
    case 'movilidad-guiada':
      return montarManoModelo(m, { ...base, animacion: Boolean(p.antes.muestras?.apertura?.length || p.despues.muestras?.apertura?.length) })
    default:
      return montarManoModelo(m, { ...base, animacion: false })
  }
}

function textoFuente(f: EscenaJuego['fuente']): string[] {
  const t = (x: 'real' | 'modelo') => (x === 'real' ? 'mano real (puntos registrados)' : 'mano modelo (ángulos guardados)')
  return f.antes === f.despues ? [`Ambas: ${t(f.antes)}`] : [`Antes: ${t(f.antes)}`, `Después: ${t(f.despues)}`]
}

export default function Estadio(props: PropsEstadio) {
  const host = useRef<HTMLDivElement>(null)
  const capaEtq = useRef<HTMLDivElement>(null)
  const rango = useRef<HTMLInputElement>(null)
  const tiempo = useRef<HTMLSpanElement>(null)
  const motorRef = useRef<Motor | null>(null)
  const escenaRef = useRef<EscenaJuego | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [escena, setEscena] = useState<EscenaJuego | null>(null)
  const [modo, setModo] = useState('')
  const [capas, setCapas] = useState<Record<string, boolean>>({})
  const [girar, setGirar] = useState(false)
  const [reproduciendo, setReproduciendo] = useState(true)
  const [version, setVersion] = useState(0) // fuerza leer título y fuente tras un cambio de modo

  useEffect(() => {
    if (!host.current || !capaEtq.current) return
    try {
      const m = crearMotor(host.current, capaEtq.current)
      m.alAvanzar = (a) => {
        if (rango.current) rango.current.value = String(Math.round(a * 1000))
        if (tiempo.current) tiempo.current.textContent = `${Math.round(a * 100)} %`
      }
      motorRef.current = m
      return () => {
        m.dispose()
        motorRef.current = null
        escenaRef.current = null
      }
    } catch {
      setError('Tu navegador no pudo abrir la vista 3D. Los números de abajo siguen disponibles.')
    }
  }, [])

  const { juego, antes, despues, largoManoCm, eventosAntes, eventosDespues } = props
  useEffect(() => {
    const m = motorRef.current
    if (!m || error) return
    m.soltar()
    const e = armar(m, { juego, antes, despues, largoManoCm, eventosAntes, eventosDespues })
    m.fijar(e)
    m.autoGirar(girar)
    escenaRef.current = e
    const primero = e.modos[0]!
    m.fijarReproduciendo(Boolean(primero.anima))
    setEscena(e)
    setModo(primero.id)
    setCapas(Object.fromEntries(e.capas.map((c) => [c.id, c.activa])))
    setReproduciendo(true)
    setVersion((v) => v + 1)
    // «girar» se aplica aparte (no reconstruye la escena)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juego, antes, despues, largoManoCm, eventosAntes, eventosDespues, error])

  const elegirModo = (id: string) => {
    const e = escenaRef.current
    const m = motorRef.current
    if (!e || !m) return
    e.fijarModo(id)
    const anima = Boolean(e.modos.find((x) => x.id === id)?.anima)
    m.fijarReproduciendo(anima)
    setModo(id)
    setReproduciendo(true)
    setVersion((v) => v + 1)
  }
  const alternarCapa = (id: string) => {
    const on = !capas[id]
    escenaRef.current?.fijarCapa(id, on)
    setCapas({ ...capas, [id]: on })
  }
  const alternarGirar = () => {
    motorRef.current?.autoGirar(!girar)
    setGirar(!girar)
  }
  const alternarPlay = () => {
    motorRef.current?.fijarReproduciendo(!reproduciendo)
    setReproduciendo(!reproduciendo)
  }
  const mover = (v: number) => {
    const m = motorRef.current
    m?.fijarReproduciendo(false)
    m?.fijarAvance(v / 1000)
    if (tiempo.current) tiempo.current.textContent = `${Math.round(v / 10)} %`
    setReproduciendo(false)
  }

  const modoActual = escena?.modos.find((x) => x.id === modo)
  // `version` solo fuerza esta lectura: título y fuente dependen del modo vigente dentro de la escena
  void version
  const titulo = escena?.titulo?.() ?? null
  const fuentes = escena ? textoFuente(escena.fuente) : []

  return (
    <section className="cmp-estadio-envoltura" aria-label="Vista 3D antes y después">
      {!error && (
        <div className="cmp-barra">
          <div className="cmp-grupo" role="group" aria-label="Vista">
            {escena?.modos.map((x) => (
              <button key={x.id} type="button" className="cmp-opc" aria-pressed={modo === x.id} onClick={() => elegirModo(x.id)}>
                {x.anima ? '▶ ' : ''}
                {x.texto}
              </button>
            ))}
          </div>
          {Boolean(escena?.capas.length) && (
            <div className="cmp-grupo" role="group" aria-label="Capas">
              {escena?.capas.map((c) => (
                <button key={c.id} type="button" className="cmp-opc suave" aria-pressed={Boolean(capas[c.id])} onClick={() => alternarCapa(c.id)}>
                  {c.texto}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="cmp-estadio" ref={host}>
        <div className="cmp-capa cmp-etiquetas" ref={capaEtq} aria-hidden="true" />
        {error ? (
          <p className="cmp-error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <button type="button" className="cmp-capa cmp-girar" aria-pressed={girar} onClick={alternarGirar}>
              Girar
            </button>
            {escena?.escalaKg != null && (
              <div className="cmp-capa cmp-escala" aria-hidden="true">
                <span>{Math.round(escena.escalaKg)} kg</span>
                <div className="grad" />
                <span>0</span>
              </div>
            )}
            {titulo && (
              <div className="cmp-capa cmp-titulo" data-testid="titulo-3d">
                <span className="que">{titulo.que}</span>
                <span className="cifras">
                  <b className="antes">{titulo.antes}</b>
                  <span aria-hidden="true">→</span>
                  <span className="sr-only"> a </span>
                  <b className="despues">{titulo.despues}</b>
                </span>
              </div>
            )}
            <div className={`cmp-capa cmp-reproductor${modoActual?.anima ? '' : ' oculto'}`}>
              <button type="button" className="cmp-play" onClick={alternarPlay} aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}>
                <Icono nombre={reproduciendo ? 'pausa' : 'play'} tam={18} />
              </button>
              <input ref={rango} type="range" min={0} max={1000} defaultValue={0} aria-label="Avance de la repetición" onChange={(e) => mover(Number(e.target.value))} />
              <span className="tiempo" ref={tiempo}>
                0 %
              </span>
            </div>
          </>
        )}
      </div>
      {escena && (
        <div className="cmp-pie-vista">
          <p className="cmp-fuente" data-testid="fuente-mano">
            {fuentes.join(' · ')}
          </p>
          <p className="cmp-nota">{escena.nota}</p>
        </div>
      )}
    </section>
  )
}
