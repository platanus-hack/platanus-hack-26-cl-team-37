// Piezas propias de la app sobre el brandbook (brandbook/README.md): la marca, el arco de la semana
// (la firma), el anillo chico y la tarjeta Ahora con la escena real del juego. Solo usan tokens de src/index.css.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { escenaDe } from './escenas'
import logoHorizontal from '../../brandbook/logos/kuwu-horizontal.svg'
import './salud.css'

/** El logo horizontal del brandbook (brandbook/logos/kuwu-horizontal.svg, sin recolorear): símbolo y nombre. */
export function Marca() {
  return (
    <span className="marca">
      <img className="marca-logo" src={logoHorizontal} alt="Kuwü" width={100} height={28} />
    </span>
  )
}

/** Barra de marca y quién usa la app, y debajo el título de la pantalla en una línea. */
export function EncabezadoMarca({ titulo, iniciales }: { titulo: ReactNode; iniciales: string }) {
  return (
    <header className="encabezado-marca">
      <div className="encabezado-marca-barra">
        <Marca />
        <span className="avatar-marca" aria-hidden="true">
          {iniciales}
        </span>
      </div>
      <h1 className="titulo-pantalla">{titulo}</h1>
    </header>
  )
}

// Geometría del arco: 270° (de 135° a 405°, sentido horario en pantalla), radio 80, centro (105, 92) en un lienzo de 210×150.
const CX = 105
const CY = 92
const R = 80
const INICIO = 135
const BARRIDO = 270
const HUECO = 6

const punto = (grados: number) => {
  const r = (grados * Math.PI) / 180
  return `${(CX + R * Math.cos(r)).toFixed(1)} ${(CY + R * Math.sin(r)).toFixed(1)}`
}
const tramo = (desde: number, hasta: number) => `M${punto(desde)}A${R} ${R} 0 ${hasta - desde > 180 ? 1 : 0} 1 ${punto(hasta)}`

export type EstadoDiaArco = 'hecha' | 'pendiente'
export interface DiaArco {
  letra: string
  nombre: string
  estado: EstadoDiaArco
  hoy: boolean
}

/** La firma: un tramo por sesión indicada esta semana (desde 8, un arco continuo que se llena), la cifra fina adentro
 *  y los siete días debajo. El amarillo nunca informa solo: la cifra lo dice. */
export function ArcoSemana({ hechas, total, dias }: { hechas: number; total: number; dias: DiaArco[] }) {
  const n = Math.max(1, total)
  const llenas = Math.min(hechas, n)
  const tramos: { d: string; hecho: boolean }[] = []
  if (n >= 8) {
    const fin = INICIO + (BARRIDO * llenas) / n
    tramos.push({ d: tramo(INICIO, INICIO + BARRIDO), hecho: false })
    if (llenas > 0) tramos.push({ d: tramo(INICIO, fin), hecho: true })
  } else {
    const largo = (BARRIDO - (n - 1) * HUECO) / n
    for (let i = 0; i < n; i++) {
      const desde = INICIO + i * (largo + HUECO)
      tramos.push({ d: tramo(desde, desde + largo), hecho: i < llenas })
    }
  }
  return (
    <section className="tarjeta semana" aria-label="Esta semana">
      <div className="arco" role="img" aria-label={`${hechas} de ${total} ${total === 1 ? 'sesión' : 'sesiones'} esta semana`}>
        <svg viewBox="0 0 210 150" aria-hidden="true">
          {tramos.map((t, i) => (
            <path key={i} className={t.hecho ? 'hecho' : 'vacio'} d={t.d} />
          ))}
        </svg>
        <div className="arco-centro" aria-hidden="true">
          <b data-testid="sesiones-semana">{hechas}</b>
          <span>
            de {total} {total === 1 ? 'sesión' : 'sesiones'}
          </span>
        </div>
      </div>
      <ol className="dias">
        {dias.map((d) => (
          <li key={d.nombre} data-dia={d.estado} aria-current={d.hoy ? 'date' : undefined} aria-label={`${d.nombre}: ${d.estado === 'hecha' ? 'sesión hecha' : d.hoy ? 'hoy' : 'sin sesión'}`}>
            <span aria-hidden="true">{d.letra}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** La cosa principal de la pantalla: la escena real del juego a sangre, la etiqueta Ahora y el título sobre un velo. */
export function Ahora({ juego, nombre, detalle, to, accion }: { juego: string; nombre: string; detalle: string; to: string; accion?: ReactNode }) {
  const escena = escenaDe(juego)
  const tarjeta = (
    <Link className="ahora" to={to} data-estado="siguiente" aria-label={`Ahora: ${nombre}, ${detalle}`}>
      {escena && <img src={escena} alt="" />}
      <span className="etiqueta-ahora">Ahora</span>
      <span className="ahora-texto">
        <span className="ahora-nombre">{nombre}</span>
        <span className="ahora-detalle">{detalle}</span>
      </span>
    </Link>
  )
  // Con acción (escritorio): la escena arriba y el botón debajo, en la misma tarjeta (igual que la ficha de preparar).
  if (!accion) return tarjeta
  return (
    <section className="tarjeta ahora-tarjeta" aria-label={`Ahora: ${nombre}`}>
      {tarjeta}
      <div className="ahora-accion">{accion}</div>
    </section>
  )
}
