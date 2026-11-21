// F24 · Atrapa burbujas sobre /sesion/:id/jugar con ?fuente=sintetica (horizontal 844×390).
// La mano sintética se lleva a la burbuja objetivo en lazo cerrado: el juego publica la posición del objetivo y la de la
// palma (window.__manoviva.juego.estado()) y la prueba corrige la pose hasta que la palma queda dentro de la burbuja.
// - Sesión REAL, nivel 1, meta 3, mano derecha: la mano a medio abrir sobre la burbuja NO la revienta (intento_cerrado y
//   la pista lo recuerda); abierta del todo sí. Meta 3/3, eventos, métricas (extensión, alcance, tiempo por burbuja, mapa de zonas)
//   y /sensacion. Mide el fps. Con CAPTURA_BURBUJAS=1 guarda docs/capturas/atrapa-burbujas.png.
// - Sesión REAL con mano IZQUIERDA (lado: 'izquierda'): lo mismo, y el resumen guarda alcance y zonas de la izquierda.
// - Alcance máximo: solo cuenta el de cada burbuja reventada y solo de la mano de la sesión: una segunda mano sobre la
//   burbuja no la revienta ni suma, y mover la mano lejos (acomodar el teléfono, bajarla) no infla el alcance.
// - Sesión REAL nivel 5 (3 s de vida) con el parámetro `zona: 'derecha'` INYECTADO directo en los parámetros de la sesión
//   (el editor de planes de P2 todavía no lo ofrece): todas las burbujas aparecen a la derecha, una que se deja sin tocar
//   expira (expirada) y aparece otra.
import { expect, test, type Page } from '@playwright/test'
import { clienteComo, entrarComo, vigilarErrores } from './ayudas.ts'
import { HORIZONTAL, crearSesion, esperarFase, juego, limpiar, parametros, type Ventana } from './juegos.ts'

type Lado = 'derecha' | 'izquierda'
type V3 = { x: number; y: number; z: number }
type Estado = {
  contador: number
  meta: number
  objetivo: (V3 & { radio: number; celda: number; edadMs: number; vidaMs: number }) | null
  umbral: number
  extension: Partial<Record<Lado, number>>
  dentro: Partial<Record<Lado, boolean>>
  palma: Partial<Record<Lado, V3>>
  reposoListo: Partial<Record<Lado, boolean>>
  zonaPct: number
  limiteZona: string | null
  intentosCerrados: number
  expiradas: number
  alcanceMax: number
  lados: Lado[]
}
const SIN_FPS = '[data-testid=fps] { display: none !important }'

const estado = (p: Page) => p.evaluate(() => (globalThis as unknown as Ventana).__manoviva!.juego!.estado() as unknown) as Promise<Estado>
const poner = (p: Page, pose: object, lado: Lado) => p.evaluate(([po, l]) => (globalThis as unknown as Ventana).__manoviva!.fuente!.fijarPose(po as object, l as string), [pose, lado] as const)
const recorte = (v: number) => Math.min(1, Math.max(0, v))

/** Pose de la mano sintética (imagen cruda + distancia) cuya palma cae en `p` de la escena (inverso de anclaEnEscena). */
function poseDe(p: V3) {
  const u = recorte((p.x + 2.1) / 4.2)
  const v = recorte((p.y - 0.3) / 1.3)
  const d = recorte((p.z + 0.9) / 1.8)
  return { x: 0.9 - 0.8 * u, y: 0.9 - 0.8 * v, distanciaCm: 30 + 35 * d }
}
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, 0.5 * (a.z - b.z))
const REPOSO = (lado: Lado) => ({ apertura: 1, x: lado === 'derecha' ? 0.42 : 0.58, y: 0.55, distanciaCm: 50 })

/** Lleva la palma al centro de la burbuja objetivo con la apertura pedida (corrige la pose hasta que coincide). */
async function alObjetivo(page: Page, lado: Lado, apertura: number): Promise<object> {
  let cmd: V3 | null = null
  const inicial = (await estado(page)).contador
  for (let i = 0; i < 8; i++) {
    const e = await estado(page).catch(() => null)
    if (!e || e.contador > inicial) return { apertura, ...poseDe(cmd!) } // ya reventó (o terminó el juego): no perseguir la siguiente
    if (!e.objetivo) {
      if (i > 0) return { apertura, ...poseDe(cmd!) } // la burbuja ya reventó al llegar
      throw new Error('no hay objetivo')
    }
    const o = e.objetivo
    cmd ??= { x: o.x, y: o.y, z: o.z }
    const palma = e.palma[lado]
    if (palma && i > 0) {
      if (dist(palma, o) < o.radio * 0.4) return { apertura, ...poseDe(cmd) }
      cmd = { x: cmd.x + (o.x - palma.x), y: cmd.y + (o.y - palma.y), z: cmd.z + (o.z - palma.z) }
    }
    await poner(page, { apertura, ...poseDe(cmd) }, lado)
    await page.waitForTimeout(350)
  }
  const e = await estado(page)
  expect(e.palma[lado] && e.objetivo && dist(e.palma[lado]!, e.objetivo), 'la palma llegó a la burbuja').toBeLessThan(e.objetivo!.radio)
  return { apertura, ...poseDe(cmd!) }
}

/** Reposo: mano abierta, quieta fuera de las burbujas, hasta que el juego fija la posición de reposo (1 s). */
async function enReposo(page: Page, lado: Lado) {
  await poner(page, REPOSO(lado), lado)
  await expect.poll(async () => (await estado(page)).reposoListo[lado], { timeout: 8_000 }).toBe(true)
}

/** Si la palma quedó dentro de la burbuja (apareció sobre la mano), la saca: una burbuja solo cuenta al entrar a ella. */
async function salirDeLaBurbuja(page: Page, lado: Lado) {
  if (!(await estado(page)).dentro[lado]) return
  await poner(page, { apertura: 1, x: lado === 'derecha' ? 0.8 : 0.2, y: 0.55, distanciaCm: 50 }, lado)
  await expect.poll(async () => (await estado(page)).dentro[lado], { timeout: 3_000 }).toBe(false)
}

/** Reventar la burbuja actual con la mano bien abierta y esperar a que cuente. */
async function reventar(page: Page, lado: Lado) {
  const antes = (await estado(page)).contador
  await salirDeLaBurbuja(page, lado)
  await alObjetivo(page, lado, 1)
  await expect.poll(async () => (await estado(page)).contador, { timeout: 6_000 }).toBe(antes + 1)
  // La mano se queda donde está: la burbuja siguiente aparece lejos de ella. Volver de golpe al reposo podría reventarla sin querer.
  await expect.poll(async () => (await estado(page)).objetivo !== null, { timeout: 4_000 }).toBe(true)
  await salirDeLaBurbuja(page, lado)
}

async function sesionDelLado(page: Page, lado: Lado, id: string, extra = '') {
  await page.setViewportSize(HORIZONTAL)
  await page.goto(`/sesion/${id}/jugar?fuente=sintetica&guion=quieta&lado=${lado}&depuracion=1${extra}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Atrapa burbujas' })).toBeVisible({ timeout: 15_000 })
  await esperarFase(page, 'jugando', 15_000)
}

for (const lado of ['derecha', 'izquierda'] as Lado[]) {
  test(`mano ${lado}: a medio abrir no revienta, bien abierta sí; meta 3/3, métricas y mapa de zonas guardados`, async ({ page, context }, info) => {
    test.setTimeout(150_000)
    await entrarComo(context, 'paciente')
    const desde = new Date(Date.now() - 5_000).toISOString()
    let id = ''
    try {
      id = await crearSesion('atrapa-burbujas', 5, 3, 1, 'paciente', { parametros: { ...parametros(5, 3, 1), mano: lado } })
      const v = vigilarErrores(page)
      const rapier: string[] = []
      page.on('request', (r) => /rapier/i.test(r.url()) && rapier.push(r.url()))
      await sesionDelLado(page, lado, id)

      // Interfaz según la referencia: pista, contador y las tres métricas en vivo.
      await expect(page.getByText('Abre bien la mano y toca la burbuja amarilla')).toBeVisible()
      await expect(page.getByText('Extensión de dedos')).toBeVisible()
      await expect(page.getByText('Alcance máximo')).toBeVisible()
      await expect(page.getByText('Tiempo por burbuja')).toBeVisible()
      await expect(page.getByTestId('contador')).toHaveText('0/3')
      // La primera burbuja espera a que se fije el reposo de la mano (1 s con la mano a la vista).
      await expect.poll(async () => (await estado(page)).objetivo !== null, { timeout: 8_000 }).toBe(true)
      const e0 = await estado(page)
      expect(e0.reposoListo[lado]).toBe(true)
      expect(e0.umbral).toBe(80)
      expect(e0.zonaPct).toBe(40) // zona inicial pequeña, cerca del reposo
      expect(e0.objetivo!.radio).toBe(0.55)

      await enReposo(page, lado)
      await salirDeLaBurbuja(page, lado)
      await expect(page.getByTestId(`mano-${lado}`)).toContainText('Abierta')

      // A medio abrir sobre la burbuja: no se revienta, aunque se quede ahí; el juego anota el intento y la pista lo recuerda.
      const media = await alObjetivo(page, lado, 0.5)
      await expect.poll(async () => (await estado(page)).intentosCerrados, { timeout: 5_000 }).toBeGreaterThanOrEqual(1)
      let e = await estado(page)
      expect(e.dentro[lado]).toBe(true)
      expect(e.extension[lado]!).toBeLessThan(80)
      expect(e.contador).toBe(0)
      expect(e.alcanceMax, 'sin burbujas reventadas no hay alcance máximo, aunque la mano ya se movió').toBe(0)
      await expect(page.getByTestId('vivo-alcance')).not.toContainText('cm')
      await expect(page.getByTestId('pista')).toContainText('Abre más la mano', { timeout: 3_000 })
      await expect(page.getByTestId(`mano-${lado}`)).toContainText('Alcanzando')
      await page.waitForTimeout(800)
      expect((await estado(page)).contador).toBe(0)

      // Bien abierta, en la misma burbuja: revienta (la palma sigue dentro, solo se abren los dedos).
      await poner(page, { ...media, apertura: 1 }, lado)
      await expect(page.getByTestId('contador')).toHaveText('1/3', { timeout: 5_000 })
      await expect(page.getByTestId('vivo-tiempoBurbuja')).toContainText(' s')
      await expect(page.getByTestId('vivo-extension')).toContainText('%')
      const zona1 = (await estado(page)).zonaPct

      await expect.poll(async () => (await estado(page)).objetivo !== null, { timeout: 4_000 }).toBe(true)
      await reventar(page, lado)
      await expect(page.getByTestId('contador')).toHaveText('2/3')
      expect((await estado(page)).zonaPct).toBeGreaterThan(zona1 - 1) // la zona crece con los aciertos
      expect((await estado(page)).zonaPct).toBeGreaterThan(40)
      await expect(page.getByTestId('vivo-alcance')).toContainText('cm')

      // Captura "en acción": la tercera burbuja, la mano llegando abierta pero todavía sin tocarla.
      const j0 = (await juego(page))!
      if (process.env.CAPTURA_BURBUJAS && lado === 'derecha') {
        await poner(page, { ...REPOSO(lado), x: 0.3 }, lado)
        await page.waitForTimeout(700)
        await page.screenshot({ path: 'docs/capturas/atrapa-burbujas.png', style: SIN_FPS })
      }
      await alObjetivo(page, lado, 1)
      await expect(page.getByTestId('meta-cumplida')).toContainText('¡Meta cumplida! 3/3', { timeout: 6_000 })
      if (process.env.CAPTURA_BURBUJAS && lado === 'derecha') await page.screenshot({ path: 'docs/capturas/atrapa-burbujas-meta.png', style: SIN_FPS })
      await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion\\?fuente=sintetica&guion=quieta&lado=${lado}&depuracion=1$`), { timeout: 10_000 })
      expect(rapier, 'Atrapa burbujas no usa física').toEqual([])
      info.annotations.push({ type: 'fps', description: `${j0.fps} fps (calidad ${j0.calidad}, pixel ratio ${j0.pixelRatio})` })
      console.log(`[burbujas ${lado}] fps: ${j0.fps} · calidad ${j0.calidad} · pixel ratio ${j0.pixelRatio}`)

      const sb = await clienteComo('paciente')
      const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
      expect(s.estado).toBe('en curso')
      expect(s.metricas).toMatchObject({ contador: 3, meta: 3, metaCumplida: true, motivoFin: 'meta' })
      const g = s.metricas.juego
      const otra: Lado = lado === 'derecha' ? 'izquierda' : 'derecha'
      const cap = (l: Lado) => (l === 'derecha' ? 'Derecha' : 'Izquierda')
      expect(g).toMatchObject({ burbujas: 3, expiradas: 0 })
      expect(g.intentosCerrados).toBeGreaterThanOrEqual(1)
      expect(g.extensionMedia).toBeGreaterThanOrEqual(80) // extensión de dedos al tocar
      expect(g.extensionMin).toBeGreaterThanOrEqual(80)
      expect(g.tiempoBurbuja).toBeGreaterThan(0.3)
      expect(g.alcanceMax).toBeGreaterThan(3) // cm aprox., desde el reposo hasta la burbuja
      expect(g[`alcanceMax${cap(lado)}`]).toBeGreaterThan(3)
      expect(g[`alcanceMax${cap(otra)}`]).toBeNull() // la otra mano no se vio
      expect(g[`zonas${cap(lado)}Pct`]).toBeGreaterThan(0)
      expect(g[`zonas${cap(lado)}`]).toBeGreaterThan(0) // máscara del mapa de zonas
      expect(g[`zonas${cap(otra)}`]).toBe(0)
      expect(g.precision).toBeGreaterThan(0)
      expect(s.muestras.canales.extension.length).toBe(s.muestras.t.length)
      expect(s.muestras.canales.alcanceCm.length).toBe(s.muestras.t.length)

      const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
      const rev = evs.filter((x) => x.tipo === 'reventada')
      expect(rev).toHaveLength(3)
      for (const r of rev) {
        expect(r.mano).toBe(lado)
        expect(r.objeto).toBe('burbuja')
        expect(r.datos.extension).toBeGreaterThanOrEqual(80)
        expect(r.datos.tiempoMs).toBeGreaterThan(300)
        expect(typeof r.datos.alcanceCm).toBe('number')
      }
      // El alcance máximo del resumen sale SOLO de los eventos 'reventada'.
      expect(g.alcanceMax).toBeCloseTo(Math.max(...rev.map((r) => r.datos.alcanceCm as number)), 1)
      const mostradas = evs.filter((x) => x.tipo === 'objetivo_mostrado')
      expect(mostradas).toHaveLength(3)
      for (const m of mostradas) expect(m.datos).toMatchObject({ radio: 0.55, vidaMs: 0 })
      expect(typeof mostradas[0].datos.x).toBe('number')
      const ic = evs.filter((x) => x.tipo === 'intento_cerrado')
      expect(ic.length).toBeGreaterThanOrEqual(1)
      expect(ic[0].mano).toBe(lado)
      expect(ic[0].datos.extensionMax).toBeLessThan(80)
      expect(evs.some((x) => x.tipo === 'expirada')).toBe(false)
      expect(evs.map((x) => x.seq)).toEqual(evs.map((_, i) => i + 1))
      v.sinErrores()
    } finally {
      limpiar(desde, id)
    }
  })
}

test('nivel 5 (3 s) con el parámetro zona inyectado en la sesión (el plan aún no lo ofrece): todo aparece a la derecha y una burbuja sin tocar expira', async ({ page, context }) => {
  test.setTimeout(120_000)
  await entrarComo(context, 'paciente')
  const desde = new Date(Date.now() - 5_000).toISOString()
  let id = ''
  try {
    id = await crearSesion('atrapa-burbujas', 5, 0, 5, 'paciente', { parametros: { ...parametros(5, 0, 5), mano: 'derecha', zona: 'derecha' } })
    const v = vigilarErrores(page)
    await sesionDelLado(page, 'derecha', id)
    await expect.poll(async () => (await estado(page)).objetivo !== null, { timeout: 8_000 }).toBe(true)
    let e = await estado(page)
    expect(e.limiteZona).toBe('derecha')
    await expect.poll(async () => (await estado(page)).objetivo?.vidaMs, { timeout: 5_000 }).toBe(3000)
    expect((await estado(page)).objetivo?.radio ?? 0.27).toBeCloseTo(0.27, 2)
    await poner(page, { apertura: 1, x: 0.8, y: 0.55, distanciaCm: 50 }, 'derecha') // mano lejos, a la izquierda de la pantalla
    await expect.poll(async () => (await estado(page)).reposoListo.derecha, { timeout: 8_000 }).toBe(true)
    // El botón Reiniciar saca una burbuja nueva: todas dentro de la zona del plan.
    for (let i = 0; i < 8; i++) {
      e = await estado(page)
      if (e.objetivo) expect(e.objetivo.x, `burbuja ${i + 1} a la derecha`).toBeGreaterThanOrEqual(0)
      await page.getByRole('button', { name: 'Reiniciar' }).click()
      await page.waitForTimeout(80)
    }
    // Sin tocar: a los 3 s la burbuja expira y aparece otra.
    const antes = (await estado(page)).expiradas
    await expect.poll(async () => (await estado(page)).expiradas, { timeout: 8_000 }).toBeGreaterThan(antes)
    await expect.poll(async () => (await estado(page)).objetivo !== null, { timeout: 3_000 }).toBe(true)
    expect((await estado(page)).objetivo!.x).toBeGreaterThanOrEqual(0)
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Terminar sesión' }).click()
    await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })
    const sb = await clienteComo('paciente')
    const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
    expect(s.metricas.juego).toMatchObject({ expiradas: expect.any(Number) })
    expect(s.metricas.juego.expiradas).toBeGreaterThanOrEqual(1)
    const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
    const ex = evs.filter((x) => x.tipo === 'expirada')
    expect(ex.length).toBeGreaterThanOrEqual(1)
    expect(ex[0].datos.tiempoMs).toBeGreaterThanOrEqual(2900)
    for (const m of evs.filter((x) => x.tipo === 'objetivo_mostrado')) expect(m.datos.x).toBeGreaterThanOrEqual(0)
    v.sinErrores()
  } finally {
    limpiar(desde, id)
  }
})

test('alcance máximo: una segunda mano sobre la burbuja no cuenta y mover la mano lejos no infla el alcance; solo vale el de las burbujas reventadas', async ({ page, context }) => {
  test.setTimeout(120_000)
  await entrarComo(context, 'paciente')
  const desde = new Date(Date.now() - 5_000).toISOString()
  let id = ''
  try {
    id = await crearSesion('atrapa-burbujas', 5, 1, 1, 'paciente', { parametros: { ...parametros(5, 1, 1), mano: 'derecha' } })
    const v = vigilarErrores(page)
    await sesionDelLado(page, 'derecha', id)
    await expect.poll(async () => (await estado(page)).objetivo !== null, { timeout: 8_000 }).toBe(true)
    await enReposo(page, 'derecha')
    await salirDeLaBurbuja(page, 'derecha')
    const o = (await estado(page)).objetivo!

    // La mano izquierda (no es la de la sesión) aparece abierta justo sobre la burbuja y se queda ahí.
    await page.evaluate(
      ([po, pi]) => {
        const f = (globalThis as unknown as Ventana).__manoviva!.fuente as unknown as { guion: { manos: { lado: string; poses: object[] }[] }; cargarGuion(g: object): void }
        const der = f.guion.manos[0]
        f.cargarGuion({ ...f.guion, manos: [der, { lado: 'izquierda', poses: [{ ...der.poses[0], ...(po as object), ...(pi as object), t: 0 }] }] })
      },
      [{ apertura: 1 }, poseDe(o)] as const,
    )
    await page.waitForTimeout(1800)
    let e = await estado(page)
    expect(e.palma.izquierda, 'la mano que no es de la sesión se ignora').toBeUndefined()
    expect(e.contador).toBe(0)
    expect(e.intentosCerrados).toBe(0)
    expect(e.alcanceMax).toBe(0)

    // La mano de la sesión se aleja mucho (acomoda el teléfono, la baja al regazo): sin burbuja reventada no hay alcance.
    await poner(page, { apertura: 1, x: 0.95, y: 0.95, distanciaCm: 50 }, 'derecha')
    await page.waitForTimeout(1200)
    e = await estado(page)
    expect(e.contador).toBe(0)
    expect(e.alcanceMax, 'mover la mano no es alcance').toBe(0)
    await expect(page.getByTestId('vivo-alcance')).not.toContainText('cm')

    // Reventar la burbuja: ahora sí, y solo con el alcance de ese momento.
    await alObjetivo(page, 'derecha', 1)
    await expect(page).toHaveURL(new RegExp(`/sesion/${id}/sensacion`), { timeout: 10_000 })
    const sb = await clienteComo('paciente')
    const s = (await sb.from('sesiones').select('*').eq('id', id).single()).data!
    const g = s.metricas.juego
    const evs = (await sb.from('eventos_sesion').select('*').eq('sesion_id', id).order('seq')).data!
    const rev = evs.filter((x) => x.tipo === 'reventada')
    expect(rev).toHaveLength(1)
    expect(rev.every((r) => r.mano === 'derecha')).toBe(true)
    expect(g.burbujas).toBe(1)
    expect(g.alcanceMax).toBeCloseTo(rev[0].datos.alcanceCm as number, 1)
    expect(g.alcanceMaxDerecha).toBeCloseTo(rev[0].datos.alcanceCm as number, 1)
    expect(g.alcanceMaxIzquierda).toBeNull()
    v.sinErrores()
  } finally {
    limpiar(desde, id)
  }
})
