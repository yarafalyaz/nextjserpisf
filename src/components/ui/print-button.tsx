"use client"

import { useState } from "react"
import { Button } from "@/components/ui/page-header"
import { Printer, Loader2 } from "lucide-react"
import { showError, showSuccess } from "@/lib/utils/toast"
import { generateQuotationPDF, generateTransactionPDF } from "@/lib/pdf/generator"

interface PrintButtonProps {
  title?: string
  documentType?: "invoice" | "quotation" | "order" | "work-order"
  documentId?: number
  disabled?: boolean
}

export function PrintButton({ title = "Cetak", documentType, documentId, disabled }: PrintButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false)

  async function handlePrint() {
    if (!documentType || !documentId) {
      window.print() // Fallback to standard print if no API params
      return
    }

    try {
      setIsPrinting(true)
      const res = await fetch(`/api/print?tipe=${documentType}&id=${documentId}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Gagal mengambil data cetak")
      }

      if (documentType === "quotation") {
        generateQuotationPDF(data.company, data.docInfo, data.items, data.summary)
      } else {
        generateTransactionPDF(data.company, data.docInfo, data.items, data.summary)
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
