// Prepara y restaura al PACIENTE DE PRUEBA (prueba.demo@example.com) para los e2e de prescripción (F17). Solo service_role.
// Nunca toca a Carmen, Luis, Marta ni Jorge (sus planes no se pueden borrar).
//   preparar → ultimo_mensaje_visto = 1 (el mensaje de la versión 2 cuenta como nuevo), compartir_metricas = true (para que su terapeuta pueda prescribir: la RPC crear_version_plan lo exige),
//              vínculo con el terapeuta demo y plan versión 1 de base. Devuelve el id del paciente.
//   restaurar → borra las versiones > 1 del plan y su auditoría (RPC limpiar_planes_prueba) y vuelve al
//              estado del seed (compartir_metricas = false, ultimo_mensaje_visto = 99).
// CLI: npx tsx scripts/prueba-plan.ts preparar | restaurar
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
const EMAIL_TERAPEUTA = 'terapeuta.demo@example.com'
// Mismo plan que sembró scripts/seed.ts para 'prueba'.
const ITEMS = [
  { juego: 'movilidad-guiada', nivel: 1, duracionMin: 3, mano: 'derecha', metaAgarres: 10, metaPinzaCm: 7 },
  { juego: 'caja-juguetes', nivel: 2, duracionMin: 6, mano: 'derecha', metaAgarres: 12, metaPinzaCm: 7 },
]

function ok<T>(r: { data: T; error: { message: string } | null }, ctx: string): T {
  if (r.error) throw new Error(`${ctx}: ${r.error.message}`)
  return r.data
}

async function idDe(email: string): Promise<string> {
  const lista = await db.auth.admin.listUsers({ perPage: 200 })
  if (lista.error) throw new Error('listUsers: ' + lista.error.message)
  const u = lista.data.users.find((x) => x.email?.toLowerCase() === email)
  if (!u) throw new Error('No existe ' + email + ': corre npm run db:seed')
  return u.id
}

async function paciente() {
  const uid = await idDe(EMAIL)
  const p = ok(await db.from('pacientes').select('id, terapeuta_id').eq('usuario_id', uid).maybeSingle(), 'paciente')
  if (!p) throw new Error('No hay ficha de paciente de prueba: corre npm run db:seed')
  return p as { id: string; terapeuta_id: string | null }
}

export async function prepararPlanPrueba(): Promise<{ pacienteId: string }> {
  const p = await paciente()
  const terapeuta = p.terapeuta_id ?? (await idDe(EMAIL_TERAPEUTA))
  ok(await db.from('pacientes').update({ compartir_metricas: true, terapeuta_id: terapeuta, ultimo_mensaje_visto: 1 }).eq('id', p.id), 'compartir')
  const base = ok(await db.from('planes').select('id').eq('paciente_id', p.id).eq('version', 1).maybeSingle(), 'plan base')
  if (!base) {
    ok(
      await db.from('planes').insert({
        paciente_id: p.id, version: 1, creado_por: terapeuta, vigente_desde: new Date(Date.now() - 86_400_000).toISOString(),
        sesiones_por_semana: 5, umbral_dolor: 5, items: ITEMS,
      }),
      'plan',
    )
  }
  // Por si un intento anterior dejó versiones sueltas: la prueba parte siempre de la versión 1.
  ok(await db.rpc('limpiar_planes_prueba'), 'limpiar planes')
  return { pacienteId: p.id }
}

export async function restaurarPlanPrueba(): Promise<void> {
  const p = await paciente()
  ok(await db.rpc('limpiar_planes_prueba'), 'limpiar planes')
  ok(await db.from('pacientes').update({ compartir_metricas: false, ultimo_mensaje_visto: 99 }).eq('id', p.id), 'compartir')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const orden = process.argv[2]
  if (orden === 'preparar') console.log(JSON.stringify(await prepararPlanPrueba()))
  else if (orden === 'restaurar') await restaurarPlanPrueba()
  else {
    console.error('Uso: tsx scripts/prueba-plan.ts preparar | restaurar')
    process.exit(1)
  }
  console.log('prueba-plan: ' + orden + ' listo')
}
