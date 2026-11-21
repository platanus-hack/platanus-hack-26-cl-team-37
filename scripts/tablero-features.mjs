// Tablero de features: sirve scripts/tablero-features.html y feature_list.json (leído del disco en cada pedido).
// Uso: node scripts/tablero-features.mjs [--puerto 5199]  →  http://localhost:5199
// Solo lectura y solo en localhost. Sin dependencias.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const i = process.argv.indexOf('--puerto')
const puerto = Number(i >= 0 ? process.argv[i + 1] : 5199)
const html = new URL('./tablero-features.html', import.meta.url)
const lista = new URL('../feature_list.json', import.meta.url)

createServer(async (req, res) => {
  const ruta = new URL(req.url ?? '/', 'http://localhost').pathname
  try {
    if (ruta === '/' || ruta === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(html))
    }
    if (ruta === '/feature_list.json') {
      const texto = await readFile(lista, 'utf8')
      JSON.parse(texto) // si el JSON está roto (edición a medias), avisar en vez de servirlo
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(texto)
    }
    res.writeHead(404).end('no encontrado')
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Error leyendo: ' + e.message)
  }
}).listen(puerto, '127.0.0.1', () => console.log(`Tablero de features en http://localhost:${puerto}`))
