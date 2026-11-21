// F13 · Resumen de sesión (docs/referencia/imagenes/08_resumen_sesion.png).
// Llega desde /sensacion con la Sesion 'en curso' y la CIERRA al entrar: SHA-256 sobre el JSON canónico de la sesión y
// sus eventos (repos.sesiones.cerrar → src/domain/integridad.ts) y estado 'cerrada' (inmutable desde aquí).
// Anillo contador/meta, barras por mano y tarjetas con las métricas de resumen que declara el juego (contrato J0,
// `metricasResumen`) + dolor, con la diferencia contra la sesión anterior cerrada del mismo juego y nivel.
// Solo describe datos: nada de diagnósticos ni recomendaciones.
import type { CSSProperties } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { repos } from '../../data/repos'
import type { Sesion } from '../../domain/types'
import type { DefMetrica } from '../../games/shell/contrato'
import { formatoMetrica } from '../../games/shell/contrato'
import { cargarModulo } from '../../games/shell/modulos'
import { nombreJuego } from '../../games/registry'
import { fechaCorta } from '../../lib/formato'
import { useCarga } from '../../lib/useCarga'
import { avanceMeta, bandaDolor, diferencia, duracionTexto, sesionAnterior, tarjetasResumen, valorMetrica } from '../../metrics/resumen'
import { EVA_MAX } from '../../domain/sensacion'
import { BarraAccion, Encabezado, Estados, Vacio } from '../../ui/piezas'

interface DatosResumen {
  sesion: Sesion
  anterior: Sesion | null
  defs: DefMetrica[]
  unidadMeta: string
  /** Mensaje si no se pudo cerrar (p. ej. sin conexión): el resumen se muestra igual y se puede reintentar. */
  errorCierre: string | null
}

async function cargarResumen(id: string): Promise<DatosResumen | null> {
  let sesion = await repos.sesiones.obtener(id)
  if (!sesion) return null
  let errorCierre: string | null = null
  // Se cierra solo lo que ya se jugó (métricas guardadas) y tiene el dolor marcado; si no, se muestra qué falta.
  if (sesion.estado === 'en curso' && sesion.metricas && sesion.dolorEVA != null) {
    try {
      sesion = await repos.sesiones.cerrar(id)
    } catch (e) {
      errorCierre = e instanceof Error ? e.message : String(e)
    }
  }
  const [crear, sesiones] = await Promise.all([cargarModulo(sesion.juego).catch(() => null), repos.sesiones.listar(sesion.pacienteId)])
  const modulo = crear?.()
  return {
    sesion,
    anterior: sesionAnterior(sesion, sesiones),
    defs: tarjetasResumen(modulo?.metricasResumen ?? []),
    unidadMeta: modulo?.meta.unidad ?? 'agarres',
    errorCierre,
  }
}

export default function Resumen() {
  const { id = '' } = useParams()
  const { search } = useLocation()
  const r = useCarga(() => cargarResumen(id), [id])
  const s = r.datos?.sesion
  const lista = r.estado === 'listo' && !!s?.metricas && s.estado !== 'preparada' && s.dolorEVA != null

  return (
    <main className={`pantalla resumen ${lista ? 'con-boton' : ''}`}>
      <Encabezado
        titulo="Resumen"
        subtitulo={lista && s ? `${nombreJuego(s.juego)} · ${duracionTexto(s.metricas?.duracionS)} · Nivel ${s.parametros.nivel}` : undefined}
      />
      <Estados
        r={r}
        vacio={<Vacio titulo="No encontramos esta sesión" texto="Prepárala de nuevo desde tus ejercicios." icono="ejercicios" accion={<Link to="/ejercicios" className="boton secundario chico">Ver ejercicios</Link>} />}
      >
        {(d) =>
          d.sesion.estado === 'preparada' || !d.sesion.metricas ? (
            <Vacio titulo="Esta sesión todavía no se juega" texto="Primero calibra y juega; al terminar verás tu resumen." icono="ejercicios" accion={<Link to={`/sesion/${id}/calibrar${search}`} className="boton secundario chico">Ir a calibrar</Link>} />
          ) : d.sesion.dolorEVA == null ? (
            <Vacio titulo="Antes, cuéntanos cómo te sentiste" texto="Marca tu dolor y esfuerzo para ver el resumen." icono="mano" accion={<Link to={`/sesion/${id}/sensacion${search}`} className="boton secundario chico">Ir a la pregunta</Link>} />
          ) : (
            <Contenido d={d} reintentar={r.recargar} />
          )
        }
      </Estados>
    </main>
  )
}

function Contenido({ d, reintentar }: { d: DatosResumen; reintentar: () => void }) {
  const { sesion, anterior, defs, unidadMeta } = d
  const m = sesion.metricas!
  const contador = m.contador ?? m.agarres
  const meta = m.meta ?? sesion.parametros.metaAgarres
  const izq = m.agarresIzq
  const der = m.agarresDer
  const maxMano = Math.max(izq, der, 1)
  const avance = avanceMeta(contador, meta)
  const R = 47
  const C = 2 * Math.PI * R

  return (
    <>
      {d.errorCierre && (
        <div className="tarjeta peligro resumen-aviso" role="alert">
          <p>No pudimos cerrar la sesión todavía: {d.errorCierre}</p>
          <button type="button" className="boton secundario chico" onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}

      <section className="tarjeta resumen-meta" aria-label="Meta de la sesión">
        <div className="resumen-anillo" data-testid="anillo">
          <svg viewBox="0 0 110 110" aria-hidden="true">
            <circle cx="55" cy="55" r={R} className="pista" />
            <circle cx="55" cy="55" r={R} className="avance" strokeDasharray={`${C * avance} ${C}`} transform="rotate(-90 55 55)" />
          </svg>
          <div className="resumen-anillo-texto">
            <b data-testid="contador">{contador}</b>
            <span>{meta > 0 ? `/${meta} ${unidadMeta}` : unidadMeta}</span>
          </div>
        </div>
        <div className="resumen-manos">
          {meta > 0 && (
            <span className={`insignia ${m.metaCumplida ? 'ok' : 'gris'}`} data-testid="meta">
              {m.metaCumplida ? 'Meta cumplida' : 'Meta no alcanzada'}
            </span>
          )}
          <BarraMano etiqueta="Izq." nombre="Mano izquierda" valor={izq} max={maxMano} clase="izq" />
          <BarraMano etiqueta="Der." nombre="Mano derecha" valor={der} max={maxMano} clase="der" />
        </div>
      </section>

      <section className="resumen-tarjetas" aria-label="Métricas de la sesión">
        {defs.map((def) => {
          const v = valorMetrica(def, m)
          const dif = anterior ? diferencia(def, v, valorMetrica(def, anterior.metricas)) : null
          return (
            <div key={def.id} className="tarjeta resumen-dato" data-testid={`dato-${def.id}`}>
              <p className="resumen-dato-nombre">{def.corto ?? def.nombre}</p>
              <p className="resumen-dato-valor">
                {formatoMetrica(def, v)}
                {def.aprox && v != null && <span className="resumen-aprox"> aprox.</span>}
              </p>
              {dif && <Cambio dif={dif} />}
            </div>
          )
        })}
        <div className="tarjeta resumen-dato" data-testid="dato-dolor">
          <p className="resumen-dato-nombre">Dolor reportado</p>
          <p className="resumen-dato-valor">
            {sesion.dolorEVA}/{EVA_MAX}
          </p>
          <p className="resumen-dato-cambio tenue">{bandaDolor(sesion.dolorEVA)}</p>
        </div>
      </section>

      <p className="tenue chico centro" data-testid="comparacion">
        {anterior ? `Comparado con tu sesión del ${fechaCorta(anterior.inicio ?? anterior.creada ?? '')}` : 'Primera sesión de este juego en este nivel: todavía no hay con qué comparar.'}
      </p>

      <BarraAccion>
        <Link to="/progreso" className="boton primario bloque">
          Ver mi progreso
        </Link>
      </BarraAccion>
    </>
  )
}

function BarraMano({ etiqueta, nombre, valor, max, clase }: { etiqueta: string; nombre: string; valor: number; max: number; clase: string }) {
  return (
    <div className="resumen-mano" data-testid={`mano-${clase}`}>
      <span className="tenue" aria-hidden="true">
        {etiqueta}
      </span>
      <div className={`resumen-barra ${clase}`} role="img" aria-label={`${nombre}: ${valor}`}>
        <span style={{ '--p': `${(valor / max) * 100}%` } as CSSProperties} />
      </div>
      <b aria-hidden="true">{valor}</b>
    </div>
  )
}

function Cambio({ dif }: { dif: NonNullable<ReturnType<typeof diferencia>> }) {
  if (dif.direccion === 'igual')
    return (
      <p className="resumen-dato-cambio tenue" data-testid="cambio">
        = igual
      </p>
    )
  return (
    <p className={`resumen-dato-cambio ${dif.tono}`} data-testid="cambio">
      <span aria-hidden="true">{dif.direccion === 'sube' ? '▲' : '▼'}</span>
      <span className="sr-only">{dif.direccion === 'sube' ? 'Subió' : 'Bajó'}</span> {dif.texto}
    </p>
  )
}
