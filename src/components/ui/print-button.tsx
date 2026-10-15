"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Printer, Loader2 } from "lucide-react"
import { showError, showSuccess } from "@/lib/utils/toast"

interface PrintButtonProps {
  title?: string
  /** Wajib: tanpa keduanya tombol tidak punya dokumen untuk dirender. */
  documentType: PrintDocumentType
  documentId: number
  disabled?: boolean
}

type PrintDocumentType =
  | "invoice"
  | "quotation"
  | "order"
  | "work-order"
  | "purchase-order"
  | "delivery-order"
  | "down-payment"
  | "sales-payment"
  | "vendor-payment"
  | "sales-return"
  | "purchase-return"
  | "goods-receipt"
  | "purchase-request"
  | "vendor-bill"
  | "expense"

/**
 * Dokumen tanpa harga: barang diserahkan/diminta, bukan ditagihkan. Penerimaan
 * barang TIDAK termasuk — nilainya berguna untuk kontrol internal.
 */
const NO_PRICE_DOCUMENTS: PrintDocumentType[] = ["delivery-order", "purchase-request"]

/** Label tanda tangan kanan sesuai peran penandatangannya. */
const SIGNATURE_LABELS: Partial<Record<PrintDocumentType, string>> = {
  "delivery-order": "Pengirim,",
  "purchase-request": "Disetujui,",
  "goods-receipt": "Petugas Gudang,",
}

export function PrintButton({ title = "Cetak", documentType, documentId, disabled }: PrintButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false)

  async function handlePrint() {
    try {
      setIsPrinting(true)
      const res = await fetch(`/api/print?tipe=${documentType}&id=${documentId}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Gagal mengambil data cetak")
      }

      // Logo diubah menjadi data URL di dalam generator PDF (butuh data URL
      // agar jsPDF bisa menanamkannya secara sinkron).

      // Mesin PDF (jsPDF + autoTable) berat dan hanya dipakai saat tombol ini
      // ditekan, jadi dimuat di sini alih-alih ikut bundel awal halaman.
      const { generateQuotationPDF, generateTransactionPDF, generateWorkOrderPDF } =
        await import("@/lib/pdf/generator")

      if (documentType === "quotation") {
        await generateQuotationPDF(data.company, data.docInfo, data.items, data.summary, data.sections)
      } else if (documentType === "work-order") {
        generateWorkOrderPDF(data.company, data.docInfo, data.items)
      } else {
        await generateTransactionPDF(data.company, data.docInfo, data.items, data.summary, {
          hidePrices: NO_PRICE_DOCUMENTS.includes(documentType),
          signatureRight: SIGNATURE_LABELS[documentType],
        })
      }
      showSuccess("PDF berhasil dibuat")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Terjadi kesalahan saat memproses PDF")
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <Button
      onPress={handlePrint}
      isDisabled={isPrinting || disabled}
    >
      {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
      {isPrinting ? "Mencetak..." : title}
    </Button>
  )
}
