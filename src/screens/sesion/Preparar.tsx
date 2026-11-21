// F06 · Preparar la sesión (docs/referencia/imagenes/04_preparar_sesion.png).
// Valores por defecto del plan vigente (src/games/preparar.ts); "Comenzar" crea la Sesion "preparada" vía repos.
// Sin consentimiento firmado → /privacidad (con state.volver para regresar aquí).
import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Mano } from '../../domain/types'
import { NIVEL_MAX } from '../../games/catalogo'
import { DURACION_MAX, DURACION_MIN, sesionPreparada, valoresPorDefecto, type Preparacion } from '../../games/preparar'
import { juegoPorId, nivelDe, type Juego } from '../../games/registry'
import { num } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Icono } from '../../ui/Icono'
import { avisar, BarraAccion, Cargando, Encabezado, Estados, Segmentos, Vacio } from '../../ui/piezas'

const MANOS: { v: Mano; n: string }[] = [
  { v: 'izquierda', n: 'Izquierda' },
  { v: 'derecha', n: 'Derecha' },
  { v: 'ambas', n: 'Ambas' },
]

interface DatosPreparar {
  pacienteId: string
  consentimiento: boolean
  defecto: Preparacion
}

async function cargarPreparar(juegoId: string): Promise<DatosPreparar | null> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return null
  const [consentimiento, plan, sesiones] = await Promise.all([
    repos.consentimientos.ultimo(paciente.id),
    repos.planes.vigente(paciente.id),
    repos.sesiones.listar(paciente.id),
  ])
  return {
    pacienteId: paciente.id,
    consentimiento: !!consentimiento,
    defecto: valoresPorDefecto(juegoId, plan, paciente.manoAfectada, sesiones),
  }
}

export default function Preparar() {
  const { juego: juegoId = '' } = useParams()
  const juego = juegoPorId(juegoId)
  const r = useCarga(() => (juego?.disponible ? cargarPreparar(juegoId) : Promise.resolve(null)), [juegoId])
  // Volver: atrás en el historial si se llegó navegando; si se abrió directo, a /ejercicios.
  const atras = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? true : '/ejercicios'

  return (
    <main className="pantalla con-boton preparar">
      <Encabezado titulo={juego?.nombre ?? 'Ejercicio'} subtitulo="Configura tu sesión" atras={atras} />
      {!juego?.disponible ? (
        <Vacio
          titulo="Este ejercicio no está disponible"
          texto="Elige otro desde el catálogo."
          icono="ejercicios"
          accion={
            <Link to="/ejercicios" className="boton secundario chico">
              Ver ejercicios
            </Link>
          }
        />
      ) : (
        <Estados r={r}>
          {(d) => (d ? <Formulario juego={juego} datos={d} /> : <Vacio titulo="No encontramos tu ficha" texto="Pide a tu terapeuta que revise tu cuenta." icono="perfil" />)}
        </Estados>
      )}
    </main>
  )
}

function Formulario({ juego, datos }: { juego: Juego; datos: DatosPreparar }) {
  const nav = useNavigate()
  const { pathname, search } = useLocation()
  const [p, setP] = useState<Preparacion>(datos.defecto)
  const [creando, setCreando] = useState(false)

  // Sin consentimiento firmado no se prepara ninguna sesión: primero /privacidad.
  useEffect(() => {
    if (datos.consentimiento) return
    avisar('Antes de tu primera sesión, revisa y acepta la privacidad.')
    nav('/privacidad', { replace: true, state: { volver: pathname + search } })
  }, [datos.consentimiento, nav, pathname, search])
  if (!datos.consentimiento) return <Cargando texto="Abriendo privacidad…" />

  const nivel = nivelDe(juego.id, p.nivel)
  const fijarDuracion = (v: number) => setP((x) => ({ ...x, duracionMin: Math.min(DURACION_MAX, Math.max(DURACION_MIN, v)) }))
  const avance = ((p.duracionMin - DURACION_MIN) / (DURACION_MAX - DURACION_MIN)) * 100

  async function comenzar() {
    setCreando(true)
    try {
      const s = await repos.sesiones.crear(sesionPreparada(datos.pacienteId, juego.id, p))
      // ?fuente= (sintetica | grabacion) sigue hasta la calibración.
      nav(`/sesion/${s.id}/calibrar${search}`)
    } catch (e) {
      setCreando(false)
      avisar(!navigator.onLine ? 'Sin conexión: no pudimos preparar la sesión. Intenta de nuevo.' : `No pudimos preparar la sesión: ${e instanceof Error ? e.message : e}`, true)
    }
  }

  return (
    <>
      <section className="col" aria-labelledby="t-mano">
        <h2 id="t-mano" className="seccion">
          Mano a trabajar
        </h2>
        <Segmentos opciones={MANOS} valor={p.mano} onCambio={(mano) => setP((x) => ({ ...x, mano }))} etiqueta="Mano a trabajar" />
      </section>

      <section className="col" aria-labelledby="t-dificultad">
        <h2 id="t-dificultad" className="seccion">
          Dificultad
        </h2>
        <div className="tarjeta preparar-tarjeta">
          <div className="fila entre">
            <span className="preparar-valor" data-testid="nivel">
              Nivel {p.nivel} · {nivel.nombre}
            </span>
            <span className="tenue">de {NIVEL_MAX}</span>
          </div>
          <div className="niveles" role="group" aria-label="Dificultad">
            {Array.from({ length: NIVEL_MAX }, (_, i) => (
              <button key={i} type="button" aria-label={`Nivel ${i + 1}`} aria-pressed={p.nivel === i + 1} className={i < p.nivel ? 'lleno' : ''} onClick={() => setP((x) => ({ ...x, nivel: i + 1 }))}>
                <span />
              </button>
            ))}
          </div>
          <p className="tenue chico" data-testid="detalle-nivel">
            {nivel.detalle}
          </p>
        </div>
      </section>

      <section className="col" aria-labelledby="t-duracion">
        <h2 id="t-duracion" className="seccion">
          Duración
        </h2>
        <div className="tarjeta preparar-tarjeta">
          <div className="fila entre">
            <span className="preparar-valor" data-testid="duracion" aria-live="polite">
              {p.duracionMin} minutos
            </span>
            <span className="tenue">
              {DURACION_MIN} – {DURACION_MAX}
            </span>
          </div>
          <div className="fila duracion">
            <button type="button" className="boton-paso" aria-label="Menos un minuto" disabled={p.duracionMin <= DURACION_MIN} onClick={() => fijarDuracion(p.duracionMin - 1)}>
              <Icono nombre="menos" />
            </button>
            <input
              type="range"
              className="deslizador flex1"
              min={DURACION_MIN}
              max={DURACION_MAX}
              step={1}
              value={p.duracionMin}
              aria-label="Duración en minutos"
              aria-valuetext={`${p.duracionMin} minutos`}
              style={{ '--p': `${avance}%` } as CSSProperties}
              onChange={(e) => fijarDuracion(Number(e.target.value))}
            />
            <button type="button" className="boton-paso" aria-label="Más un minuto" disabled={p.duracionMin >= DURACION_MAX} onClick={() => fijarDuracion(p.duracionMin + 1)}>
              <Icono nombre="mas" />
            </button>
          </div>
        </div>
      </section>

      <section className="col" aria-labelledby="t-meta">
        <h2 id="t-meta" className="seccion">
          Meta de la sesión
        </h2>
        <div className="tarjeta preparar-tarjeta" data-testid="meta">
          {p.meta ? (
            <>
              <div className="fila entre">
                <span className="preparar-valor">{p.meta.agarres} agarres</span>
                <span className="preparar-valor">Pinza ≥ {num(p.meta.pinzaCm, p.meta.pinzaCm % 1 ? 1 : 0)} cm</span>
              </div>
              <p className="tenue fila autor">
                <Icono nombre="candado" tam={16} />
                Definida por {p.meta.autor ?? 'tu terapeuta'}
              </p>
            </>
          ) : (
            <>
              <span className="preparar-valor">Práctica libre</span>
              <p className="tenue fila autor">
                <Icono nombre="candado" tam={16} />
                Este ejercicio no está en tu plan: sin meta asignada
              </p>
            </>
          )}
        </div>
      </section>

      <div className="consejo" role="note">
        <Icono nombre="telefono" tam={28} />
        <p>Apoya el teléfono en horizontal, a unos 50 cm</p>
      </div>

      <BarraAccion>
        <button type="button" className="boton primario bloque" disabled={creando} onClick={comenzar}>
          {creando ? 'Preparando…' : 'Comenzar'}
        </button>
      </BarraAccion>
    </>
  )
}
