// Borra las sesiones del PACIENTE DE PRUEBA (prueba.demo@example.com), también las CERRADAS, con sus eventos,
// alertas y auditoría. Es la limpieza de los e2e que cierran sesiones (F13+): una sesión cerrada es inmutable y
// limpiar-preparadas.ts no la toca. Nunca toca a Carmen ni a los demás pacientes demo.
// Uso: npx tsx scripts/limpiar-prueba.ts [id ...]
//   Sin ids: todo lo del paciente de prueba. Con ids: solo esas sesiones (los e2e corren en paralelo).
// Usa la RPC limpiar_paciente_prueba (solo service_role; migración 20261121000007). `npm run db:seed` también la deja limpia.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const ids = process.argv.slice(2).filter(Boolean)

const env = Object.fromEntries(
  readFileSync(new URL('../.env.secrets', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })

const r = await db.rpc('limpiar_paciente_prueba', { p_ids: ids.length ? ids : null })
if (r.error) throw new Error(r.error.message)
const borradas = (r.data ?? []) as string[]
console.log(`limpiar-prueba: ${borradas.length} borradas${borradas.length ? ' (' + borradas.join(', ') + ')' : ''}`)
