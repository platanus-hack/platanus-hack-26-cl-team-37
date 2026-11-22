// Límite de errores de la app. Las pantallas se cargan a demanda (App.tsx): si un trozo no baja (se cortó la red a mitad,
// o se publicó una versión nueva y el archivo viejo ya no existe) o una pantalla falla al dibujarse, React desmonta todo y
// queda la pantalla en blanco. Este límite muestra en su lugar un aviso con «Recargar» y «Ir al inicio».
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { esFalloDeCarga } from '../lib/errores'
import { Icono } from './Icono'

interface Props {
  children: ReactNode
}
interface Estado {
  error: unknown
}

class LimiteClase extends Component<Props, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: unknown): Estado {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Solo a la consola del navegador: nada sale del dispositivo.
    console.error('Pantalla con error', error, info.componentStack)
  }

  render() {
    if (this.state.error == null) return this.props.children
    const carga = esFalloDeCarga(this.state.error)
    return (
      <main className="pantalla">
        <div className="estado" role="alert" data-testid="limite-errores">
          <div className="icono-estado malo">
            <Icono nombre="alerta" tam={26} />
          </div>
          <h3 style={{ color: 'var(--texto)' }}>{carga ? 'No pudimos abrir esta pantalla' : 'Algo falló en esta pantalla'}</h3>
          <p>
            {carga
              ? 'Puede que no haya conexión o que haya una versión nueva de la app. Recarga para volver a intentarlo.'
              : 'Tus sesiones guardadas no se pierden. Recarga para volver a intentarlo.'}
          </p>
          <button className="boton secundario chico" onClick={() => window.location.reload()}>
            Recargar
          </button>
          <a className="boton secundario chico" href="/">
            Ir al inicio
          </a>
        </div>
      </main>
    )
  }
}

/** Envuelve las rutas. Al cambiar de ruta se vuelve a intentar (el error de una pantalla no deja pegadas a las demás). */
export function LimiteErrores({ children }: Props) {
  const { pathname } = useLocation()
  return <LimiteClase key={pathname}>{children}</LimiteClase>
}
