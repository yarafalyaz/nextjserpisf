"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { HandCoins } from "lucide-react"
import { createRevisionDownCredit } from "@/actions/sales.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"

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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (revisionNumber <= 0) {
    return null
  }

  function handleClick() {
    startTransition(async () => {
      const result = await createRevisionDownCredit(quotationId)
      if (!result.success) {
        showError(result.error || "Gagal membuat kredit revisi-turun")
        return
      }
      showSuccess("Kredit revisi-turun dibuat")
      router.refresh()
    })
  }

  return (
    <Button
      variant="secondary"
      onPress={handleClick}
      isPending={isPending}
      aria-label="Buat kredit revisi-turun"
    >
      <HandCoins size={14} aria-hidden="true" /> Buat Kredit Revisi-Turun
    </Button>
  )
}
