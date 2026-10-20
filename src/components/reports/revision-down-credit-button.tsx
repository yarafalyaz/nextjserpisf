"use client"

import { HandCoins } from "lucide-react"
import { createRevisionDownCredit } from "@/actions/sales.actions"
import { RevisionActionButton } from "./revision-action-button"

/**
 * F-2026-10-20-59: tombol "Buat Kredit Revisi-Turun" di detail penawaran.
 * Layar kembar DifferenceInvoiceButton untuk arah turun: server menentukan
 * kelayakan + nominal dari builder (vonis accountant: CustomerCredit pasif
 * tanpa jurnal saat lahir). Komponen hanya meneruskan klik dan menampilkan
 * error server apa adanya.
 */
export function RevisionDownCreditButton({
  quotationId,
  revisionNumber,
}: Readonly<{ quotationId: number; revisionNumber: number }>) {
  return (
    <RevisionActionButton
      quotationId={quotationId}
      revisionNumber={revisionNumber}
      action={createRevisionDownCredit}
      label="Kredit Revisi-Turun"
      successMessage="Kredit revisi-turun dibuat"
      errorMessage="Gagal membuat kredit revisi-turun"
      Icon={HandCoins}
    />
  )
}
