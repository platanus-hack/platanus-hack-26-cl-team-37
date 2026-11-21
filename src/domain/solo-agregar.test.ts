// F15 · Prueba estática: no existe código que edite o borre la Auditoría ni sesiones cerradas.
// Lee el código fuente de src/ y scripts/ (import.meta.glob ?raw) y busca, en cada cadena de consulta de Supabase,
// update/delete/upsert contra `auditoria`; delete contra `sesiones` o `eventos_sesion`; y update de `sesiones` fuera de la
// capa de datos. La BD lo impide además con triggers (también se comprueba que sigan en las migraciones).
import { describe, expect, it } from 'vitest'

const leer = (m: Record<string, unknown>) => m as Record<string, string>
const fuentes: Record<string, string> = {
  ...leer(import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })),
  ...leer(import.meta.glob('/scripts/*.{ts,mjs}', { query: '?raw', import: 'default', eager: true })),
}
const migraciones = leer(import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }))

/**
 * Excepciones DOCUMENTADAS (scripts que corren solo con service_role, nunca en el navegador):
 *  - scripts/seed.ts: siembra y reinicia los datos demo ficticios (usa las RPC reset_demo / limpiar_*).
 *  - scripts/limpiar-*.ts: limpieza de los e2e (RPC solo service_role; el borrado lo hace la BD, no el script).
 *  - scripts/verificar-rls.ts: SONDA negativa: intenta editar la auditoría con la cuenta demo para comprobar que la BD lo rechaza.
 */
const EXCEPCIONES = [/^\/scripts\/seed\.ts$/, /^\/scripts\/limpiar-.*\.ts$/, /^\/scripts\/verificar-rls\.ts$/]
const esExcepcion = (ruta: string) => EXCEPCIONES.some((r) => r.test(ruta))
const esPrueba = (ruta: string) => /\.test\.tsx?$/.test(ruta)

/** Quita comentarios para no contar texto explicativo. */
function sinComentarios(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Cada cadena `.from('<tabla>') ...` hasta el siguiente `.from(` o `;` o 5 líneas. */
function cadenas(codigo: string, tabla: string): string[] {
  const re = new RegExp(`\\.from\\(\\s*['"\`]${tabla}['"\`]\\s*\\)`, 'g')
  const out: string[] = []
  for (const m of codigo.matchAll(re)) {
    const resto = codigo.slice(m.index! + m[0].length, m.index! + m[0].length + 600)
    const corte = resto.search(/\.from\(|;|\n\s*\n/)
    out.push(corte >= 0 ? resto.slice(0, corte) : resto)
  }
  return out
}

const archivos = Object.entries(fuentes)
  .filter(([ruta]) => !esPrueba(ruta) && !esExcepcion(ruta))
  .map(([ruta, texto]) => [ruta, sinComentarios(texto)] as const)

function infracciones(tabla: string, operaciones: string[], permitido: (ruta: string) => boolean = () => false): string[] {
  const hallazgos: string[] = []
  const op = new RegExp(`\\.(${operaciones.join('|')})\\(`)
  for (const [ruta, codigo] of archivos) {
    if (permitido(ruta)) continue
    for (const c of cadenas(codigo, tabla)) {
      const m = c.match(op)
      if (m) hallazgos.push(`${ruta}: .from('${tabla}')…${m[0]}`)
    }
  }
  return hallazgos
}

describe('solo agregar: auditoría y sesiones cerradas', () => {
  it('lee el código fuente (la prueba no es vacía)', () => {
    expect(archivos.length).toBeGreaterThan(40)
    expect(archivos.some(([r]) => r === '/src/data/supabaseRepos.ts')).toBe(true)
    // La captura de la regla funciona: el repositorio sí inserta en auditoría.
    const repo = archivos.find(([r]) => r === '/src/data/supabaseRepos.ts')![1]
    expect(cadenas(repo, 'auditoria').some((c) => /\.insert\(/.test(c))).toBe(true)
  })

  it('nada edita ni borra la tabla auditoria', () => {
    expect(infracciones('auditoria', ['update', 'delete', 'upsert'])).toEqual([])
  })

  it('nada borra sesiones ni eventos de sesión', () => {
    expect(infracciones('sesiones', ['delete'])).toEqual([])
    expect(infracciones('eventos_sesion', ['delete', 'update'])).toEqual([])
  })

  it('solo la capa de datos edita sesiones (la BD rechaza editar una cerrada) y nunca desde pantallas', () => {
    expect(infracciones('sesiones', ['update', 'upsert'], (r) => r === '/src/data/supabaseRepos.ts')).toEqual([])
    // El cierre solo toca sesiones 'en curso'.
    const repo = archivos.find(([r]) => r === '/src/data/supabaseRepos.ts')![1]
    const cierre = cadenas(repo, 'sesiones').filter((c) => /estado:\s*'cerrada'/.test(c))
    expect(cierre.length).toBeGreaterThan(0)
    for (const c of cierre) expect(c).toMatch(/\.eq\(\s*'estado'\s*,\s*'en curso'\s*\)/)
  })

  it('no hay funciones ni RPC con nombre de editar/borrar auditoría', () => {
    const malos: string[] = []
    const nombre = /\b(?:actualizar|editar|modificar|borrar|eliminar|update|delete|remove)_?(?:de)?_?auditor[ií]a\w*/gi
    const rpc = /\.rpc\(\s*['"`](\w*(?:auditoria|auditar)\w*)['"`]/g
    for (const [ruta, codigo] of archivos) {
      for (const m of codigo.matchAll(nombre)) malos.push(`${ruta}: ${m[0]}`)
      for (const m of codigo.matchAll(rpc)) malos.push(`${ruta}: rpc ${m[1]}`)
    }
    expect(malos).toEqual([])
  })

  it('la interfaz AuditoriaRepo solo ofrece listar y registrar', () => {
    const repos = fuentes['/src/data/repos.ts']
    const bloque = repos.match(/export interface AuditoriaRepo \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const metodos = [...bloque.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1])
    expect(metodos).toEqual(['listar', 'registrar'])
  })

  it('las migraciones mantienen los triggers que la BD usa para impedirlo', () => {
    const sql = Object.values(migraciones).join('\n')
    expect(sql).toMatch(/create trigger auditoria_no_update before update on public\.auditoria/)
    expect(sql).toMatch(/create trigger auditoria_no_delete before delete on public\.auditoria/)
    expect(sql).toMatch(/create trigger sesiones_inmutables before update or delete on public\.sesiones/)
    expect(sql).toMatch(/sesión cerrada: es inmutable/)
  })

  it('el detector detecta una infracción de ejemplo', () => {
    const malo = `await supabase.from('auditoria').update({ accion: 'x' }).eq('id', 1)`
    expect(cadenas(malo, 'auditoria').some((c) => /\.update\(/.test(c))).toBe(true)
    const bueno = `await supabase.from('auditoria').insert({ a: 1 })\nawait supabase.from('sesiones').update({ a: 1 })`
    expect(cadenas(bueno, 'auditoria').some((c) => /\.update\(/.test(c))).toBe(false)
  })
})
