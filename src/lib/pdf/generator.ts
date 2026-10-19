 
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatCurrency } from "@/lib/utils/format"
import { terbilangLabel } from "@/lib/utils/terbilang"

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
  /**
   * `discount` adalah PERSEN bila true, RUPIAH bila tidak.
   *
   * Semantiknya berbeda per dokumen: SalesInvoiceItem/PurchaseOrderItem menyimpan
   * nominal (`Decimal(15,2)`), sedangkan VendorBillItem menyimpan persen
   * (`discount_percent`). Tanpa penanda ini, potongan Rp 25.000 tercetak
   * "25000%".
   */
  discountIsPercent?: boolean
  total: number
  /** Satuan (mis. "Pcs", "Box") — kolom Satuan muncul bila ada isinya. */
  unit?: string | null
  /** Keterangan baris (mis. catatan pada surat jalan). */
  note?: string | null
}

/** Opsi tampilan dokumen transaksi. */
export interface TransactionPdfOptions {
  /** Ukuran asli logo (bila diketahui) agar rasionya tidak terdistorsi. */
  logoSize?: { width: number; height: number }
  /** Surat jalan: tanpa kolom harga/total dan tanpa blok ringkasan nominal. */
  hidePrices?: boolean
  /** Label tanda tangan kanan (default "Hormat Kami,"). */
  signatureRight?: string
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
  customerEmail?: string | null
}

export interface QuotationPDFItem extends DocumentItem {
  unit?: string | null
}

/**
 * Menggambar dokumen transaksi dan mengembalikan objek jsPDF-nya (tanpa efek
 * samping) sehingga hasilnya bisa diuji/diperiksa tanpa membuka tab baru.
 */
export function buildTransactionPdf(
  company: CompanyInfo,
  docInfo: DocumentInfo,
  items: DocumentItem[],
  summary: DocumentSummary,
  options: TransactionPdfOptions = {}
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

  // 1. Header (Company Info) — logo di kiri, blok perusahaan mengikuti.
  const logoWidth = 26
  let textLeft = ml
  if (company.logo) {
    try {
      const logoSize = options.logoSize
      const aspect = logoSize && logoSize.width > 0 ? logoSize.height / logoSize.width : 0.7
      const height = Math.min(logoWidth * aspect, 18)
      const width = aspect > 0 ? height / aspect : logoWidth
      doc.addImage(company.logo, imgFormat(company.logo), ml, y - 7, width, height)
      textLeft = ml + width + 6
    } catch {
      textLeft = ml
    }
  }

  doc.setFont("Helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(primaryColor)
  doc.text(company.name, textLeft, y)

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  if (company.address) {
    y += 5
    const addrLines = doc.splitTextToSize(company.address, 100)
    doc.text(addrLines, textLeft, y)
    y += (addrLines.length - 1) * 4
  }

  y += 5
  const contactInfo = []
  if (company.phone) contactInfo.push(`T: ${company.phone}`)
  if (company.email) contactInfo.push(`E: ${company.email}`)
  if (company.website) contactInfo.push(`W: ${company.website}`)
  doc.text(contactInfo.join("   |   "), textLeft, y)

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

  // 4. AutoTable for Items — gaya dokumen: tanpa blok warna, hanya garis judul.
  // Kolom disusun dari spesifikasi sehingga surat jalan (tanpa harga) memakai
  // tabel yang sama tanpa cabang terpisah.
  const hidePrices = Boolean(options.hidePrices)
  const hasUnit = items.some((item) => Boolean(item.unit))
  const hasNote = hidePrices && items.some((item) => Boolean(item.note))

  const columns: { key: string; header: string; width: number | "auto"; halign?: "center" | "right" }[] = [
    { key: "no", header: "No", width: 10, halign: "center" },
    { key: "description", header: "Deskripsi / Nama Barang", width: "auto" },
    ...(hasUnit ? [{ key: "unit", header: "Satuan", width: 18, halign: "center" as const }] : []),
    { key: "qty", header: "Kuantitas", width: 15, halign: "center" },
    ...(hidePrices
      ? hasNote
        ? [{ key: "note", header: "Keterangan", width: 52 }]
        : []
      : [
          { key: "price", header: "Harga", width: 30, halign: "right" as const },
          { key: "discount", header: "Potongan", width: 20, halign: "center" as const },
          { key: "total", header: "Total", width: 32, halign: "right" as const },
        ]),
  ]

  const cellValue = (key: string, item: DocumentItem): string | number => {
    switch (key) {
      case "no":
        return item.no
      case "description":
        return item.description
      case "unit":
        return item.unit ?? "-"
      case "qty":
        return item.qty
      case "note":
        return item.note ?? ""
      case "price":
        return formatCurrency(item.price)
      case "discount":
        if (!item.discount) return "-"
        // Dokumen yang menyimpan persen (tagihan vendor) memakai akhiran "%";
        // sisanya nominal rupiah — mencetak nominal dengan "%" memberi angka
        // yang salah arti di dokumen pelanggan.
        return item.discountIsPercent ? `${item.discount}%` : formatCurrency(item.discount)
      default:
        return formatCurrency(item.total)
    }
  }

  const tableBody = items.map((item) => columns.map((column) => cellValue(column.key, item)))

  const columnStyles: Record<number, { cellWidth: number | "auto"; halign?: "center" | "right" }> = {}
  columns.forEach((column, index) => {
    columnStyles[index] = column.halign
      ? { cellWidth: column.width, halign: column.halign }
      : { cellWidth: column.width }
  })

  autoTable(doc, {
    startY: y,
    head: [columns.map((column) => column.header)],
    body: tableBody,
    theme: "plain",
    headStyles: {
      fillColor: undefined,
      textColor: [17, 24, 39],
      fontSize: 9,
      fontStyle: "bold",
      lineWidth: { bottom: 0.4, top: 0, left: 0, right: 0 },
      lineColor: [17, 24, 39],
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [31, 41, 55],
      lineWidth: 0,
    },
    columnStyles,
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

  // Summary list on the right — dilewati pada dokumen tanpa harga (surat jalan),
  // yang hanya butuh kolom Catatan.
  if (!hidePrices) {
    doc.text("Subtotal", summaryStartX, y)
    doc.setFont("Helvetica", "bold")
    doc.setTextColor(darkGray)
    doc.text(formatCurrency(summary.subtotal), 210 - ml, y, { align: "right" })
  }

  let currentY = y + rowH
  if (!hidePrices) {
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
    currentY += 2 // add space before the line
    doc.setDrawColor(226, 232, 240)
    doc.line(summaryStartX, currentY, 210 - ml, currentY)

    currentY += 6 // add space after the line
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(primaryColor)
    doc.text("Total", summaryStartX, currentY)
    doc.text(formatCurrency(summary.total), 210 - ml, currentY, { align: "right" })

    // 5b. Terbilang — pengaman salah baca nominal, kelaziman dokumen Indonesia.
    currentY += 7
    doc.setFont("Helvetica", "italic")
    doc.setFontSize(9)
    doc.setTextColor(darkGray)
    const terbilangLines = doc.splitTextToSize(`Terbilang: ${terbilangLabel(summary.total)}`, 210 - ml * 2)
    doc.text(terbilangLines, ml, currentY)
    currentY += (terbilangLines.length - 1) * 4
  } else {
    currentY = Math.max(currentY, y)
  }

  // 6. Signatures (Bottom) — surat jalan memakai "Penerima/Pengirim".
  y = Math.max(currentY + 25, 245) // ensure it's towards the bottom

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  const signatureRight = options.signatureRight ?? "Hormat Kami,"

  // Customer signature
  doc.text("Penerima,", ml + 10, y)
  doc.line(ml, y + 20, ml + 45, y + 20)

  // Company signature
  doc.text(signatureRight, 155, y)
  doc.line(145, y + 20, 190, y + 20)

  // 8. Footer setiap halaman: waktu cetak + nomor halaman.
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(midGray)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.line(ml, 282, 210 - ml, 282)
    doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, ml, 286)
    doc.text(`Halaman ${page} dari ${pageCount}`, 210 - ml, 286, { align: "right" })
  }

  return doc
}

/**
 * Menggambar dokumen lalu membukanya di tab baru (dipakai tombol Cetak).
 * Logo diambil lebih dulu dan diubah menjadi data URL — jsPDF hanya bisa
 * menanamkan gambar secara sinkron, sedangkan logo tersimpan sebagai path/URL.
 */
export async function generateTransactionPDF(
  company: CompanyInfo,
  docInfo: DocumentInfo,
  items: DocumentItem[],
  summary: DocumentSummary,
  options: TransactionPdfOptions = {}
) {
  const logo = company.logo ? await loadImageData(company.logo) : null
  const doc = buildTransactionPdf(
    { ...company, logo: logo?.dataUrl ?? null },
    docInfo,
    items,
    summary,
    {
      ...options,
      logoSize: logo ? { width: logo.width, height: logo.height } : undefined,
    },
  )
  window.open(doc.output("bloburl"), "_blank")
}

// Exported for unit testing — pure formatting/parsing helpers with branch logic.
export function formatPdfCurrency(value: number, showSymbol = true) {
  const formatted = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value || 0))
  return showSymbol ? `Rp ${formatted}` : formatted
}

export function formatPdfDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || "-"
  // id-ID: bulan Indonesia ("Jun" bukan "Jun"/"May") — D9 audit-ui-ux.
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-").replace(/\./g, "")
}

/** Derive jsPDF image format from a dataURL mime type. */
export function imgFormat(dataUrl: string): string {
  const m = /^data:image\/(\w+)/.exec(dataUrl)
  const t = (m?.[1] || "png").toUpperCase()
  if (t === "JPG" || t === "JPEG") return "JPEG"
  if (t === "WEBP") return "WEBP"
  return "PNG"
}

/** Load an image URL into a base64 dataURL + intrinsic size (for jsPDF addImage).
 * Uses fetch -> blob -> dataURL so it works with CORS-enabled CDN assets
 * (e.g. Cloudflare) without tainting a canvas. The base64 is transient — only
 * used to embed the image into the generated PDF, never persisted. */
async function loadImageData(
  url: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" })
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })
    return { dataUrl, ...size }
  } catch {
    return null
  }
}

export async function generateQuotationPDF(
  company: CompanyInfo,
  docInfo: QuotationPDFInfo,
  items: QuotationPDFItem[],
  summary: DocumentSummary,
  sections?: { name: string; items: QuotationPDFItem[] }[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const ml = 14
  const pageW = 210
  const black = "#111827"

  // 1. Logo banner (top-left) — constrained to 55mm wide / 16mm tall, keep aspect ratio
  let metaTop = 22
  if (company.logo) {
    const logo = await loadImageData(company.logo)
    if (logo) {
      const maxW = 55
      const maxH = 14
      const ratio = logo.width / logo.height
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      doc.addImage(logo.dataUrl, imgFormat(logo.dataUrl), ml, 8, w, h)
      
      // Print company address below logo (bisa beberapa baris: jalan + wilayah)
      if (company.address) {
        doc.setFont("Helvetica", "normal")
        doc.setFontSize(7.5)
        doc.setTextColor("#4b5563")
        const addrLines = doc.splitTextToSize(company.address, pageW - ml * 2)
        doc.text(addrLines, ml, 8 + h + 3.2)
        metaTop = 8 + h + 3.2 + addrLines.length * 3.2 + 0.8
      } else {
        metaTop = 8 + h + 4
      }
    }
  }

  // Large Red Quotation Title
  doc.setTextColor("#ef4444")
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(18)
  doc.text("PENAWARAN HARGA", pageW - ml, 14, { align: "right" })

  // Thin separator line below company header
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.4)
  doc.line(ml, metaTop, pageW - ml, metaTop)
  metaTop += 5.5

  let y = metaTop

  // Helper to draw left side meta
  const drawMetaLeft = (lbl: string, val: string, currentY: number) => {
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(black)
    doc.text(lbl, ml, currentY)
    doc.text(":", ml + 26, currentY)
    doc.text(val || "-", ml + 29, currentY)
  }

  // Helper to draw right side meta
  const drawMetaRight = (lbl: string, val: string, currentY: number) => {
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(black)
    doc.text(lbl, 118, currentY)
    doc.text(":", 118 + 30, currentY)
    doc.text(val || "-", 118 + 33, currentY)
  }

  // Row 1: Nomor & Tanggal
  drawMetaLeft("Nomor", docInfo.documentNo, y)
  drawMetaRight("Tanggal", formatPdfDate(docInfo.date), y)
  y += 5.5

  // Row 2: Kepada & Kendaraan
  drawMetaLeft("Kepada", docInfo.customerName, y)
  drawMetaRight("Kendaraan", docInfo.vehicleName || "-", y)
  y += 5.5

  // Row 3: Alamat & No.Pol
  const addressLines = doc.splitTextToSize(docInfo.customerAddress || "-", 80)
  doc.setFont("Helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(black)
  doc.text("Alamat", ml, y)
  doc.text(":", ml + 26, y)
  doc.text(addressLines, ml + 29, y)

  drawMetaRight("No.Pol", docInfo.plateNumber || "-", y)

  const addressHeight = Math.max(1, addressLines.length) * 4.5
  y += Math.max(5.5, addressHeight)

  // Row 4: Nomor Telepon & Metode Pembayaran
  drawMetaLeft("Nomor Telepon", docInfo.customerPhone || "-", y)
  drawMetaRight("Metode Pembayaran", docInfo.paymentMethod || "-", y)
  y += 5.5

  // Row 5: Email & Metode Pengiriman
  drawMetaLeft("Email", docInfo.customerEmail || "-", y)
  drawMetaRight("Metode Pengiriman", docInfo.shippingMethod || "-", y)
  y += 6

  // Build the table body based on sections (if provided) or fallback to flat list
  const tableBody: any[] = []
  
  if (sections && sections.length > 0) {
    sections.forEach((section) => {
      // Add section header row spanning all 6 columns
      tableBody.push([
        {
          content: section.name.toUpperCase() + " :",
          colSpan: 6,
          styles: {
            fontStyle: "bold",
            fillColor: [255, 255, 255],
            textColor: [17, 24, 39],
            fontSize: 8,
            minCellHeight: 6,
            cellPadding: { left: 4, top: 1.8, bottom: 1.8 }
          }
        }
      ])
      
      // Add items for this section with numbered sequence resetting per section
      section.items.forEach((item, idx) => {
        tableBody.push([
          idx + 1,
          item.description,
          Number(item.qty).toLocaleString("id-ID"),
          item.unit || "Set",
          formatPdfCurrency(item.price),
          formatPdfCurrency(item.total),
        ])
      })
    })
  } else {
    items.forEach((item) => {
      tableBody.push([
        item.no,
        item.description,
        Number(item.qty).toLocaleString("id-ID"),
        item.unit || "Set",
        formatPdfCurrency(item.price),
        formatPdfCurrency(item.total),
      ])
    })
  }

  const tableStart = y
  autoTable(doc, {
    startY: tableStart,
    margin: { left: ml, right: ml },
    tableWidth: 182,
    theme: "grid",
    head: [["NO", "NAMA BARANG/JASA", "KUANTITAS", "SATUAN", "HARGA", "SUBTOTAL"]],
    body: tableBody,
    styles: { 
      font: "Helvetica", 
      fontSize: 8, 
      textColor: [17, 24, 39], 
      lineColor: [40, 40, 40], 
      lineWidth: 0.12, 
      minCellHeight: 7, 
      cellPadding: { top: 1.8, right: 1.2, bottom: 1.8, left: 1.2 } 
    },
    headStyles: { 
      fontStyle: "bold", 
      fontSize: 8.5, 
      halign: "center", 
      fillColor: [209, 213, 219], 
      textColor: [17, 24, 39], 
      lineColor: [40, 40, 40], 
      lineWidth: 0.12 
    },
    bodyStyles: { 
      fillColor: [255, 255, 255], 
      lineColor: [40, 40, 40], 
      lineWidth: 0.12 
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 92 },
      2: { cellWidth: 13, halign: "center" },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
  })

  const finalY = (doc as any).lastAutoTable.finalY
  y = finalY + 8

  // If we don't have enough space for notes, summary, and signature, start a new page
  if (y > 215) {
    doc.addPage()
    y = 20
  }

  // Draw NOTE on the left
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(black)
  doc.text("CATATAN :", ml, y)

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(8)
  const noteText = docInfo.notes || "- Sistem PreOrder\n- DP 50% Dari Harga Total\n- Quotation Ini Berlaku 10 Hari Setelah Tanggal Terbit"
  const splitNotes = doc.splitTextToSize(noteText, 95)
  doc.text(splitNotes, ml, y + 4.5)
  const noteHeight = splitNotes.length * 4

  // Draw Total on the right (aligned with the first line of NOTE)
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(9.5)
  doc.text("Total", 130, y)
  doc.text(":", 145, y)
  doc.text(formatPdfCurrency(summary.total), pageW - ml, y, { align: "right" })

  y += Math.max(noteHeight + 8, 12)

  // Ensure signature blocks won't overlap the bottom of page
  if (y > 240) {
    doc.addPage()
    y = 20
  }

  // Draw Keterangan box on the left
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(black)
  doc.text("Keterangan :", ml, y)

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(7.5)
  const footerText = docInfo.footerNotes || [
    "- Untuk pembayaran dapat di transfer ke",
    "Bank Central Asia (BCA)",
    "No Rekening : 4890310457",
    "Atas Nama : Rosemety Cartariandini",
    "Untuk konfirmasi Pembayaran : WA 0817-6415-303",
  ].join("\n")
  const splitFooter = doc.splitTextToSize(footerText, 90)

  const boxY = y + 2
  const boxH = splitFooter.length * 3.8 + 4
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.2)
  doc.setFillColor(250, 250, 250)
  doc.rect(ml, boxY, 95, boxH, "FD")

  doc.setTextColor("#374151")
  doc.text(splitFooter, ml + 3, boxY + 4)

  // Draw Signature on the right
  const sigRightX = pageW - ml
  const sigWidth = 45
  const sigCenterX = sigRightX - sigWidth / 2

  doc.setFont("Helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(black)
  doc.text("IRONSMITH FABRICATION", sigCenterX, y + 2, { align: "center" })

  let sigNameY = y + 24
  if (docInfo.signatureImage) {
    const sig = await loadImageData(docInfo.signatureImage)
    if (sig) {
      const maxW = 34
      const maxH = 16
      const ratio = sig.width / sig.height
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      doc.addImage(sig.dataUrl, imgFormat(sig.dataUrl), sigCenterX - w / 2, y + 5, w, h)
      sigNameY = y + 5 + h + 3
    }
  }

  doc.setFont("Helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(black)
  const sigName = docInfo.signatureName || "Wahid Achmad Fauzi"
  doc.text(sigName, sigCenterX, sigNameY, { align: "center" })

  const nameW = doc.getTextWidth(sigName)
  doc.setDrawColor(17, 24, 39)
  doc.setLineWidth(0.3)
  doc.line(sigCenterX - nameW / 2, sigNameY + 0.8, sigCenterX + nameW / 2, sigNameY + 0.8)

  const pdfData = doc.output("bloburl")
  window.open(pdfData, "_blank")
}

// ─── Work Order PDF ──────────────────────────────────────────────────

export interface WorkOrderPDFInfo {
  title: string
  documentNo: string
  date: string
  startDate?: string | null
  endDate?: string | null
  status: string
  customerName: string
  customerAddress?: string | null
  customerPhone?: string | null
  quotationNo?: string | null
  projectName?: string | null
  notes?: string | null
}

export interface WorkOrderPDFItem {
  no: number
  description: string
  qty: number
  status: string
}

const woStatusLabel: Record<string, string> = {
  draft: "Draft",
  pending: "Menunggu",
  in_progress: "Dikerjakan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
}

export function generateWorkOrderPDF(
  company: CompanyInfo,
  docInfo: WorkOrderPDFInfo,
  items: WorkOrderPDFItem[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const darkGray = "#1f2937"
  const midGray = "#4b5563"
  const primaryColor = "#0284c7"
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
  if (contactInfo.length > 0) doc.text(contactInfo.join("   |   "), ml, y)

  // Decorative header line
  y += 3
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(ml, y, 210 - ml, y)

  // 2. Document Title
  y += 12
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(darkGray)
  doc.text(docInfo.title.toUpperCase(), ml, y)

  // Status badge (top right)
  const statusText = woStatusLabel[docInfo.status] || docInfo.status
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(primaryColor)
  doc.text(statusText.toUpperCase(), 210 - ml, y, { align: "right" })

  // 3. Meta grid
  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  const metaRightX = 130
  y += 8

  // Left column: customer info
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

  // Right column: document meta
  const metaY = y
  const drawMeta = (label: string, val: string, row: number) => {
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(midGray)
    doc.text(label, metaRightX, metaY + row * 5)
    doc.setFont("Helvetica", "bold")
    doc.setTextColor(darkGray)
    doc.text(val, metaRightX + 32, metaY + row * 5)
  }

  drawMeta("No. Dokumen  :", docInfo.documentNo, 0)
  drawMeta("Tanggal      :", formatPdfDate(docInfo.date), 1)
  if (docInfo.startDate) drawMeta("Tgl. Mulai   :", formatPdfDate(docInfo.startDate), 2)
  if (docInfo.endDate) drawMeta("Tgl. Selesai  :", formatPdfDate(docInfo.endDate), 3)
  if (docInfo.quotationNo) drawMeta("Penawaran    :", docInfo.quotationNo, 4)
  if (docInfo.projectName) drawMeta("Proyek       :", docInfo.projectName, 5)

  // Set cursor past both columns
  y = Math.max(customerY + 8, metaY + 36)

  // 4. Items table (no price columns)
  const tableBody = items.map((item) => [
    item.no,
    item.description,
    item.qty,
    woStatusLabel[item.status] || item.status,
  ])

  autoTable(doc, {
    startY: y,
    head: [["No", "Deskripsi / Item", "Qty", "Status"]],
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [31, 41, 55],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 30, halign: "center" },
    },
    margin: { left: ml, right: ml },
  })

  // Get position after table
  const finalY = (doc as any).lastAutoTable.finalY
  y = finalY + 8

  // 5. Notes section — structured rendering with proper formatting
  if (docInfo.notes) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage()
      y = 20
    }

    doc.setFont("Helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(darkGray)
    doc.text("Catatan:", ml, y)
    y += 6

    const lines = docInfo.notes.split("\n")
    const dangerColor = "#dc2626"
    const warningColor = "#d97706"
    const successColor = "#16a34a"

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (line.trim() === "") {
        y += 2
        continue
      }

      // Auto page-break
      if (y > 278) {
        doc.addPage()
        y = 20
      }

      // Section headers: [INFORMASI PROYEK], [DAFTAR ITEM...], etc.
      if (/^\[[^\]]{0,500}\]$/.test(line.trim())) {
        y += 3
        doc.setFont("Helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(primaryColor)
        doc.text(line.trim(), ml, y)
        y += 1.5
        // Draw underline
        const textW = doc.getTextWidth(line.trim())
        doc.setDrawColor(2, 132, 199)
        doc.setLineWidth(0.3)
        doc.line(ml, y, ml + textW, y)
        y += 4
        continue
      }

      // BOM product header: ● [PRD-0001] OKE (Qty: 1)
      if (line.trim().startsWith("●")) {
        y += 2
        doc.setFont("Helvetica", "bold")
        doc.setFontSize(8.5)
        doc.setTextColor(darkGray)
        doc.text(line.trim(), ml + 2, y)
        y += 4
        continue
      }

      // Sub-header: "Breakdown Material:" or "Breakdown Material:"
      if (line.trim().startsWith("Breakdown Material")) {
        doc.setFont("Helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(midGray)
        doc.text(line.trim(), ml + 6, y)
        y += 4
        continue
      }

      // Material line with stock status: "  - Busi Motor Bosch: Butuh 1 PCS → Habis"
      if (line.trim().startsWith("-") || line.trim().startsWith("–")) {
        doc.setFontSize(8)

        const text = line.trim()
        const arrowIdx = text.indexOf("→")

        if (arrowIdx > -1) {
          const beforeArrow = text.substring(0, arrowIdx).trim()
          const afterArrow = text.substring(arrowIdx + 1).trim()

          // Material name + qty
          doc.setFont("Helvetica", "normal")
          doc.setTextColor(midGray)
          doc.text(beforeArrow + " →", ml + 8, y)

          // Stock status — color coded
          const statusX = ml + 8 + doc.getTextWidth(beforeArrow + " → ")
          doc.setFont("Helvetica", "bold")
          if (afterArrow.startsWith("Habis")) {
            doc.setTextColor(dangerColor)
          } else if (afterArrow.startsWith("Tinggal sedikit")) {
            doc.setTextColor(warningColor)
          } else if (afterArrow.startsWith("Stok ada")) {
            doc.setTextColor(successColor)
          } else {
            doc.setTextColor(midGray)
          }
          doc.text(afterArrow, statusX, y)
        } else {
          doc.setFont("Helvetica", "normal")
          doc.setTextColor(midGray)
          doc.text(text, ml + 8, y)
        }
        y += 3.8
        continue
      }

      // Key-value lines: "Nama Proyek  : xxx", "Pelanggan    : xxx"
      const kvMatch = line.match(/^(\S[^:]{0,500})\s*:\s*(.{1,2000})$/)
      if (kvMatch) {
        doc.setFont("Helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(midGray)
        const label = kvMatch[1].trim()
        const val = kvMatch[2].trim()
        doc.text(label, ml + 4, y)
        doc.text(":", ml + 38, y)
        doc.setFont("Helvetica", "bold")
        doc.setTextColor(darkGray)
        doc.text(val, ml + 41, y)
        y += 4
        continue
      }

      // Fallback: plain text
      doc.setFont("Helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(midGray)
      doc.text(line, ml + 2, y)
      y += 3.5
    }

    y += 4
  }

  // 6. Signatures (Bottom)
  // Ensure signatures are near the bottom
  if (y < 240) y = 245
  if (y > 270) {
    doc.addPage()
    y = 245
  }

  doc.setFont("Helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(midGray)

  doc.text("Dibuat oleh,", ml + 10, y)
  doc.line(ml, y + 20, ml + 45, y + 20)

  doc.text("Diketahui oleh,", 90, y)
  doc.line(80, y + 20, 125, y + 20)

  doc.text("Pelaksana,", 155, y)
  doc.line(145, y + 20, 190, y + 20)

  const pdfData = doc.output("bloburl")
  window.open(pdfData, "_blank")
}
