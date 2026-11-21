// Genera los íconos PNG de la PWA desde public/favicon.svg con Chromium (Playwright, ya instalado).
// Uso: node scripts/generar-iconos.mjs   → public/iconos/*.png (se commitean; no hace falta correrlo en cada build).
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync('public/favicon.svg', 'utf8')
const interior = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace('</svg>', '') // sin <svg> ni el fondo redondeado
const FONDO = '#ffc83d'

// 'any': el favicon tal cual (esquinas redondeadas transparentes). 'maskable' y 'apple': fondo a sangre y la mano dentro
// de la zona segura (círculo central del 80 %), porque el sistema recorta la forma (círculo, squircle…).
const variantes = [
  { archivo: 'icono-192.png', tam: 192, html: svg },
  { archivo: 'icono-512.png', tam: 512, html: svg },
  { archivo: 'icono-maskable-512.png', tam: 512, html: ajustado(0.62) },
  { archivo: 'apple-touch-icon.png', tam: 180, html: ajustado(0.78) },
]

function ajustado(escala) {
  // La mano ocupa ~ x 11–53, y 14–54 de 64: se centra en (32, 34) y se escala.
  const t = `translate(32 32) scale(${escala}) translate(-32 -34)`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${FONDO}"/><g transform="${t}">${interior}</g></svg>`
}

const navegador = await chromium.launch()
try {
  for (const v of variantes) {
    const pagina = await navegador.newPage({ viewport: { width: v.tam, height: v.tam }, deviceScaleFactor: 1 })
    await pagina.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${v.tam}px;height:${v.tam}px}</style>${v.html}`)
    await pagina.screenshot({ path: `public/iconos/${v.archivo}`, omitBackground: true })
    await pagina.close()
    console.log('ok', v.archivo)
  }
} finally {
  await navegador.close()
}
