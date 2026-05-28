import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatCurrency, formatDate } from "@/lib/utils/format"

export interface CompanyInfo {
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
}

export interface DocumentInfo {
  title: string
  documentNo: string
  date: string
  dueDate?: string | null
  customerName: string
  customerAddress?: string | null
  customerPhone?: string | null
  notes?: string | null
}

export interface DocumentItem {
  no: number
  description: string
  qty: number
  price: number
  discount?: number
  total: number
}

export interface DocumentSummary {
  subtotal: number
  discount?: number
  tax?: number
  total: number
}

export function generateTransactionPDF(
  company: CompanyInfo,
  docInfo: DocumentInfo,
  items: DocumentItem[],
  summary: DocumentSummary
) {
  // A4 size: 210 x 297 mm
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  // Colors
  const darkGray = "#1f2937"
  const midGray = "#4b5563"
  const primaryColor = "#0284c7" // light blue brand color

  // Margin left & right
  const ml = 15
  let y = 20

  // 1. Header (Company Info)
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(primaryColor)
  doc.text(company.name, ml, y)

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  if (company.address) {
    y += 5
    const addrLines = doc.splitTextToSize(company.address, 100)
    doc.text(addrLines, ml, y)
    y += (addrLines.length - 1) * 4
  }

  y += 5
  let contactInfo = []
  if (company.phone) contactInfo.push(`T: ${company.phone}`)
  if (company.email) contactInfo.push(`E: ${company.email}`)
  if (company.website) contactInfo.push(`W: ${company.website}`)
  doc.text(contactInfo.join("   |   "), ml, y)

  // Decorative header line
  y += 3
  doc.setDrawColor(226, 232, 240) // border-default
  doc.setLineWidth(0.5)
  doc.line(ml, y, 210 - ml, y)

  // 2. Document Title & Main Meta
  y += 12
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(darkGray)
  doc.text(docInfo.title.toUpperCase(), ml, y)

  // Meta grid (Top right info)
  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  const metaRightX = 145
  doc.text("Nomor Dokumen :", metaRightX, y - 4)
  doc.setFont("Helvetica", "bold")
  doc.setTextColor(darkGray)
  doc.text(docInfo.documentNo, metaRightX + 28, y - 4)

  doc.setFont("Helvetica", "normal")
  doc.setTextColor(midGray)
  doc.text("Tanggal Dokumen :", metaRightX, y)
  doc.text(docInfo.date, metaRightX + 28, y)

  if (docInfo.dueDate) {
    doc.text("Jatuh Tempo       :", metaRightX, y + 4)
    doc.text(docInfo.dueDate, metaRightX + 28, y + 4)
  }

  // 3. Customer Info (Left side)
  y += 8
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(darkGray)
  doc.text("Kepada Yth:", ml, y)

  doc.setFont("Helvetica", "bold")
  doc.setFontSize(11)
  doc.text(docInfo.customerName, ml, y + 5)

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  let customerY = y + 9
  if (docInfo.customerAddress) {
    const custAddrLines = doc.splitTextToSize(docInfo.customerAddress, 90)
    doc.text(custAddrLines, ml, customerY)
    customerY += custAddrLines.length * 4
  }

  if (docInfo.customerPhone) {
    doc.text(`Telp: ${docInfo.customerPhone}`, ml, customerY)
  }

  // Set cursor past billing info
  y = Math.max(customerY + 12, y + 16)

  // 4. AutoTable for Items
  const tableBody = items.map((item) => [
    item.no,
    item.description,
    item.qty,
    formatCurrency(item.price),
    item.discount ? `${item.discount}%` : "-",
    formatCurrency(item.total),
  ])

  autoTable(doc, {
    startY: y,
    head: [["No", "Deskripsi / Nama Barang", "Qty", "Harga", "Potongan", "Total"]],
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [2, 132, 199], // primaryColor sky blue
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [31, 41, 55],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 35, halign: "right" },
    },
    margin: { left: ml, right: ml },
  })

  // Get position after table
  const finalY = (doc as any).lastAutoTable.finalY
  y = finalY + 10

  // 5. Notes & Summary Grid
  const summaryStartX = 135
  const rowH = 5

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  // Notes on the left
  if (docInfo.notes) {
    doc.setFont("Helvetica", "bold")
    doc.text("Catatan:", ml, y)
    doc.setFont("Helvetica", "normal")
    const noteLines = doc.splitTextToSize(docInfo.notes, 100)
    doc.text(noteLines, ml, y + 4)
  }

  // Summary list on the right
  doc.text("Subtotal", summaryStartX, y)
  doc.setFont("Helvetica", "bold")
  doc.setTextColor(darkGray)
  doc.text(formatCurrency(summary.subtotal), 210 - ml, y, { align: "right" })

  let currentY = y + rowH
  if (summary.discount && summary.discount > 0) {
    doc.setFont("Helvetica", "normal")
    doc.setTextColor(midGray)
    doc.text("Potongan / Diskon", summaryStartX, currentY)
    doc.setFont("Helvetica", "bold")
    doc.setTextColor(darkGray)
    doc.text(`-${formatCurrency(summary.discount)}`, 210 - ml, currentY, { align: "right" })
    currentY += rowH
  }

  if (summary.tax && summary.tax > 0) {
    doc.setFont("Helvetica", "normal")
    doc.setTextColor(midGray)
    doc.text("Pajak (PPN)", summaryStartX, currentY)
    doc.setFont("Helvetica", "bold")
    doc.setTextColor(darkGray)
    doc.text(formatCurrency(summary.tax), 210 - ml, currentY, { align: "right" })
    currentY += rowH
  }

  // Total Line
  doc.setDrawColor(226, 232, 240)
  doc.line(summaryStartX, currentY - 3, 210 - ml, currentY - 3)

  doc.setFont("Helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(primaryColor)
  doc.text("Total", summaryStartX, currentY)
  doc.text(formatCurrency(summary.total), 210 - ml, currentY, { align: "right" })

  // 6. Signatures (Bottom)
  y = Math.max(currentY + 25, 245) // ensure it's towards the bottom

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  // Customer signature
  doc.text("Penerima,", ml + 10, y)
  doc.line(ml, y + 20, ml + 45, y + 20)

  // Company signature
  doc.text("Hormat Kami,", 155, y)
  doc.line(145, y + 20, 190, y + 20)

  // Output to new tab window
  const pdfData = doc.output("bloburl")
  window.open(pdfData, "_blank")
}
