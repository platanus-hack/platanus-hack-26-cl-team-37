// Rutas de la app (docs/manoviva-spec.md §3). Las pantallas se cargan a demanda, salvo el acceso.
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { AlInicio, Protegida, SoloPublica } from './auth/Protegida'
import Acceso from './screens/acceso/Acceso'
import { EstadoRed } from './ui/EstadoRed'
import { PantallaCargando } from './ui/Marco'
import { Avisos } from './ui/piezas'

const Inicio = lazy(() => import('./screens/paciente/Inicio'))
const Ejercicios = lazy(() => import('./screens/paciente/Ejercicios'))
const Progreso = lazy(() => import('./screens/paciente/Progreso'))
const Historial = lazy(() => import('./screens/paciente/Historial'))
const RegistroSesion = lazy(() => import('./screens/paciente/RegistroSesion'))
const Perfil = lazy(() => import('./screens/paciente/Perfil'))
const Privacidad = lazy(() => import('./screens/privacidad/Privacidad'))
const Preparar = lazy(() => import('./screens/sesion/Preparar'))
const Calibrar = lazy(() => import('./screens/sesion/Calibrar'))
const Jugar = lazy(() => import('./screens/sesion/Jugar'))
const Sensacion = lazy(() => import('./screens/sesion/Sensacion'))
const Resumen = lazy(() => import('./screens/sesion/Resumen'))
const Pacientes = lazy(() => import('./screens/terapeuta/Pacientes'))
const Prescripcion = lazy(() => import('./screens/terapeuta/Prescripcion'))
const Alertas = lazy(() => import('./screens/terapeuta/Alertas'))
const Planes = lazy(() => import('./screens/terapeuta/Planes'))
const Informes = lazy(() => import('./screens/terapeuta/Informes'))
const Depuracion = lazy(() => import('./screens/depuracion/Depuracion'))
const VistaOficina3D = lazy(() => import('./ui/VistaOficina3D'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PantallaCargando />}>
          <Routes>
            <Route path="/" element={<AlInicio />} />
            <Route element={<SoloPublica />}>
              <Route path="/acceso" element={<Acceso />} />
            </Route>

            {/* Paciente: pestañas con barra inferior */}
            <Route element={<Protegida roles={['paciente']} barra />}>
              <Route path="/inicio" element={<Inicio />} />
              <Route path="/ejercicios" element={<Ejercicios />} />
              <Route path="/progreso" element={<Progreso />} />
              <Route path="/perfil" element={<Perfil />} />
            </Route>
            {/* Paciente: flujo de sesión y privacidad, sin barra */}
            <Route element={<Protegida roles={['paciente']} />}>
              <Route path="/sesion/:juego/preparar" element={<Preparar />} />
              <Route path="/sesion/:id/calibrar" element={<Calibrar />} />
              <Route path="/sesion/:id/sensacion" element={<Sensacion />} />
              <Route path="/sesion/:id/resumen" element={<Resumen />} />
              <Route path="/privacidad" element={<Privacidad />} />
            </Route>
            {/* Juego: pantalla completa (horizontal), sin barra ni banner */}
            <Route element={<Protegida roles={['paciente']} banner={false} />}>
              <Route path="/sesion/:id/jugar" element={<Jugar />} />
            </Route>

            {/* Historial: del paciente, y el terapeuta lo abre desde un paciente. Barra según el rol. */}
            <Route element={<Protegida roles={['paciente', 'terapeuta']} barra />}>
              <Route path="/historial" element={<Historial />} />
              <Route path="/historial/:id" element={<RegistroSesion />} />
            </Route>

            {/* Terapeuta */}
            <Route element={<Protegida roles={['terapeuta']} barra />}>
              <Route path="/terapeuta/pacientes" element={<Pacientes />} />
              <Route path="/terapeuta/alertas" element={<Alertas />} />
              <Route path="/terapeuta/planes" element={<Planes />} />
              <Route path="/terapeuta/informes" element={<Informes />} />
            </Route>
            <Route element={<Protegida roles={['terapeuta']} />}>
              <Route path="/terapeuta/pacientes/:id/plan" element={<Prescripcion />} />
            </Route>

            {/* Ambos roles */}
            <Route element={<Protegida roles={['paciente', 'terapeuta']} />}>
              <Route path="/depuracion" element={<Depuracion />} />
            </Route>

            {/* Vista previa pública del ambiente 3D de la oficina */}
            <Route path="/oficina-3d" element={<VistaOficina3D />} />

            <Route path="*" element={<AlInicio />} />
          </Routes>
        </Suspense>
        <Avisos />
        <EstadoRed />
      </AuthProvider>
    </BrowserRouter>
  )
}
