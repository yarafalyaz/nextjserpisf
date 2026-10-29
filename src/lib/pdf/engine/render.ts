/**
 * Engine PDF deklaratif (server-side, jsPDF) untuk lembar laporan.
 *
 * Menggambar ulang tampilan `ReportSheet` + tabel `.stmt` langsung ke PDF:
 * kop di tengah, judul, baris periode, tabel bergaris horisontal, blok tanda
 * tangan, dan footer nomor halaman. Karena koordinatnya dihitung di sini (bukan
 * diwarisi dari DOM), hasil cetak selalu identik dengan data — dan tombol Cetak
 * tidak perlu lagi mencetak halaman HTML aplikasi.
 *
 * Tanpa ketergantungan DOM: aman dipanggil dari route handler Node.
 */

import { jsPDF } from "jspdf"
import type { StatementTable, StatementTableRow } from "@/lib/reports/statement-table"
import type {
  DocumentHeader,
  StatementDocument,
  TableColumn,
  TableDocument,
  TableRow,
} from "./types"

const A4_WIDTH = 210
const MARGIN = 15
const RIGHT_EDGE = A4_WIDTH - MARGIN
/** Batas bawah isi — di atas garis footer (282). */
const BOTTOM_LIMIT = 272
const TOP = 18
const FOOTER_Y = 282

const FONT = "Helvetica"
const INK = "#111827"
const MUTED = "#6b7280"
const SOFT_RULE = "#9ca3af"

/** Lebar kolom kode (mm) — padanan `.col-code { width: 68px }`. */
const CODE_WIDTH = 20
const ROW_HEIGHT = 4.6
const INDENT_MM = 4
/** Jarak antar kolom angka saat ada kolom persen. */
const VALUE_COLUMN_GAP = 17

/** Format gambar jsPDF dari mime pada data URL. */
export function imageFormatFor(dataUrl: string): string {
  const match = /^data:image\/(\w+)/.exec(dataUrl)
  const type = (match?.[1] || "png").toUpperCase()
  if (type === "JPG" || type === "JPEG") return "JPEG"
  if (type === "WEBP") return "WEBP"
  return "PNG"
}

/** Posisi tepi kanan tiap kolom angka (kolom terakhir paling kanan). */
function valueColumnEdges(count: number): number[] {
  if (count <= 1) return [RIGHT_EDGE]
  const edges: number[] = []
  let edge = RIGHT_EDGE
  for (let index = count - 1; index >= 0; index -= 1) {
    edges[index] = edge
    edge -= VALUE_COLUMN_GAP
  }
  return edges
}

function setStyle(doc: jsPDF, size: number, style: "normal" | "bold" | "italic", color: string) {
  doc.setFont(FONT, style)
  doc.setFontSize(size)
  doc.setTextColor(color)
}

/** Kop + judul + baris periode. Mengembalikan posisi y siap untuk header tabel. */
function drawLetterhead(doc: jsPDF, model: DocumentHeader, pageWidth = A4_WIDTH): number {
  const { letterhead } = model
  const center = pageWidth / 2
  const rightEdge = pageWidth - MARGIN
  let y = TOP

  if (letterhead.logo) {
    try {
      const { dataUrl, width, height } = letterhead.logo
      const aspect = width > 0 ? height / width : 0.7
      const logoWidth = Math.min(12 / aspect, 60)
      const logoHeight = logoWidth * aspect
      doc.addImage(dataUrl, imageFormatFor(dataUrl), (pageWidth - logoWidth) / 2, y - 2, logoWidth, logoHeight)
      y += logoHeight + 1.5
    } catch {
      // Logo yang tidak terbaca cukup dilewati — kop tetap tercetak tanpa gambar.
    }
  }

  setStyle(doc, 12.5, "bold", INK)
  y += 3.5
  doc.text(letterhead.companyName.toUpperCase(), center, y, { align: "center" })

  setStyle(doc, 8.5, "normal", MUTED)
  for (const line of letterhead.addressLines) {
    y += 3.6
    doc.text(line, center, y, { align: "center" })
  }
  if (letterhead.contactParts.length > 0) {
    y += 3.6
    doc.text(letterhead.contactParts.join("  •  "), center, y, { align: "center" })
  }

  y += 2.6
  doc.setDrawColor(INK)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, rightEdge, y)

  y += 7
  setStyle(doc, 13, "bold", INK)
  doc.text(model.title.toUpperCase(), center, y, { align: "center" })

  if (model.subtitle) {
    y += 4
    setStyle(doc, 9, "normal", MUTED)
    doc.text(model.subtitle, center, y, { align: "center" })
  }

  y += 5.6
  setStyle(doc, 9, "bold", INK)
  doc.text(model.periodCaption, MARGIN, y)
  if (model.metaRight) {
    setStyle(doc, 8.5, "normal", MUTED)
    doc.text(model.metaRight, rightEdge, y, { align: "right" })
  }

  return y + 3
}

/** Header kolom tabel (digambar ulang di setiap halaman). */
function drawTableHeader(doc: jsPDF, table: StatementTable, y: number): number {
  const edges = valueColumnEdges(Math.max(table.columns.length - 2, 1))

  setStyle(doc, 9.5, "bold", INK)
  doc.text(table.columns[0]?.header ?? "", MARGIN, y)
  if (table.columns[1]) doc.text(table.columns[1].header, MARGIN + CODE_WIDTH, y)
  table.columns.slice(2).forEach((column, index) => {
    doc.text(column.header, edges[index] ?? RIGHT_EDGE, y, { align: "right" })
  })

  doc.setDrawColor(INK)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y + 1.3, RIGHT_EDGE, y + 1.3)

  return y + 5
}

/** Tinggi baris (mm) — baris akun bisa membungkus beberapa baris teks. */
function measureRow(doc: jsPDF, row: StatementTableRow, descriptionWidth: number, firstEdge: number): number {
  if (row.kind === "group") return ROW_HEIGHT + 2.6

  if (row.kind === "notice") {
    setStyle(doc, 8, "normal", MUTED)
    return doc.splitTextToSize(row.text, A4_WIDTH - MARGIN * 2).length * 3.6 + 4
  }

  if (row.kind === "line") {
    setStyle(doc, 10, "normal", INK)
    const indent = Math.min(row.level + 1, 3) * INDENT_MM
    const lines = doc.splitTextToSize(row.name, Math.max(descriptionWidth - indent, 20))
    return Math.max(1, lines.length) * ROW_HEIGHT
  }

  setStyle(doc, 10, "bold", INK)
  const lines = doc.splitTextToSize(row.label, Math.max(firstEdge - MARGIN - 4, 20))
  return Math.max(1, lines.length) * ROW_HEIGHT
}

/** Menggambar satu baris; mengembalikan posisi y berikutnya. */
function drawRow(
  doc: jsPDF,
  row: StatementTableRow,
  descriptionWidth: number,
  edges: number[],
  y: number,
): number {
  let cursor = y

  if (row.kind === "group") {
    cursor += 2.6
    setStyle(doc, 10, "bold", INK)
    doc.text(row.label.toUpperCase(), MARGIN, cursor)
    return cursor + ROW_HEIGHT
  }

  if (row.kind === "notice") {
    cursor += 2
    setStyle(doc, 8, "normal", MUTED)
    const lines = doc.splitTextToSize(row.text, A4_WIDTH - MARGIN * 2)
    doc.text(lines, MARGIN, cursor)
    return cursor + lines.length * 3.6 + 2
  }

  if (row.kind === "line") {
    const indent = Math.min(row.level + 1, 3) * INDENT_MM
    const weight = row.hasChildren ? "bold" : "normal"
    setStyle(doc, 10, weight, INK)
    doc.text(row.code, MARGIN, cursor)
    const lines = doc.splitTextToSize(row.name, Math.max(descriptionWidth - indent, 20))
    doc.text(lines, MARGIN + CODE_WIDTH + indent, cursor)
    row.values.forEach((value, index) => {
      doc.text(value, edges[index] ?? RIGHT_EDGE, cursor, { align: "right" })
    })
    return cursor + Math.max(1, lines.length) * ROW_HEIGHT
  }

  // subtotal | total | grand
  const firstEdge = edges[0] ?? RIGHT_EDGE
  const indent = row.kind === "subtotal" ? (row.indent ?? 0) * INDENT_MM : 0

  if (row.kind === "grand") {
    // Garis ganda di atas (padanan `border-top: 3px double`).
    doc.setDrawColor(INK)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, cursor - 2.2, RIGHT_EDGE, cursor - 2.2)
    doc.line(MARGIN, cursor - 1.2, RIGHT_EDGE, cursor - 1.2)
  } else if (row.kind === "subtotal") {
    doc.setDrawColor(SOFT_RULE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, cursor - 2, RIGHT_EDGE, cursor - 2)
  } else {
    doc.setDrawColor(INK)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, cursor - 2, RIGHT_EDGE, cursor - 2)
  }

  setStyle(doc, row.kind === "grand" ? 10.5 : 10, "bold", INK)
  const lines = doc.splitTextToSize(row.label, Math.max(firstEdge - MARGIN - indent - 4, 20))
  doc.text(lines, MARGIN + indent, cursor)
  row.values.forEach((value, index) => {
    doc.text(value, edges[index] ?? RIGHT_EDGE, cursor, { align: "right" })
  })
  cursor += Math.max(1, lines.length) * ROW_HEIGHT

  if (row.kind === "total") {
    doc.setDrawColor(INK)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, cursor - 2.6, RIGHT_EDGE, cursor - 2.6)
    doc.line(MARGIN, cursor - 1.9, RIGHT_EDGE, cursor - 1.9)
  }

  return cursor
}

/**
 * Menggambar tabel statement. Header kolom diulang setiap kali pindah halaman,
 * sehingga lembar yang panjang tetap terbaca.
 */
function drawTable(doc: jsPDF, table: StatementTable, startY: number): number {
  const edges = valueColumnEdges(Math.max(table.columns.length - 2, 1))
  const descriptionWidth = (edges[0] ?? RIGHT_EDGE) - (MARGIN + CODE_WIDTH) - 4
  let y = drawTableHeader(doc, table, startY)

  for (const row of table.rows) {
    if (y + measureRow(doc, row, descriptionWidth, edges[0] ?? RIGHT_EDGE) > BOTTOM_LIMIT) {
      doc.addPage()
      y = drawTableHeader(doc, table, TOP)
    }
    y = drawRow(doc, row, descriptionWidth, edges, y)
  }

  return y
}

/** Blok tanda tangan di bawah tabel (rata kanan, seperti `.doc-foot-sig`). */
function drawSignatures(doc: jsPDF, labels: string[], y: number, pageWidth = A4_WIDTH): number {
  const blockWidth = 52
  const gap = 10
  const totalWidth = labels.length * blockWidth + (labels.length - 1) * gap
  let x = pageWidth - MARGIN - totalWidth

  setStyle(doc, 9, "normal", INK)
  for (const label of labels) {
    doc.text(label, x + blockWidth / 2, y, { align: "center" })
    doc.setDrawColor(MUTED)
    doc.setLineWidth(0.2)
    doc.line(x, y + 18, x + blockWidth, y + 18)
    x += blockWidth + gap
  }

  return y + 18
}

/** Footer tiap halaman: sumber cetak di kiri, nomor halaman di kanan. */
function drawFooters(doc: jsPDF, printFooter: string, pageWidth = A4_WIDTH) {
  const rightEdge = pageWidth - MARGIN
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(SOFT_RULE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, FOOTER_Y, rightEdge, FOOTER_Y)
    setStyle(doc, 7.5, "normal", MUTED)
    doc.text(printFooter, MARGIN, FOOTER_Y + 3.5)
    doc.text(`Halaman ${page} dari ${pageCount}`, rightEdge, FOOTER_Y + 3.5, { align: "right" })
  }
}

/** Menggambar dokumen statement dan mengembalikan objek jsPDF-nya (untuk diuji). */
export function renderStatementPdf(model: StatementDocument): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  let y = drawTable(doc, model.table, drawLetterhead(doc, model))

  if (model.signatures && model.signatures.length > 0) {
    // Blok tanda tangan butuh ~20mm; pindah halaman bila tidak cukup.
    if (y + 24 > BOTTOM_LIMIT) {
      doc.addPage()
      y = TOP
    }
    drawSignatures(doc, model.signatures, Math.max(y + 14, 244))
  }

  drawFooters(doc, model.printFooter)

  return doc
}

/** Bytes PDF siap dikirim sebagai respons HTTP. */
export function renderStatementPdfBytes(model: StatementDocument): Uint8Array<ArrayBuffer> {
  const buffer = renderStatementPdf(model).output("arraybuffer") as ArrayBuffer
  return new Uint8Array(buffer)
}

// ─── Tabel generik (laporan berbentuk daftar) ────────────────────────────────

/**
 * Lebar kolom efektif (mm). Bila Σwidth lampaui area isi, semua kolom
 * diskalakan proporsional (fit-to-width) — laporan lebar (buku besar kas
 * 422mm, scrap 406mm) muat di kertas tanpa ubah builder satu-satu.
 * Kolom sempit tidak diskalakan naik: tabel di bawah area isi tetap apa adanya.
 */
export function fitColumnWidths(columns: TableColumn[], contentWidth: number): number[] {
  const total = columns.reduce((sum, column) => sum + column.width, 0)
  if (total <= contentWidth || total <= 0) return columns.map((column) => column.width)
  const scale = contentWidth / total
  return columns.map((column) => column.width * scale)
}

/** Posisi x tepi kiri tiap kolom, dari lebar kolom (mm). */
function columnEdges(columns: TableColumn[], widths: number[]): { start: number; end: number }[] {
  let x = MARGIN
  return columns.map((column, index) => {
    const start = x
    x += widths[index] ?? column.width
    return { start, end: x }
  })
}

function drawTableColumnHeaders(
  doc: jsPDF,
  columns: TableColumn[],
  edges: { start: number; end: number }[],
  y: number,
  rightEdge: number,
): number {
  setStyle(doc, 9, "bold", INK)
  columns.forEach((column, index) => {
    const at = edges[index]
    if (column.align === "right") doc.text(column.header, at.end, y, { align: "right" })
    else if (column.align === "center") doc.text(column.header, (at.start + at.end) / 2, y, { align: "center" })
    else doc.text(column.header, at.start, y)
  })

  doc.setDrawColor(INK)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y + 1.3, rightEdge, y + 1.3)

  return y + 5
}

/**
 * Tinggi baris tabel generik. Sel angka tidak dibungkus (satu baris); kolom teks
 * boleh membungkus sehingga barisnya tumbuh.
 */
function measureTableRow(
  doc: jsPDF,
  row: TableRow,
  columns: TableColumn[],
  widths: number[],
  rightEdge: number,
): number {
  if (row.kind === "group") return ROW_HEIGHT + 2.6

  if (row.kind === "notice") {
    setStyle(doc, 8, "normal", MUTED)
    return doc.splitTextToSize(row.text, rightEdge - MARGIN).length * 3.6 + 4
  }

  if (row.kind === "total") {
    setStyle(doc, 10, "bold", INK)
    const labelWidth = widths
      .slice(0, Math.max(columns.length - row.cells.length, 1))
      .reduce((sum, width) => sum + width, 0)
    return Math.max(1, doc.splitTextToSize(row.label, labelWidth).length) * ROW_HEIGHT
  }

  setStyle(doc, 9, row.bold ? "bold" : "normal", INK)
  const wrapped = row.cells.reduce((max, cell, index) => {
    const column = columns[index]
    if (!column || column.align !== "left") return max
    return Math.max(max, doc.splitTextToSize(cell, (widths[index] ?? column.width) - 2).length)
  }, 1)
  return Math.max(1, wrapped) * ROW_HEIGHT
}

function drawTableRow(
  doc: jsPDF,
  row: TableRow,
  columns: TableColumn[],
  widths: number[],
  edges: { start: number; end: number }[],
  rightEdge: number,
  y: number,
): number {
  if (row.kind === "group") {
    setStyle(doc, 9.5, "bold", INK)
    doc.text(row.label.toUpperCase(), MARGIN, y + 2.6)
    return y + ROW_HEIGHT + 2.6
  }

  if (row.kind === "notice") {
    setStyle(doc, 8, "normal", MUTED)
    const lines = doc.splitTextToSize(row.text, rightEdge - MARGIN)
    doc.text(lines, MARGIN, y + 2)
    return y + lines.length * 3.6 + 4
  }

  if (row.kind === "total") {
    if (row.grand) {
      doc.setDrawColor(INK)
      doc.setLineWidth(0.3)
      doc.line(MARGIN, y - 2.2, rightEdge, y - 2.2)
      doc.line(MARGIN, y - 1.2, rightEdge, y - 1.2)
    } else {
      doc.setDrawColor(SOFT_RULE)
      doc.setLineWidth(0.2)
      doc.line(MARGIN, y - 2, rightEdge, y - 2)
    }

    setStyle(doc, 10, "bold", INK)
    const leadingCount = Math.max(columns.length - row.cells.length, 1)
    const labelWidth = widths.slice(0, leadingCount).reduce((sum, width) => sum + width, 0)
    const lines = doc.splitTextToSize(row.label, Math.max(labelWidth, 20))
    doc.text(lines, MARGIN, y)
    // Sel angka baris total sejajar dengan kolom TERAKHIR, bukan kolom pertama:
    // label sudah membentang kolom-kolom di depannya.
    drawTableCells(doc, row.cells, columns.slice(leadingCount), widths.slice(leadingCount), edges.slice(leadingCount), y, true)
    return y + Math.max(1, lines.length) * ROW_HEIGHT
  }

  setStyle(doc, 9, row.bold ? "bold" : "normal", INK)
  const height = drawTableCells(doc, row.cells, columns, widths, edges, y, false)
  return y + Math.max(1, height) * ROW_HEIGHT
}

/** Menggambar sel sejajar kolom; mengembalikan jumlah baris teks terbanyak. */
function drawTableCells(
  doc: jsPDF,
  cells: string[],
  columns: TableColumn[],
  widths: number[],
  edges: { start: number; end: number }[],
  y: number,
  singleLine: boolean,
): number {
  let rows = 1

  cells.forEach((cell, index) => {
    const column = columns[index]
    const at = edges[index]
    if (!column || !at) return

    if (column.align === "right") {
      doc.text(cell, at.end, y, { align: "right" })
      return
    }
    if (column.align === "center") {
      doc.text(cell, (at.start + at.end) / 2, y, { align: "center" })
      return
    }

    const lines = singleLine ? [cell] : doc.splitTextToSize(cell, (widths[index] ?? column.width) - 2)
    doc.text(lines, at.start, y)
    rows = Math.max(rows, lines.length)
  })

  return rows
}

function drawGenericTable(
  doc: jsPDF,
  table: TableDocument["table"],
  startY: number,
  rightEdge: number,
): number {
  const widths = fitColumnWidths(table.columns, rightEdge - MARGIN)
  const edges = columnEdges(table.columns, widths)
  let y = drawTableColumnHeaders(doc, table.columns, edges, startY, rightEdge)

  for (const row of table.rows) {
    if (y + measureTableRow(doc, row, table.columns, widths, rightEdge) > BOTTOM_LIMIT) {
      doc.addPage()
      y = drawTableColumnHeaders(doc, table.columns, edges, TOP, rightEdge)
    }
    y = drawTableRow(doc, row, table.columns, widths, edges, rightEdge, y)
  }

  return y
}

/** Menggambar laporan berbentuk daftar (registry, buku besar, kartu stok). */
export function renderTablePdf(model: TableDocument): jsPDF {
  const landscape = Boolean(model.landscape)
  const pageWidth = landscape ? 297 : A4_WIDTH
  const rightEdge = pageWidth - MARGIN

  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" })

  let y = drawGenericTable(doc, model.table, drawLetterhead(doc, model, pageWidth), rightEdge)

  if (model.signatures && model.signatures.length > 0) {
    if (y + 24 > BOTTOM_LIMIT) {
      doc.addPage()
      y = TOP
    }
    drawSignatures(doc, model.signatures, Math.max(y + 14, 244), pageWidth)
  }

  drawFooters(doc, model.printFooter, pageWidth)

  return doc
}

/** Bytes PDF laporan daftar siap dikirim sebagai respons HTTP. */
export function renderTablePdfBytes(model: TableDocument): Uint8Array<ArrayBuffer> {
  const buffer = renderTablePdf(model).output("arraybuffer") as ArrayBuffer
  return new Uint8Array(buffer)
}
