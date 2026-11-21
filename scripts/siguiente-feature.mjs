// Dice qué feature toca según feature_list.json.
// Regla: la primera "in-progress"; si no hay, la primera "not-started" cuyas dependencias estén "done".
// Uso: node scripts/siguiente-feature.mjs [--resumen] [--owner P1|P2|P3|coordinación]
import { readFileSync } from 'node:fs'

const { features } = JSON.parse(readFileSync(new URL('../feature_list.json', import.meta.url), 'utf8'))
const porId = new Map(features.map((f) => [f.id, f]))
const iOwner = process.argv.indexOf('--owner')
const owner = iOwner >= 0 ? process.argv[iOwner + 1] : null
const mias = (f) => !owner || f.owner === owner
const cuenta = {}
for (const f of features) cuenta[f.status] = (cuenta[f.status] ?? 0) + 1

const enCurso = features.find((f) => f.status === 'in-progress' && mias(f))
const listo = (f) => f.dependencies.every((d) => porId.get(d)?.status === 'done')
const siguiente = enCurso ?? features.find((f) => f.status === 'not-started' && listo(f) && mias(f))
const bloqueados = features.filter((f) => f.status === 'blocked')

console.log(`features: ${features.length} · ` + Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(' · '))
if (bloqueados.length) console.log('bloqueados: ' + bloqueados.map((f) => `${f.id} (${f.blocked_reason ?? 'sin motivo'})`).join('; '))

if (!siguiente) {
  const pendientes = features.filter((f) => f.status === 'not-started')
  if (!pendientes.length) console.log('SIGUIENTE: ninguno. Todo done o blocked → escribir informe final (F28) y detenerse.')
  else console.log('SIGUIENTE: ninguno disponible; pendientes esperan dependencias bloqueadas: ' + pendientes.map((f) => f.id).join(', '))
  process.exit(0)
}

console.log(`SIGUIENTE: ${siguiente.id} — ${siguiente.name} [${siguiente.status}]`)
if (process.argv.includes('--resumen')) process.exit(0)
console.log('\n' + siguiente.description)
console.log('\nPrompt: ' + (siguiente.prompt || '—').replace(/^ref\//, 'docs/referencia/'))
console.log('Imágenes: ' + (siguiente.images.map((i) => i.replace(/^ref\//, 'docs/referencia/')).join(', ') || '—'))
if (siguiente.spec_refs) console.log('Spec: docs/manoviva-spec.md ' + siguiente.spec_refs.join(' '))
console.log('\nAceptación:\n' + siguiente.acceptance.map((a) => '  - ' + a).join('\n'))
console.log('Verificación:\n' + siguiente.verify.map((a) => '  - ' + a).join('\n'))
if (siguiente.deploy) console.log('\nAl terminar: deploy a producción (vercel deploy --prod --yes) y comprobar 200.')
