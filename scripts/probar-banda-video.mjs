// Prueba de punta a punta del laboratorio de banda con un video como cámara: MediaPipe en modo video, filtros, reposo
// automático y conteo de repeticiones reales, sin persona frente a la cámara.
//
//   node scripts/probar-banda-video.mjs [url]        (por defecto http://localhost:5174/laboratorio; el servidor debe estar arriba)
//
// Arma un video de 24 s con dos manos reales (foto de prueba de MediaPipe, la segunda en espejo) que se separan y
// vuelven en ciclos de 8 s: 3 s quietas, 1,5 s estirando, 1 s sostenido, 1,5 s volviendo y 1 s quietas. Lo pasa a
// Chromium como cámara falsa y lee la pantalla. Espera 3 repeticiones completas o más (el video se repite en bucle).
// Necesita ffmpeg. Todo se escribe en una carpeta temporal que se borra al terminar.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://localhost:5174/laboratorio'
const FOTO = 'https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg'
const carpeta = mkdtempSync(join(tmpdir(), 'banda-video-'))

try {
  const foto = join(carpeta, 'mano.jpg')
  const respuesta = await fetch(FOTO)
  if (!respuesta.ok) throw new Error(`no se pudo bajar la foto de prueba (${respuesta.status})`)
  writeFileSync(foto, Buffer.from(await respuesta.arrayBuffer()))

  // Separación entre las manos (px) según el momento del ciclo de 8 s.
  const u = 'mod(t\\,8)'
  const sep = `if(lt(${u}\\,3)\\,110\\,if(lt(${u}\\,4.5)\\,110+120*(${u}-3)/1.5\\,if(lt(${u}\\,5.5)\\,230\\,if(lt(${u}\\,7)\\,230-120*(${u}-5.5)/1.5\\,110))))`
  const video = join(carpeta, 'banda.y4m')
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0xd9d4cc:s=640x480:r=15:d=24',
    '-loop', '1', '-i', foto,
    '-filter_complex',
    `[1]scale=-1:170,format=rgba,split[l][r0];[r0]hflip[r];` +
      `[0][l]overlay=x='320-(${sep})/2-overlay_w':y=(main_h-overlay_h)/2:shortest=1[a];` +
      `[a][r]overlay=x='320+(${sep})/2':y=(main_h-overlay_h)/2:shortest=1,format=yuv420p`,
    '-t', '24', '-f', 'yuv4mpegpipe', video,
  ])

  const navegador = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] })
  const page = await navegador.newPage({ viewport: { width: 1280, height: 900 } })
  await page.context().grantPermissions(['camera'])
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.addInitScript(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('manoviva.laboratorio.')) localStorage.removeItem(k)
  })
  await page.goto(url)
  const leer = () =>
    page.evaluate(() => {
      const q = (t) => document.querySelector(`[data-testid=${t}]`)?.textContent ?? ''
      return { reposo: q('reposo'), estiramiento: q('estiramiento'), carga: q('carga'), repeticiones: Number(q('repeticiones')) || 0, constancia: q('constancia'), cuadros: q('cuadros'), indicacion: q('indicacion') }
    })
  let maxEstiramiento = 0
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(500)
    const v = await leer()
    maxEstiramiento = Math.max(maxEstiramiento, parseInt(v.estiramiento) || 0)
  }
  const fin = await leer()
  await navegador.close()

  console.log(`Reposo: ${fin.reposo} · repeticiones: ${fin.repeticiones} · estiramiento máximo: ${maxEstiramiento} % · constancia: ${fin.constancia} · seguimiento: ${fin.cuadros}`)
  const fallas = []
  if (errores.length) fallas.push(`errores en la página: ${errores.join(' | ')}`)
  if (fin.repeticiones < 3) fallas.push(`se esperaban 3 repeticiones o más y hubo ${fin.repeticiones}`)
  if (maxEstiramiento < 25 || maxEstiramiento > 60) fallas.push(`estiramiento máximo fuera de lo esperado (25–60 %): ${maxEstiramiento} %`)
  if (fallas.length) {
    console.error(`FALLA\n- ${fallas.join('\n- ')}`)
    process.exitCode = 1
  } else console.log('OK')
} finally {
  rmSync(carpeta, { recursive: true, force: true })
}
