import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../brandbook/paleta.css'
import '../brandbook/primitivas.css'
import './fuentes.css'
import './index.css'
import './pwa.css'
import App from './App.tsx'
import { actualizarSola } from './lib/actualizacion'

actualizarSola()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
