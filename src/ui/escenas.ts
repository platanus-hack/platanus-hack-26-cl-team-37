// Escena real de cada juego (recorte de su escena sin paneles ni cámara, 840×440, desde las capturas de
// public/screenshots/). Es la única imagen de la app: tarjeta Ahora, catálogo y miniaturas. Los juegos sin escena
// todavía van con su miniatura SVG (src/games/Miniatura.tsx).
import banda from './escenas/banda.jpg'
import burbujas from './escenas/burbujas.jpg'
import caja from './escenas/caja.jpg'
import movilidad from './escenas/movilidad.jpg'
import naranja from './escenas/naranja.jpg'
import pinza from './escenas/pinza.jpg'
import torre from './escenas/torre.jpg'

const ESCENAS: Record<string, string> = {
  'caja-juguetes': caja,
  'movilidad-guiada': movilidad,
  'pinza-fina': pinza,
  'torre-cubos': torre,
  'exprime-naranja': naranja,
  'atrapa-burbujas': burbujas,
  'banda-elastica': banda,
}
export const escenaDe = (juego: string): string | undefined => ESCENAS[juego]
