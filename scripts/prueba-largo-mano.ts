// Limpieza del e2e de F19 (perfil). SOLO el paciente de prueba (prueba.demo@example.com), con service_role.
// Quita las filas de auditoría 'largo_mano_actualizado' que creó la prueba y restaura el largo de mano original.
//   npx tsx scripts/prueba-largo-mano.ts [cm]   (por defecto 18,2 = valor del seed)
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

export async function restaurarLargoMano(cm: number | null = 18.2) {
  const r = await db.rpc('restaurar_largo_mano_prueba', { p_cm: cm })
  if (r.error) throw new Error('restaurar_largo_mano_prueba: ' + r.error.message)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cm = process.argv[2] ? Number(process.argv[2].replace(',', '.')) : 18.2
  await restaurarLargoMano(cm)
  console.log('prueba-largo-mano: restaurado a ' + cm)
}
