// Genera public/grabaciones/demo.json: una vuelta del guion sintético 'calibracion' grabada a 15 fps con
// el mismo grabador de la app (solo landmarks). Uso: npx tsx scripts/generar-grabacion.ts [guion] [salida]
import { writeFileSync } from 'node:fs'
import { FuenteSintetica, relojManual } from '../src/tracking/fuenteSimulada'
import { GrabadorLandmarks } from '../src/tracking/grabacion'
import { GUIONES_PRESET, guionPreset, resolverClaves, type NombreGuion } from '../src/tracking/sintetica'

const nombre = (process.argv[2] ?? 'calibracion') as NombreGuion
if (!GUIONES_PRESET.includes(nombre)) throw new Error(`guion desconocido: ${nombre}`)
const salida = process.argv[3] ?? 'public/grabaciones/demo.json'
const guion = guionPreset(nombre)
const fin = Math.max(1000, ...guion.manos.map((m) => resolverClaves(m.poses).at(-1)?.t ?? 0))
const reloj = relojManual()
const fuente = new FuenteSintetica(guion, reloj)
const grabador = new GrabadorLandmarks('sintetica')
fuente.alCuadro((c) => grabador.agregar(c))
await fuente.iniciar()
for (let t = 1000 / 15; t < fin; t += 1000 / 15) {
  reloj.t = Math.round(t)
  fuente.paso()
}
writeFileSync(salida, grabador.json('2026-11-21T00:00:00.000Z'))
console.log(`${salida}: ${grabador.cantidad} cuadros, ${fin} ms`)
