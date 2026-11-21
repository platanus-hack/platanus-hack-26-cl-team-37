// Escena real de cada juego (recorte de su mesa sin paneles; artefacto «Design System», grupo Escenas). Es la única
// imagen de la app: tarjeta Ahora y miniaturas. Los juegos sin escena todavía van sin imagen.
import caja from './escenas/caja.jpg'
import movilidad from './escenas/movilidad.jpg'
import pinza from './escenas/pinza.jpg'

const ESCENAS: Record<string, string> = { 'caja-juguetes': caja, 'pinza-fina': pinza, 'movilidad-guiada': movilidad }
export const escenaDe = (juego: string): string | undefined => ESCENAS[juego]
