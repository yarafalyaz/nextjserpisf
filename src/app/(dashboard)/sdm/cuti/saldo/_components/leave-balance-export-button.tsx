"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { exportLeaveBalancesCsv } from "@/actions/hrm.actions"
import { Button } from "@/components/ui/button"
import { showError } from "@/lib/utils/toast"

/**
 * Unduh CSV saldo cuti (BR-LVB-11, AC-LVB-B4). CSV + nama berkas dibangun
 * server oleh `exportLeaveBalancesCsv` untuk scope + filter pemanggil;
 * komponen ini hanya memicu unduhan berkas hasil server apa adanya.
 */
export function LeaveBalanceExportButton({
  year,
  departmentId,
}: {
  year: number
  departmentId: number | null
}) {
  const [pending, setPending] = useState(false)

  async function handleExport() {
    setPending(true)
    try {
      const result = await exportLeaveBalancesCsv(year, { departmentId })
      if (!result.success) {
        showError(result.error || "Gagal mengekspor saldo cuti")
        return
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = result.fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      showError("Gagal mengekspor saldo cuti")
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      aria-label="Ekspor saldo cuti ke CSV"
      isDisabled={pending}
      onClick={handleExport}
      className="gap-1.5"
    >
      <Download size={14} aria-hidden="true" /> {pending ? "Mengekspor..." : "Ekspor CSV"}
    </Button>
  )
}
