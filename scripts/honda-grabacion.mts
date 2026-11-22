// Pasa una grabación del laboratorio de banda (botón «Descargar» de /laboratorio: solo puntos de las manos, sin video)
// por la lógica de la Honda y muestra el cero, los cambios de reposo y cada tiro. Sirve para revisar una prueba real sin
// repetirla. Las grabaciones tienen datos de la mano de una persona: no se versionan.
//
//   npx tsx scripts/honda-grabacion.mts <grabacion.json> [nivel 1–5] [d = detalle cuadro a cuadro]
import { readFileSync } from 'node:fs'
import { leerGrabacion } from '../src/tracking/grabacion'
import { AGARRE_POR_DEFECTO, medirBanda } from '../src/banda/medicion'
import { SesionHonda, bandaConfigurada, nivelHonda } from '../src/games/honda/logica'

const [archivo, nivelTxt = '3', detalle = ''] = process.argv.slice(2)
const g = leerGrabacion(readFileSync(archivo, 'utf8'))
const n = nivelHonda(Number(nivelTxt))
const banda = bandaConfigurada(() => null)
const s = new SesionHonda(banda.curva, n)
let prevFase = ''
let maxE = 0
let saltos = 0
let prevLargo: number | null = null
const lineas: string[] = []
for (const c of g.cuadros) {
  const m = medirBanda(c, AGARRE_POR_DEFECTO)
  if (m && prevLargo != null && Math.abs(m.largoCm - prevLargo) / prevLargo > 0.25) saltos++
  prevLargo = m?.largoCm ?? prevLargo
  const ev = s.paso(c.t, m?.largoCm ?? null)
  const u = s.ultimo
  maxE = Math.max(maxE, u?.e ?? 0)
  for (const e of ev) lineas.push(`  ${(c.t / 1000).toFixed(1)}s EV ${e.tipo}${e.tipo === 'tiro' ? ` #${e.tiro.n} ${e.tiro.resultado} pico ${e.tiro.picoKg.toFixed(2)} kg (${(e.tiro.picoEstiramiento*100).toFixed(0)} %)${e.tiro.sePaso ? ' se pasó' : ''} sost ${e.tiro.sostenidoS.toFixed(2)} s tension ${e.tiro.tensionS.toFixed(2)} s` : ''}`)
  if (u?.evento) lineas.push(`  ${(c.t / 1000).toFixed(1)}s REPOSO ${u.evento} → ${u.reposoCm?.toFixed(1)} cm`)
  if (detalle && (s.fase !== prevFase || Math.round(c.t / 250) !== Math.round((c.t - 33) / 250))) {
    lineas.push(`  ${(c.t / 1000).toFixed(2)}s manos ${c.manos.length} largo ${m ? m.largoCm.toFixed(1) : '—'} e ${u?.e == null ? '—' : (u.e * 100).toFixed(0) + '%'} kg ${u?.kg == null ? '—' : u.kg.toFixed(2)} ${s.fase}${m ? ` desn ${m.desnivel.toFixed(2)}${m.alBorde ? ' BORDE' : ''} palma ${m.palma.toFixed(3)}` : ''}`)
    prevFase = s.fase
  }
}
console.log(`${archivo.split('/').pop()} · nivel ${nivelTxt} (zona ${s.zona.minKg.toFixed(1)}–${s.zona.maxKg.toFixed(1)} kg) · ${g.cuadros.length} cuadros · reposo final ${s.seguidor.reposoCm?.toFixed(1)} cm · e máx ${(maxE * 100).toFixed(0)} % · saltos >25 % ${saltos}`)
console.log(lineas.join('\n'))
console.log(`  TIROS: ${s.tiros.map((t) => t.resultado).join(', ')}`)
