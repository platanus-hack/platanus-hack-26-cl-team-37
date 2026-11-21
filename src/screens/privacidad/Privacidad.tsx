// F18 · Privacidad y datos (docs/referencia/imagenes/13_privacidad.png).
// Interruptores, consentimiento informado versionado (obligatorio antes de la primera sesión), descarga JSON/CSV y
// eliminación con doble confirmación. Los cambios de ajustes los audita la RPC actualizar_privacidad; la firma del
// consentimiento y la descarga se anotan aquí con repos.auditoria.registrar.
import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { repos } from '../../data/repos'
import type { Consentimiento, Paciente } from '../../domain/types'
import { bloquesDeMarkdown, consentimientoVigente, TEXTO_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from '../../legal/consentimiento'
import { fechaNumerica } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Icono } from '../../ui/Icono'
import { avisar, Dialogo, Encabezado, Estados, Hoja, Interruptor, Vacio } from '../../ui/piezas'
import { aCsv, aJson, descargar, nombreArchivo } from './exportar'
import { reunir } from './reunir'
import './privacidad.css'

interface Datos {
  paciente: Paciente | null
  consentimiento: Consentimiento | null
  terapeuta: string | null
}

async function cargar(): Promise<Datos> {
  const paciente = await repos.pacientes.miPaciente()
  if (!paciente) return { paciente: null, consentimiento: null, terapeuta: null }
  const [consentimiento, terapeuta] = await Promise.all([
    repos.consentimientos.ultimo(paciente.id),
    paciente.terapeutaId ? repos.perfiles.nombre(paciente.terapeutaId) : Promise.resolve(null),
  ])
  return { paciente, consentimiento, terapeuta }
}

export default function Privacidad() {
  const r = useCarga(cargar, [])
  return (
    <main className="pantalla privacidad">
      <Encabezado titulo="Privacidad y datos" atras="/perfil" />
      <Estados r={r}>
        {(d) =>
          d.paciente ? (
            <Contenido paciente={d.paciente} consentimiento={d.consentimiento} terapeuta={d.terapeuta} recargar={r.recargar} />
          ) : (
            <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
          )
        }
      </Estados>
    </main>
  )
}

function Contenido({ paciente, consentimiento, terapeuta, recargar }: { paciente: Paciente; consentimiento: Consentimiento | null; terapeuta: string | null; recargar: () => void }) {
  const { usuario } = useAuth()
  const nav = useNavigate()
  const volver = (useLocation().state as { volver?: string } | null)?.volver
  const vigente = consentimientoVigente(consentimiento)

  const [compartir, setCompartir] = useState(paciente.compartirMetricas)
  const [investigacion, setInvestigacion] = useState(paciente.datosInvestigacion)
  const [guardando, setGuardando] = useState(false)

  const [leyendo, setLeyendo] = useState(!vigente && !!volver) // al venir de una sesión se abre solo
  const [acepto, setAcepto] = useState(false)
  const [firmando, setFirmando] = useState(false)

  const [formatos, setFormatos] = useState(false)
  const [bajando, setBajando] = useState(false)

  const [paso, setPaso] = useState<0 | 1 | 2>(0)
  const [palabra, setPalabra] = useState('')
  const [eliminando, setEliminando] = useState(false)

  async function cambiar(nuevoCompartir: boolean, nuevaInvestigacion: boolean) {
    const antes = { c: compartir, i: investigacion }
    setCompartir(nuevoCompartir)
    setInvestigacion(nuevaInvestigacion)
    setGuardando(true)
    try {
      await repos.pacientes.actualizarPrivacidad(nuevoCompartir, nuevaInvestigacion)
      avisar(
        nuevoCompartir !== antes.c
          ? nuevoCompartir
            ? 'Tu terapeuta volverá a ver tus métricas'
            : 'Tu terapeuta ya no ve tus métricas'
          : nuevaInvestigacion
            ? 'Datos anónimos para investigación: activado'
            : 'Datos anónimos para investigación: desactivado',
      )
    } catch {
      setCompartir(antes.c)
      setInvestigacion(antes.i)
      avisar('No se pudo guardar el cambio. Intenta de nuevo.', true)
    } finally {
      setGuardando(false)
    }
  }

  async function firmar() {
    setFirmando(true)
    try {
      const c = await repos.consentimientos.firmar(paciente.id, VERSION_CONSENTIMIENTO, {
        analisisEnDispositivo: true,
        compartirMetricas: compartir,
        datosInvestigacion: investigacion,
      })
      try {
        await repos.auditoria.registrar({
          accion: 'consentimiento_firmado',
          entidad: 'consentimiento',
          entidadId: c.id,
          pacienteId: paciente.id,
          despues: { version: c.version, firmadoEl: c.firmadoEl },
        })
      } catch {
        // La firma ya quedó guardada; no se pierde por un fallo del registro.
      }
      setLeyendo(false)
      avisar('Consentimiento firmado')
      if (volver) nav(volver, { replace: true })
      else recargar()
    } catch {
      avisar('No se pudo guardar tu firma. Intenta de nuevo.', true)
    } finally {
      setFirmando(false)
    }
  }

  async function bajar(formato: 'json' | 'csv') {
    setBajando(true)
    try {
      const paquete = await reunir({ nombre: usuario?.nombre ?? paciente.nombre, titulo: usuario?.titulo, rol: 'paciente' }, paciente)
      if (formato === 'json') descargar(nombreArchivo('json'), aJson(paquete), 'application/json')
      else descargar(nombreArchivo('csv'), aCsv(paquete), 'text/csv;charset=utf-8')
      try {
        await repos.auditoria.registrar({
          accion: 'datos_descargados',
          entidad: 'paciente',
          entidadId: paciente.id,
          pacienteId: paciente.id,
          despues: { formato, sesiones: paquete.sesiones.length, eventos: paquete.eventos.length },
        })
      } catch {
        // La descarga ya ocurrió; el registro es de mejor esfuerzo.
      }
      setFormatos(false)
      avisar(`Descargaste tus datos (${formato.toUpperCase()})`)
    } catch {
      avisar('No se pudieron reunir tus datos. Intenta de nuevo.', true)
    } finally {
      setBajando(false)
    }
  }

  async function eliminar() {
    setEliminando(true)
    try {
      await repos.pacientes.eliminarMisDatos()
      setPaso(0)
      setPalabra('')
      setCompartir(false)
      setInvestigacion(false)
      avisar('Eliminamos tus datos')
      recargar()
    } catch {
      avisar('No se pudieron eliminar tus datos. Intenta de nuevo.', true)
    } finally {
      setEliminando(false)
    }
  }

  const cancelarEliminar = () => {
    setPaso(0)
    setPalabra('')
  }
  const firmado = consentimiento ? fechaNumerica(consentimiento.firmadoEl) : null

  return (
    <>
      <section className="priv-tarjeta" aria-label="Tu video no se guarda">
        <svg className="priv-escudo" viewBox="0 0 48 56" aria-hidden="true">
          <path d="M24 2 4 9.5v17C4 39 12.5 49.5 24 54c11.5-4.5 20-15 20-27.5v-17z" fill="var(--exito)" />
          <path d="M14.5 28.5 21.5 35.5 34 21" fill="none" stroke="#0f1720" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <h2>Tu video no se guarda</h2>
          <p>La cámara se analiza en tu teléfono. Solo se guardan los puntos de la mano y tus resultados.</p>
        </div>
      </section>

      <ul className="priv-ajustes">
        <Ajuste titulo="Analizar en el dispositivo" detalle="Siempre activo">
          <Interruptor marcado deshabilitado etiqueta="Analizar en el dispositivo" />
        </Ajuste>
        <Ajuste titulo="Guardar video de la sesión" detalle="Desactivado">
          <Interruptor marcado={false} deshabilitado etiqueta="Guardar video de la sesión" />
        </Ajuste>
        <Ajuste titulo="Compartir métricas con mi terapeuta" detalle={terapeuta ?? (paciente.terapeutaId ? 'Tu terapeuta' : 'Sin terapeuta vinculado')}>
          <Interruptor marcado={compartir} deshabilitado={guardando} onCambio={(v) => cambiar(v, investigacion)} etiqueta="Compartir métricas con mi terapeuta" />
        </Ajuste>
        <Ajuste titulo="Datos anónimos para investigación" detalle="Opcional">
          <Interruptor marcado={investigacion} deshabilitado={guardando} onCambio={(v) => cambiar(compartir, v)} etiqueta="Datos anónimos para investigación" />
        </Ajuste>
      </ul>

      <button type="button" className={`priv-consent ${vigente ? '' : 'pendiente'}`} onClick={() => setLeyendo(true)}>
        <span className="priv-consent-texto">
          <strong>Consentimiento informado</strong>
          <span>
            {vigente
              ? `Firmado el ${firmado}`
              : consentimiento
                ? `Hay una versión nueva (la tuya: ${consentimiento.version}). Fírmala antes de tu próxima sesión.`
                : 'Léelo y fírmalo antes de tu primera sesión.'}
          </span>
        </span>
        <span className={`insignia ${vigente ? 'ok' : 'malo'}`}>{vigente ? 'Vigente' : 'Pendiente'}</span>
      </button>

      <div className="priv-acciones">
        <button type="button" className="boton secundario" onClick={() => setFormatos(true)}>
          Descargar mis datos
        </button>
        <button type="button" className="boton peligro" onClick={() => setPaso(1)}>
          Eliminar
        </button>
      </div>

      <Hoja abierta={leyendo} onCerrar={() => setLeyendo(false)} titulo="Consentimiento informado">
        <div className="priv-texto">
          {bloquesDeMarkdown(TEXTO_CONSENTIMIENTO).map((b, i) =>
            b.tipo === 'titulo' ? (
              <h3 key={i}>{b.texto}</h3>
            ) : b.tipo === 'aviso' ? (
              <p key={i} className="priv-borrador">
                {b.texto}
              </p>
            ) : b.tipo === 'lista' ? (
              <ul key={i}>
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{b.texto}</p>
            ),
          )}
        </div>
        {vigente ? (
          <p className="tenue priv-pie">
            Versión {consentimiento?.version} · firmado el {firmado}
          </p>
        ) : (
          <div className="col priv-firma">
            <label className="priv-acepto">
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
              <span>Leí el consentimiento y lo acepto (versión {VERSION_CONSENTIMIENTO})</span>
            </label>
            <button type="button" className="boton primario bloque" disabled={!acepto || firmando} onClick={firmar}>
              {firmando ? 'Guardando…' : 'Firmar consentimiento'}
            </button>
          </div>
        )}
        <button type="button" className="boton secundario bloque" onClick={() => setLeyendo(false)}>
          Cerrar
        </button>
      </Hoja>

      <Hoja abierta={formatos} onCerrar={() => setFormatos(false)} titulo="Descargar mis datos">
        <div className="col">
          <h3>Descargar mis datos</h3>
          <p className="tenue">Perfil, versiones de tu plan, sesiones, eventos, consentimientos, alertas y registro de cambios. No incluye video porque nunca se guarda.</p>
          <button type="button" className="boton primario bloque" disabled={bajando} onClick={() => bajar('json')}>
            <Icono nombre="descarga" />
            Descargar JSON
          </button>
          <button type="button" className="boton secundario bloque" disabled={bajando} onClick={() => bajar('csv')}>
            <Icono nombre="descarga" />
            Descargar CSV
          </button>
        </div>
      </Hoja>

      <Dialogo abierto={paso === 1} onCerrar={cancelarEliminar} titulo="Eliminar mis datos">
        <h3>¿Eliminar tus datos?</h3>
        <p className="tenue">Se borran tus sesiones, eventos, alertas, versiones de plan y consentimientos. Tu cuenta sigue activa. Te recomendamos descargar una copia antes.</p>
        <button type="button" className="boton peligro bloque" onClick={() => setPaso(2)}>
          Continuar
        </button>
        <button type="button" className="boton secundario bloque" onClick={cancelarEliminar}>
          Cancelar
        </button>
      </Dialogo>
      <Dialogo abierto={paso === 2} onCerrar={cancelarEliminar} titulo="Confirmar eliminación">
        <h3>Esta acción no se puede deshacer</h3>
        <p className="tenue">Para confirmar, escribe ELIMINAR.</p>
        <input className="priv-palabra" aria-label="Escribe ELIMINAR" value={palabra} onChange={(e) => setPalabra(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        <button type="button" className="boton peligro bloque" disabled={palabra.trim().toUpperCase() !== 'ELIMINAR' || eliminando} onClick={eliminar}>
          {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
        </button>
        <button type="button" className="boton secundario bloque" onClick={cancelarEliminar}>
          Cancelar
        </button>
      </Dialogo>
    </>
  )
}

function Ajuste({ titulo, detalle, children }: { titulo: string; detalle: string; children: ReactNode }) {
  return (
    <li className="priv-ajuste">
      <div>
        <p className="priv-ajuste-titulo">{titulo}</p>
        <p className="priv-ajuste-detalle">{detalle}</p>
      </div>
      {children}
    </li>
  )
}
