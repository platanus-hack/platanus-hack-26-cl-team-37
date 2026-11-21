// Descarga de datos del paciente (F18): arma un paquete con todo lo suyo y lo convierte a JSON o CSV.
// Funciones puras (con pruebas en exportar.test.ts) + un reunir() que lee por `repos`.
import type { Alerta, Auditoria, Consentimiento, EventoSesion, Paciente, Plan, Sesion, Usuario } from '../../domain/types'

export interface PaqueteDatos {
  generado: string
  aviso: string
  perfil: { usuario: Pick<Usuario, 'nombre' | 'titulo' | 'rol'>; paciente: Omit<Paciente, 'usuarioId'> }
  planes: Plan[]
  sesiones: Sesion[]
  eventos: EventoSesion[]
  consentimientos: Consentimiento[]
  alertas: Alerta[]
  auditoria: Auditoria[]
}

export const AVISO_DESCARGA =
  'Copia de tus datos en ManoViva. No incluye video: la cámara nunca se guarda. Las medidas en cm y grados son estimaciones.'

export function aJson(p: PaqueteDatos): string {
  return JSON.stringify(p, null, 2)
}

/** Celda CSV: comillas dobles escapadas y entre comillas si hay coma, comilla o salto de línea. */
export function celdaCsv(v: unknown): string {
  const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/**
 * CSV "largo" de un solo archivo: una fila por campo de cada registro (tabla, registro, campo, valor).
 * Abre bien en Excel/Sheets y cubre todas las tablas sin columnas vacías; los campos con estructura
 * (parámetros, métricas, muestras, items) van como JSON dentro de la celda.
 */
export function aCsv(p: PaqueteDatos): string {
  const filas: string[][] = [['tabla', 'registro', 'campo', 'valor']]
  const agregar = (tabla: string, registro: string, obj: object) => {
    for (const [campo, valor] of Object.entries(obj)) filas.push([tabla, registro, campo, valor === undefined ? '' : (valor as never)])
  }
  filas.push(['generado', '', 'fecha', p.generado as never])
  agregar('perfil', 'usuario', p.perfil.usuario)
  agregar('perfil', 'paciente', p.perfil.paciente)
  for (const x of p.planes) agregar('plan', `v${x.version}`, x)
  for (const x of p.sesiones) agregar('sesion', x.id, x)
  for (const x of p.eventos) agregar('evento', `${x.sesionId}#${x.seq}`, x)
  for (const x of p.consentimientos) agregar('consentimiento', x.id, x)
  for (const x of p.alertas) agregar('alerta', x.id, x)
  for (const x of p.auditoria) agregar('auditoria', String(x.id), x)
  // BOM para que Excel reconozca UTF-8; saltos CRLF según RFC 4180.
  return '﻿' + filas.map((f) => f.map(celdaCsv).join(',')).join('\r\n') + '\r\n'
}

export function nombreArchivo(formato: 'json' | 'csv', d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `manoviva-mis-datos-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${formato}`
}

/** Dispara la descarga en el navegador (Blob local: nada sale del teléfono). */
export function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
