"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Percent } from "lucide-react"
import { createProgressInvoice } from "@/actions/sales.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"

/**
 * F-2026-10-20-58: tombol "Buat Faktur Progres" di detail penawaran.
 *
 * Server menentukan kelayakan + nominal dari builder (target kumulatif
 * persen × nilai kontrak berjalan, draft memesan porsi). Komponen hanya
 * mengumpulkan persen dan menampilkan error server apa adanya.
 */
export function ProgressInvoiceButton({ quotationId }: Readonly<{ quotationId: number }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [percent, setPercent] = useState("")

  function handleClick() {
    const targetPercent = Number(percent)
    startTransition(async () => {
      const result = await createProgressInvoice(quotationId, targetPercent)
      if (!result.success) {
        showError(result.error || "Gagal membuat faktur progres")
        return
      }
      showSuccess("Faktur progres dibuat")
      router.push(`/penjualan/faktur/${result.slug}`)
    })
  }

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Target progres (%)
        <Input
          type="number"
          min={1}
          max={100}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          aria-label="Target progres persen"
          className="w-28"
        />
      </label>
      <Button
        variant="secondary"
        onPress={handleClick}
        isPending={isPending}
        aria-label="Buat faktur progres"
      >
        <Percent size={14} aria-hidden="true" /> Buat Faktur Progres
      </Button>
    </div>
  )
}
