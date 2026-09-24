
'use client'

import { FileDown, Printer, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

/**
 * Helper: fetch system settings from a JSON endpoint for the PDF letterhead.
 * Uses browser-native fetch cache so repeated exports are efficient.
 */
interface Settings {
  companyName: string
  companyAddress: string | null
  companyPhone: string | null
  companyEmail: string | null
  companyWebsite: string | null
  companyLogo: string | null
  companyPostalCode: string | null
}
const DEFAULT_SETTINGS: Settings = {
  companyName: 'Perusahaan', companyAddress: null, companyPhone: null,
  companyEmail: null, companyWebsite: null, companyLogo: null, companyPostalCode: null,
}

async function fetchSettings(): Promise<Settings> {
  try {
    const res = await fetch('/api/system-settings')
    if (res.ok) return (await res.json()) as Settings
    return DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

// Colour palette — professional near-black + muted blue
const C = {
  primary: [30, 30, 30] as [number, number, number],
  accent: [41, 128, 185] as [number, number, number],
  text: [60, 60, 60] as [number, number, number],
  light: [100, 100, 100] as [number, number, number],
  line: [210, 210, 210] as [number, number, number],
  altRow: [248, 249, 250] as [number, number, number],
}

export function ExportButtons({ title }: { title: string }) {
  const handlePrint = () => {
    window.print()
  }

  const handleExportCSV = () => {
    const tables = document.querySelectorAll('[data-report-table]')
    if (tables.length === 0) {
      showError('Tidak ada data untuk di-export')
      return
    }

    let csv = `"${title}"\n\n`
    tables.forEach((table) => {
      const section = table.getAttribute('data-report-table')
      if (section) csv += `"${section}"\n`
      const rows = table.querySelectorAll('tr')
      rows.forEach((row) => {
        const cells = row.querySelectorAll('th, td')
        const rowData = Array.from(cells).map((cell) => {
          let text = (cell as HTMLElement).innerText.replace(/"/g, '""')
          if (/^[=+\-@\t|%]/.test(text)) text = '\t' + text
          return `"${text}"`
        })
        csv += rowData.join(',') + '\n'
      })
      csv += '\n'
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.replace(/\s+/g, '_')}_${toLocalDateOnly(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = async () => {
    const tables = document.querySelectorAll('[data-report-table]')
    if (tables.length === 0) {
      showError('Tidak ada data untuk di-export')
      return
    }

    const settings = await fetchSettings()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    const lm = 14, rm = 14
    const usable = pw - lm - rm
    const now = new Date()

    // ── Footer ──────────────────────────────────────────────────────────
    const drawFooter = () => {
      const page = doc.getCurrentPageInfo().pageNumber
      const total = doc.getNumberOfPages()
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.light)
      doc.text(
        `Dicetak: ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}  |  Halaman ${page} dari ${total}`,
        lm, ph - 14
      )
      doc.setDrawColor(...C.line)
      doc.line(lm, ph - 16, pw - rm, ph - 16)
    }

    // ── Letterhead ──────────────────────────────────────────────────────
    let top = 18

    // Company identity (left side)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.primary)
    doc.text(settings.companyName, lm, top + 7)

    const addrParts = [settings.companyAddress, settings.companyPostalCode].filter(Boolean)
    const contactParts = [settings.companyPhone ? `Telp: ${settings.companyPhone}` : null, settings.companyEmail || null].filter(Boolean)
    const metaLine = [addrParts.join(', '), contactParts.join('  |  ')].filter(Boolean).join('  •  ')
    if (metaLine) {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.light)
      doc.text(metaLine, lm, top + 13)
    }

    // Logo (right side)
    if (settings.companyLogo) {
      try {
        doc.addImage(settings.companyLogo, 'PNG', pw - rm - 40, top - 2, 0, 14, undefined, 'FAST')
      } catch { /* ignore image errors */ }
    }

    top += metaLine ? 28 : 24
    doc.setDrawColor(...C.primary)
    doc.setLineWidth(0.6)
    doc.line(lm, top, pw - rm, top)

    // Report title
    top += 10
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.primary)
    doc.text(title.replace(/_/g, ' '), pw / 2, top, { align: 'center' })

    // Period (from hidden div in ReportLetterhead)
    const periodEl = document.querySelector('[data-report-period]')
    const periodText = periodEl ? periodEl.getAttribute('data-report-period') || '' : ''
    if (periodText) {
      top += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.light)
      doc.text(periodText, pw / 2, top, { align: 'center' })
    }

    // Narrative text (from ReportNarration component)
    const narrationEl = document.querySelector('[data-report-narration]')
    if (narrationEl) {
      const narrationText = narrationEl.getAttribute('data-report-narration') || ''
      if (narrationText) {
        top += 8
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...C.light)
        const maxW = pw - lm - rm
        const lines = doc.splitTextToSize(narrationText, maxW)
        doc.text(lines, lm, top)
        top += lines.length * 4.5
      }
    }

    // Separator before table
    top += 5
    doc.setDrawColor(...C.line)
    doc.setLineWidth(0.3)
    doc.line(lm, top, pw - rm, top)

    // ── Tables ──────────────────────────────────────────────────────────
    let startY = top + 8

    for (let ti = 0; ti < tables.length; ti++) {
      if (ti > 0) startY += 6

      const sectionTitle = tables[ti].getAttribute('data-report-table')
      if (sectionTitle) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...C.primary)
        doc.text(sectionTitle, lm, startY)
        startY += 5.5
      }

      const headers: string[] = []
      const body: string[][] = []

      const headerRow = tables[ti].querySelector('thead tr')
      if (headerRow) {
        headerRow.querySelectorAll('th').forEach((th) => {
          headers.push((th as HTMLElement).innerText.trim())
        })
      }

      tables[ti].querySelectorAll('tbody tr').forEach((row) => {
        const rowData: string[] = []
        row.querySelectorAll('td').forEach((td) => {
          rowData.push((td as HTMLElement).innerText.trim())
        })
        if (rowData.length > 0) body.push(rowData)
      })

      if (headers.length > 0 && body.length > 0) {
        autoTable(doc, {
          head: [headers],
          body,
          startY,
          margin: { left: lm, right: rm, bottom: 26 },
          tableWidth: usable,
          styles: {
            fontSize: 8,
            cellPadding: 2.5,
            overflow: 'linebreak',
            textColor: [...C.text],
            lineColor: [...C.line],
            lineWidth: 0.2,
          },
          headStyles: {
            fillColor: [...C.accent],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
          },
          alternateRowStyles: {
            fillColor: [...C.altRow],
          },
          didDrawPage: drawFooter,
        })
        const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        if (last) startY = last.finalY
      }
    }

    // Final footer
    drawFooter()

    // Preview di tab baru, bukan auto-download
    const pdfBlob = doc.output('blob')
    const pdfUrl = URL.createObjectURL(pdfBlob)
    window.open(pdfUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000)
  }

  return (
    <div
      role="group"
      aria-label="Export dokumen"
      className="flex items-center gap-2 print:hidden"
    >
      <Button
        type="button"
        onClick={handleExportPDF}
        aria-label="Unduh sebagai PDF"
        variant="secondary"
        size="sm"
        className="gap-1.5"
      >
        <FileText size={16} aria-hidden="true" />
        PDF
      </Button>
      <Button
        type="button"
        onClick={handleExportCSV}
        aria-label="Unduh sebagai CSV"
        variant="secondary"
        size="sm"
        className="gap-1.5"
      >
        <FileDown size={16} aria-hidden="true" />
        CSV
      </Button>
      <Button
        type="button"
        onClick={handlePrint}
        aria-label="Cetak halaman"
        variant="secondary"
        size="sm"
        className="gap-1.5"
      >
        <Printer size={16} aria-hidden="true" />
        Cetak
      </Button>
    </div>
  )
}
