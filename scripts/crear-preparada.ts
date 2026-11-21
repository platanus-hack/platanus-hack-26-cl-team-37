// Crea una Sesion "preparada" para la paciente demo (Carmen) y escribe su id. Sirve para capturas y pruebas a mano
// de /sesion/<id>/calibrar y /sesion/<id>/jugar sin pasar por /preparar.
// Uso: npx tsx scripts/crear-preparada.ts [juego=caja-juguetes] [mano=derecha] [duracionMin=5] [meta=0] [nivel=1] [en-curso]
//   "en-curso" (F12) la deja 'en curso', como queda al terminar el juego: sirve para capturar /sesion/<id>/sensacion.
//   p. ej. el juego de prueba de la base (F09): npx tsx scripts/crear-preparada.ts prueba-shell derecha 5 12
// Limpieza: npx tsx scripts/limpiar-preparadas.ts <ISO desde>  (borra 'preparada' y 'en curso' de pacientes demo)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const juego = process.argv[2] ?? 'caja-juguetes'
const mano = process.argv[3] ?? 'derecha'
const duracionMin = Number(process.argv[4] ?? 5)
const meta = Number(process.argv[5] ?? 0)
const nivel = Number(process.argv[6] ?? 1)
const estado = process.argv[7] === 'en-curso' ? 'en curso' : 'preparada'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as never } })
const login = await sb.auth.signInWithPassword({ email: 'carmen.demo@example.com', password: 'manoviva-demo' })
if (login.error) throw new Error('login demo: ' + login.error.message)
const pac = await sb.from('pacientes').select('id').single()
if (pac.error) throw new Error(pac.error.message)
const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }).replaceAll('-', '')
for (let intento = 0; intento < 4; intento++) {
  const id = await sb.rpc('siguiente_id_sesion', { p_dia: dia })
  if (id.error) throw new Error(id.error.message)
  const r = await sb.from('sesiones').insert({
    id: id.data,
    paciente_id: pac.data.id,
    juego,
    estado,
    parametros: { mano, nivel, duracionMin, metaAgarres: meta, metaPinzaCm: 0, prescritoPor: null },
  })
  if (!r.error) {
    console.log(id.data)
    process.exit(0)
  }
  if (!/duplicate key/i.test(r.error.message)) throw new Error(r.error.message)
}
throw new Error('no se pudo asignar id')
