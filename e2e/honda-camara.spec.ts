// F39 · Honda con la CÁMARA (MediaPipe real, no manos simuladas): un video hace de cámara de Chromium. Dos manos reales
// (foto de prueba de MediaPipe, la segunda en espejo) se separan y vuelven en ciclos de 20 s: un tiro a la zona verde
// sostenido 2,5 s y un tiro corto. Comprueba que con el modelo real, sus huecos y su ruido, la honda marca el cero sola,
// acierta los tiros buenos y marca cortos los cortos, sin tiros partidos ni tirones falsos.
// Necesita ffmpeg (si no está, se salta). Sesión falsa: no toca la BD. El video vive en una carpeta temporal.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { entrarComo } from './ayudas.ts'
import { HORIZONTAL, ID_FALSO, esperarFase, sesionFalsa, type Ventana } from './juegos.ts'

const CARPETA = join(tmpdir(), 'manoviva-honda-camara')
const VIDEO = join(CARPETA, 'honda.y4m')
const FOTO = 'https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg'
const hayFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

type Estado = { fase: string; reposoCm: number | null; kg: number | null; tiros: { resultado: string; picoKg: number; sostenidoS: number }[] }
const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva?.juego?.estado() as unknown) as Promise<Estado | undefined>

/**
 * Separación entre las manos (px) en el ciclo de 20 s. Con la foto de prueba el largo entre palmas es ≈ separación +
 * 183 px (medido con el banco del laboratorio: 110 → 230 px da 41 %), así que 242 px ≈ 45 % de estiramiento (dentro de
 * la zona verde del nivel 1: 30 a 65 %) y 150 px ≈ 14 % (corto).
 */
function separacion(): string {
  const u = 'mod(t\\,20)'
  const tramo = (t0: number, pico: number) =>
    `if(lt(${u}\\,${t0 + 3})\\,110\\,if(lt(${u}\\,${t0 + 4.2})\\,110+${pico - 110}*(${u}-${t0 + 3})/1.2\\,if(lt(${u}\\,${t0 + 6.7})\\,${pico}\\,if(lt(${u}\\,${t0 + 7.9})\\,${pico}-${pico - 110}*(${u}-${t0 + 6.7})/1.2\\,110))))`
  return `if(lt(${u}\\,10)\\,${tramo(0, 242)}\\,${tramo(10, 150)})`
}

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${VIDEO}`] }, permissions: ['camera'] })

test.beforeAll(async () => {
  if (!hayFfmpeg || existsSync(VIDEO)) return
  mkdirSync(CARPETA, { recursive: true })
  const foto = join(CARPETA, 'mano.jpg')
  const r = await fetch(FOTO)
  if (!r.ok) throw new Error(`no se pudo bajar la foto de prueba (${r.status})`)
  writeFileSync(foto, Buffer.from(await r.arrayBuffer()))
  const sep = separacion()
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0xd9d4cc:s=640x480:r=15:d=40',
    '-loop', '1', '-i', foto,
    '-filter_complex',
    `[1]scale=-1:170,format=rgba,split[l][r0];[r0]hflip[r];` +
      `[0][l]overlay=x='320-(${sep})/2-overlay_w':y=(main_h-overlay_h)/2:shortest=1[a];` +
      `[a][r]overlay=x='320+(${sep})/2':y=(main_h-overlay_h)/2:shortest=1,format=yuv420p`,
    '-t', '40', '-r', '15', '-f', 'yuv4mpegpipe', `${VIDEO}.part`,
  ])
  execFileSync('mv', [`${VIDEO}.part`, VIDEO])
})

test.describe('Honda con cámara (MediaPipe real)', () => {
  test.skip(!hayFfmpeg, 'necesita ffmpeg')
  test('nivel 1: cero automático, los tiros a la zona verde aciertan y los cortos quedan cortos', async ({ page, context }) => {
    test.setTimeout(180_000)
    await entrarComo(context, 'prueba')
    await sesionFalsa(page, 'honda', 5, 0, 1)
    await page.setViewportSize(HORIZONTAL)
    await page.goto(`/sesion/${ID_FALSO}/jugar`)
    await esperarFase(page, 'jugando', 40_000)
    // MediaPipe arranca y el cero se marca solo con las manos quietas.
    await expect.poll(async () => (await estado(page))?.reposoCm ?? null, { timeout: 40_000 }).not.toBeNull()
    // Cada ciclo de 20 s trae un tiro bueno y uno corto.
    // El video ya corre cuando MediaPipe termina de arrancar: el cero puede caer a mitad de un ciclo y el primer tiro sale
    // parcial. Se juzga desde el segundo.
    await expect.poll(async () => (await estado(page))?.tiros.length ?? 0, { timeout: 90_000, intervals: [1_000] }).toBeGreaterThanOrEqual(5)
    const e = (await estado(page))!
    const resultados = e.tiros.slice(1).map((t) => t.resultado)
    console.log(`HONDA-CAMARA reposo ${e.reposoCm} cm · tiros ${e.tiros.map((t) => `${t.resultado} ${t.picoKg} kg ${t.sostenidoS} s`).join(' · ')}`)
    expect(resultados.filter((r) => r === 'acierto').length).toBeGreaterThanOrEqual(2)
    expect(resultados.filter((r) => r === 'corto').length).toBeGreaterThanOrEqual(1)
    expect(resultados).not.toContain('largo')
    // Alternan bueno y corto: ningún tiro se partió en dos.
    for (let i = 1; i < resultados.length; i++) expect(resultados[i] === 'corto').not.toBe(resultados[i - 1] === 'corto')
    await page.screenshot({ path: process.env.CAPTURAS ? `${process.env.CAPTURAS}/honda-camara.png` : 'test-results/honda-camara.png' })
  })
})
