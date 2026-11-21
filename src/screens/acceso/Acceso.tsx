// F03 · Acceso y roles (docs/referencia/imagenes/01_acceso.png).
// Rol + código de clínica (diseño) + correo y contraseña (Supabase Auth, ver Decisiones en progress.md).
// Al ingresar, SoloPublica lleva solo al inicio del rol (paciente → /inicio, terapeuta → /terapeuta/pacientes).
import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { codigoValido, correoValido, errorCodigo, normalizarCodigo } from '../../auth/codigo'
import { useAuth, type DatosIngreso } from '../../auth/contexto'
import type { Rol } from '../../domain/types'
import { Icono, LogoMano } from '../../ui/Icono'
import { BannerDemo } from '../../ui/piezas'
import simboloSobreAmarillo from '../../../brandbook/logos/simbolo-sobre-amarillo.svg'

/** Cuentas demo ficticias (docs/manoviva-spec.md §9). */
const DEMO = {
  codigo: 'CRM-4821',
  password: 'manoviva-demo',
  email: { paciente: 'carmen.demo@example.com', terapeuta: 'terapeuta.demo@example.com' } satisfies Record<Rol, string>,
}

const ROLES: { rol: Rol; titulo: string; texto: string }[] = [
  { rol: 'paciente', titulo: 'Soy paciente', texto: 'Sigo mi plan de ejercicios' },
  { rol: 'terapeuta', titulo: 'Soy terapeuta', texto: 'Gestiono a mis pacientes' },
]

export default function Acceso() {
  const { ingresar } = useAuth()
  const [params] = useSearchParams()
  const rolInicial = params.get('rol')
  // ?rol=paciente&codigo=CRM-4821 deja el formulario prellenado (enlace que puede compartir la clínica).
  const [rol, setRol] = useState<Rol | null>(rolInicial === 'paciente' || rolInicial === 'terapeuta' ? rolInicial : null)
  const [codigo, setCodigo] = useState(() => normalizarCodigo(params.get('codigo') ?? ''))
  const [codigoTocado, setCodigoTocado] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const errCodigo = errorCodigo(codigo, codigoTocado)
  const listo = rol !== null && codigoValido(codigo) && correoValido(email) && password.length > 0

  async function entrar(datos: DatosIngreso) {
    setEnviando(true)
    setError(null)
    try {
      await ingresar(datos)
      // Con la sesión abierta, SoloPublica redirige al inicio del rol.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ingresar. Revisa tu conexión e intenta de nuevo.')
      setEnviando(false)
    }
  }

  function enviar(ev: FormEvent) {
    ev.preventDefault()
    setCodigoTocado(true)
    if (!listo || enviando || !rol) return
    void entrar({ email: email.trim(), password, rol, codigoClinica: codigo })
  }

  function entrarDemo() {
    if (enviando) return
    const r = rol ?? 'paciente'
    setRol(r)
    setCodigo(DEMO.codigo)
    setEmail(DEMO.email[r])
    setPassword(DEMO.password)
    void entrar({ email: DEMO.email[r], password: DEMO.password, rol: r, codigoClinica: DEMO.codigo })
  }

  function elegirRol(r: Rol) {
    setRol(r)
    setError(null)
  }

  return (
    <>
      <BannerDemo />
      <main className="pantalla acceso">
        <header className="acceso-cabeza">
          <div className="logo">
            {/* Símbolo del brandbook en su variante sobre amarillo (los nodos amarillos pasan a blanco). */}
            <img src={simboloSobreAmarillo} alt="" width={52} height={52} />
          </div>
          <h1>ManoViva</h1>
          <p className="tenue">Rehabilitación que se juega</p>
        </header>

        <form className="col acceso-form" onSubmit={enviar} noValidate>
          <div className="col">
            <p className="seccion" id={`${id}-rol`}>
              ¿Quién eres?
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-rol`} className="col">
              {ROLES.map((o) => (
                <button
                  key={o.rol}
                  type="button"
                  role="radio"
                  aria-checked={rol === o.rol}
                  className="rol"
                  onClick={() => elegirRol(o.rol)}
                >
                  <span className={`icono-caja ${o.rol === 'paciente' ? 'rol-paciente' : 'rol-terapeuta'}`}>
                    {o.rol === 'paciente' ? <LogoMano tam={30} /> : <Icono nombre="tendencia" tam={24} grosor={2.4} />}
                  </span>
                  <span className="flex1">
                    <span className="titulo rol-titulo">{o.titulo}</span>
                    <span className="tenue rol-texto">{o.texto}</span>
                  </span>
                  <span className="radio" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="campo">
            <label htmlFor={`${id}-codigo`}>Código de la clínica</label>
            <input
              id={`${id}-codigo`}
              className="entrada entrada-codigo"
              value={codigo}
              onChange={(e) => {
                setCodigo(normalizarCodigo(e.target.value))
                setError(null)
              }}
              onBlur={() => setCodigoTocado(true)}
              placeholder="CRM-0000"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              aria-invalid={errCodigo ? true : undefined}
              aria-describedby={`${id}-codigo-ayuda`}
            />
            {errCodigo ? (
              <p className="error-campo" id={`${id}-codigo-ayuda`} role="alert">
                {errCodigo}
              </p>
            ) : (
              <p className="nota-pie" id={`${id}-codigo-ayuda`}>
                Tu terapeuta te entrega este código
              </p>
            )}
          </div>

          <div className="campo">
            <label htmlFor={`${id}-email`}>Correo</label>
            <input
              id={`${id}-email`}
              className="entrada"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              placeholder="nombre@correo.cl"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="campo">
            <label htmlFor={`${id}-clave`}>Contraseña</label>
            <input
              id={`${id}-clave`}
              className="entrada"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="tarjeta peligro malo chico" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="boton primario bloque" disabled={!listo || enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button type="button" className="boton secundario bloque" onClick={entrarDemo} disabled={enviando}>
            Entrar con cuenta demo
          </button>
          <p className="nota-pie centro">
            La cuenta demo entra como {rol === 'terapeuta' ? 'terapeuta' : 'paciente'} con datos ficticios.
          </p>
        </form>
      </main>
    </>
  )
}
