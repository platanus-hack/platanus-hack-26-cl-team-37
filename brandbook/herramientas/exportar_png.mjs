// Exporta los PNG de brandbook/iconos/ desde sus SVG con Chromium (Playwright, ya está en devDependencies).
// El SVG se incrusta en la página (no se carga por URL), así no hay imagen rota si falla una ruta.
// Uso, desde la raíz del repo: node brandbook/herramientas/exportar_png.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const iconos = fileURLToPath(new URL('../iconos/', import.meta.url))
const SALIDAS = [
  ['icono-app.svg', 'icono-512.png', 512],
  ['icono-app.svg', 'icono-192.png', 192],
  ['icono-app.svg', 'apple-touch-icon-180.png', 180],
  ['favicon.svg', 'favicon-32.png', 32],
  // Logo de la ficha del proyecto (README y entrega del hackathon), en la raíz del repo.
  ['icono-app.svg', '../../project-logo.png', 1000],
]

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ deviceScaleFactor: 1 })
for (const [svg, png, lado] of SALIDAS) {
  const contenido = readFileSync(iconos + svg, 'utf8').replace(/<\?xml[^>]*>/, '')
  await pagina.setViewportSize({ width: lado, height: lado })
  await pagina.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>${contenido}`,
  )
  const caja = await pagina.locator('svg').boundingBox()
  if (!caja || Math.round(caja.width) !== lado) throw new Error(`${svg}: el SVG no se dibujó a ${lado} px`)
  await pagina.locator('svg').screenshot({ path: iconos + png, omitBackground: true })
  console.log('ok', png, lado)
}
await navegador.close()
