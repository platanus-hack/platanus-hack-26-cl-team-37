import { useEffect, useId, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Icono } from './Icono'

// ---------------------------------------------------------- estados de pantalla
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="estado" role="status" aria-live="polite">
      <div className="giro" />
      <p>{texto}</p>
    </div>
  )
}

export function Vacio({ titulo, texto, icono = 'objetivo', accion }: { titulo: string; texto?: string; icono?: string; accion?: ReactNode }) {
  return (
    <div className="estado">
      <div className="icono-estado">
        <Icono nombre={icono} tam={26} />
      </div>
      <h3 style={{ color: 'var(--texto)' }}>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {accion}
    </div>
  )
}

export function ErrorEstado({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="estado" role="alert">
      <div className="icono-estado malo">
        <Icono nombre="alerta" tam={26} />
      </div>
      <h3 style={{ color: 'var(--texto)' }}>No pudimos cargar esto</h3>
      <p>{!navigator.onLine ? 'Parece que no hay conexión a internet.' : msg}</p>
      {reintentar && (
        <button className="boton secundario chico" onClick={reintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}

/** Muestra carga / error / contenido de un resultado de useCarga. */
export function Estados<T>({ r, children, cargando }: { r: { estado: string; datos: T | null; error: unknown; recargar: () => void }; children: (d: T) => ReactNode; cargando?: ReactNode }) {
  if (r.estado === 'cargando' && r.datos == null) return <>{cargando ?? <Cargando />}</>
  if (r.estado === 'error') return <ErrorEstado error={r.error} reintentar={r.recargar} />
  if (r.datos == null) return <Cargando />
  return <>{children(r.datos)}</>
}

// ---------------------------------------------------------- encabezado
export function Encabezado({ titulo, subtitulo, atras, derecha }: { titulo: ReactNode; subtitulo?: ReactNode; atras?: string | true; derecha?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="encabezado">
      {atras && (
        <button className="boton-icono" aria-label="Volver" onClick={() => (atras === true ? nav(-1) : nav(atras))}>
          <Icono nombre="atras" />
        </button>
      )}
      <div className="textos">
        <h1 style={{ fontSize: atras ? 20 : 26 }}>{titulo}</h1>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
      </div>
      {derecha}
    </header>
  )
}

// ---------------------------------------------------------- barras de navegación
export function BarraPaciente() {
  const items = [
    { a: '/inicio', n: 'Inicio', i: 'inicio' },
    { a: '/ejercicios', n: 'Ejercicios', i: 'ejercicios' },
    { a: '/progreso', n: 'Progreso', i: 'progreso' },
    { a: '/historial', n: 'Historial', i: 'historial' },
    { a: '/perfil', n: 'Perfil', i: 'perfil' },
  ]
  return (
    <div className="barra-inferior">
      <nav aria-label="Navegación principal">
        {items.map((x) => (
          <NavLink key={x.a} to={x.a}>
            <Icono nombre={x.i} />
            {x.n}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function BarraTerapeuta({ alertas = 0 }: { alertas?: number }) {
  const items = [
    { a: '/terapeuta/pacientes', n: 'Pacientes', i: 'pacientes' },
    { a: '/terapeuta/alertas', n: 'Alertas', i: 'alerta', punto: alertas > 0 },
    { a: '/terapeuta/planes', n: 'Planes', i: 'planes' },
    { a: '/terapeuta/informes', n: 'Informes', i: 'informes' },
  ]
  return (
    <div className="barra-inferior">
      <nav aria-label="Navegación del terapeuta">
        {items.map((x) => (
          <NavLink key={x.a} to={x.a} end={x.a === '/terapeuta/pacientes'}>
            <Icono nombre={x.i} />
            {x.n}
            {x.punto && <span className="punto" aria-label="hay alertas" />}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function BarraAccion({ children }: { children: ReactNode }) {
  return (
    <div className="barra-accion">
      <div className="interior">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------- controles
export function Stepper({ valor, min, max, paso = 1, onCambio, formato, etiqueta, cambiado }: {
  valor: number
  min: number
  max: number
  paso?: number
  onCambio: (v: number) => void
  formato?: (v: number) => string
  etiqueta: string
  cambiado?: boolean
}) {
  const fijar = (v: number) => onCambio(Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000)
  return (
    <div className="stepper" role="group" aria-label={etiqueta}>
      <button type="button" aria-label={`Bajar ${etiqueta}`} disabled={valor <= min} onClick={() => fijar(valor - paso)}>
        <Icono nombre="menos" />
      </button>
      <span className={`valor ${cambiado ? 'cambiado' : ''}`} aria-live="polite">
        {formato ? formato(valor) : valor}
      </span>
      <button type="button" aria-label={`Subir ${etiqueta}`} disabled={valor >= max} onClick={() => fijar(valor + paso)}>
        <Icono nombre="mas" />
      </button>
    </div>
  )
}

export function Segmentos<T extends string | number>({ opciones, valor, onCambio, etiqueta }: { opciones: { v: T; n: string }[]; valor: T | null; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <div className="segmentos" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={valor === o.v} onClick={() => onCambio(o.v)}>
          {o.n}
        </button>
      ))}
    </div>
  )
}

export function Interruptor({ marcado, onCambio, deshabilitado, etiqueta }: { marcado: boolean; onCambio?: (v: boolean) => void; deshabilitado?: boolean; etiqueta: string }) {
  return (
    <span className="interruptor">
      <input type="checkbox" role="switch" aria-label={etiqueta} checked={marcado} disabled={deshabilitado} onChange={(e) => onCambio?.(e.target.checked)} />
      <span className="pista" />
    </span>
  )
}

export function BarraProgreso({ valor, color }: { valor: number; color?: string }) {
  return (
    <div className="barra-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(valor * 100)}>
      <div style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%`, background: color }} />
    </div>
  )
}

/** Anillo de progreso (0..1). */
export function Anillo({ valor, tam = 64, grosor = 7, color = 'var(--acento)', children }: { valor: number; tam?: number; grosor?: number; color?: string; children?: ReactNode }) {
  const r = (tam - grosor) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(1, Math.max(0, valor))
  return (
    <div style={{ position: 'relative', width: tam, height: tam, flex: 'none' }}>
      <svg width={tam} height={tam} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} stroke="#2c3c4b" strokeWidth={grosor} fill="none" />
        <circle cx={tam / 2} cy={tam / 2} r={r} stroke={color} strokeWidth={grosor} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  )
}

/** Minigráfico de línea. */
export function Sparkline({ valores, ancho = 90, alto = 28, color = 'var(--exito)' }: { valores: number[]; ancho?: number; alto?: number; color?: string }) {
  const id = useId()
  if (valores.length < 2) return <svg width={ancho} height={alto} aria-hidden="true" />
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * (ancho - 4) + 2},${alto - 3 - ((v - min) / rango) * (alto - 6)}`)
  return (
    <svg width={ancho} height={alto} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`2,${alto} ${pts.join(' ')} ${ancho - 2},${alto}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------- hoja inferior y diálogo
export function Hoja({ abierta, onCerrar, children, titulo }: { abierta: boolean; onCerrar: () => void; children: ReactNode; titulo: string }) {
  useEffect(() => {
    if (!abierta) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [abierta, onCerrar])
  if (!abierta) return null
  return (
    <div className="velo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="asa" />
        {children}
      </div>
    </div>
  )
}

export function Dialogo({ abierto, onCerrar, children, titulo }: { abierto: boolean; onCerrar: () => void; children: ReactNode; titulo: string }) {
  if (!abierto) return null
  return (
    <div className="velo centrado" onClick={onCerrar}>
      <div className="dialogo col" role="alertdialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------- aviso temporal
let emitir: ((t: { texto: string; error?: boolean }) => void) | null = null
export function avisar(texto: string, error = false) {
  emitir?.({ texto, error })
}
export function Avisos() {
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  useEffect(() => {
    emitir = (a) => setAviso(a)
    return () => {
      emitir = null
    }
  }, [])
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 3200)
    return () => clearTimeout(t)
  }, [aviso])
  if (!aviso) return null
  return (
    <div className={`aviso ${aviso.error ? 'error' : ''}`} role="status" aria-live="assertive">
      {aviso.texto}
    </div>
  )
}

// ---------------------------------------------------------- banner de datos demo
/** Franja fija arriba: los datos de las cuentas demo son ficticios. */
export function BannerDemo() {
  return (
    <div className="banner-demo" role="note">
      Datos de demostración ficticios
    </div>
  )
}

// ---------------------------------------------------------- pantalla provisoria
/** Pantalla con título mientras su feature no está construido (cada feature la reemplaza). */
export function EnConstruccion({ titulo, subtitulo, atras, barra }: { titulo: string; subtitulo?: ReactNode; atras?: string | true; barra?: boolean }) {
  return (
    <main className={`pantalla ${barra ? 'con-barra' : ''}`}>
      <Encabezado titulo={titulo} subtitulo={subtitulo} atras={atras} />
      <Vacio titulo="En construcción" texto="Esta pantalla estará lista pronto." icono="objetivo" />
    </main>
  )
}
