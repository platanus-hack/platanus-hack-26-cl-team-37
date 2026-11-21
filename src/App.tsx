import { useEffect, useState } from 'react'
import { LogoMano } from './ui/Icono'
import { configurado, supabase } from './data/supabase'

// Página provisoria mientras se construyen las pantallas.
export default function App() {
  const [conexion, setConexion] = useState<'probando' | 'ok' | 'error'>('probando')

  useEffect(() => {
    if (!configurado) {
      setConexion('error')
      return
    }
    // Consulta anónima: con RLS devuelve 0 filas, pero confirma que el servidor responde.
    supabase
      .from('clinicas')
      .select('id', { head: true, count: 'exact' })
      .then(({ error }) => setConexion(error ? 'error' : 'ok'))
  }, [])

  return (
    <main className="pantalla" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div className="logo">
        <LogoMano tam={44} />
      </div>
      <h1>ManoViva</h1>
      <p className="tenue">Rehabilitación que se juega</p>
      <div className="tarjeta" style={{ marginTop: 12, maxWidth: 360 }}>
        <p>App en construcción.</p>
        <p className="tenue chico" style={{ marginTop: 6 }}>
          Conexión con la base de datos:{' '}
          <strong className={conexion === 'ok' ? 'ok' : conexion === 'error' ? 'malo' : ''}>
            {conexion === 'ok' ? 'OK' : conexion === 'error' ? 'con problemas' : 'probando…'}
          </strong>
        </p>
      </div>
    </main>
  )
}
