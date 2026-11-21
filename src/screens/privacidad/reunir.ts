// Lee todo lo del paciente por `repos` (con RLS: solo ve lo suyo) y arma el paquete de exportar.ts.
import { repos } from '../../data/repos'
import type { EventoSesion, Paciente, Usuario } from '../../domain/types'
import { AVISO_DESCARGA, type PaqueteDatos } from './exportar'

export async function reunir(usuario: Pick<Usuario, 'nombre' | 'titulo' | 'rol'>, paciente: Paciente): Promise<PaqueteDatos> {
  const [planes, sesiones, consentimientos, alertas, auditoria] = await Promise.all([
    repos.planes.versiones(paciente.id),
    repos.sesiones.listar(paciente.id),
    repos.consentimientos.listar(paciente.id),
    repos.alertas.delPaciente(paciente.id),
    repos.auditoria.listar(paciente.id),
  ])
  const eventos: EventoSesion[] = []
  for (let i = 0; i < sesiones.length; i += 6) {
    const lote = await Promise.all(sesiones.slice(i, i + 6).map((s) => repos.sesiones.eventos(s.id)))
    for (const e of lote) eventos.push(...e)
  }
  // `usuarioId` es un identificador interno de acceso: no hace falta en la copia.
  const { usuarioId: _u, ...pac } = paciente
  void _u
  return {
    generado: new Date().toISOString(),
    aviso: AVISO_DESCARGA,
    perfil: { usuario: { nombre: usuario.nombre, titulo: usuario.titulo ?? null, rol: usuario.rol }, paciente: pac },
    planes,
    sesiones,
    eventos,
    consentimientos,
    alertas,
    auditoria,
  }
}

