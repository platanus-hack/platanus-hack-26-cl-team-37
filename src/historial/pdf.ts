// F15 · Dibujo del PDF (jsPDF + autoTable, cargados con import() para no entrar al bundle principal).
// Gráficos de progreso dibujados con líneas vectoriales (sin imágenes de la cámara ni capturas).
import { fechaCorta, num } from '../lib/formato'
import type { DatosPdf, SerieGrafico } from './pdfDatos'

type Doc = import('jspdf').jsPDF
const finalY = (d: Doc): number | undefined => (d as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY

const MARGEN = 14
const COLOR_TEXTO: [number, number, number] = [30, 41, 59]
const COLOR_TENUE: [number, number, number] = [100, 116, 139]
const COLOR_LINEA: [number, number, number] = [37, 99, 235]

function grafico(doc: Doc, s: SerieGrafico, x: number, y: number, ancho: number, alto: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_TEXTO)
  doc.text(`${s.titulo} (${s.unidad})`, x, y)
  const gx = x + 10
  const gy = y + 4
  const gw = ancho - 12
  const gh = alto - 12
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.rect(gx, gy, gw, gh)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_TENUE)
  if (s.puntos.length < 1) {
    doc.text('Sin datos en este período', gx + 3, gy + gh / 2)
    return
  }
  const ys = s.puntos.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (max - min < 1e-9) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.1
  min -= pad
  max += pad
  const xs = s.puntos.map((p) => p.x)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const px = (v: number) => (x1 === x0 ? gx + gw / 2 : gx + 4 + ((v - x0) / (x1 - x0)) * (gw - 8))
  const py = (v: number) => gy + gh - 3 - ((v - min) / (max - min)) * (gh - 6)
  doc.text(num(max, s.unidad === '%' ? 0 : 1), gx - 1, gy + 3, { align: 'right' })
  doc.text(num(min, s.unidad === '%' ? 0 : 1), gx - 1, gy + gh, { align: 'right' })
  doc.text(fechaCorta(new Date(x0)), gx, gy + gh + 4)
  if (x1 !== x0) doc.text(fechaCorta(new Date(x1)), gx + gw, gy + gh + 4, { align: 'right' })
  doc.setDrawColor(...COLOR_LINEA)
  doc.setFillColor(...COLOR_LINEA)
  doc.setLineWidth(0.5)
  s.puntos.forEach((p, i) => {
    if (i > 0) doc.line(px(s.puntos[i - 1].x), py(s.puntos[i - 1].y), px(p.x), py(p.y))
  })
  s.puntos.forEach((p) => doc.circle(px(p.x), py(p.y), 0.7, 'F'))
}

/** Genera el PDF y devuelve los bytes. */
export async function generarPdf(d: DatosPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  doc.setProperties({ title: d.titulo, subject: 'Exportación ManoViva', creator: 'ManoViva' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...COLOR_TEXTO)
  doc.text('ManoViva', MARGEN, 16)
  doc.setFontSize(13)
  doc.text(d.titulo, MARGEN, 24)

  autoTable(doc, {
    startY: 28,
    body: d.encabezado,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 0.8, textColor: COLOR_TEXTO },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: COLOR_TENUE } },
    margin: { left: MARGEN, right: MARGEN },
  })
  let y = (finalY(doc) ?? 60) + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Métricas por sesión', MARGEN, y)
  autoTable(doc, {
    startY: y + 2,
    head: [d.columnas],
    body: d.filas.length ? d.filas : [['Sin sesiones en este período', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: COLOR_TEXTO },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: MARGEN, right: MARGEN, bottom: 16 },
  })
  y = (finalY(doc) ?? y) + 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLOR_TEXTO)
  doc.text(doc.splitTextToSize(d.dolor, ancho - 2 * MARGEN) as string[], MARGEN, y)
  y += 8

  // Gráficos de progreso (dos, lado a lado), en una página nueva si no caben.
  const altoGrafico = 56
  if (y + altoGrafico + 6 > alto - 16) {
    doc.addPage()
    y = 16
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Progreso', MARGEN, y)
  const mitad = (ancho - 2 * MARGEN - 8) / 2
  d.series.forEach((s, i) => grafico(doc, s, MARGEN + i * (mitad + 8), y + 7, mitad, altoGrafico))
  y += altoGrafico + 12

  // IDs y hashes de las sesiones incluidas.
  if (y + 20 > alto - 16) {
    doc.addPage()
    y = 16
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_TEXTO)
  doc.text('Sesiones incluidas: IDs y hashes SHA-256', MARGEN, y)
  autoTable(doc, {
    startY: y + 2,
    head: [['ID de sesión', 'Hash SHA-256', 'Integridad']],
    body: d.hashes.map((h) => [h.id, h.hash, h.integridad]),
    theme: 'grid',
    styles: { font: 'courier', fontSize: 7, cellPadding: 1.3, textColor: COLOR_TEXTO },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, font: 'helvetica', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 38 }, 2: { cellWidth: 26, font: 'helvetica' } },
    margin: { left: MARGEN, right: MARGEN, bottom: 16 },
  })

  // Pie en todas las páginas.
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR_TENUE)
    doc.text(d.pie, MARGEN, alto - 8)
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, alto - 8, { align: 'right' })
  }
  return doc.output('blob')
}
