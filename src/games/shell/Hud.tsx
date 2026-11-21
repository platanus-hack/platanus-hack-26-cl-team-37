// HUD de la base común, en React sobre el canvas (imagenes/06a_juego_agarre.png, 06b, imagenes_juegos/00):
// panel izquierdo (título, estado de cada mano, pista, botón amarillo), barra superior (tiempo y contador contra
// la meta con barra), "← Menú", métricas en vivo abajo a la izquierda (hasta 3, la primera con minigráfico),
// miniatura de cámara abajo a la derecha, aviso "¡Meta cumplida!" y las capas de pausa, espera, giro y guardado.
import type { ReactNode, RefObject } from 'react'
import type { LadoMano } from '../../domain/types'
import { entero, mmss } from '../../lib/formato'
import { Icono } from '../../ui/Icono'
import { BarraProgreso, Sparkline } from '../../ui/piezas'
import type { MotivoPausa } from './ciclo'
import { formatoMetrica, type DefMetrica, type EstadoManoHud } from './contrato'

export function PanelJuego({ titulo, manos, pista, textoReiniciar, onReiniciar }: {
  titulo: string
  manos: Record<LadoMano, EstadoManoHud>
  pista: string
  textoReiniciar?: string
  onReiniciar?: () => void
}) {
  return (
    <section className="juego-panel juego-caja" aria-label="Estado del juego">
      <h1>{titulo}</h1>
      {(['izquierda', 'derecha'] as LadoMano[]).map((l) => (
        <p key={l} className="juego-mano" data-testid={`mano-${l}`}>
          <span>Mano {l}</span>
          <strong className={manos[l].tono}>{manos[l].texto}</strong>
        </p>
      ))}
      <p className="juego-pista" data-testid="pista">
        {pista}
      </p>
      {onReiniciar && textoReiniciar && (
        <button type="button" className="boton primario bloque juego-reiniciar" onClick={onReiniciar}>
          {textoReiniciar}
        </button>
      )}
    </section>
  )
}

export function BarraSuperior({ segundos, etiqueta, contador, meta }: { segundos: number; etiqueta: string; contador: number; meta: number }) {
  return (
    <section className="juego-barra juego-caja" aria-label="Tiempo y avance">
      <div>
        <span className="juego-rotulo">Tiempo</span>
        <strong className="juego-grande" data-testid="tiempo">
          {mmss(segundos)}
        </strong>
      </div>
      <span className="juego-separador" aria-hidden="true" />
      <div>
        <span className="juego-rotulo">{etiqueta}</span>
        <strong className="juego-grande" data-testid="contador">
          {meta > 0 ? `${entero(contador)}/${entero(meta)}` : entero(contador)}
        </strong>
      </div>
      {meta > 0 && (
        <div className="juego-avance">
          <BarraProgreso valor={contador / meta} />
        </div>
      )}
    </section>
  )
}

export function MetricasVivo({ defs, valores, historia }: { defs: DefMetrica[]; valores: Record<string, number | null>; historia: number[] }) {
  if (!defs.length) return null
  return (
    <section className="juego-metricas juego-caja" aria-label="Métricas en vivo">
      {defs.slice(0, 3).map((d, i) => (
        <div key={d.id} className="juego-metrica" data-testid={`vivo-${d.id}`}>
          <span className="juego-rotulo">{d.nombre}</span>
          <span className="fila">
            <strong className="juego-grande">{formatoMetrica(d, valores[d.id])}</strong>
            {i === 0 && <Sparkline valores={historia} ancho={76} alto={26} color="var(--acento)" />}
          </span>
        </div>
      ))}
    </section>
  )
}

export function MiniaturaCamara({ lienzo, video, conVideo }: { lienzo: RefObject<HTMLCanvasElement | null>; video: RefObject<HTMLDivElement | null>; conVideo: boolean }) {
  return (
    <figure className={`juego-camara juego-caja ${conVideo ? 'con-video' : ''}`} aria-label="Cámara con los puntos de la mano">
      <div ref={video} className="juego-camara-video" aria-hidden="true" />
      <canvas ref={lienzo} aria-hidden="true" />
      <figcaption>MediaPipe Hands</figcaption>
    </figure>
  )
}

const TEXTO_PAUSA: Record<MotivoPausa, { titulo: string; texto: string }> = {
  'sin-mano': { titulo: 'No vemos tu mano', texto: 'Vuelve a ponerla frente a la cámara y seguimos.' },
  manual: { titulo: 'Pausa', texto: 'El tiempo está detenido.' },
  orientacion: { titulo: 'Gira tu teléfono', texto: 'El ejercicio se hace con el teléfono en horizontal.' },
  oculta: { titulo: 'Pausa', texto: 'Vuelve a la app para seguir.' },
}

/** Capa central: espera de la mano, pausa automática o manual (con su menú). */
export function CapaPausa({ motivo, onContinuar, onTerminar, terminando }: { motivo: MotivoPausa; onContinuar: () => void; onTerminar: () => void; terminando: boolean }) {
  const t = TEXTO_PAUSA[motivo]
  if (motivo === 'sin-mano') {
    return (
      <div className="juego-aviso" role="status" data-testid="pausa-auto">
        <Icono nombre="mano" tam={22} />
        <span>
          <strong>Pausa · {t.titulo}</strong>
          <br />
          {t.texto}
        </span>
      </div>
    )
  }
  return (
    <div className="juego-capa" role="dialog" aria-modal="true" aria-labelledby="titulo-pausa" data-testid="menu-pausa">
      <div className="juego-dialogo juego-caja">
        <h2 id="titulo-pausa">{t.titulo}</h2>
        <p className="tenue">{t.texto}</p>
        <button type="button" className="boton primario bloque" onClick={onContinuar}>
          <Icono nombre="play" />
          Continuar
        </button>
        <button type="button" className="boton secundario bloque" onClick={onTerminar} disabled={terminando}>
          Terminar sesión
        </button>
      </div>
    </div>
  )
}

export function AvisoCentral({ children, tono = 'neutro', testid }: { children: ReactNode; tono?: 'neutro' | 'exito'; testid?: string }) {
  return (
    <div className={`juego-pildora ${tono}`} role="status" aria-live="polite" data-testid={testid}>
      {children}
    </div>
  )
}

/** "Gira tu teléfono": tapa todo en vertical. Ofrece pantalla completa + bloqueo horizontal donde se pueda. */
export function GiraTelefono({ onPantallaCompleta }: { onPantallaCompleta: () => void }) {
  return (
    <div className="juego-girar" role="alertdialog" aria-labelledby="titulo-girar" data-testid="gira-telefono">
      <span className="juego-girar-icono" aria-hidden="true">
        <Icono nombre="rotar" tam={44} />
      </span>
      <h2 id="titulo-girar">Gira tu teléfono</h2>
      <p className="tenue">El ejercicio se hace con el teléfono en horizontal, apoyado frente a ti. El tiempo está detenido.</p>
      <button type="button" className="boton secundario" onClick={onPantallaCompleta}>
        Pantalla completa
      </button>
    </div>
  )
}
