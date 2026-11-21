// Siembra DATOS DE DEMOSTRACIÓN FICTICIOS: 1 clínica, 1 terapeuta, 4 pacientes, planes y sesiones.
// Uso: npx tsx scripts/seed.ts   (lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.secrets)
// Es re-ejecutable: primero borra solo los datos marcados demo.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { hashSesion } from '../src/domain/integridad'
import type { EventoSesion, MetricasSesion, Sesion } from '../src/domain/types'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.secrets', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })

export const CLAVE_DEMO = 'manoviva-demo'
export const CODIGO_CLINICA = 'CRM-4821'

function ok<T>(r: { data: T; error: { message: string } | null }, ctx: string): T {
  if (r.error) throw new Error(`${ctx}: ${r.error.message}`)
  return r.data
}

// generador pseudoaleatorio determinista
let semilla = 42
const rnd = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646
const entre = (a: number, b: number) => a + (b - a) * rnd()
const r1 = (x: number) => Math.round(x * 10) / 10

async function usuario(email: string, nombre: string) {
  const lista = ok(await db.auth.admin.listUsers({ perPage: 200 }), 'listUsers')
  const existente = lista.users.find((u) => u.email === email)
  if (existente) return existente.id
  const r = ok(await db.auth.admin.createUser({ email, password: CLAVE_DEMO, email_confirm: true, user_metadata: { nombre, demo: true } }), 'createUser')
  return r.user!.id
}

const HOY = new Date()
function fecha(diasAtras: number, h: number, m: number) {
  const d = new Date(HOY)
  d.setDate(d.getDate() - diasAtras)
  d.setHours(h, m, 0, 0)
  return d
}
const contadorDia = new Map<string, number>()
function nuevoId(d: Date) {
  const k = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const n = (contadorDia.get(k) ?? 0) + 1
  contadorDia.set(k, n)
  return `S-${k}-${String(n).padStart(2, '0')}`
}

interface Spec {
  pacienteId: string
  juego: 'caja-juguetes' | 'movilidad-guiada'
  inicio: Date
  nivel: number
  duracionMin: number
  mano: 'izquierda' | 'derecha' | 'ambas'
  metaAgarres: number
  metaPinzaCm: number
  progreso: number // 0..1
  dolor: number
  esfuerzo: Sesion['esfuerzo']
  nota?: string
  planVersion: number
  prescritoPor: string
  largoMano: number
  calidad?: number
}

async function sembrarSesion(s: Spec) {
  const id = nuevoId(s.inicio)
  const duracionS = s.duracionMin * 60
  const fin = new Date(s.inicio.getTime() + duracionS * 1000)
  const caja = s.juego === 'caja-juguetes'
  const meta = s.metaAgarres
  const exitosos = caja ? Math.min(meta, Math.round(meta * (0.6 + 0.4 * s.progreso + entre(-0.05, 0.08)))) : Math.round(meta * (0.8 + 0.2 * s.progreso))
  const fallos = caja ? Math.max(0, Math.round(entre(0, 3) * (1 - s.progreso) + entre(0, 1.2))) : 0
  const tiempoAgarre = 5.9 - 2.1 * s.progreso + entre(-0.2, 0.2)
  const apertura = 4.2 + 1.9 * s.progreso + entre(-0.15, 0.15)

  const eventos: EventoSesion[] = []
  let seq = 0
  let t = 3000
  const objetos = ['cubo-rojo', 'esfera-verde', 'cilindro-azul', 'cubo-amarillo', 'cono-morado', 'capsula-roja']
  const total = exitosos + fallos
  let izq = 0
  let der = 0
  const tiempos: number[] = []
  for (let i = 0; i < total; i++) {
    const exito = i < exitosos ? true : false
    const mano = s.mano === 'ambas' ? (rnd() < 0.42 ? 'izquierda' : 'derecha') : s.mano
    const objeto = objetos[i % objetos.length]
    if (caja) {
      const dur = Math.max(1.5, tiempoAgarre + entre(-0.8, 0.8)) * 1000
      eventos.push({ sesionId: id, seq: ++seq, t: Math.round(t), tipo: 'agarre_inicio', mano, objeto, datos: { aperturaCm: r1(entre(1.2, 2.2)) } })
      t += dur
      eventos.push({ sesionId: id, seq: ++seq, t: Math.round(t), tipo: 'agarre_fin', mano, objeto, datos: null })
      eventos.push({ sesionId: id, seq: ++seq, t: Math.round(t), tipo: 'soltar', mano, objeto, datos: { enCaja: exito } })
      if (exito) {
        tiempos.push(dur / 1000)
        if (mano === 'izquierda') izq++
        else der++
      }
      t += entre(2500, 6000)
    } else {
      // movilidad: un ciclo abrir/cerrar = agarre_inicio (cierre) + soltar (apertura completa)
      eventos.push({ sesionId: id, seq: ++seq, t: Math.round(t), tipo: 'agarre_inicio', mano, objeto: 'ciclo', datos: null })
      t += entre(1500, 2500)
      eventos.push({ sesionId: id, seq: ++seq, t: Math.round(t), tipo: 'soltar', mano, objeto: 'ciclo', datos: { enCaja: true } })
      if (mano === 'izquierda') izq++
      else der++
      tiempos.push(2)
      t += entre(1500, 3000)
    }
  }
  if (rnd() < 0.3) eventos.push({ sesionId: id, seq: ++seq, t: Math.round(entre(20000, duracionS * 1000 - 5000)), tipo: 'perdida_seguimiento', mano: null, objeto: null, datos: { duracionMs: Math.round(entre(400, 1800)) } })
  eventos.sort((a, b) => a.t - b.t).forEach((e, i) => (e.seq = i + 1))

  const flexIndice = Math.round(52 + 18 * s.progreso + entre(-3, 3))
  const metricas: MetricasSesion = {
    agarres: exitosos,
    agarresIzq: izq,
    agarresDer: der,
    intentos: total,
    precision: total ? Math.round((exitosos / total) * 1000) / 1000 : 0,
    tiempoMedioAgarreS: tiempos.length ? r1(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
    aperturaMaxCm: r1(apertura),
    flexionMax: {
      pulgar: Math.round(38 + 12 * s.progreso + entre(-3, 3)),
      indice: flexIndice,
      medio: Math.round(60 + 20 * s.progreso + entre(-3, 3)),
      anular: Math.round(55 + 18 * s.progreso + entre(-3, 3)),
      menique: Math.round(40 + 16 * s.progreso + entre(-3, 3)),
    },
    flexionIndiceMax: flexIndice,
    suavidad: Math.round(70 + 16 * s.progreso + entre(-3, 3)),
    calidadRegistro: s.calidad ?? Math.round(entre(0.86, 0.98) * 1000) / 1000,
    duracionS,
    fpsMedio: r1(entre(27, 30)),
    metaCumplida: exitosos >= meta,
  }
  const hz = 1
  const muestras = { hz, t: [] as number[], apertura: [] as (number | null)[], flexIndice: [] as (number | null)[] }
  for (let k = 0; k < duracionS; k += 1 / hz) {
    muestras.t.push(k * 1000)
    const fase = (Math.sin(k * 0.9) + 1) / 2
    muestras.apertura.push(r1(1.2 + (apertura - 1.2) * fase))
    muestras.flexIndice.push(Math.round(10 + (flexIndice - 10) * (1 - fase)))
  }
  const sesion: Sesion = {
    id,
    pacienteId: s.pacienteId,
    planVersion: s.planVersion,
    juego: s.juego,
    parametros: { mano: s.mano, nivel: s.nivel, duracionMin: s.duracionMin, metaAgarres: meta, metaPinzaCm: s.metaPinzaCm, prescritoPor: s.prescritoPor },
    inicio: s.inicio.toISOString(),
    fin: fin.toISOString(),
    estado: 'cerrada',
    calibracion: {
      largoManoCm: s.largoMano,
      largoManoFuente: 'regla',
      largoManoEstimadoCm: r1(s.largoMano + entre(-0.6, 0.6)),
      aperturaPinzaMaxCm: r1(apertura - 0.2),
      rangoAbrirCerrar: { min: Math.round(entre(0.05, 0.2) * 100) / 100, max: Math.round(entre(0.8, 1.0) * 100) / 100 },
      fps: 30,
      confianzaMedia: Math.round(entre(0.9, 0.98) * 100) / 100,
      escalaCmPorUnidad: r1(s.largoMano / 0.18),
    },
    metricas,
    muestras,
    dolorEVA: s.dolor,
    esfuerzo: s.esfuerzo,
    nota: s.nota ?? null,
    dispositivo: { modelo: 'Android · Chrome (demo)', camara: 'Cámara frontal', fps: 30 },
    versionApp: '1.0.0',
    versionModelo: 'MediaPipe Hands · hand_landmarker float16 v1',
    hash: null,
  }
  ok(
    await db.from('sesiones').insert({
      id,
      paciente_id: sesion.pacienteId,
      plan_version: sesion.planVersion,
      juego: sesion.juego,
      parametros: sesion.parametros,
      inicio: sesion.inicio,
      fin: sesion.fin,
      estado: 'en curso',
      calibracion: sesion.calibracion,
      metricas: sesion.metricas,
      muestras: sesion.muestras,
      dolor_eva: sesion.dolorEVA,
      esfuerzo: sesion.esfuerzo,
      nota: sesion.nota,
      dispositivo: sesion.dispositivo,
      version_app: sesion.versionApp,
      version_modelo: sesion.versionModelo,
      creada: sesion.inicio,
    }),
    'insert sesion ' + id,
  )
  if (eventos.length)
    ok(
      await db.from('eventos_sesion').insert(eventos.map((e) => ({ sesion_id: id, seq: e.seq, t: e.t, tipo: e.tipo, mano: e.mano, objeto: e.objeto, datos: e.datos }))),
      'eventos ' + id,
    )
  const hash = await hashSesion(sesion, eventos)
  ok(await db.from('sesiones').update({ estado: 'cerrada', hash }).eq('id', id), 'cerrar ' + id)
  return { id, dolor: s.dolor }
}

async function main() {
  console.log('Reiniciando datos demo…')
  ok(await db.rpc('reset_demo'), 'reset_demo')

  // clínica
  let clinica = ok(await db.from('clinicas').select('*').eq('codigo', CODIGO_CLINICA).maybeSingle(), 'clinica')
  if (!clinica) clinica = ok(await db.from('clinicas').insert({ codigo: CODIGO_CLINICA, nombre: 'Clínica Demo ManoViva (ficticia)' }).select('*').single(), 'insert clinica')

  const personas = [
    { key: 'diego', email: 'terapeuta.demo@example.com', nombre: 'Diego M.', titulo: 'Klgo.', rol: 'terapeuta' },
    { key: 'carmen', email: 'carmen.demo@example.com', nombre: 'Carmen R.', rol: 'paciente' },
    { key: 'luis', email: 'luis.demo@example.com', nombre: 'Luis A.', rol: 'paciente' },
    { key: 'marta', email: 'marta.demo@example.com', nombre: 'Marta S.', rol: 'paciente' },
    { key: 'jorge', email: 'jorge.demo@example.com', nombre: 'Jorge P.', rol: 'paciente' },
    // Paciente de PRUEBA de los e2e que cierran sesiones (F13+). No comparte métricas: el terapeuta no la ve.
    // Sus sesiones (también las cerradas) se borran con scripts/limpiar-prueba.ts (RPC limpiar_paciente_prueba).
    { key: 'prueba', email: 'prueba.demo@example.com', nombre: 'Paciente de prueba', rol: 'paciente' },
  ] as const
  const ids: Record<string, string> = {}
  for (const p of personas) {
    ids[p.key] = await usuario(p.email, p.nombre)
    ok(
      await db.from('perfiles').upsert({ id: ids[p.key], rol: p.rol, nombre: p.nombre, titulo: 'titulo' in p ? p.titulo : null, clinica_id: clinica.id, demo: true }),
      'perfil ' + p.key,
    )
  }
  const diego = ids.diego
  const prescritoPor = 'Klgo. Diego M.'

  const pacientesDef = [
    { key: 'carmen', mano: 'ambas', condicion: 'Fractura de muñeca', semanas: 4, diasExtra: 2, largo: 18.4 },
    { key: 'luis', mano: 'izquierda', condicion: null, semanas: 7, diasExtra: 1, largo: 19.6 },
    { key: 'marta', mano: 'ambas', condicion: null, semanas: 11, diasExtra: 3, largo: 17.2 },
    { key: 'jorge', mano: 'derecha', condicion: null, semanas: 2, diasExtra: 0, largo: 19.1 },
    { key: 'prueba', mano: 'derecha', condicion: null, semanas: 1, diasExtra: 0, largo: 18.2 },
  ] as const
  const pac: Record<string, string> = {}
  for (const d of pacientesDef) {
    const inicio = fecha((d.semanas - 1) * 7 + d.diasExtra, 9, 0)
    const f = ok(
      await db
        .from('pacientes')
        .insert({
          usuario_id: ids[d.key],
          terapeuta_id: diego,
          mano_afectada: d.mano,
          condicion: d.condicion,
          fecha_inicio: inicio.toISOString().slice(0, 10),
          largo_mano_cm: d.largo,
          compartir_metricas: d.key !== 'prueba',
          ultimo_mensaje_visto: d.key === 'carmen' ? 1 : 99,
        })
        .select('id')
        .single(),
      'paciente ' + d.key,
    )
    pac[d.key] = f.id
    ok(
      await db.from('consentimientos').insert({
        paciente_id: f.id,
        version: '1.0',
        firmado_el: fecha((d.semanas - 1) * 7 + d.diasExtra, 9, 30).toISOString(),
        opciones: { analisisEnDispositivo: true, compartirMetricas: d.key !== 'prueba' },
      }),
      'consent ' + d.key,
    )
  }

  const item = (juego: string, nivel: number, duracionMin: number, mano: string, metaAgarres: number, metaPinzaCm: number) => ({
    juego, nivel, duracionMin, mano, metaAgarres, metaPinzaCm,
  })

  async function plan(pk: string, version: number, cuando: Date, spw: number, umbral: number, items: unknown[], mensaje: string | null, antes: unknown) {
    const f = ok(
      await db
        .from('planes')
        .insert({ paciente_id: pac[pk], version, vigente_desde: cuando.toISOString(), creado_por: diego, sesiones_por_semana: spw, umbral_dolor: umbral, mensaje, items })
        .select('*')
        .single(),
      'plan',
    )
    ok(
      await db.from('auditoria').insert({
        quien: diego,
        cuando: cuando.toISOString(),
        accion: version === 1 ? 'plan_creado' : 'plan_actualizado',
        entidad: 'plan',
        entidad_id: f.id,
        paciente_id: pac[pk],
        antes,
        despues: { version, sesionesPorSemana: spw, umbralDolor: umbral, items, mensaje },
      }),
      'audit plan',
    )
  }

  // ---------------- Carmen: caso principal
  const carmenInicio = (4 - 1) * 7 + 2 // días atrás
  const itemsC1 = [item('movilidad-guiada', 1, 3, 'ambas', 10, 7), item('caja-juguetes', 1, 6, 'ambas', 10, 7)]
  const itemsC2 = [item('movilidad-guiada', 1, 3, 'ambas', 10, 7), item('caja-juguetes', 2, 6, 'ambas', 12, 7)]
  await plan('carmen', 1, fecha(carmenInicio, 9, 10), 5, 5, itemsC1, '¡Bienvenida, Carmen! Empezamos suave.', null)
  const v2 = fecha(3, 9, 14)
  await plan('carmen', 2, v2, 5, 5, itemsC2, '¡Buen avance, Carmen! Subimos un nivel 💪', {
    version: 1, sesionesPorSemana: 5, umbralDolor: 5, items: itemsC1,
  })
  ok(await db.from('citas').insert({ paciente_id: pac.carmen, terapeuta_id: diego, fecha: fecha(-5, 11, 0).toISOString(), modalidad: 'presencial' }), 'cita')

  // 19 sesiones cerradas: días atrás y juegos
  const planCarmen: [number, 'movilidad-guiada' | 'caja-juguetes', number, number][] = [
    [23, 'caja-juguetes', 10, 5], [22, 'caja-juguetes', 17, 40], [20, 'caja-juguetes', 10, 15], [16, 'caja-juguetes', 18, 2],
    [15, 'caja-juguetes', 10, 20], [13, 'caja-juguetes', 9, 45], [9, 'caja-juguetes', 17, 50], [8, 'caja-juguetes', 10, 10],
    [6, 'caja-juguetes', 18, 5], [5, 'movilidad-guiada', 10, 22], [5, 'caja-juguetes', 10, 28], [4, 'movilidad-guiada', 18, 0],
    [4, 'caja-juguetes', 18, 5], [3, 'caja-juguetes', 10, 32], [3, 'movilidad-guiada', 10, 26], [1, 'movilidad-guiada', 9, 40],
    [1, 'caja-juguetes', 9, 46], [6, 'movilidad-guiada', 17, 58], [0, 'movilidad-guiada', 10, 26],
  ]
  planCarmen.sort((a, b) => b[0] - a[0] || a[2] - b[2] || a[3] - b[3])
  for (const [dias, juego, h, m] of planCarmen) {
    const inicio = fecha(dias, h, m)
    const despuesV2 = inicio >= v2
    const progreso = 1 - dias / carmenInicio
    const caja = juego === 'caja-juguetes'
    await sembrarSesion({
      pacienteId: pac.carmen, juego, inicio, nivel: caja ? (despuesV2 ? 2 : 1) : 1, duracionMin: caja ? 6 : 3, mano: 'ambas',
      metaAgarres: caja ? (despuesV2 ? 12 : 10) : 10, metaPinzaCm: 7, progreso, dolor: Math.max(1, Math.round(4 - 2.5 * progreso + entre(-0.6, 0.6))),
      esfuerzo: progreso > 0.6 ? 'Moderado' : 'Fuerte', planVersion: despuesV2 ? 2 : 1, prescritoPor, largoMano: 18.4,
      nota: dias === 3 && caja ? 'Molestia leve en el pulgar al final.' : undefined,
      calidad: dias === 16 ? 0.62 : undefined,
    })
  }

  // ---------------- Luis: alerta de dolor
  await plan('luis', 1, fecha(7 * 6 + 1, 10, 0), 4, 5, [item('caja-juguetes', 2, 6, 'izquierda', 10, 7.5)], null, null)
  let ultima = { id: '', dolor: 0 }
  for (const [i, dias] of [40, 33, 27, 21, 16, 12, 9, 6, 2].entries()) {
    ultima = await sembrarSesion({
      pacienteId: pac.luis, juego: 'caja-juguetes', inicio: fecha(dias, 18, 30), nivel: 2, duracionMin: 6, mano: 'izquierda', metaAgarres: 10,
      metaPinzaCm: 7.5, progreso: 0.3 + 0.5 * (i / 8) - (dias === 2 ? 0.25 : 0), dolor: dias === 2 ? 6 : 3, esfuerzo: dias === 2 ? 'Fuerte' : 'Moderado',
      planVersion: 1, prescritoPor, largoMano: 19.6, nota: dias === 2 ? 'Me dolió más que otras veces.' : undefined,
    })
  }
  ok(await db.from('alertas').insert({ paciente_id: pac.luis, sesion_id: ultima.id, tipo: 'dolor', valor: 6, creada: fecha(2, 18, 40).toISOString() }), 'alerta')

  // ---------------- Marta: buena adherencia
  await plan('marta', 1, fecha(7 * 10 + 3, 10, 0), 4, 6, [item('caja-juguetes', 3, 8, 'ambas', 14, 8)], null, null)
  for (const [i, dias] of [60, 50, 42, 30, 20, 13, 9, 6, 4, 2, 1].entries()) {
    await sembrarSesion({
      pacienteId: pac.marta, juego: 'caja-juguetes', inicio: fecha(dias, 11, 15), nivel: 3, duracionMin: 8, mano: 'ambas', metaAgarres: 14,
      metaPinzaCm: 8, progreso: 0.4 + 0.6 * (i / 10), dolor: 1, esfuerzo: 'Suave', planVersion: 1, prescritoPor, largoMano: 17.2,
    })
  }

  // ---------------- Jorge: sin sesiones hace 4 días
  await plan('jorge', 1, fecha(7 * 1 + 0, 9, 0), 5, 5, [item('caja-juguetes', 1, 5, 'derecha', 8, 6.5)], null, null)
  for (const [i, dias] of [7, 6, 4].entries()) {
    await sembrarSesion({
      pacienteId: pac.jorge, juego: 'caja-juguetes', inicio: fecha(dias, 20, 10), nivel: 1, duracionMin: 5, mano: 'derecha', metaAgarres: 8,
      metaPinzaCm: 6.5, progreso: 0.1 + 0.2 * (i / 2), dolor: 3, esfuerzo: 'Moderado', planVersion: 1, prescritoPor, largoMano: 19.1,
    })
  }

  // ---------------- Paciente de prueba (e2e): plan con Caja nivel 2 y Movilidad, sin sesiones.
  await plan('prueba', 1, fecha(1, 9, 0), 5, 5, [item('movilidad-guiada', 1, 3, 'derecha', 10, 7), item('caja-juguetes', 2, 6, 'derecha', 12, 7)], null, null)

  const n = ok(await db.from('sesiones').select('id', { count: 'exact', head: true }), 'count')
  console.log('Listo. Datos demo sembrados.', n)
  console.log(`Clínica ${CODIGO_CLINICA} · contraseña demo: ${CLAVE_DEMO}`)
  console.log(personas.map((p) => `  ${p.rol.padEnd(9)} ${p.email}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
