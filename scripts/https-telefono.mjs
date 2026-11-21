// HTTPS en la red local para probar en un teléfono, sin tocar la configuración del proyecto: un proxy con certificado
// temporal delante del servidor de desarrollo (la cámara del navegador solo funciona con HTTPS fuera de localhost).
//
//   node scripts/https-telefono.mjs [puerto-del-servidor] [puerto-https]      (por defecto 5174 y 5443)
//
// Crea un certificado autofirmado en una carpeta temporal (se borra al salir), muestra las direcciones para abrir en el
// teléfono y reenvía todo, incluido el WebSocket de recarga de Vite. El teléfono mostrará «conexión no privada» la
// primera vez: hay que aceptar el aviso (Safari: «Mostrar detalles» → «visitar este sitio web»). Se detiene con Ctrl+C.
// A diferencia de .certs/ (docs/telefono.md), no cambia el protocolo de `npm run dev` ni rompe los e2e.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'

const destino = Number(process.argv[2] ?? 5174)
const puerto = Number(process.argv[3] ?? 5443)
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address)

const carpeta = mkdtempSync(join(tmpdir(), 'https-telefono-'))
const limpiar = () => rmSync(carpeta, { recursive: true, force: true })
const nombres = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',')
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', join(carpeta, 'clave.pem'), '-out', join(carpeta, 'cert.pem'), '-subj', '/CN=ManoViva local', '-addext', `subjectAltName=${nombres}`], { stdio: 'ignore' })
const opciones = { key: readFileSync(join(carpeta, 'clave.pem')), cert: readFileSync(join(carpeta, 'cert.pem')) }
// Las claves ya están en memoria: la carpeta se borra al tiro.
limpiar()

const servidor = https.createServer(opciones, (req, res) => {
  const ida = http.request({ host: 'localhost', port: destino, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${destino}` } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  ida.on('error', () => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`No responde el servidor de desarrollo en el puerto ${destino}. ¿Está corriendo?`)
  })
  req.pipe(ida)
})

// WebSocket (recarga en caliente de Vite): se reenvía la conexión tal cual.
servidor.on('upgrade', (req, socket, cabeza) => {
  const ida = net.connect(destino, 'localhost', () => {
    const lineas = [`${req.method} ${req.url} HTTP/${req.httpVersion}`, ...Object.entries({ ...req.headers, host: `localhost:${destino}` }).map(([k, v]) => `${k}: ${v}`), '', '']
    ida.write(lineas.join('\r\n'))
    if (cabeza?.length) ida.write(cabeza)
    socket.pipe(ida).pipe(socket)
  })
  ida.on('error', () => socket.destroy())
  socket.on('error', () => ida.destroy())
})

servidor.listen(puerto, '0.0.0.0', () => {
  console.log(`HTTPS para teléfonos → servidor de desarrollo en http://localhost:${destino}`)
  for (const ip of ips) console.log(`  https://${ip}:${puerto}/laboratorio`)
  console.log('El teléfono debe estar en la misma red. Ctrl+C para detener.')
})
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => servidor.close(() => process.exit(0)))
