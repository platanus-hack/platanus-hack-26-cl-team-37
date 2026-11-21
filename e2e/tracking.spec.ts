// F07: las tres fuentes de manos arrancan en el navegador real (Chromium con cámara falsa).
// Todavía no hay pantalla que las use (F08 calibración), así que se importa el módulo del servidor dev de Vite.
import { expect, test } from '@playwright/test'

type Resumen = { estado: string; manos: number; lados: string[]; puntos: number; fps: number; luz: number | null; delegado?: string | null; detalle?: string | null }

async function probarFuente(page: import('@playwright/test').Page, search: string, esperar: string[], msMax = 25_000, msFps = 1000): Promise<Resumen> {
  return page.evaluate(
    async ({ search, esperar, msMax, msFps }) => {
      const ruta = '/src/tracking/fuentes.ts'
      const mod = await import(/* @vite-ignore */ ruta)
      const fuente = await mod.crearFuente(mod.configDesdeUrl(search))
      await fuente.iniciar()
      const t0 = performance.now()
      while (!esperar.includes(fuente.estado) && performance.now() - t0 < msMax) await new Promise((r) => setTimeout(r, 100))
      // un rato más para medir fps
      await new Promise((r) => setTimeout(r, msFps))
      const u = fuente.ultimo
      const r = {
        estado: fuente.estado,
        manos: u?.manos.length ?? 0,
        lados: (u?.manos ?? []).map((m: { lado: string }) => m.lado),
        puntos: u?.manos[0] ? u.manos[0].landmarks.length + u.manos[0].worldLandmarks.length : 0,
        fps: Math.round(fuente.fps * 10) / 10,
        luz: fuente.luminancia,
        delegado: (fuente as { delegado?: string | null }).delegado ?? null,
        detalle: fuente.detalleError,
      }
      // las simuladas siguen corriendo (control en vivo); la cámara se apaga
      if (fuente.tipo === 'camara') fuente.detener()
      return r
    },
    { search, esperar, msMax, msFps },
  )
}

test.describe('fuentes de manos (F07)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/acceso')
  })

  test('sintetica: detecta una mano de 21+21 puntos a ~30 fps', async ({ page }) => {
    const r = await probarFuente(page, '?fuente=sintetica&guion=quieta&lado=izquierda', ['detectada'])
    expect(r).toMatchObject({ estado: 'detectada', manos: 1, lados: ['izquierda'], puntos: 42, luz: 140 })
    expect(r.fps).toBeGreaterThan(20)
    // control en vivo para los e2e de los juegos
    const estado = await page.evaluate(async () => {
      const f = (globalThis as unknown as { __manoviva: { fuente: { ocultar(): void; estado: string } } }).__manoviva.fuente
      f.ocultar()
      await new Promise((r) => setTimeout(r, 600))
      return f.estado
    })
    expect(['perdida', 'buscando']).toContain(estado)
  })

  test('grabacion: reproduce la demo JSON', async ({ page }) => {
    const r = await probarFuente(page, '?fuente=grabacion', ['detectada'])
    expect(r).toMatchObject({ estado: 'detectada', manos: 1, lados: ['derecha'], puntos: 42 })
  })

  // auto = GPU con respaldo; en headless la GPU es por software (<1 fps) y debe pasar sola a CPU. cpu = forzado.
  for (const delegado of ['auto', 'cpu']) test(`camara (${delegado}): con la cámara falsa carga MediaPipe local y queda buscando la mano, sin enviar nada`, async ({ page }) => {
    test.setTimeout(60_000)
    const salientes: string[] = []
    // Las fuentes de Google (index.html) son archivos estáticos que se piden con GET y no llevan datos de la cámara:
    // se permiten solo esos dos orígenes y solo con GET. Cualquier otra salida (p. ej. odml.pa.googleapis.com) falla.
    const FUENTES_WEB = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])
    page.on('request', (req) => {
      const u = new URL(req.url())
      if (req.method() === 'GET' && FUENTES_WEB.has(u.host)) return
      if (req.method() !== 'GET' || u.host !== new URL(page.url()).host) salientes.push(`${req.method()} ${req.url()}`)
    })
    const r = await probarFuente(page, `?fuente=camara&delegado=${delegado}`, ['buscando', 'detectada', 'error', 'sin camara', 'sin permiso'], 40_000, delegado === 'auto' ? 12000 : 3000)
    console.log(`cámara falsa: estado=${r.estado} delegado=${r.delegado} fps=${r.fps} luz=${r.luz?.toFixed?.(0)} ${r.detalle ?? ''}`)
    expect(r.estado, r.detalle ?? '').toBe('buscando') // la imagen de prueba de Chromium no tiene manos
    expect(r.fps).toBeGreaterThan(5)
    expect(r.luz).not.toBeNull()
    // MediaPipe sale de la propia app (public/mediapipe), no de un CDN, y ningún cuadro se envía.
    expect(salientes.filter((s) => !s.includes('supabase.co'))).toEqual([])
  })
})
