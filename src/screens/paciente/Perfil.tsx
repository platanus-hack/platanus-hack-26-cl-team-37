// F19 · Perfil del paciente (pestaña /perfil). Sin imagen de referencia: mismo lenguaje que Inicio y Privacidad.
// Ficha tal como la registró el terapeuta (solo lectura), largo de mano medido con regla y corregible (referencia de
// escala de la calibración; lo escribe la RPC actualizar_largo_mano, con auditoría), entrada a Privacidad y datos
// (única puerta a /privacidad después de firmar el consentimiento) y cerrar sesión, que está siempre disponible.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { useCerrarSesion } from '../../auth/useCerrarSesion'
import { repos } from '../../data/repos'
import type { Consentimiento, Paciente } from '../../domain/types'
import { consentimientoVigente } from '../../legal/consentimiento'
import { fechaNumerica, iniciales, nombreMano, num } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { VERSION_APP } from '../../lib/version'
import { semanaTratamiento } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { avisar, Encabezado, Estados, Vacio } from '../../ui/piezas'
import { LARGO_INICIAL_CM, LARGO_MAX_CM, LARGO_MIN_CM, pasoLargo, textoLargo, validarLargo } from './largoMano'
import './perfil.css'

interface Datos {
  paciente: Paciente | null
  /** undefined = no se pudo consultar (no se muestra estado del consentimiento). */
  consentimiento: Consentimiento | null | undefined
  terapeuta: string | null
  clinica: string | null
}

// La ficha manda: si falla, la pantalla muestra el error con reintento. Lo demás (nombres y consentimiento) es
// complementario: si falla, el perfil se muestra igual sin ese dato.
async function cargar(clinicaId: string | undefined): Promise<Datos> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return { paciente: null, consentimiento: undefined, terapeuta: null, clinica: null }
  const [consentimiento, terapeuta, clinica] = await Promise.all([
    repos.consentimientos.ultimo(paciente.id).catch(() => undefined),
    paciente.terapeutaId ? repos.perfiles.nombre(paciente.terapeutaId).catch(() => null) : Promise.resolve(null),
    clinicaId ? repos.perfiles.clinica(clinicaId).catch(() => null) : Promise.resolve(null),
  ])
  return { paciente, consentimiento, terapeuta, clinica }
}

export default function Perfil() {
  const { usuario } = useAuth()
  const r = useCarga(() => cargar(usuario?.clinicaId), [usuario?.clinicaId])
  return (
    <main className="pantalla con-barra perfil">
      <Encabezado titulo="Perfil" />
      <Estados r={r}>
        {(d) =>
          d.paciente ? (
            <Contenido datos={d} paciente={d.paciente} recargar={r.recargar} />
          ) : (
            <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
          )
        }
      </Estados>
      <CerrarSesion />
      <p className="perfil-version">Kuwü · versión {VERSION_APP}</p>
    </main>
  )
}

function Contenido({ datos, paciente, recargar }: { datos: Datos; paciente: Paciente; recargar: () => void }) {
  const { usuario } = useAuth()
  const { consentimiento, terapeuta, clinica } = datos
  const nombre = usuario?.nombre ?? paciente.nombre
  const [hoy] = useState(() => new Date())
  const inicio = paciente.fechaInicio ? new Date(paciente.fechaInicio + 'T00:00:00') : null
  const condicion = paciente.condicion?.trim()

  return (
    <div className="perfil-cuerpo">
      <section className="tarjeta perfil-identidad" aria-label="Tus datos">
        <span className="perfil-avatar" aria-hidden="true">
          {iniciales(nombre)}
        </span>
        <div className="perfil-nombre">
          <h2>{nombre}</h2>
          {clinica && <p>{clinica}</p>}
        </div>
      </section>

      <section className="tarjeta perfil-ficha" aria-label="Tu tratamiento">
        <dl className="perfil-datos">
          <Dato titulo="Terapeuta" valor={terapeuta ?? (paciente.terapeutaId ? 'Tu terapeuta' : 'Sin terapeuta asignado')} />
          <Dato titulo="Mano afectada" valor={nombreMano(paciente.manoAfectada)} />
          {inicio && <Dato titulo="Inicio" valor={`${fechaNumerica(inicio)} · semana ${semanaTratamiento(paciente.fechaInicio, hoy)}`} />}
          {condicion && <Dato titulo="Condición" valor={condicion} />}
        </dl>
        <p className="perfil-nota">Estos datos los registró tu terapeuta. Si algo no está bien, pídele que lo corrija.</p>
      </section>

      {/* Va antes del largo de mano para que en el teléfono se vea sin desplazarse: es la única entrada a /privacidad. */}
      <Link to="/privacidad" className="tarjeta perfil-enlace">
        <span className="icono-caja" aria-hidden="true">
          <Icono nombre="escudo" />
        </span>
        <span className="perfil-enlace-texto">
          <strong>Privacidad y datos</strong>
          <span>Qué compartes, descargar o eliminar tus datos</span>
          {consentimiento !== undefined &&
            (consentimientoVigente(consentimiento) ? (
              <span data-testid="perfil-consentimiento">Consentimiento vigente</span>
            ) : (
              <span data-testid="perfil-consentimiento" className="perfil-pendiente">
                Consentimiento pendiente de firma
              </span>
            ))}
        </span>
        <Icono nombre="adelante" className="perfil-flecha" />
      </Link>

      <LargoMano inicial={paciente.largoManoCm} alGuardar={recargar} />
    </div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="perfil-dato">
      <dt>{titulo}</dt>
      <dd>{valor}</dd>
    </div>
  )
}

/** Largo de mano medido con regla: campo con coma decimal, pasos de 0,5 cm y guardado con confirmación a la vista. */
function LargoMano({ inicial, alGuardar }: { inicial: number | null; alGuardar: () => void }) {
  const [guardado, setGuardado] = useState(inicial)
  const [texto, setTexto] = useState(inicial == null ? '' : textoLargo(inicial))
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const v = validarLargo(texto)
  const cambiado = v.ok && v.cm !== guardado
  // El campo vacío no es un error (todavía no escribe); un texto inválido sí. Un fallo al guardar se queda hasta que edite.
  const error = texto.trim() && !v.ok ? v.error : fallo
  const actual = v.ok ? v.cm : (guardado ?? LARGO_INICIAL_CM)

  const escribir = (t: string) => {
    setTexto(t)
    setFallo(null)
  }

  async function guardar() {
    if (!v.ok || guardando) return
    setGuardando(true)
    setFallo(null)
    try {
      await repos.pacientes.actualizarLargoMano(v.cm)
      setGuardado(v.cm)
      setTexto(textoLargo(v.cm))
      avisar(`Largo de mano guardado: ${num(v.cm)} cm`)
      alGuardar()
    } catch {
      const sinRed = typeof navigator !== 'undefined' && !navigator.onLine
      setFallo(sinRed ? 'No hay conexión: el largo de tu mano no se guardó. Intenta cuando vuelvas a tener internet.' : 'No se pudo guardar el largo de tu mano. Intenta de nuevo.')
      avisar('No se pudo guardar el largo de tu mano', true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="tarjeta perfil-largo" aria-label="Largo de mano">
      <div className="perfil-largo-cabeza">
        <h2>Largo de mano</h2>
        <span className={`insignia ${guardado == null ? 'gris' : 'ok'}`} data-testid="perfil-largo-guardado">
          {guardado == null ? 'Sin medir' : `${num(guardado)} cm`}
        </span>
      </div>
      <p className="perfil-nota">
        Mide tu mano abierta con una regla, desde el pliegue de la muñeca hasta la punta del dedo medio. Con esa medida la app ajusta la escala de tu mano en
        la cámara y calcula mejor las distancias de tus ejercicios, que siguen siendo aproximadas.
        {guardado == null ? ' Mientras no la midas, la app estima el largo con la cámara.' : ''}
      </p>
      <form
        className="perfil-largo-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <div className="campo">
          <label htmlFor="perfil-largo">Largo de mano en centímetros</label>
          <div className="perfil-largo-control">
            <button type="button" className="boton-paso" aria-label="Bajar largo de mano" disabled={guardando || actual <= LARGO_MIN_CM} onClick={() => escribir(textoLargo(pasoLargo(actual, -1)))}>
              <Icono nombre="menos" />
            </button>
            <input
              id="perfil-largo"
              className="entrada"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'perfil-largo-error' : 'perfil-largo-ayuda'}
              placeholder="18,5"
              value={texto}
              disabled={guardando}
              onChange={(e) => escribir(e.target.value)}
            />
            <button type="button" className="boton-paso" aria-label="Subir largo de mano" disabled={guardando || actual >= LARGO_MAX_CM} onClick={() => escribir(textoLargo(pasoLargo(actual, 1)))}>
              <Icono nombre="mas" />
            </button>
          </div>
          {error ? (
            <p id="perfil-largo-error" className="error-campo" role="alert">
              {error}
            </p>
          ) : (
            <p id="perfil-largo-ayuda" className="ayuda-campo">
              Entre {LARGO_MIN_CM} y {LARGO_MAX_CM} cm. El cambio se usa desde tu próxima sesión.
            </p>
          )}
        </div>
        <button type="submit" className="boton primario bloque" disabled={!cambiado || guardando}>
          {guardando ? 'Guardando…' : 'Guardar largo de mano'}
        </button>
      </form>
    </section>
  )
}

function CerrarSesion() {
  const cerrar = useCerrarSesion()
  const [saliendo, setSaliendo] = useState(false)
  return (
    <button
      type="button"
      className="boton secundario bloque perfil-salir"
      disabled={saliendo}
      onClick={async () => {
        setSaliendo(true)
        await cerrar()
        setSaliendo(false)
      }}
    >
      <Icono nombre="salir" />
      Cerrar sesión
    </button>
  )
}
