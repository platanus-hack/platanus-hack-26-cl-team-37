// Prueba de punta a punta del laboratorio de banda con un video como cámara: MediaPipe en modo video, filtros, reposo
// automático y conteo de repeticiones reales, sin persona frente a la cámara.
//
//   node scripts/probar-banda-video.mjs [url] [variante|todas]
//   (url por defecto http://localhost:5174/laboratorio; el servidor debe estar arriba)
//   `marcas` prueba el modo de marcas pintadas en la banda (dos puntos verdes sobre una banda azul).
//
// Variantes que imitan cámaras reales: limpio (por defecto), ruido (sensor con poca luz), borroso (foco o movimiento),
// baja (320×240 reescalado), oscuro (poca luz y contraste), lento (8 cuadros por segundo) y huecos (una mano desaparece
// 150 ms a mitad de cada estiramiento, como cuando MediaPipe la pierde). `todas` corre cada una y muestra una tabla.
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
const pedida = process.argv[3] ?? 'limpio'
const VARIANTES = {
  limpio: { cps: 15, filtro: '' },
  // Ruido moderado. Con ruido fuerte (alls 18 o más) MediaPipe no detecta ninguna mano aunque se vean claras: es un
  // límite del modelo, y la pantalla pide más luz cuando pasa.
  ruido: { cps: 15, filtro: ',noise=alls=8:allf=t' },
  borroso: { cps: 15, filtro: ',gblur=sigma=2.5' },
  baja: { cps: 15, filtro: ',scale=320:240,scale=640:480' },
  oscuro: { cps: 15, filtro: ',eq=brightness=-0.22:contrast=0.65,noise=alls=12:allf=t' },
  lento: { cps: 8, filtro: '' },
  huecos: { cps: 15, filtro: '', huecos: true },
  // Banda azul entre las manos con dos marcas verdes a ±30 % de su largo: el modo marcas mide la banda misma, así que
  // el estiramiento esperado es el real del video (230 ÷ 110 − 1 = 109 %), no el de los nudillos.
  marcas: { cps: 15, filtro: '', marcas: true, esperado: [95, 120] },
}
if (pedida !== 'todas' && !(pedida in VARIANTES)) throw new Error(`variante desconocida: ${pedida} (${Object.keys(VARIANTES).join(', ')}, todas)`)
const FOTO = 'https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg'
const carpeta = mkdtempSync(join(tmpdir(), 'banda-video-'))

async function correr(nombre, foto) {
  const v = VARIANTES[nombre]
  // Separación entre las manos (px) según el momento del ciclo de 8 s.
  const u = 'mod(t\\,8)'
  const sep = `if(lt(${u}\\,3)\\,110\\,if(lt(${u}\\,4.5)\\,110+120*(${u}-3)/1.5\\,if(lt(${u}\\,5.5)\\,230\\,if(lt(${u}\\,7)\\,230-120*(${u}-5.5)/1.5\\,110))))`
  const video = join(carpeta, `banda-${nombre}.y4m`)
  const ocultar = v.huecos ? `:enable='not(between(${u}\\,3.7\\,3.85))'` : ''
  // Con marcas: dos mitades de banda azul (115 px) ancladas en cada mano cubren justo la separación, y dos marcas verdes
  // a ±30 % del largo desde el centro.
  const banda = v.marcas
    ? `[2]split[b1][b2];[3]split[m1][m2];` +
      `[0][b1]overlay=x='320-(${sep})/2':y=235:shortest=1[x1];[x1][b2]overlay=x='320+(${sep})/2-115':y=235:shortest=1[x2];` +
      `[x2][m1]overlay=x='320-0.3*(${sep})-6':y=233:shortest=1[x3];[x3][m2]overlay=x='320+0.3*(${sep})-6':y=233:shortest=1[bg];`
    : '[0]null[bg];'
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=0xd9d4cc:s=640x480:r=${v.cps}:d=24`,
    '-loop', '1', '-i', foto,
    '-f', 'lavfi', '-i', `color=c=0x2a4fbf:s=115x10:r=${v.cps}:d=24`,
    '-f', 'lavfi', '-i', `color=c=0x28dc3c:s=12x14:r=${v.cps}:d=24`,
    '-filter_complex',
    banda +
      `[1]scale=-1:170,format=rgba,split[l][r0];[r0]hflip[r];` +
      `[bg][l]overlay=x='320-(${sep})/2-overlay_w':y=(main_h-overlay_h)/2:shortest=1[a];` +
      `[a][r]overlay=x='320+(${sep})/2':y=(main_h-overlay_h)/2:shortest=1${ocultar}${v.filtro},format=yuv420p`,
    '-t', '24', '-r', String(v.cps), '-f', 'yuv4mpegpipe', video,
  ])

  const navegador = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] })
  const page = await navegador.newPage({ viewport: { width: 1280, height: 900 } })
  await page.context().grantPermissions(['camera'])
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.addInitScript((marcas) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('manoviva.laboratorio.')) localStorage.removeItem(k)
    if (marcas) {
      localStorage.setItem('manoviva.laboratorio.modo', JSON.stringify('marcas'))
      // El verde de las marcas del video (#28dc3c), como si se hubiera tocado una en pantalla.
      localStorage.setItem('manoviva.laboratorio.colorMarca', JSON.stringify({ h: 127, s: 0.82, v: 0.86 }))
    }
  }, !!v.marcas)
  await page.goto(url)
  const leer = () =>
    page.evaluate(() => {
      const q = (t) => document.querySelector(`[data-testid=${t}]`)?.textContent ?? ''
      return { reposo: q('reposo'), estiramiento: q('estiramiento'), repeticiones: Number(q('repeticiones')) || 0, constancia: q('constancia'), cuadros: q('cuadros') }
    })
  // MediaPipe puede tardar varios segundos en arrancar (en Chromium sin GPU prueba GPU y cae a CPU): la ventana de
  // medición parte cuando el seguimiento ya corre, así todas las variantes miden lo mismo.
  for (let i = 0; i < 60 && (parseInt((await leer()).cuadros) || 0) < 5; i++) await page.waitForTimeout(500)
  let maxEstiramiento = 0
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(500)
    const l = await leer()
    maxEstiramiento = Math.max(maxEstiramiento, parseInt(l.estiramiento) || 0)
  }
  const fin = await leer()
  await navegador.close()
  rmSync(video, { force: true })
  const fallas = []
  if (errores.length) fallas.push(`errores en la página: ${errores.join(' | ')}`)
  // En 35 s de video en bucle caben 4 ciclos completos; con 3 o menos se perdió alguno, con 5 o más se partió alguno.
  if (fin.repeticiones < 3 || fin.repeticiones > 5) fallas.push(`repeticiones fuera de lo esperado (3–5): ${fin.repeticiones}`)
  const [min, max] = v.esperado ?? [25, 60]
  if (maxEstiramiento < min || maxEstiramiento > max) fallas.push(`estiramiento máximo fuera de lo esperado (${min}–${max} %): ${maxEstiramiento} %`)
  return { nombre, ...fin, maxEstiramiento, fallas }
}

try {
  const foto = join(carpeta, 'mano.jpg')
  const respuesta = await fetch(FOTO)
  if (!respuesta.ok) throw new Error(`no se pudo bajar la foto de prueba (${respuesta.status})`)
  writeFileSync(foto, Buffer.from(await respuesta.arrayBuffer()))
  const nombres = pedida === 'todas' ? Object.keys(VARIANTES) : [pedida]
  let falla = false
  for (const n of nombres) {
    const r = await correr(n, foto)
    console.log(`${r.nombre.padEnd(8)} reposo ${r.reposo.padEnd(6)} · ${String(r.repeticiones).padStart(2)} repeticiones · estiramiento máx. ${r.maxEstiramiento} % · constancia ${r.constancia} · seguimiento ${r.cuadros}${r.fallas.length ? `  ← FALLA: ${r.fallas.join('; ')}` : '  OK'}`)
    falla ||= r.fallas.length > 0
  }
  if (falla) process.exitCode = 1
} finally {
  rmSync(carpeta, { recursive: true, force: true })
}
