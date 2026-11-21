// Marco común de las pantallas con sesión: banner de datos demo, contenido y barra inferior según el rol.
import { Suspense, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/contexto'
import { repos } from '../data/repos'
import { BannerDemo, BarraPaciente, BarraTerapeuta, Cargando } from './piezas'

export function Marco({ barra = false, banner = true }: { barra?: boolean; banner?: boolean }) {
  const { usuario } = useAuth()
  return (
    <div className={barra ? 'app con-nav' : 'app'}>
      {banner && usuario?.demo && <BannerDemo />}
      <Suspense fallback={<PantallaCargando />}>
        <Outlet />
      </Suspense>
      {barra && (usuario?.rol === 'terapeuta' ? <BarraTerapeutaConAlertas /> : <BarraPaciente />)}
    </div>
  )
}

export function PantallaCargando({ texto }: { texto?: string }) {
  return (
    <main className="pantalla" style={{ justifyContent: 'center' }}>
      <Cargando texto={texto} />
    </main>
  )
}

/** La pestaña Alertas muestra un punto cuando hay alertas abiertas. Si la consulta falla, no se muestra. */
function BarraTerapeutaConAlertas() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    repos.alertas
      .abiertas()
      .then((a) => vivo && setN(a.length))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])
  return <BarraTerapeuta alertas={n} />
}
