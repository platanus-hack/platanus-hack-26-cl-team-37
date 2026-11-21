// Prueba de integración contra Supabase con la clave pública (respeta RLS).
// Uso: npx tsx scripts/verificar-rls.ts
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { verificarSesion } from '../src/domain/integridad'
import type { EventoSesion, Sesion } from '../src/domain/types'

const leer = (f: string) =>
  Object.fromEntries(
    readFileSync(new URL(f, import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
const env = leer('../.env.local')
const cliente = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })

let fallas = 0
function check(nombre: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${nombre}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallas++
}

async function login(email: string) {
  const c = cliente()
  const r = await c.auth.signInWithPassword({ email, password: 'manoviva-demo' })
  if (r.error) throw new Error(email + ': ' + r.error.message)
  return c
}

async function main() {
  const anon = cliente()
  const a = await anon.from('sesiones').select('id')
  check('anónimo no ve sesiones', (a.data ?? []).length === 0)

  const carmen = await login('carmen.demo@example.com')
  check('verificar_acceso paciente + código', (await carmen.rpc('verificar_acceso', { p_rol: 'paciente', p_codigo: 'CRM-4821' })).data === true)
  check('rol equivocado rechazado', (await carmen.rpc('verificar_acceso', { p_rol: 'terapeuta', p_codigo: 'CRM-4821' })).data === false)
  check('código equivocado rechazado', (await carmen.rpc('verificar_acceso', { p_rol: 'paciente', p_codigo: 'CRM-0000' })).data === false)

  const pacientes = (await carmen.from('pacientes').select('id')).data ?? []
  check('paciente solo ve su ficha', pacientes.length === 1, `${pacientes.length}`)
  const todas = (await carmen.from('sesiones').select('*')).data ?? []
  // Las 19 cerradas del seed. Desde F13 la app en producción cierra sesiones al llegar al resumen: si alguien usa la
  // cuenta demo de Carmen, puede haber más (cerradas o en curso) hasta el próximo `npm run db:seed`. Se exigen ≥ 19
  // cerradas y que TODAS las cerradas verifiquen su hash; las no cerradas se informan.
  const ses = todas.filter((s) => s.estado === 'cerrada')
  const abiertas = todas.length - ses.length
  check('Carmen ve sus 19 sesiones cerradas del seed', ses.length >= 19, `${ses.length}${ses.length > 19 ? ' (uso de la demo; npm run db:seed las reinicia)' : ''}${abiertas ? ` · ${abiertas} sin cerrar` : ''}`)
  const otras = todas.filter((s) => s.paciente_id !== pacientes[0]?.id)
  check('no ve sesiones de otros', otras.length === 0)

  // integridad tras ida y vuelta a la BD
  // La CI corre varios e2e a la vez contra esta base: una sesión de Carmen que otra corrida está creando o cerrando se
  // escribe en varios pasos y su hash no cuadra hasta que termina (luego la prueba la borra). Se omiten las cerradas
  // hace menos de 10 minutos; las del seed son de días anteriores y se siguen exigiendo todas.
  const recientes = new Set(ses.filter((s) => Date.now() - Date.parse(s.fin ?? s.inicio) < 10 * 60_000).map((s) => s.id))
  let verificadas = 0
  for (const f of ses) {
    if (recientes.has(f.id)) continue
    const evs = (await carmen.from('eventos_sesion').select('*').eq('sesion_id', f.id)).data ?? []
    const s: Sesion = {
      id: f.id, pacienteId: f.paciente_id, planVersion: f.plan_version, juego: f.juego, parametros: f.parametros, inicio: f.inicio, fin: f.fin,
      estado: f.estado, calibracion: f.calibracion, metricas: f.metricas, muestras: f.muestras, dolorEVA: f.dolor_eva, esfuerzo: f.esfuerzo,
      nota: f.nota, dispositivo: f.dispositivo, versionApp: f.version_app, versionModelo: f.version_modelo, hash: f.hash,
    }
    const e: EventoSesion[] = evs.map((x) => ({ sesionId: x.sesion_id, seq: x.seq, t: x.t, tipo: x.tipo, mano: x.mano, objeto: x.objeto, datos: x.datos }))
    if ((await verificarSesion(s, e)) === 'verificado') verificadas++
  }
  check('hash verificado en todas las sesiones', verificadas === ses.length - recientes.size, `${verificadas}/${ses.length - recientes.size}${recientes.size ? ` (${recientes.size} recién cerrada(s) por otra prueba, omitida(s))` : ''}`)

  const cerrada = ses[0]
  const upd = await carmen.from('sesiones').update({ dolor_eva: 0 }).eq('id', cerrada.id).select()
  check('sesión cerrada es inmutable', !!upd.error, upd.error?.message)
  const del = await carmen.from('sesiones').delete().eq('id', cerrada.id).select()
  check('sesión cerrada no se borra', !!del.error || (del.data ?? []).length === 0)
  const aud = (await carmen.from('auditoria').select('id').limit(1)).data ?? []
  if (aud[0]) {
    const u = await carmen.from('auditoria').update({ accion: 'x' }).eq('id', aud[0].id).select()
    check('auditoría no se edita', !!u.error || (u.data ?? []).length === 0)
  }
  const plan = await carmen.from('planes').insert({ paciente_id: pacientes[0].id, version: 99, sesiones_por_semana: 7, umbral_dolor: 9 })
  check('paciente no puede crear planes', !!plan.error)
  const limpiar = await carmen.rpc('limpiar_sesiones_prueba', { p_desde: '2000-01-01T00:00:00Z', p_ids: null })
  check('paciente no puede usar la limpieza de pruebas', !!limpiar.error)
  const limpiarPrueba = await carmen.rpc('limpiar_paciente_prueba', { p_ids: null })
  check('paciente no puede usar la limpieza del paciente de prueba', !!limpiarPrueba.error)

  const diego = await login('terapeuta.demo@example.com')
  const pts = (await diego.from('pacientes').select('id')).data ?? []
  check('terapeuta ve 4 pacientes (no el paciente de prueba de los e2e)', pts.length === 4, `${pts.length}`)
  const sesD = await diego.from('sesiones').insert({ id: 'S-20000101-01', paciente_id: pts[0].id, juego: 'x' })
  check('terapeuta no crea sesiones de paciente', !!sesD.error)

  console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodo OK')
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
