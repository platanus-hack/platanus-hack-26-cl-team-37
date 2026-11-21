import { describe, expect, it } from 'vitest'
import type { Auditoria, EventoSesion, Sesion } from '../domain/types'
import { csvEventos, csvSesiones, filaCsv, BOM, COLUMNAS_SESIONES } from './csv'
import { cambiosPlan, etiquetasSesion, textoCambio, textoCantidad, unirHistorial } from './filas'
import { datosPdf, nombreArchivo, PIE_PDF } from './pdfDatos'

const ses = (id: string, inicio: string, extra: Partial<Sesion> = {}): Sesion => ({
  id, pacienteId: 'p', planVersion: 1, juego: 'caja-juguetes',
  parametros: { mano: 'ambas', nivel: 2, duracionMin: 6, metaAgarres: 12, metaPinzaCm: 7, prescritoPor: 'Klgo. Diego M.' },
  inicio, fin: null, estado: 'cerrada', calibracion: null,
  metricas: { agarres: 12, agarresIzq: 5, agarresDer: 7, intentos: 13, precision: 0.923, tiempoMedioAgarreS: 3.84, aperturaMaxCm: 6.1, flexionMax: { pulgar: 1, indice: 2, medio: 3, anular: 4, menique: 5 }, flexionIndiceMax: 68, suavidad: 80, calidadRegistro: 0.95, duracionS: 360, fpsMedio: 30, metaCumplida: true },
  muestras: null, dolorEVA: 2, esfuerzo: 'Suave', nota: null, dispositivo: { modelo: 'x', camara: 'Cámara frontal', fps: 30 },
  versionApp: '1.0.0', versionModelo: 'MediaPipe Hands', hash: 'a'.repeat(64), ...extra,
})

const aud = (id: number, cuando: string, antes: unknown, despues: unknown, extra: Partial<Auditoria> = {}): Auditoria => ({
  id, quien: 'u1', cuando, accion: antes ? 'plan_actualizado' : 'plan_creado', entidad: 'plan', entidadId: 'x', pacienteId: 'p',
  antes: antes as Auditoria['antes'], despues: despues as Auditoria['despues'], ...extra,
})

const item = (juego: string, nivel: number) => ({ juego, nivel, duracionMin: 6, mano: 'ambas', metaAgarres: 10, metaPinzaCm: 7 })

describe('historial: mezcla y orden', () => {
  it('mezcla sesiones cerradas y cambios de plan, lo más reciente primero, y cuenta solo sesiones', () => {
    const filas = unirHistorial(
      [ses('S-1', '2026-11-20T10:00:00Z'), ses('S-3', '2026-11-21T10:00:00Z'), ses('S-2', '2026-11-19T10:00:00Z', { estado: 'en curso' })],
      [aud(1, '2026-11-20T12:00:00Z', { version: 1, items: [item('caja-juguetes', 1)] }, { version: 2, items: [item('caja-juguetes', 2)] }), { ...aud(2, '2026-11-22T00:00:00Z', null, {}), entidad: 'alerta' }],
      { u1: 'Klgo. Diego M.' },
    )
    expect(filas.map((f) => f.clave)).toEqual(['s-S-3', 'a-1', 's-S-1'])
    expect(filas.filter((f) => f.tipo === 'sesion')).toHaveLength(2)
    const plan = filas[1]
    expect(plan.tipo === 'plan' && plan.quien).toBe('Klgo. Diego M.')
    expect(plan.tipo === 'plan' && plan.cambios.map(textoCambio)).toEqual(['Nivel 1 → 2'])
  })

  it('texto del contador', () => {
    expect(textoCantidad(19)).toBe('19 sesiones registradas')
    expect(textoCantidad(1)).toBe('1 sesión registrada')
  })

  it('cambios de plan: sesiones por semana, umbral, ejercicios agregados y quitados', () => {
    const c = cambiosPlan(
      { sesionesPorSemana: 3, umbralDolor: 5, items: [item('caja-juguetes', 1), item('movilidad-guiada', 1)] },
      { sesionesPorSemana: 4, umbralDolor: 4, items: [{ ...item('caja-juguetes', 1), duracionMin: 8, metaAgarres: 12 }, item('torre-cubos', 1)] },
    )
    expect(c.map((x) => `${x.juego ?? ''}|${textoCambio(x)}`)).toEqual([
      '|Sesiones por semana 3 → 4',
      '|Umbral de dolor 5 → 4',
      'Caja de juguetes|Duración 6 min → 8 min',
      'Caja de juguetes|Meta 10 → 12',
      'Torre de cubos|Ejercicio agregado',
      'Movilidad guiada|Ejercicio quitado',
    ])
    expect(cambiosPlan(null, { items: [item('caja-juguetes', 1)] }).map(textoCambio)).toEqual(['Plan inicial: 1 ejercicios'])
    expect(cambiosPlan({ items: [] }, null)).toEqual([])
  })
})

describe('historial: etiquetas', () => {
  it('contador/meta con tono, precisión y dolor', () => {
    expect(etiquetasSesion(ses('S', '2026-11-21T10:00:00Z'))).toEqual([
      { texto: '12/12', tono: 'ok' },
      { texto: '92%', tono: 'gris' },
      { texto: 'Dolor 2', tono: 'gris' },
    ])
    const corta = ses('S', '2026-11-21T10:00:00Z', { metricas: { ...ses('x', '').metricas!, agarres: 8, meta: 10, contador: 8, precision: 0.81 }, dolorEVA: null })
    expect(etiquetasSesion(corta)).toEqual([{ texto: '8/10', tono: 'malo' }, { texto: '81%', tono: 'gris' }])
  })
})

describe('historial: CSV', () => {
  it('escapa, usa coma decimal y protege fórmulas', () => {
    expect(filaCsv(['a;b', 'c"d', 1.5, null, true, '=1+1', 'x\ny', -3])).toBe('"a;b";"c""d";1,5;;sí;\'=1+1;"x\ny";-3')
  })

  it('una fila por sesión con BOM, decimales con coma e integridad', () => {
    const t = csvSesiones([ses('S-20261121-02', '2026-11-21T13:32:00Z')], { 'S-20261121-02': 'verificado' })
    expect(t.startsWith(BOM)).toBe(true)
    const [cab, fila] = t.slice(1).trimEnd().split('\r\n')
    expect(cab.split(';')).toEqual(COLUMNAS_SESIONES)
    const c = fila.split(';')
    expect(c[0]).toBe('S-20261121-02')
    expect(c[COLUMNAS_SESIONES.indexOf('precision_pct')]).toBe('92,3')
    expect(c[COLUMNAS_SESIONES.indexOf('apertura_max_cm_aprox')]).toBe('6,1')
    expect(c[COLUMNAS_SESIONES.indexOf('integridad')]).toBe('verificado')
    expect(c[COLUMNAS_SESIONES.indexOf('hash_sha256')]).toBe('a'.repeat(64))
    expect(c).toHaveLength(COLUMNAS_SESIONES.length)
  })

  it('eventos ordenados por sesión y secuencia, con datos en JSON', () => {
    const e = (sesionId: string, seq: number): EventoSesion => ({ sesionId, seq, t: seq * 100, tipo: 'pausa', mano: null, objeto: null, datos: seq === 2 ? { motivo: 'menu' } : null })
    const t = csvEventos([e('S-2', 1), e('S-1', 2), e('S-1', 1)])
    const lineas = t.slice(1).trimEnd().split('\r\n')
    expect(lineas.slice(1).map((l) => l.split(';').slice(0, 2).join('/'))).toEqual(['S-1/1', 'S-1/2', 'S-2/1'])
    expect(lineas[2]).toContain('"{""motivo"":""menu""}"')
  })
})

describe('historial: datos del PDF', () => {
  const entrada = {
    paciente: { nombre: 'Carmen R.', manoAfectada: 'derecha' },
    terapeuta: 'Klgo. Diego M.',
    generadoPor: 'Carmen R.',
    generadoEn: new Date('2026-11-21T15:00:00'),
    periodo: 'Últimos 7 días',
    sesiones: [ses('S-2', '2026-11-21T10:00:00'), ses('S-1', '2026-11-20T10:00:00', { dolorEVA: 4 })],
    integridad: { 'S-1': 'verificado', 'S-2': 'alterado' } as const,
  }

  it('encabezado, tabla de métricas, dolor, IDs y hashes', () => {
    const d = datosPdf({ ...entrada, integridad: { ...entrada.integridad } })
    expect(d.encabezado).toContainEqual(['Paciente', 'Carmen R.'])
    expect(d.encabezado).toContainEqual(['Terapeuta', 'Klgo. Diego M.'])
    expect(d.encabezado).toContainEqual(['Sesiones incluidas', '2'])
    expect(d.filas).toHaveLength(2)
    expect(d.filas[0][0]).toBe('20-11-2026 10:00')
    expect(d.filas[1].slice(1)).toEqual(['Caja de juguetes', '2', '12/12', '92%', '3,8 s', '6,1 cm aprox.', '68° aprox.', '2'])
    expect(d.dolor).toContain('promedio 3,0')
    expect(d.dolor).toContain('máximo 4')
    expect(d.hashes).toEqual([
      { id: 'S-1', hash: 'a'.repeat(64), integridad: 'Verificado' },
      { id: 'S-2', hash: 'a'.repeat(64), integridad: 'Alterado' },
    ])
    expect(d.series[0].puntos).toHaveLength(2)
    expect(d.pie).toBe('Mediciones estimadas con cámara; no reemplazan la evaluación clínica')
    expect(PIE_PDF).toBe(d.pie)
    expect(d.titulo).toBe('Historial de sesiones')
  })

  it('una sola sesión usa su ID en el título y el archivo', () => {
    const d = datosPdf({ ...entrada, sesiones: [entrada.sesiones[0]], integridad: { 'S-2': 'verificado' } })
    expect(d.titulo).toBe('Registro de sesión S-2')
    expect(nombreArchivo('S-20261121-02', 'pdf')).toBe('manoviva-S-20261121-02.pdf')
  })

  it('sin sesiones no inventa datos', () => {
    const d = datosPdf({ ...entrada, sesiones: [], integridad: {} })
    expect(d.filas).toEqual([])
    expect(d.dolor).toBe('Sin dolor reportado en las sesiones incluidas.')
    expect(d.encabezado).toContainEqual(['Fechas incluidas', 'Sin sesiones'])
  })

  it('genera un PDF real con el pie obligatorio', async () => {
    const { generarPdf } = await import('./pdf')
    const blob = await generarPdf(datosPdf({ ...entrada, integridad: { ...entrada.integridad } }))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const texto = new TextDecoder('latin1').decode(bytes)
    expect(texto.startsWith('%PDF-')).toBe(true)
    expect(bytes.length).toBeGreaterThan(3000)
    expect(texto).toContain('Mediciones estimadas con cámara')
    expect(texto).toContain('a'.repeat(64))
  })
})
