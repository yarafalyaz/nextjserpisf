"use client"

import { ReceiptText } from "lucide-react"
import { createDifferenceInvoice } from "@/actions/sales.actions"
import { RevisionActionButton } from "./revision-action-button"

/**
 * F-2026-10-20-10: tombol "Buat Faktur Selisih" di detail penawaran.
 *
 * Server menentukan kelayakan dan nilai secara otoritatif: revisionNumber > 0,
 * selisih positif setelah menjumlahkan faktur non-cancelled lewat tiga
 * jembatan, dan baris kunci quotation mencegah dua draft untuk porsi sama.
 * Komponen ini tidak mewakili "hasDifference" sebagai izin: komponen hanya
 * meneruskan klik lalu menampilkan error server apa adanya.
 */
export function DifferenceInvoiceButton({
  quotationId,
  revisionNumber,
}: Readonly<{ quotationId: number; revisionNumber: number }>) {
  return (
    <RevisionActionButton
      quotationId={quotationId}
      revisionNumber={revisionNumber}
      action={createDifferenceInvoice}
      label="Faktur Selisih"
      successMessage="Faktur selisih dibuat"
      errorMessage="Gagal membuat faktur selisih"
      Icon={ReceiptText}
    />
  )
}
