import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fuentes.css'
import './index.css'
import './pwa.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
