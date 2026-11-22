// Cambia de ambiente: separa .env.<nombre> en .env.local (público) y .env.secrets (secreto).
//   node scripts/entorno.mjs dev      → usa Supabase manoviva-dev (desarrollo y pruebas del equipo)
//   node scripts/entorno.mjs prod     → usa producción (solo coordinación; el equipo NO tiene .env.prod)
//   node scripts/entorno.mjs --actual → dice en cuál estás (sin mostrar claves)
// .env.dev y .env.prod están ignorados por git: se pasan por canal privado.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url)
const leer = (f) => {
  const u = new URL(f, RAIZ)
  if (!existsSync(u)) return null
  return Object.fromEntries(
    readFileSync(u, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}
const host = (url) => (url ? new URL(url).hostname.split('.')[0] : null)
const NOMBRES = { adpwhfcgssgpgomzoljm: 'dev', iniposctftmzxkqasikh: 'prod' }
const PUBLICAS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const SECRETAS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD']

const arg = process.argv[2]
if (arg === '--actual' || !arg) {
  const l = leer('.env.local')
  const ref = host(l?.VITE_SUPABASE_URL)
  console.log(ref ? `ambiente actual: ${NOMBRES[ref] ?? 'desconocido'} (${ref})` : 'sin .env.local')
  process.exit(0)
}
if (!['dev', 'prod'].includes(arg)) {
  console.error('Uso: node scripts/entorno.mjs dev|prod|--actual')
  process.exit(1)
}
const env = leer(`.env.${arg}`)
if (!env) {
  console.error(`No existe .env.${arg}. Pídelo por el canal privado del equipo (no está en git).`)
  process.exit(1)
}
for (const k of [...PUBLICAS, 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) {
    console.error(`Falta ${k} en .env.${arg}`)
    process.exit(1)
  }
}
writeFileSync(new URL('.env.local', RAIZ), PUBLICAS.map((k) => `${k}=${env[k]}`).join('\n') + '\n')
writeFileSync(new URL('.env.secrets', RAIZ), SECRETAS.filter((k) => env[k]).map((k) => `${k}=${env[k]}`).join('\n') + '\n')
console.log(`ambiente: ${arg} (${host(env.VITE_SUPABASE_URL)}) → .env.local y .env.secrets actualizados`)
if (arg === 'prod') console.log('OJO: es PRODUCCIÓN. No corras db:seed ni pruebas que mutan datos.')
