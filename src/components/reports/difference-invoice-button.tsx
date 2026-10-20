"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ReceiptText } from "lucide-react"
import { createDifferenceInvoice } from "@/actions/sales.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"

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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (revisionNumber <= 0) {
    return null
  }

  function handleClick() {
    startTransition(async () => {
      const result = await createDifferenceInvoice(quotationId)
      if (!result.success) {
        showError(result.error || "Gagal membuat faktur selisih")
        return
      }
      showSuccess("Faktur selisih dibuat")
      router.push(`/penjualan/faktur/${result.slug}`)
    })
  }

  return (
    <Button
      variant="secondary"
      onPress={handleClick}
      isPending={isPending}
      aria-label="Buat faktur selisih"
    >
      <ReceiptText size={14} aria-hidden="true" /> Buat Faktur Selisih
    </Button>
  )
}
