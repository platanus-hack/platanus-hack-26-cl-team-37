// F19 · Perfil del paciente (pestaña /perfil). Sin imagen de referencia: mismo lenguaje visual que Inicio y Privacidad.
// Datos de la ficha tal como los registró el terapeuta (solo lectura), largo de mano editable (referencia de escala de
// la calibración; lo escribe la RPC actualizar_largo_mano con auditoría), acceso a Privacidad, versión y cerrar sesión.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { repos } from '../../data/repos'
import type { Consentimiento, Paciente } from '../../domain/types'
import { consentimientoVigente } from '../../legal/consentimiento'
import { fechaCorta, iniciales, nombreMano, num } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { VERSION_APP } from '../../lib/version'
import { semanaTratamiento } from '../../metrics/sesion'
import { Icono } from '../../ui/Icono'
import { avisar, Encabezado, Estados, Vacio } from '../../ui/piezas'
import { LARGO_INICIAL_CM, LARGO_MAX_CM, LARGO_MIN_CM, pasoLargo, textoLargo, validarLargo } from './largoMano'
import './perfil.css'

interface Datos {
  paciente: Paciente | null
  consentimiento: Consentimiento | null
  terapeuta: string | null
  clinica: string | null
}

async function cargar(clinicaId: string | undefined): Promise<Datos> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return { paciente: null, consentimiento: null, terapeuta: null, clinica: null }
  const [consentimiento, terapeuta, clinica] = await Promise.all([
    repos.consentimientos.ultimo(paciente.id),
    paciente.terapeutaId ? repos.perfiles.nombre(paciente.terapeutaId) : Promise.resolve(null),
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
            <Contenido datos={d as Datos & { paciente: Paciente }} recargar={r.recargar} />
          ) : (
            <>
              <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
              <CerrarSesion />
            </>
          )
        }
      </Estados>
    </main>
  )
}

function Contenido({ datos, recargar }: { datos: Datos & { paciente: Paciente }; recargar: () => void }) {
  const { usuario } = useAuth()
  const { paciente, consentimiento, terapeuta, clinica } = datos
  const nombre = usuario?.nombre ?? paciente.nombre
  const [hoy] = useState(() => new Date())
  const inicio = new Date(paciente.fechaInicio + 'T00:00:00')
  const vigente = consentimientoVigente(consentimiento)

  return (
    <>
      <section className="tarjeta perfil-identidad" aria-label="Tus datos">
        <span className="perfil-avatar" aria-hidden="true">
          {iniciales(nombre)}
        </span>
        <div className="perfil-nombre">
          <h2>{nombre}</h2>
          <p>{clinica ?? 'Clínica sin nombre'}</p>
        </div>
      </section>

      <section className="tarjeta" aria-label="Tu tratamiento">
        <p className="perfil-nota">Esta información la registró tu terapeuta.</p>
        <dl className="perfil-datos">
          <Dato titulo="Terapeuta" valor={terapeuta ?? 'Sin terapeuta asignado'} />
          <Dato titulo="Inicio del tratamiento" valor={`${fechaCorta(inicio)} ${inicio.getFullYear()}`} />
          <Dato titulo="Semana de tratamiento" valor={`Semana ${semanaTratamiento(paciente.fechaInicio, hoy)}`} />
          <Dato titulo="Mano afectada" valor={nombreMano(paciente.manoAfectada)} />
          <Dato titulo="Condición" valor={paciente.condicion?.trim() || 'Sin registrar'} />
        </dl>
      </section>

      <LargoMano key={paciente.largoManoCm ?? 'nada'} guardado={paciente.largoManoCm} alGuardar={recargar} />

      <Link to="/privacidad" className="tarjeta tarjeta-boton perfil-enlace">
        <span className="icono-caja" aria-hidden="true">
          <Icono nombre="escudo" />
        </span>
        <span className="perfil-enlace-texto">
          <strong>Privacidad y datos</strong>
          <span>Consentimiento informado</span>
        </span>
        <span className={`insignia ${vigente ? 'ok' : 'malo'}`}>{vigente ? 'Vigente' : 'Pendiente'}</span>
        <Icono nombre="adelante" />
      </Link>

      <CerrarSesion />
      <p className="perfil-version">ManoViva · versión {VERSION_APP}</p>
    </>
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

function LargoMano({ guardado, alGuardar }: { guardado: number | null; alGuardar: () => void }) {
  const [texto, setTexto] = useState(guardado == null ? '' : textoLargo(guardado))
  const [guardando, setGuardando] = useState(false)
  const v = validarLargo(texto)
  const cambiado = v.ok && v.cm !== guardado
  const error = texto.trim() && !v.ok ? v.error : null
  const actual = v.ok ? v.cm : (guardado ?? LARGO_INICIAL_CM)

  const mover = (d: 1 | -1) => setTexto(textoLargo(pasoLargo(actual, d)))

  async function guardar() {
    if (!v.ok) return
    setGuardando(true)
    try {
      await repos.pacientes.actualizarLargoMano(v.cm)
      avisar(`Largo de mano guardado: ${num(v.cm)} cm`)
      alGuardar()
    } catch {
      avisar('No se pudo guardar el largo de tu mano. Intenta de nuevo.', true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="tarjeta perfil-largo" aria-label="Largo de mano">
      <div className="fila entre">
        <h2>Largo de mano</h2>
        <span className={`insignia ${guardado == null ? 'gris' : 'ok'}`}>{guardado == null ? 'Sin medir' : `${num(guardado)} cm`}</span>
      </div>
      <p className="perfil-nota">
        Mídelo con una regla, desde el pliegue de la muñeca hasta la punta del dedo medio. Ayuda a calcular distancias más
        precisas en las sesiones (son estimaciones).
      </p>
      <div className="perfil-largo-control">
        <button type="button" className="perfil-paso" aria-label="Bajar largo de mano" disabled={actual <= LARGO_MIN_CM} onClick={() => mover(-1)}>
          <Icono nombre="menos" />
        </button>
        <div className="perfil-largo-campo">
          <input
            className="entrada"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Largo de mano en centímetros"
            aria-invalid={!!error}
            aria-describedby={error ? 'perfil-largo-error' : undefined}
            placeholder="18,5"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <span aria-hidden="true">cm</span>
        </div>
        <button type="button" className="perfil-paso" aria-label="Subir largo de mano" disabled={actual >= LARGO_MAX_CM} onClick={() => mover(1)}>
          <Icono nombre="mas" />
        </button>
      </div>
      {error && (
        <p id="perfil-largo-error" className="error-campo" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="boton primario bloque" disabled={!cambiado || guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar largo de mano'}
      </button>
    </section>
  )
}

function CerrarSesion() {
  const { salir } = useAuth()
  const nav = useNavigate()
  const [saliendo, setSaliendo] = useState(false)
  const cerrar = async () => {
    setSaliendo(true)
    try {
      await salir()
      avisar('Sesión cerrada')
      nav('/acceso', { replace: true })
    } catch {
      setSaliendo(false)
      avisar('No se pudo cerrar la sesión. Intenta de nuevo.', true)
    }
  }
  return (
    <button type="button" className="boton secundario bloque" disabled={saliendo} onClick={cerrar}>
      <Icono nombre="salir" />
      Cerrar sesión
    </button>
  )
}
