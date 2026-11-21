// Borra sesiones en estado "preparada" de pacientes DEMO creadas desde una fecha (las que dejan los e2e de F06+).
// Uso: npx tsx scripts/limpiar-preparadas.ts <ISO desde>
// Nunca toca sesiones "en curso" ni "cerradas" (además el trigger de BD impide borrar una cerrada).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const desde = process.argv[2]
if (!desde || Number.isNaN(Date.parse(desde))) {
  console.error('Uso: npx tsx scripts/limpiar-preparadas.ts <ISO desde>')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.secrets', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })

const pacs = await db.from('pacientes').select('id, perfil:perfiles!pacientes_usuario_id_fkey(demo)')
if (pacs.error) throw new Error(pacs.error.message)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const demo = (pacs.data as any[]).filter((p) => (Array.isArray(p.perfil) ? p.perfil[0]?.demo : p.perfil?.demo)).map((p) => p.id as string)
if (demo.length === 0) {
  console.log('limpiar-preparadas: sin pacientes demo')
  process.exit(0)
}
const r = await db.from('sesiones').delete().eq('estado', 'preparada').in('paciente_id', demo).gte('creada', new Date(desde).toISOString()).select('id')
if (r.error) throw new Error(r.error.message)
console.log(`limpiar-preparadas: ${r.data.length} borradas${r.data.length ? ' (' + r.data.map((x) => x.id).join(', ') + ')' : ''}`)
