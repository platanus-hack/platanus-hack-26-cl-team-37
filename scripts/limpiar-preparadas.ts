// Borra las sesiones de PRUEBA no cerradas ('preparada' o 'en curso') de pacientes DEMO creadas desde una fecha
// (las que dejan los e2e de F06+ y las capturas), con sus eventos.
// Uso: npx tsx scripts/limpiar-preparadas.ts <ISO desde> [id ...]
//   Con ids, borra solo esas (los e2e corren en paralelo: sin ids, una prueba borraría la sesión de otra).
// Usa la RPC limpiar_sesiones_prueba (solo service_role; migración 20261121000004): las sesiones 'en curso' pueden
// tener eventos, que solo se borran con el permiso de borrado del titular. Nunca toca sesiones cerradas.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const desde = process.argv[2]
const ids = process.argv.slice(3).filter(Boolean)
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

const r = await db.rpc('limpiar_sesiones_prueba', { p_desde: new Date(desde).toISOString(), p_ids: ids.length ? ids : null })
if (r.error) throw new Error(r.error.message)
const borradas = (r.data ?? []) as string[]
console.log(`limpiar-preparadas: ${borradas.length} borradas${borradas.length ? ' (' + borradas.join(', ') + ')' : ''}`)
