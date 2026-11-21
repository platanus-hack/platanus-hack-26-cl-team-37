// F15 · Exportar PDF y CSV. Cada exportación se anota en Auditoría (quién, cuándo, qué) ANTES de entregar el archivo:
// si no se puede dejar constancia, no se exporta.
import { repos } from '../data/repos'
import { verificarSesion } from '../domain/integridad'
import type { EventoSesion, Paciente, Sesion, Usuario } from '../domain/types'
import { csvEventos, csvSesiones, type EstadoIntegridad } from './csv'
import { datosPdf, nombreArchivo } from './pdfDatos'

export interface ContextoExport {
  paciente: Paciente
  terapeuta: string | null
  usuario: Usuario
}

export interface Preparado {
  eventos: EventoSesion[]
  integridad: Record<string, EstadoIntegridad>
}

/** Lee los eventos de cada sesión y recalcula su integridad (se incluye en los archivos exportados). */
export async function preparar(sesiones: Sesion[]): Promise<Preparado> {
  const eventos: EventoSesion[] = []
  const integridad: Record<string, EstadoIntegridad> = {}
  for (let i = 0; i < sesiones.length; i += 6) {
    await Promise.all(
      sesiones.slice(i, i + 6).map(async (s) => {
        const ev = await repos.sesiones.eventos(s.id)
        eventos.push(...ev)
        integridad[s.id] = await verificarSesion(s, ev)
      }),
    )
  }
  return { eventos, integridad }
}

export function descargar(contenido: Blob, nombre: string) {
  const url = URL.createObjectURL(contenido)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const csvBlob = (texto: string) => new Blob([texto], { type: 'text/csv;charset=utf-8' })
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function anotar(ctx: ContextoExport, formato: 'pdf' | 'csv', sesiones: Sesion[], periodo: string, archivos: string[]) {
  const unica = sesiones.length === 1 ? sesiones[0].id : null
  await repos.auditoria.registrar({
    accion: formato === 'pdf' ? 'exportar_pdf' : 'exportar_csv',
    entidad: unica ? 'sesion' : 'historial',
    entidadId: unica,
    pacienteId: ctx.paciente.id,
    despues: { formato, periodo, sesiones: sesiones.map((s) => s.id), archivos },
  })
}

/** PDF de una sesión o de un período. Devuelve el nombre del archivo. */
export async function exportarPdf(ctx: ContextoExport, sesiones: Sesion[], periodo: string): Promise<string> {
  const { integridad } = await preparar(sesiones)
  const datos = datosPdf({
    paciente: ctx.paciente,
    terapeuta: ctx.terapeuta,
    generadoPor: ctx.usuario.nombre,
    generadoEn: new Date(),
    periodo,
    sesiones,
    integridad,
  })
  const { generarPdf } = await import('./pdf')
  const blob = await generarPdf(datos)
  const nombre = nombreArchivo(sesiones.length === 1 ? sesiones[0].id : `historial-${new Date().toISOString().slice(0, 10)}`, 'pdf')
  await anotar(ctx, 'pdf', sesiones, periodo, [nombre])
  descargar(blob, nombre)
  return nombre
}

/** CSV: un archivo con una fila por sesión y otro con los eventos. Devuelve los nombres. */
export async function exportarCsv(ctx: ContextoExport, sesiones: Sesion[], periodo: string): Promise<string[]> {
  const { eventos, integridad } = await preparar(sesiones)
  const base = sesiones.length === 1 ? sesiones[0].id : `historial-${new Date().toISOString().slice(0, 10)}`
  const nombres = [nombreArchivo(`${base}-sesiones`, 'csv'), nombreArchivo(`${base}-eventos`, 'csv')]
  await anotar(ctx, 'csv', sesiones, periodo, nombres)
  descargar(csvBlob(csvSesiones(sesiones, integridad)), nombres[0])
  await pausa(350)
  descargar(csvBlob(csvEventos(eventos)), nombres[1])
  return nombres
}

