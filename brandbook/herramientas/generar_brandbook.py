"""Genera el brandbook de Kuwü (logos SVG, íconos SVG, paleta CSS/JSON y copia de la fuente) desde la geometría aprobada en la ronda 8.

No genera `vista-previa.html` (se edita a mano) ni los PNG de `iconos/` (los exporta `herramientas/exportar_png.mjs`).

Uso: python -I generar_brandbook.py <ruta a Nunito[wght].ttf> <ruta a OFL.txt> <carpeta de salida>

- El nombre "Kuwü" se convierte a trazos (paths) con Nunito ExtraBold 800: el SVG no depende de fuentes instaladas.
- La diéresis de la ü son dos nodos unidos por un segmento (como en el símbolo).
"""
import json
import math
import shutil
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FUENTE, LICENCIA, SALIDA = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])

# ---------- Paleta ----------
P = {
    "crema": "#fff9f0",
    "marino": "#24283b",
    "rojo": "#ff9b93",
    "amarillo": "#ffd66b",
    "azul": "#8ec5ff",
    "menta": "#8fe0b8",
    "blanco": "#ffffff",
}

# ---------- Símbolo: flor de 6 nodos y 5 segmentos (ronda 8, variación leve 0,35) ----------
PATRON = [0.10, -0.08, 0.16, -0.14, 0.02]
VARIACION = 0.35
ANGULOS = [-90, -18, 54, 126, 198]
LARGO, R_PETALO, R_CENTRO = 32, 9.5, 8.5
COLORES = ["rojo", "amarillo", "azul", "rojo", "amarillo"]


def petalos():
    out = []
    for i, a in enumerate(ANGULOS):
        r = R_PETALO * (1 + PATRON[i] * VARIACION * 2.2)
        x = 50 + LARGO * math.cos(math.radians(a))
        y = 50 + LARGO * math.sin(math.radians(a))
        out.append((x, y, r))
    return out


def simbolo(rellenos, centro, trazo, seg=4.6, borde=3.1, dx=0.0, dy=0.0, escala=1.0):
    """Elementos SVG del símbolo. Coordenadas base 0..100, trasladadas y escaladas."""
    t = lambda x, y: (dx + x * escala, dy + y * escala)  # noqa: E731
    cx, cy = t(50, 50)
    partes = []
    for x, y, _ in petalos():
        px, py = t(x, y)
        partes.append(f'<line x1="{cx:.2f}" y1="{cy:.2f}" x2="{px:.2f}" y2="{py:.2f}" stroke="{trazo}" stroke-width="{seg * escala:.2f}" stroke-linecap="round"/>')
    orden = sorted(range(5), key=lambda i: -petalos()[i][2])
    for i in orden:
        x, y, r = petalos()[i]
        px, py = t(x, y)
        partes.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="{r * escala:.2f}" fill="{rellenos[i]}" stroke="{trazo}" stroke-width="{borde * escala:.2f}"/>')
    partes.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{R_CENTRO * escala:.2f}" fill="{centro}"/>')
    return "\n  ".join(partes)


def caja_simbolo(borde=3.1):
    xs, ys = [], []
    for x, y, r in petalos():
        e = r + borde / 2
        xs += [x - e, x + e]
        ys += [y - e, y + e]
    return min(xs), min(ys), max(xs), max(ys)


# ---------- Nombre: "Kuwu" en trazos + diéresis de nodos ----------
fuente = instancer.instantiateVariableFont(TTFont(FUENTE), {"wght": 800})
glifos = fuente.getGlyphSet()
cmap = fuente.getBestCmap()
UPM = fuente["head"].unitsPerEm


def palabra(texto, x0=0.0, base=0.0, tam=100.0, color="#000"):
    """Devuelve (path SVG, x final, caja de la última letra) del texto en tamaño tam (px por em)."""
    esc = tam / UPM
    x = x0
    d_total, ultima = [], None
    for ch in texto:
        nombre = cmap[ord(ch)]
        g = glifos[nombre]
        pen = SVGPathPen(glifos)
        g.draw(TransformPen(pen, (esc, 0, 0, -esc, x, base)))
        d_total.append(pen.getCommands())
        bp = BoundsPen(glifos)
        g.draw(bp)
        if bp.bounds:
            b = bp.bounds
            ultima = (x + b[0] * esc, base - b[3] * esc, x + b[2] * esc, base - b[1] * esc)
        x += g.width * esc
    return f'<path d="{" ".join(d_total)}" fill="{color}"/>', x, ultima


def nombre_kuwu(x0, base, tam, color, borde_nodo, d1, d2):
    """'Kuwu' en trazos + dos nodos unidos por un segmento sobre la última u (la diéresis)."""
    path, x_fin, u = palabra("Kuwu", x0, base, tam, color)
    ux0, uy0, ux1, _ = u
    r1, r2 = 0.125 * tam, 0.105 * tam
    b = 0.045 * tam
    cy = uy0 - 0.06 * tam - r1
    c1x, c2x = ux0 + 0.03 * tam + r1, ux1 - 0.03 * tam - r2
    seg = f'<line x1="{c1x:.2f}" y1="{cy:.2f}" x2="{c2x:.2f}" y2="{cy:.2f}" stroke="{borde_nodo}" stroke-width="{0.055 * tam:.2f}" stroke-linecap="round"/>'
    n1 = f'<circle cx="{c1x:.2f}" cy="{cy:.2f}" r="{r1 - b / 2:.2f}" fill="{d1}" stroke="{borde_nodo}" stroke-width="{b:.2f}"/>'
    n2 = f'<circle cx="{c2x:.2f}" cy="{cy:.2f}" r="{r2 - b / 2:.2f}" fill="{d2}" stroke="{borde_nodo}" stroke-width="{b:.2f}"/>'
    arriba = cy - r1
    return path + "\n  " + seg + "\n  " + n1 + "\n  " + n2, x_fin, arriba


def svg(ancho, alto, cuerpo, titulo, fondo=None, radio=0):
    rect = f'<rect width="{ancho:.2f}" height="{alto:.2f}" rx="{radio}" fill="{fondo}"/>\n  ' if fondo else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho:.2f} {alto:.2f}" width="{ancho:.0f}" height="{alto:.0f}" role="img" aria-label="{titulo}">\n'
            f'  <title>{titulo}</title>\n  {rect}{cuerpo}\n</svg>\n')


def guardar(ruta, contenido):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(contenido, encoding="utf-8")


# ---------- Variantes de color ----------
COLOR = dict(rellenos=[P[c] for c in COLORES], centro=P["marino"], trazo=P["marino"])
UNA_TINTA_MARINO_FONDO = dict(rellenos=[P["marino"]] * 5, centro=P["crema"], trazo=P["crema"])  # sobre azul marino
UNA_TINTA_CLARO = dict(rellenos=[P["blanco"]] * 5, centro=P["marino"], trazo=P["marino"])  # sobre fondos claros
SOBRE_AMARILLO = dict(rellenos=[P["blanco"] if c == "amarillo" else P[c] for c in COLORES], centro=P["marino"], trazo=P["marino"])

M = 4  # margen
x0, y0, x1, y1 = caja_simbolo()
LADO = max(x1 - x0, y1 - y0) + 2 * M
DX, DY = -(x0 + x1) / 2 + LADO / 2, -(y0 + y1) / 2 + LADO / 2
L = SALIDA / "logos"

# Símbolo solo
guardar(L / "simbolo.svg", svg(LADO, LADO, simbolo(**COLOR, dx=DX, dy=DY), "Kuwü (símbolo)"))
guardar(L / "simbolo-una-tinta-sobre-marino.svg", svg(LADO, LADO, simbolo(**UNA_TINTA_MARINO_FONDO, dx=DX, dy=DY), "Kuwü (símbolo, una tinta sobre marino)"))
guardar(L / "simbolo-una-tinta-sobre-claro.svg", svg(LADO, LADO, simbolo(**UNA_TINTA_CLARO, dx=DX, dy=DY), "Kuwü (símbolo, una tinta sobre fondo claro)"))
guardar(L / "simbolo-sobre-amarillo.svg", svg(LADO, LADO, simbolo(**SOBRE_AMARILLO, dx=DX, dy=DY), "Kuwü (símbolo sobre amarillo)"))


def horizontal(variante, color_nombre, borde_nodo, d1, d2, titulo, archivo):
    alto_sim = 120.0
    esc = alto_sim / LADO
    tam = 104.0
    base = alto_sim / 2 + tam * 0.255  # centra la altura de las minúsculas con el símbolo
    cuerpo_sim = simbolo(**variante, dx=DX * esc, dy=DY * esc, escala=esc)
    texto, x_fin, _ = nombre_kuwu(alto_sim + 18, base, tam, color_nombre, borde_nodo, d1, d2)
    guardar(L / archivo, svg(x_fin + 8, alto_sim, cuerpo_sim + "\n  " + texto, titulo))


def apilado(variante, color_nombre, borde_nodo, d1, d2, titulo, archivo):
    lado = 160.0
    esc = lado / LADO
    tam = 96.0
    _, ancho_txt, _ = palabra("Kuwu", 0, 0, tam)
    ancho = max(lado, ancho_txt) + 16
    cuerpo_sim = simbolo(**variante, dx=(ancho - lado) / 2 + DX * esc, dy=DY * esc, escala=esc)
    base = lado + 28 + tam * 0.72
    texto, _, _ = nombre_kuwu((ancho - ancho_txt) / 2, base, tam, color_nombre, borde_nodo, d1, d2)
    guardar(L / archivo, svg(ancho, base + tam * 0.08, cuerpo_sim + "\n  " + texto, titulo))


def reducida(color_nombre, borde_nodo, d1, d2, titulo, archivo):
    tam = 120.0
    _, ancho_txt, _ = palabra("Kuwu", 0, 0, tam)
    base = tam * 0.98
    texto, _, _ = nombre_kuwu(6, base, tam, color_nombre, borde_nodo, d1, d2)
    guardar(L / archivo, svg(ancho_txt + 12, base + tam * 0.06, texto, titulo))


m, cr = P["marino"], P["crema"]
horizontal(COLOR, m, m, P["rojo"], P["azul"], "Kuwü", "kuwu-horizontal.svg")
horizontal(UNA_TINTA_MARINO_FONDO, cr, cr, m, m, "Kuwü (una tinta sobre marino)", "kuwu-horizontal-una-tinta-sobre-marino.svg")
horizontal(UNA_TINTA_CLARO, m, m, P["blanco"], P["blanco"], "Kuwü (una tinta sobre fondo claro)", "kuwu-horizontal-una-tinta-sobre-claro.svg")
horizontal(SOBRE_AMARILLO, m, m, P["rojo"], P["azul"], "Kuwü (sobre amarillo)", "kuwu-horizontal-sobre-amarillo.svg")
apilado(COLOR, m, m, P["rojo"], P["azul"], "Kuwü (apilado)", "kuwu-apilado.svg")
apilado(UNA_TINTA_MARINO_FONDO, cr, cr, m, m, "Kuwü (apilado, una tinta sobre marino)", "kuwu-apilado-una-tinta-sobre-marino.svg")
reducida(m, m, P["blanco"], P["blanco"], "Kuwü (versión reducida)", "kuwu-reducida.svg")
reducida(cr, cr, m, m, "Kuwü (versión reducida, una tinta sobre marino)", "kuwu-reducida-una-tinta-sobre-marino.svg")

# ---------- Íconos ----------
I = SALIDA / "iconos"
# Favicon: trazos más gruesos para que se lea a 16 px.
xf0, yf0, xf1, yf1 = caja_simbolo(borde=3.8)
LF = max(xf1 - xf0, yf1 - yf0) + 4
guardar(I / "favicon.svg", svg(LF, LF, simbolo(**COLOR, seg=6, borde=3.8, dx=-(xf0 + xf1) / 2 + LF / 2, dy=-(yf0 + yf1) / 2 + LF / 2), "Kuwü"))
# Ícono de app 512: fondo crema a sangre; el símbolo ocupa ~64 % (zona segura de íconos "maskable" = 80 %).
esc = 512 * 0.64 / LF
dx, dy = 256 - 50 * esc, 256 - 50 * esc
guardar(I / "icono-app.svg", svg(512, 512, simbolo(**COLOR, seg=6, borde=3.8, dx=dx, dy=dy, escala=esc), "Kuwü", fondo=P["crema"]))
guardar(I / "icono-app-una-tinta.svg", svg(512, 512, simbolo(**UNA_TINTA_MARINO_FONDO, seg=6, borde=3.8, dx=dx, dy=dy, escala=esc), "Kuwü", fondo=P["marino"]))

# ---------- Paleta ----------
# Base: los 7 colores de la marca.
PALETA = [
    ("crema", P["crema"], "Fondo principal de la app y de los íconos."),
    ("marino", P["marino"], "Tinta: todo el texto, segmentos y bordes del logo, botones principales y fondo de la versión a una tinta."),
    ("rojo", P["rojo"], "Pastel primario. Nodos, tarjetas de juego, acentos."),
    ("amarillo", P["amarillo"], "Pastel primario. Plan del día, destacados, lo que avanza, subrayado de la marca."),
    ("azul", P["azul"], "Pastel primario. Nodos, tarjetas de juego, información."),
    ("menta", P["menta"], "Éxito y progreso (como relleno; el texto encima va en marino)."),
    ("blanco", P["blanco"], "Tarjetas sobre fondo crema; relleno de nodos en versiones reducida y sobre amarillo."),
]


def mezcla(a, b, t):
    """t de `a` + (1 - t) de `b`, en sRGB. Los derivados salen solo de colores de la paleta."""
    va = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    vb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * t + y * (1 - t)):02x}" for x, y in zip(va, vb))


# Derivados (consolidación con el sistema «Salud» de la app): neutros, rellenos suaves, alerta y tema de cámara.
NEGRO = "#000000"
DERIVADOS = [
    ("linea", mezcla(P["marino"], P["crema"], 0.12), "Bordes y separadores (marino 12 % sobre crema)."),
    ("pista", mezcla(P["marino"], P["crema"], 0.07), "Pistas de barras, deslizadores e interruptores apagados (marino 7 %)."),
    ("control", mezcla(P["marino"], P["crema"], 0.55), "Bordes de controles y líneas de referencia; no es color de texto (marino 55 %)."),
    ("suave", mezcla(P["marino"], P["crema"], 0.78), "Texto secundario (marino 78 %)."),
    ("tenue", mezcla(P["marino"], P["crema"], 0.70), "Texto terciario y notas (marino 70 %)."),
    ("amarillo-suave", mezcla(P["amarillo"], P["crema"], 0.35), "Relleno de tarjetas destacadas (amarillo 35 % sobre crema)."),
    ("menta-suave", mezcla(P["menta"], P["crema"], 0.35), "Relleno de avisos de éxito (menta 35 %)."),
    ("azul-suave", mezcla(P["azul"], P["crema"], 0.30), "Relleno de avisos informativos (azul 30 %)."),
    ("alerta", "#d1363c", "Dolor y error: bordes, íconos y fondo de avisos de error (con texto blanco)."),
    ("alerta-texto", "#c4282e", "Dolor y error como texto, sobre crema, blanco o alerta-fondo."),
    ("alerta-fondo", "#fdeceb", "Fondo de tarjetas de dolor o error."),
    ("noche", mezcla(P["marino"], NEGRO, 0.72), "Tema de cámara y juego: fondo detrás del video y de la escena (marino oscurecido)."),
    ("noche-borde", mezcla(P["marino"], P["crema"], 0.88), "Tema de cámara y juego: pistas y bordes sobre marino."),
    ("noche-texto-2", mezcla(P["crema"], P["marino"], 0.70), "Tema de cámara y juego: texto secundario en crema atenuada."),
]


def lum(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]


def contraste(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


guardar(SALIDA / "paleta.json", json.dumps({
    "marca": "Kuwü",
    "colores": {n: {"hex": h, "uso": u, "contraste_con_marino": round(contraste(h, P["marino"]), 2)} for n, h, u in PALETA},
    "derivados": {n: {"hex": h, "uso": u, "contraste_con_crema": round(contraste(h, P["crema"]), 2)} for n, h, u in DERIVADOS},
    "reglas": [
        "El texto siempre va en marino (o en crema sobre marino). Los pasteles no se usan como color de texto.",
        "Excepciones de texto: suave y tenue (texto secundario), alerta-texto (dolor y error) y noche-texto-2 (sobre marino).",
        "No se permiten colores fuera de esta paleta (base y derivados) en la UI.",
    ],
}, ensure_ascii=False, indent=2) + "\n")
css = ["/* Paleta Kuwü (brandbook). Todo elemento de UI usa solo estos colores. Generado por herramientas/generar_brandbook.py. */", ":root {"]
css += [f"  --kuwu-{n}: {h}; /* {u} */" for n, h, u in PALETA]
css += ["  /* Derivados */"]
css += [f"  --kuwu-{n}: {h}; /* {u} */" for n, h, u in DERIVADOS]
css += ["}", ""]
guardar(SALIDA / "paleta.css", "\n".join(css))

# ---------- Fuente (OFL, redistribuible junto a su licencia) ----------
(SALIDA / "tipografia").mkdir(parents=True, exist_ok=True)
for origen, destino in ((FUENTE, SALIDA / "tipografia" / "Nunito[wght].ttf"), (LICENCIA, SALIDA / "tipografia" / "OFL.txt")):
    if origen.resolve() != destino.resolve():  # si ya está en su lugar (regenerar dentro del brandbook), no se copia
        shutil.copy(origen, destino)

print("contrastes con marino:", {n: round(contraste(h, P["marino"]), 2) for n, h, _ in PALETA})
print("derivados, contraste con crema:", {n: round(contraste(h, P["crema"]), 2) for n, h, _ in DERIVADOS})
print("archivos:", sorted(str(p.relative_to(SALIDA)) for p in SALIDA.rglob("*") if p.is_file()))
