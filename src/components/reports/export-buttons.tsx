/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { FileDown, Printer, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { showError } from "@/lib/utils/toast"

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
          const text = (cell as HTMLElement).innerText.replace(/"/g, '""')
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
    link.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = () => {
    const tables = document.querySelectorAll('[data-report-table]')
    if (tables.length === 0) {
      showError('Tidak ada data untuk di-export')
      return
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const now = new Date()

    // Header
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title.replace(/_/g, ' '), 14, 15)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Dicetak: ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`, 14, 22)

    // Line separator
    doc.setDrawColor(200)
    doc.line(14, 25, pageWidth - 14, 25)

    let startY = 30

    tables.forEach((table, tableIndex) => {
      const section = table.getAttribute('data-report-table')

      if (tableIndex > 0) {
        startY += 8
      }

      // Section title
      if (section) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(section, 14, startY)
        startY += 6
      }

      // Extract table data
      const headers: string[] = []
      const body: string[][] = []

      const headerRow = table.querySelector('thead tr')
      if (headerRow) {
        headerRow.querySelectorAll('th').forEach((th) => {
          headers.push((th as HTMLElement).innerText.trim())
        })
      }

      const bodyRows = table.querySelectorAll('tbody tr')
      bodyRows.forEach((row) => {
        const rowData: string[] = []
        row.querySelectorAll('td').forEach((td) => {
          rowData.push((td as HTMLElement).innerText.trim())
        })
        if (rowData.length > 0) body.push(rowData)
      })

      if (headers.length > 0 && body.length > 0) {
        autoTable(doc, {
          head: [headers],
          body: body,
          startY: startY,
          margin: { left: 14, right: 14 },
          styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak',
          },
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250],
          },
          didDrawPage: () => {
            // Footer on each page
            const pageCount = doc.getNumberOfPages()
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.text(
              `Halaman ${doc.getCurrentPageInfo().pageNumber} dari ${pageCount}`,
              pageWidth - 14,
              doc.internal.pageSize.getHeight() - 10,
              { align: 'right' }
            )
          },
        })

        // Get final Y position after table
        startY = (doc as any).lastAutoTable?.finalY || startY + 20
      }
    })

    doc.save(`${title.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.pdf`)
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        onClick={handleExportPDF}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-default bg-surface hover:bg-default/50 transition-colors"
      >
        <FileText size={16} />
        PDF
      </button>
      <button
        onClick={handleExportCSV}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-default bg-surface hover:bg-default/50 transition-colors"
      >
        <FileDown size={16} />
        CSV
      </button>
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-default bg-surface hover:bg-default/50 transition-colors"
      >
        <Printer size={16} />
        Print
      </button>
    </div>
  )
}
