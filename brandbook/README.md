# Kuwü · Brandbook

Identidad visual de la app. **Todo elemento de UI usa solo los colores de `paleta.css`** y los logos de esta carpeta (no se redibujan ni se recolorean a mano).

Vista previa de todo: `vista-previa.html` (servir la carpeta con un servidor local para que cargue la paleta).

## 1. Marca

- **Nombre:** Kuwü. Se pronuncia "ku-WÜ".
  - *Pendiente de validar:* entendemos que *kuwü* significa "mano" en mapudungun. Antes de publicar, confirmarlo con hablantes o una fuente mapuche (hay varias grafías, como *kuwü* o *kuq*) y revisar la marca en INAPI, el dominio y las tiendas de apps.
- **Símbolo:** una flor de **6 nodos y 5 segmentos**: un centro y 5 pétalos de distinto tamaño (variación leve). El lenguaje de nodos y segmentos viene de los puntos de la mano que sigue la cámara.
- **Nombre como logotipo:** "Kuwü" en Nunito ExtraBold. La **diéresis de la ü son dos nodos unidos por un segmento**. Está convertido a trazos, así que no depende de fuentes instaladas.
- **Animación (referencia):** el símbolo puede mutar a mano, flor con tallo, ramo, árbol y rama, con el esqueleto articulado de 12 nodos (ver la exploración "ronda 8"). En esas figuras sí se ven las articulaciones. El símbolo principal nunca las muestra.

## 2. Logos (`logos/`)

| Archivo | Versión | Cuándo |
|---|---|---|
| `simbolo.svg` | Normal | Uso general sobre crema o blanco |
| `simbolo-una-tinta-sobre-marino.svg` | Una tinta | Sobre fondo marino: todo en crema y los nodos rellenos de marino |
| `simbolo-una-tinta-sobre-claro.svg` | Una tinta | Impresión a un color o documentos: marino con nodos blancos |
| `simbolo-sobre-amarillo.svg` | Normal sobre amarillo | Los nodos amarillos pasan a blanco para no desaparecer |
| `kuwu-horizontal.svg` | Normal | Encabezados, presentaciones, web |
| `kuwu-horizontal-una-tinta-sobre-marino.svg` | Una tinta | Sobre marino |
| `kuwu-horizontal-una-tinta-sobre-claro.svg` | Una tinta | A un color sobre claro |
| `kuwu-horizontal-sobre-amarillo.svg` | Sobre amarillo | Fondos amarillos |
| `kuwu-apilado.svg` | Normal | Pantallas de bienvenida y espacios cuadrados |
| `kuwu-apilado-una-tinta-sobre-marino.svg` | Una tinta | Bienvenida sobre marino |
| `kuwu-reducida.svg` | **Reducida** (solo nombre) | Espacios chicos o cuando el símbolo ya está cerca. Los nodos de la ü van **del color del fondo** |
| `kuwu-reducida-una-tinta-sobre-marino.svg` | Reducida a una tinta | Sobre marino |

**Reglas**
- **Versión a una tinta** (fondo marino): todo el logo en crema. El relleno de los nodos, pétalos y diéresis, es del color del fondo.
- **Versión reducida:** solo el nombre. Los nodos de la ü van del color del fondo, nunca a color.
- **Área de resguardo:** alrededor del logo, al menos el diámetro de un pétalo.
- **Tamaño mínimo:** símbolo a 16 px (usar `iconos/favicon.svg`, con trazos más gruesos); logotipo con nombre a 24 px de alto.
- **No hacer:** deformar, rotar, cambiar los colores de los pétalos, agregar sombras o contornos, ni poner el logo a color sobre fondos que no sean crema, blanco o amarillo.

## 3. Íconos (`iconos/`)

| Archivo | Uso |
|---|---|
| `icono-app.svg`, `icono-512.png`, `icono-192.png` | Ícono de la app (manifest). Fondo crema a sangre; el símbolo ocupa ~64 %, dentro de la zona segura de los íconos *maskable* (80 %). |
| `apple-touch-icon-180.png` | Ícono para iPhone (Agregar a inicio) |
| `icono-app-una-tinta.svg` | Variante sobre marino (tiendas, materiales oscuros) |
| `favicon.svg`, `favicon-32.png` | Pestaña del navegador. Trazos más gruesos para leerse a 16 px |

## 4. Paleta (`paleta.css`, `paleta.json`)

| Token | Hex | Uso | Contraste con marino |
|---|---|---|---|
| `--kuwu-crema` | `#fff9f0` | Fondo principal de la app y de los íconos | 13,9:1 |
| `--kuwu-marino` | `#24283b` | **Tinta**: todo el texto, segmentos y bordes del logo, botones principales, fondo de la versión a una tinta | — |
| `--kuwu-rojo` | `#ff9b93` | Pastel primario: nodos, tarjetas de juego, acentos | 7,2:1 |
| `--kuwu-amarillo` | `#ffd66b` | Pastel primario: plan del día, destacados, subrayado de marca | 10,5:1 |
| `--kuwu-azul` | `#8ec5ff` | Pastel primario: nodos, tarjetas de juego, información | 8,0:1 |
| `--kuwu-menta` | `#8fe0b8` | Éxito y progreso (como relleno) | 9,4:1 |
| `--kuwu-blanco` | `#ffffff` | Tarjetas sobre crema; nodos en versiones reducida y sobre amarillo | 14,6:1 |

**Reglas de color**
- **El texto va siempre en marino**, o en crema sobre marino. Los pasteles son fondos y rellenos, nunca color de texto: como texto sobre crema no pasan el contraste mínimo.
- Todas las combinaciones de marino sobre la paleta superan **AA (4,5:1)** con margen; la menor es el rojo, con 7,2:1.
- **No se usan colores fuera de esta paleta en la UI.**

**Derivados** (generados por `herramientas/generar_brandbook.py` como mezclas de colores de la paleta, salvo los de alerta). Cubren lo que la app necesita y la base no tiene: neutros, rellenos suaves, avisos de dolor y error, y el tema de cámara y juego.

| Token | Hex | Uso | Contraste con crema |
|---|---|---|---|
| `--kuwu-linea` | `#e5e0da` | Bordes y separadores (marino 12 % sobre crema). | 1,25:1 |
| `--kuwu-pista` | `#f0eae3` | Pistas de barras, deslizadores e interruptores apagados (marino 7 %). | 1,14:1 |
| `--kuwu-control` | `#87868c` | Bordes de controles y líneas de referencia; no es color de texto (marino 55 %). | 3,45:1 |
| `--kuwu-suave` | `#545663` | Texto secundario (marino 78 %). | 6,95:1 |
| `--kuwu-tenue` | `#666771` | Texto terciario y notas (marino 70 %). | 5,36:1 |
| `--kuwu-amarillo-suave` | `#ffedc1` | Relleno de tarjetas destacadas (amarillo 35 % sobre crema). | 1,11:1 |
| `--kuwu-menta-suave` | `#d8f0dc` | Relleno de avisos de éxito (menta 35 %). | 1,15:1 |
| `--kuwu-azul-suave` | `#dde9f4` | Relleno de avisos informativos (azul 30 %). | 1,18:1 |
| `--kuwu-alerta` | `#d1363c` | Dolor y error: bordes, íconos y fondo de avisos de error (con texto blanco). | 4,66:1 |
| `--kuwu-alerta-texto` | `#c4282e` | Dolor y error como texto, sobre crema, blanco o alerta-fondo. | 5,44:1 |
| `--kuwu-alerta-fondo` | `#fdeceb` | Fondo de tarjetas de dolor o error. | 1,09:1 |
| `--kuwu-noche` | `#1a1d2a` | Tema de cámara y juego: fondo detrás del video y de la escena (marino oscurecido). | 16,01:1 |
| `--kuwu-noche-borde` | `#3e4151` | Tema de cámara y juego: pistas y bordes sobre marino. | 9,65:1 |
| `--kuwu-noche-texto-2` | `#bdbaba` | Tema de cámara y juego: texto secundario en crema atenuada. | 1,84:1 |

- Texto permitido además de marino: `suave` y `tenue` (secundario), `alerta-texto` (dolor y error) y `noche-texto-2` (sobre marino o noche).
- **Cómo se usa en la app:** `src/main.tsx` importa `paleta.css`; `src/index.css` define los tokens de las pantallas (`--fondo`, `--tinta`, `--alerta`…) apuntando a `--kuwu-*`. Los lienzos y escenas 3D usan `src/ui/paleta.ts` (lee `paleta.json`). Transparencias: `color-mix()` sobre un color de la paleta.
- La cámara y el juego usan el tema «noche» (clase `.juego` / `.calibrar` en `index.css`): marino de fondo, texto crema y los pasteles como acentos.
- Excepción: los objetos de las escenas 3D (fruta, madera, cubos) pueden tener su color natural; los acentos de interfaz dentro del juego (guías, aciertos, avisos, letreros) sí van con la paleta.

## 5. Tipografía

| Rol | Fuente | Pesos | Por qué |
|---|---|---|---|
| **Principal**: títulos, botones y texto de interfaz | **Nunito** (`tipografia/Nunito[wght].ttf`, licencia OFL) | 900 títulos grandes · 800 títulos y botones · 600 texto · 400 texto largo | Redondeada, amable y muy legible. Es la misma fuente del logotipo. Tiene ü, ñ y ¿. Es variable: un solo archivo para todos los pesos |

**Alternativas a Nunito**, si se busca otro tono:
- **Baloo 2:** más infantil y gruesa.
- **Quicksand:** más liviana y geométrica.
- **Fredoka:** muy redonda y juguetona.

Las tres son libres (OFL), pero ninguna está aquí; habría que agregarlas.

**Cifras:** también Nunito. Sus diez dígitos miden lo mismo (600 unidades) en todos los pesos, así que los números en vivo no "bailan" aunque la fuente no traiga la función `tnum`. No hace falta una segunda fuente.

**En la web:** `src/ui/fuentes/nunito-latin.woff2` (subconjunto latino de `tipografia/Nunito[wght].ttf`), declarada en `src/fuentes.css` con `font-display: swap`.

## 6. Cómo se generan los archivos

`herramientas/generar_brandbook.py` genera todos los SVG, la paleta y copia la fuente, a partir de la geometría aprobada:

```bash
python3 -m venv /tmp/kuwu-venv && /tmp/kuwu-venv/bin/pip install fonttools
/tmp/kuwu-venv/bin/python -I herramientas/generar_brandbook.py "tipografia/Nunito[wght].ttf" tipografia/OFL.txt .
```

El script **no** genera `vista-previa.html` (se edita a mano) ni los PNG. Los PNG de `iconos/` se exportan desde los SVG con Chromium (Playwright), desde la raíz del repo:

```bash
node brandbook/herramientas/exportar_png.mjs
```

Después se copian a `public/iconos/` (`icono-512.png` también como `icono-maskable-512.png`, `apple-touch-icon-180.png` como `apple-touch-icon.png`). Revísalos en `vista-previa.html`.
