// F15 · Historial y registro de sesión (docs/referencia/imagenes/10a_historial.png y 10b_registro_sesion.png).
// /historial = lista; /historial/:id = la misma lista con la hoja "Registro de sesión" abierta (enlace directo).
// El terapeuta lo abre desde un paciente con ?paciente=<id>. Solo describe datos: sin interpretación clínica.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/contexto'
import { repos } from '../../data/repos'
import { hashCorto, verificarSesion } from '../../domain/integridad'
import type { Paciente, Sesion } from '../../domain/types'
import { nombreJuego } from '../../games/registry'
import { exportarCsv, exportarPdf, type ContextoExport } from '../../historial/exportar'
import { nombrePeriodo, RANGOS, sesionesDelPeriodo, type Rango } from '../../historial/periodo'
import {
  cantidadSesiones,
  etiquetasSesion,
  fechaSesion,
  textoCambio,
  textoCantidad,
  textoDispositivo,
  textoParametros,
  textoVersion,
  unirHistorial,
  type FilaHistorial,
  type FilaPlan,
} from '../../historial/filas'
import { fechaNumerica, hora, mesCorto } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { Icono } from '../../ui/Icono'
import { avisar, Encabezado, Estados, Hoja, Vacio } from '../../ui/piezas'
import './historial.css'

interface Datos {
  paciente: Paciente | null
  terapeuta: string | null
  filas: FilaHistorial[]
  sesiones: Sesion[]
}

async function cargar(pacienteId: string | null, esTerapeuta: boolean): Promise<Datos> {
  const paciente = esTerapeuta ? (pacienteId ? await repos.pacientes.porId(pacienteId) : null) : await repos.pacientes.miPaciente()
  if (!paciente) return { paciente: null, terapeuta: null, filas: [], sesiones: [] }
  const [sesiones, auditoria, terapeuta] = await Promise.all([
    repos.sesiones.listar(paciente.id),
    repos.auditoria.listar(paciente.id),
    paciente.terapeutaId ? repos.perfiles.nombre(paciente.terapeutaId).catch(() => null) : Promise.resolve(null),
  ])
  const quienes = [...new Set(auditoria.filter((a) => a.entidad === 'plan' && a.quien).map((a) => a.quien as string))]
  const nombres: Record<string, string | null> = {}
  await Promise.all(quienes.map(async (q) => (nombres[q] = await repos.perfiles.nombre(q).catch(() => null))))
  return { paciente, terapeuta, filas: unirHistorial(sesiones, auditoria, nombres), sesiones }
}

export default function HistorialPantalla({ idAbierto }: { idAbierto?: string }) {
  const { usuario } = useAuth()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const esTerapeuta = usuario?.rol === 'terapeuta'
  const pacienteParam = esTerapeuta ? params.get('paciente') : null
  const r = useCarga(() => cargar(pacienteParam, esTerapeuta), [pacienteParam, esTerapeuta, usuario?.id])
  const [exportando, setExportando] = useState(false)
  const [plan, setPlan] = useState<FilaPlan | null>(null)
  const suf = pacienteParam ? `?paciente=${encodeURIComponent(pacienteParam)}` : ''

  const total = r.datos ? cantidadSesiones(r.datos.filas) : 0
  const ctx: ContextoExport | null = usuario && r.datos?.paciente ? { paciente: r.datos.paciente, terapeuta: r.datos.terapeuta, usuario } : null

  return (
    <main className="pantalla con-barra historial">
      <Encabezado
        titulo="Historial"
        subtitulo={r.datos?.paciente ? textoCantidad(total) : undefined}
        atras={esTerapeuta ? '/terapeuta/pacientes' : undefined}
        derecha={
          <button type="button" className="historial-exportar" onClick={() => setExportando(true)} disabled={!ctx || total === 0}>
            <Icono nombre="documento" tam={20} />
            Exportar
          </button>
        }
      />
      <Estados r={r}>
        {(d) =>
          !d.paciente ? (
            esTerapeuta ? (
              <Vacio titulo="Elige un paciente" texto="Abre el historial desde la ficha de un paciente." icono="pacientes" accion={<Link className="boton primario" to="/terapeuta/pacientes">Ver pacientes</Link>} />
            ) : (
              <Vacio titulo="Tu ficha aún no está lista" texto="Pide a tu terapeuta que te registre en la clínica." icono="perfil" />
            )
          ) : d.filas.length === 0 ? (
            <Vacio titulo="Aún no hay registros" texto="Cuando completes una sesión, aparecerá aquí con su registro." icono="historial" />
          ) : (
            <ul className="lista sin-vinetas historial-lista" aria-label="Registros">
              {d.filas.map((f) =>
                f.tipo === 'sesion' ? (
                  <li key={f.clave}>
                    <FilaDeSesion fila={f} abierta={f.sesion.id === idAbierto} suf={suf} />
                  </li>
                ) : (
                  <li key={f.clave}>
                    <FilaDePlan fila={f} onAbrir={() => setPlan(f)} />
                  </li>
                ),
              )}
            </ul>
          )
        }
      </Estados>

      {r.datos && ctx && idAbierto && (
        <HojaRegistro
          id={idAbierto}
          sesiones={r.datos.sesiones}
          ctx={ctx}
          onCerrar={() => nav(`/historial${suf}`, { replace: true })}
        />
      )}
      {plan && <HojaPlan fila={plan} onCerrar={() => setPlan(null)} />}
      {r.datos && ctx && <HojaExportar abierta={exportando} onCerrar={() => setExportando(false)} sesiones={r.datos.sesiones.filter((s) => s.estado === 'cerrada')} ctx={ctx} />}
    </main>
  )
}

// ---------------------------------------------------------- filas
function Fecha({ fecha }: { fecha: Date }) {
  return (
    <span className="historial-fecha" aria-hidden="true">
      <strong>{fecha.getDate()}</strong>
      <span>{mesCorto(fecha)}</span>
    </span>
  )
}

function FilaDeSesion({ fila, abierta, suf }: { fila: Extract<FilaHistorial, { tipo: 'sesion' }>; abierta: boolean; suf: string }) {
  const s = fila.sesion
  return (
    <Link to={`/historial/${s.id}${suf}`} className={`historial-fila ${abierta ? 'seleccionada' : ''}`} data-testid="fila-sesion" data-id={s.id}>
      <Fecha fecha={fila.fecha} />
      <span className="historial-cuerpo">
        <span className="historial-titulo">{nombreJuego(s.juego)}</span>
        <span className="historial-sub mono">
          {hora(fila.fecha)} · {s.id}
        </span>
        <span className="historial-etiquetas">
          {etiquetasSesion(s).map((e) => (
            <span key={e.texto} className={`historial-tag ${e.tono}`}>
              {e.texto}
            </span>
          ))}
        </span>
      </span>
      <Icono nombre="adelante" tam={20} className="historial-flecha" />
    </Link>
  )
}

const MAX_TAGS_PLAN = 3

function FilaDePlan({ fila, onAbrir }: { fila: FilaPlan; onAbrir: () => void }) {
  const visibles = fila.cambios.slice(0, MAX_TAGS_PLAN)
  return (
    <button type="button" className="historial-fila" onClick={onAbrir} data-testid="fila-plan">
      <Fecha fecha={fila.fecha} />
      <span className="historial-cuerpo">
        <span className="historial-titulo">{fila.titulo}</span>
        <span className="historial-sub mono">
          {hora(fila.fecha)} · {fila.quien ? `por ${fila.quien}` : 'autor no disponible'}
        </span>
        <span className="historial-etiquetas">
          {visibles.map((c) => (
            <span key={textoCambio(c) + (c.juego ?? '')} className="historial-tag info">
              {textoCambio(c)}
            </span>
          ))}
          {fila.cambios.length > MAX_TAGS_PLAN && <span className="historial-tag gris">+{fila.cambios.length - MAX_TAGS_PLAN} más</span>}
        </span>
      </span>
      <Icono nombre="adelante" tam={20} className="historial-flecha" />
    </button>
  )
}

// ---------------------------------------------------------- hoja: cambio de plan
function HojaPlan({ fila, onCerrar }: { fila: FilaPlan; onCerrar: () => void }) {
  const mensaje = typeof fila.auditoria.despues?.mensaje === 'string' ? fila.auditoria.despues.mensaje : null
  return (
    <Hoja abierta onCerrar={onCerrar} titulo={fila.titulo}>
      <div className="col historial-hoja">
        <h2 className="historial-hoja-titulo">{fila.titulo}</h2>
        <div className="tabla-datos">
          <Dato n="Fecha y hora" v={`${fechaNumerica(fila.fecha)} · ${hora(fila.fecha)}`} />
          <Dato n="Hecho por" v={fila.quien ?? 'No disponible'} />
          <Dato n="Versión del plan" v={String(fila.auditoria.despues?.version ?? '—')} />
        </div>
        <h3 className="seccion">Qué cambió</h3>
        {fila.cambios.length ? (
          <ul className="sin-vinetas col historial-cambios">
            {fila.cambios.map((c, i) => (
              <li key={i}>{c.juego ? `${c.juego}: ` : ''}{textoCambio(c)}</li>
            ))}
          </ul>
        ) : (
          <p className="tenue">Sin cambios en los ejercicios ni en las metas.</p>
        )}
        {mensaje && <p className="tenue">Mensaje del terapeuta: «{mensaje}»</p>}
        <button type="button" className="boton secundario bloque" onClick={onCerrar}>Cerrar</button>
      </div>
    </Hoja>
  )
}

// ---------------------------------------------------------- hoja: registro de sesión
type Integ = 'calculando' | 'verificado' | 'alterado' | 'sin-hash' | 'error'

function useIntegridad(s: Sesion | null): Integ {
  const [estado, setEstado] = useState<{ clave: string; v: Integ } | null>(null)
  const clave = s ? `${s.id}|${s.hash}` : ''
  useEffect(() => {
    if (!s) return
    let vivo = true
    repos.sesiones
      .eventos(s.id)
      .then((ev) => verificarSesion(s, ev))
      .then(
        (v) => vivo && setEstado({ clave, v }),
        () => vivo && setEstado({ clave, v: 'error' }),
      )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return !s ? 'error' : estado?.clave === clave ? estado.v : 'calculando'
}

const TEXTO_INTEG: Record<Integ, string> = {
  calculando: 'Verificando…',
  verificado: 'Verificado',
  alterado: 'Alterado',
  'sin-hash': 'Sin cerrar',
  error: 'No se pudo verificar',
}

function Dato({ n, v, mono, testid }: { n: string; v: string; mono?: boolean; testid?: string }) {
  return (
    <div>
      <span className="tenue">{n}</span>
      <strong className={mono ? 'mono historial-mono' : undefined} data-testid={testid}>{v}</strong>
    </div>
  )
}

function HojaRegistro({ id, sesiones, ctx, onCerrar }: { id: string; sesiones: Sesion[]; ctx: ContextoExport; onCerrar: () => void }) {
  const conocida = sesiones.find((s) => s.id === id) ?? null
  const extra = useCarga(async () => (conocida ? null : ((await repos.sesiones.obtener(id)) ?? { noEncontrada: true })), [id, conocida])
  const s = conocida ?? (extra.datos && 'id' in extra.datos ? extra.datos : null)
  const integ = useIntegridad(s)
  const [ocupado, setOcupado] = useState<'pdf' | 'csv' | null>(null)

  const exportar = async (tipo: 'pdf' | 'csv') => {
    if (!s || ocupado) return
    setOcupado(tipo)
    try {
      if (tipo === 'pdf') avisar(`PDF listo: ${await exportarPdf(ctx, [s], `Sesión ${s.id}`)}`)
      else avisar(`CSV listo: ${(await exportarCsv(ctx, [s], `Sesión ${s.id}`)).join(' y ')}`)
    } catch (e) {
      avisar(e instanceof Error ? `No se pudo exportar: ${e.message}` : 'No se pudo exportar. Intenta de nuevo.', true)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Registro de sesión">
      <div className="col historial-hoja">
        <div className="fila entre">
          <h2 className="historial-hoja-titulo">Registro de sesión</h2>
          {s && (
            <span className={`insignia ${integ === 'verificado' ? 'ok' : integ === 'alterado' ? 'malo' : 'gris'}`} data-testid="integridad" role="status">
              {TEXTO_INTEG[integ]}
            </span>
          )}
        </div>
        {!s ? (
          extra.estado === 'cargando' ? (
            <p className="tenue">Cargando…</p>
          ) : (
            <p className="tenue">No encontramos esta sesión.</p>
          )
        ) : (
          <>
            <div className="tabla-datos">
              <Dato n="ID" v={s.id} testid="reg-id" />
              <Dato n="Fecha y hora" v={`${fechaNumerica(fechaSesion(s))} · ${hora(fechaSesion(s))}`} />
              <Dato n="Ejercicio" v={nombreJuego(s.juego)} />
              <Dato n="Parámetros" v={textoParametros(s)} />
              <Dato n="Prescrito por" v={s.parametros?.prescritoPor ?? 'Práctica libre'} />
              <Dato n="Dispositivo" v={textoDispositivo(s)} />
              <Dato n="Versión" v={textoVersion(s)} />
              <Dato n="Integridad" v={`sha-256 ${hashCorto(s.hash)}${integ === 'verificado' ? ' ✓' : integ === 'alterado' ? ' ✗' : ''}`} mono testid="reg-hash" />
            </div>
            <div className="historial-acciones">
              <button type="button" className="boton primario" onClick={() => exportar('pdf')} disabled={!!ocupado} data-testid="exportar-pdf">
                {ocupado === 'pdf' ? 'Preparando…' : 'Exportar PDF'}
              </button>
              <button type="button" className="boton secundario" onClick={() => exportar('csv')} disabled={!!ocupado} data-testid="exportar-csv">
                {ocupado === 'csv' ? 'Preparando…' : 'CSV'}
              </button>
            </div>
            <p className="muy-tenue chico">Mediciones estimadas con cámara; no reemplazan la evaluación clínica.</p>
          </>
        )}
      </div>
    </Hoja>
  )
}

// ---------------------------------------------------------- hoja: exportar un período
function HojaExportar({ abierta, onCerrar, sesiones, ctx }: { abierta: boolean; onCerrar: () => void; sesiones: Sesion[]; ctx: ContextoExport }) {
  const [rango, setRango] = useState<Rango>('4s')
  const [ocupado, setOcupado] = useState<'pdf' | 'csv' | null>(null)
  const [hoy] = useState(() => new Date())
  const periodo = useMemo(() => sesionesDelPeriodo(sesiones, rango, hoy), [sesiones, rango, hoy])

  const exportar = async (tipo: 'pdf' | 'csv') => {
    if (ocupado || !periodo.length) return
    setOcupado(tipo)
    try {
      const nombre = nombrePeriodo(rango, hoy)
      if (tipo === 'pdf') avisar(`PDF listo: ${await exportarPdf(ctx, periodo, nombre)}`)
      else avisar(`CSV listo: ${(await exportarCsv(ctx, periodo, nombre)).join(' y ')}`)
      onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? `No se pudo exportar: ${e.message}` : 'No se pudo exportar. Intenta de nuevo.', true)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Exportar historial">
      <div className="col historial-hoja">
        <h2 className="historial-hoja-titulo">Exportar</h2>
        <div className="chips" role="group" aria-label="Período">
          {RANGOS.map((x) => (
            <button key={x.id} type="button" className="chip" aria-pressed={rango === x.id} onClick={() => setRango(x.id)}>
              {x.texto}
            </button>
          ))}
        </div>
        <p className="tenue" data-testid="cantidad-periodo">{textoCantidad(periodo.length)} en este período</p>
        <div className="historial-acciones">
          <button type="button" className="boton primario" onClick={() => exportar('pdf')} disabled={!!ocupado || !periodo.length} data-testid="exportar-periodo-pdf">
            {ocupado === 'pdf' ? 'Preparando…' : 'Exportar PDF'}
          </button>
          <button type="button" className="boton secundario" onClick={() => exportar('csv')} disabled={!!ocupado || !periodo.length} data-testid="exportar-periodo-csv">
            {ocupado === 'csv' ? 'Preparando…' : 'CSV'}
          </button>
        </div>
        <p className="muy-tenue chico">El CSV trae dos archivos: uno con una fila por sesión y otro con los eventos. Cada exportación queda anotada en la auditoría.</p>
      </div>
    </Hoja>
  )
}
