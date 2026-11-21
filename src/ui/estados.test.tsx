import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Estados, Vacio } from './piezas'

const carga = <T,>(estado: string, datos: T | null) => ({ estado, datos, error: null, recargar: () => {} })

describe('Estados', () => {
  it('cargando', () => {
    expect(renderToStaticMarkup(<Estados r={carga('cargando', null)}>{() => 'contenido'}</Estados>)).toContain('Cargando…')
  })
  it('listo con datos → contenido', () => {
    expect(renderToStaticMarkup(<Estados r={carga('listo', { a: 1 })}>{(d) => `valor ${d.a}`}</Estados>)).toContain('valor 1')
  })
  it('listo con null → estado vacío, no "Cargando…" para siempre', () => {
    const html = renderToStaticMarkup(<Estados r={carga<{ a: number }>('listo', null)}>{() => 'contenido'}</Estados>)
    expect(html).not.toContain('Cargando…')
    expect(html).toContain('No encontramos esto')
  })
  it('listo con null → vacio propio', () => {
    const html = renderToStaticMarkup(
      <Estados r={carga<number>('listo', null)} vacio={<Vacio titulo="Sin sesión" />}>
        {() => 'contenido'}
      </Estados>,
    )
    expect(html).toContain('Sin sesión')
  })
})
