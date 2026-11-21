// Alerta de dolor de PRUEBA sobre Luis A. (demo, visible para el terapeuta) para el e2e del terapeuta (F16).
// Marcarla como revisada no toca la alerta original de Luis (la de "Dolor 6/10").
//   npx tsx scripts/alerta-prueba.ts crear [valor]   → imprime el id de la alerta creada
//   npx tsx scripts/alerta-prueba.ts limpiar <id>    → borra esa alerta y su auditoría (RPC limpiar_alerta_prueba, service_role)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const [accion, arg] = process.argv.slice(2)
const env = Object.fromEntries(
  readFileSync(new URL('../.env.secrets', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })

if (accion === 'crear') {
  const u = await db.auth.admin.listUsers({ perPage: 200 })
  const luis = u.data.users.find((x) => x.email === 'luis.demo@example.com')
  if (!luis) throw new Error('No está luis.demo@example.com (¿falta el seed?)')
  const pac = await db.from('pacientes').select('id').eq('usuario_id', luis.id).single()
  if (pac.error) throw new Error(pac.error.message)
  const ses = await db.from('sesiones').select('id').eq('paciente_id', pac.data.id).order('inicio', { ascending: false }).limit(1).single()
  if (ses.error) throw new Error(ses.error.message)
  const a = await db
    .from('alertas')
    .insert({ paciente_id: pac.data.id, sesion_id: ses.data.id, tipo: 'dolor', valor: Number(arg ?? 9) })
    .select('id')
    .single()
  if (a.error) throw new Error(a.error.message)
  console.log(a.data.id)
} else if (accion === 'limpiar' && arg) {
  const r = await db.rpc('limpiar_alerta_prueba', { p_alerta: arg })
  if (r.error) throw new Error(r.error.message)
  console.log('alerta de prueba limpiada')
} else {
  throw new Error('Uso: alerta-prueba.ts crear [valor] | limpiar <id>')
}
