// Estado del PACIENTE DE PRUEBA (prueba.demo@example.com) para los e2e de privacidad (F18). Solo service_role.
// Nunca toca a Carmen ni a los demás pacientes demo.
//   npx tsx scripts/prueba-privacidad.ts restaurar   → vuelve al estado del seed (consentimiento 1.0 firmado, plan v1,
//                                                      compartir_metricas = false, investigación = false, sin sesiones
//                                                      ni auditoría). Úsalo si un e2e dejó al paciente a medias o después
//                                                      de probar "Eliminar" a mano. `npm run db:seed` también lo restaura.
//   npx tsx scripts/prueba-privacidad.ts sin-consentimiento → borra su(s) consentimiento(s) (para probar la firma).
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.secrets', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })

const EMAIL = 'prueba.demo@example.com'
const VERSION = '1.0' // = VERSION_CONSENTIMIENTO de src/legal/consentimiento.ts
// Mismo plan que sembró scripts/seed.ts para 'prueba'.
const ITEMS = [
  { juego: 'movilidad-guiada', nivel: 1, duracionMin: 3, mano: 'derecha', metaAgarres: 10, metaPinzaCm: 7 },
  { juego: 'caja-juguetes', nivel: 2, duracionMin: 6, mano: 'derecha', metaAgarres: 12, metaPinzaCm: 7 },
]

function ok<T>(r: { data: T; error: { message: string } | null }, ctx: string): T {
  if (r.error) throw new Error(`${ctx}: ${r.error.message}`)
  return r.data
}

async function paciente() {
  const lista = await db.auth.admin.listUsers({ perPage: 200 })
  if (lista.error) throw new Error('listUsers: ' + lista.error.message)
  const u = lista.data.users.find((x) => x.email?.toLowerCase() === EMAIL)
  if (!u) throw new Error('No existe ' + EMAIL + ': corre npm run db:seed')
  const p = ok(await db.from('pacientes').select('id, terapeuta_id').eq('usuario_id', u.id).maybeSingle(), 'paciente')
  if (!p) throw new Error('No hay ficha de paciente de prueba: corre npm run db:seed')
  return p as { id: string; terapeuta_id: string }
}

export async function sinConsentimiento() {
  const p = await paciente()
  ok(await db.from('consentimientos').delete().eq('paciente_id', p.id), 'borrar consentimientos')
}

export async function restaurarPrueba() {
  const p = await paciente()
  // Sesiones, alertas y auditoría del paciente de prueba (RPC de F13; solo ese paciente).
  ok(await db.rpc('limpiar_paciente_prueba', { p_ids: null }), 'limpiar')
  ok(await db.from('consentimientos').delete().eq('paciente_id', p.id), 'borrar consentimientos')
  ok(
    await db.from('consentimientos').insert({ paciente_id: p.id, version: VERSION, opciones: { analisisEnDispositivo: true, compartirMetricas: false } }),
    'consentimiento',
  )
  ok(
    await db.from('pacientes').update({ compartir_metricas: false, datos_investigacion: false, largo_mano_cm: 18.2, condicion: null }).eq('id', p.id),
    'paciente',
  )
  const planes = ok(await db.from('planes').select('id').eq('paciente_id', p.id).limit(1), 'planes')
  if (!planes?.length) {
    ok(
      await db.from('planes').insert({
        paciente_id: p.id, version: 1, creado_por: p.terapeuta_id, vigente_desde: new Date(Date.now() - 86_400_000).toISOString(),
        sesiones_por_semana: 5, umbral_dolor: 5, items: ITEMS,
      }),
      'plan',
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const orden = process.argv[2]
  if (orden === 'restaurar') await restaurarPrueba()
  else if (orden === 'sin-consentimiento') await sinConsentimiento()
  else {
    console.error('Uso: tsx scripts/prueba-privacidad.ts restaurar | sin-consentimiento')
    process.exit(1)
  }
  console.log('prueba-privacidad: ' + orden + ' listo')
}
