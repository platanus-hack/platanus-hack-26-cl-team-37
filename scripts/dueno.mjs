// Dueños de cada archivo: guarda tu rol y dice si puedes editar una ruta.
// Reglas en docs/equipo/propiedad.json (gana la ruta más larga). Lo usa Claude Code (CLAUDE.md) y la CI.
//
//   node scripts/dueno.mjs --quien                      → tu rol (lee .rol; si no, la rama p1/ p2/ p3/)
//   node scripts/dueno.mjs --soy P2                     → guarda tu rol en .rol (ignorado por git)
//   node scripts/dueno.mjs --puede src/games/torre/x.ts → ¿puedo editar esto? (sale 0 sí, 1 no)
//   node scripts/dueno.mjs --cambios [--base origin/main] → revisa todo lo que cambiaste contra tu rol
//   node scripts/dueno.mjs --rol P3 …                   → fuerza el rol solo para esa llamada
//
// Cambiar un rol ya guardado exige --autoriza-coordinacion (la coordinación lo decide, no la persona).
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url)
const { reglas, roles } = JSON.parse(readFileSync(new URL('docs/equipo/propiedad.json', RAIZ), 'utf8'))
const ARCHIVO_ROL = new URL('.rol', RAIZ)
const args = process.argv.slice(2)
const val = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const tiene = (k) => args.includes(k)

const norm = (r) => r.replace(/\\/g, '/').replace(/^\.\//, '')

function reglaDe(ruta) {
  const r = norm(ruta)
  let mejor = null
  for (const x of reglas) {
    const coincide = x.ruta.endsWith('/') ? r.startsWith(x.ruta) : r === x.ruta
    if (coincide && (!mejor || x.ruta.length > mejor.ruta.length)) mejor = x
  }
  return mejor
}

function rolGuardado() {
  return existsSync(ARCHIVO_ROL) ? readFileSync(ARCHIVO_ROL, 'utf8').trim() : null
}
function rolPorRama() {
  try {
    const rama = execSync('git rev-parse --abbrev-ref HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const m = /^p([123])\//i.exec(rama)
    return m ? `P${m[1]}` : null
  } catch {
    return null
  }
}
const rolActual = () => val('--rol') ?? process.env.DUENO_ROL ?? rolGuardado() ?? rolPorRama()

function veredicto(ruta, rol) {
  const r = reglaDe(ruta)
  // La coordinación es quien arbitra: puede editar cualquier archivo (y avisa si toca algo con otro dueño).
  if (rol === 'coordinación') return { ok: true, compartido: false, nota: r && !r.duenos.includes(rol) ? `dueño: ${r.duenos.join(' / ')}` : r?.nota, dueños: r?.duenos ?? [] }
  if (!r) return { ok: false, motivo: 'sin dueño asignado: pregunta a coordinación', dueños: [] }
  if (r.duenos.includes(rol)) {
    return { ok: true, compartido: Boolean(r.compartido), nota: r.nota, dueños: r.duenos }
  }
  return { ok: false, motivo: `es de ${r.duenos.join(' / ')}`, dueños: r.duenos }
}

function cambiados(base) {
  const sh = (c) => {
    try {
      return execSync(c, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').map((s) => s.trim()).filter(Boolean)
    } catch {
      return []
    }
  }
  const conBase = sh(`git diff --name-only ${base}...HEAD`)
  const sucios = sh('git diff --name-only HEAD')
  const nuevos = sh('git ls-files -o --exclude-standard')
  return [...new Set([...conBase, ...sucios, ...nuevos])].filter((f) => f !== '.rol' && !f.startsWith('.claude/'))
}

const salirConRol = () => {
  console.error('Sin rol. Dime quién eres: node scripts/dueno.mjs --soy P1|P2|P3  (coordinación: --soy coordinación)')
  process.exit(2)
}

if (tiene('--soy')) {
  const rol = val('--soy')
  if (!roles.includes(rol)) {
    console.error(`Rol inválido "${rol}". Opciones: ${roles.join(', ')}`)
    process.exit(1)
  }
  const actual = rolGuardado()
  if (actual && actual !== rol && !tiene('--autoriza-coordinacion')) {
    console.error(`Ya estás registrado como ${actual}. Cambiar de rol lo decide la coordinación (no la persona ni Claude).`)
    process.exit(1)
  }
  writeFileSync(ARCHIVO_ROL, rol + '\n')
  console.log(`Rol guardado: ${rol}`)
  process.exit(0)
}

if (tiene('--quien')) {
  const rol = rolActual()
  if (!rol) salirConRol()
  console.log(rol)
  process.exit(0)
}

if (tiene('--puede')) {
  const rol = rolActual()
  if (!rol) salirConRol()
  const rutas = args.slice(args.indexOf('--puede') + 1).filter((a) => !a.startsWith('--') && a !== rol)
  let mal = 0
  for (const ruta of rutas) {
    const v = veredicto(ruta, rol)
    if (v.ok) {
      console.log(`SÍ  ${norm(ruta)}${v.compartido ? '  (compartido: solo agregar líneas)' : ''}${v.nota ? `  [${v.nota}]` : ''}`)
    } else {
      mal++
      console.log(`NO  ${norm(ruta)}  ${v.motivo}. Pídelo con el formato de docs/equipo/contratos.md §8.`)
    }
  }
  process.exit(mal ? 1 : 0)
}

if (tiene('--cambios')) {
  const rol = rolActual()
  if (!rol) salirConRol()
  const base = val('--base') ?? 'origin/main'
  const archivos = cambiados(base)
  const mal = []
  const compartidos = []
  for (const f of archivos) {
    const v = veredicto(f, rol)
    if (!v.ok) mal.push(`${f}  → ${v.motivo}`)
    else if (v.compartido) compartidos.push(f)
  }
  console.log(`Rol ${rol} · ${archivos.length} archivo(s) cambiado(s) respecto de ${base}`)
  if (compartidos.length) console.log('Compartidos (verifica que solo agregaste líneas):\n  ' + compartidos.join('\n  '))
  if (mal.length) {
    console.error('\nArchivos que NO son tuyos:\n  ' + mal.join('\n  '))
    console.error('\nSi de verdad hace falta, pídelo (contratos.md §8) o haz un PR aparte marcando al dueño.')
    process.exit(1)
  }
  console.log('Todo es tuyo o compartido. OK')
  process.exit(0)
}

console.log('Uso: --quien | --soy <P1|P2|P3|coordinación> | --puede <ruta…> | --cambios [--base origin/main] (ver encabezado del archivo)')
process.exit(1)
