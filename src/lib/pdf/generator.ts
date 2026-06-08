/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatCurrency } from "@/lib/utils/format"

export interface CompanyInfo {
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  logo?: string | null
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

export interface QuotationPDFInfo extends DocumentInfo {
  vehicleName?: string | null
  plateNumber?: string | null
  paymentMethod?: string | null
  shippingMethod?: string | null
  footerNotes?: string | null
  signatureName?: string | null
  signatureImage?: string | null
}

export interface QuotationPDFItem extends DocumentItem {
  unit?: string | null
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
  const contactInfo = []
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

function formatPdfCurrency(value: number, showSymbol = true) {
  const formatted = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value || 0))
  return showSymbol ? `Rp ${formatted}` : formatted
}

function formatPdfDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || "-"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-")
}

/** Load a same-origin image URL into a base64 dataURL + intrinsic size (for jsPDF addImage). */
async function loadImageData(
  url: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return { dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

export async function generateQuotationPDF(
  company: CompanyInfo,
  docInfo: QuotationPDFInfo,
  items: QuotationPDFItem[],
  summary: DocumentSummary
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const ml = 14
  const pageW = 210
  const black = "#111827"

  // 1. Logo banner (top-left) — constrained to 55mm wide / 20mm tall, keep aspect ratio
  let metaTop = 23
  if (company.logo) {
    const logo = await loadImageData(company.logo)
    if (logo) {
      const maxW = 55
      const maxH = 20
      const ratio = logo.width / logo.height
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      doc.addImage(logo.dataUrl, "PNG", ml, 10, w, h)
      metaTop = Math.max(metaTop, 10 + h + 6)
    }
  }

  doc.setTextColor(black)
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(11)
  doc.text("QUOTATION", pageW - ml, 15, { align: "right" })

  const label = (text: string, x: number, y: number) => {
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(8)
    doc.text(text, x, y)
    doc.text(":", x + 30, y)
  }
  const value = (text: string, x: number, y: number) => {
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(8)
    doc.text(text || "-", x, y)
  }

  let y = metaTop
  label("No", ml, y); value(docInfo.documentNo, ml + 34, y)
  label("Tanggal", 120, y); value(formatPdfDate(docInfo.date), 154, y)
  y += 6
  label("Kepada", ml, y); value(docInfo.customerName, ml + 34, y)
  label("Kendaraan", 120, y); value(docInfo.vehicleName || "-", 154, y)
  y += 6
  label("Alamat", ml, y); value(docInfo.customerAddress || "", ml + 34, y)
  label("No.Pol", 120, y); value(docInfo.plateNumber || "-", 154, y)
  y += 6
  label("Nomor Telepon", ml, y); value(docInfo.customerPhone || "-", ml + 34, y)
  label("Metode Pembayaran", 120, y); value(docInfo.paymentMethod || "-", 154, y)
  y += 6
  label("Email", ml, y); value("-", ml + 34, y)
  label("Metode Pengiriman", 120, y); value(docInfo.shippingMethod || "", 154, y)

  const tableStart = y + 6
  autoTable(doc, {
    startY: tableStart,
    margin: { left: ml, right: ml },
    tableWidth: 182,
    theme: "grid",
    head: [["NO", "NAMA BARANG/JASA", "QTY", "UNIT", "HARGA", "SUB TOTAL"]],
    body: items.map((item) => [
      item.no,
      item.description,
      Number(item.qty).toLocaleString("id-ID"),
      item.unit || "Set",
      formatPdfCurrency(item.price),
      formatPdfCurrency(item.total),
    ]),
    styles: { font: "Helvetica", fontSize: 8, textColor: [17, 24, 39], lineColor: [40, 40, 40], lineWidth: 0.12, minCellHeight: 7, cellPadding: { top: 1.8, right: 1.2, bottom: 1.8, left: 1.2 } },
    headStyles: { fontStyle: "bold", fontSize: 8, halign: "center", fillColor: [255, 255, 255], textColor: [17, 24, 39], lineColor: [40, 40, 40], lineWidth: 0.12 },
    bodyStyles: { fillColor: [255, 255, 255], lineColor: [40, 40, 40], lineWidth: 0.12 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 92 },
      2: { cellWidth: 13, halign: "center" },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
  })

  y = Math.max((doc as any).lastAutoTable.finalY + 12, 148)
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(8)
  doc.text("NOTE :", ml, y)
  doc.setFont("Helvetica", "normal")
  const noteText = docInfo.notes || "- Untuk DP 50% Dari Harga Total\n- Quotation Ini Berlaku 7 Hari Setelah Tanggal Terbit"
  doc.text(doc.splitTextToSize(noteText, 105), ml, y + 5)

  const footerY = 205
  doc.setFont("Helvetica", "normal")
  doc.setFontSize(8)
  doc.text("Keterangan :", ml, footerY)
  const footerText = docInfo.footerNotes || [
    "- Untuk pembayaran dapat di transfer ke",
    "Bank Central Asia (BCA)",
    "No Rekening : 0670 793 494",
    "Atas Nama : WAHID ACHMAD FAUZI",
    "Untuk konfirmasi Pembayaran :",
    "WA 0817-6415-303",
  ].join("\n")
  doc.text(doc.splitTextToSize(footerText, 95), ml + 3, footerY + 6)

  doc.setFont("Helvetica", "normal")
  doc.text("Total", 125, footerY)
  doc.text(":", 155, footerY)
  doc.setFont("Helvetica", "bold")
  doc.text(formatPdfCurrency(summary.total), 195, footerY, { align: "right" })

  // Signature image (above the name) + signature name (bottom-right)
  const sigCenterX = 172
  let sigNameY = 248
  if (docInfo.signatureImage) {
    const sig = await loadImageData(docInfo.signatureImage)
    if (sig) {
      const maxW = 38
      const maxH = 22
      const ratio = sig.width / sig.height
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      doc.addImage(sig.dataUrl, "PNG", sigCenterX - w / 2, 224, w, h)
      sigNameY = 224 + h + 5
    }
  }
  doc.setFont("Helvetica", "normal")
  doc.setFontSize(8)
  doc.text(docInfo.signatureName || "Wahid Achmad Fauzi", sigCenterX, sigNameY, { align: "center" })

  const pdfData = doc.output("bloburl")
  window.open(pdfData, "_blank")
}
