"use client"

import { FileDown } from "@/components/ui/fontawesome-icons"
import { Button } from "@/components/ui/button"
import { formatCurrencyExact } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"

interface SptReplaceExportButtonProps {
  csv: string
  filename: string
  eligible: boolean
  eligibilityReason: string
  rowCount: number
  outputDpp: number
  outputNetVat: number
  inputDpp: number
  inputVat: number
  netVat: number
}

export function SptReplaceExportButton({
  csv,
  filename,
  eligible,
  eligibilityReason,
  rowCount,
  outputDpp,
  outputNetVat,
  inputDpp,
  inputVat,
  netVat,
}: Readonly<SptReplaceExportButtonProps>) {
  function handleDownload() {
    if (!eligible) {
      showError(eligibilityReason)
      return
    }
    if (rowCount === 0) {
      showError("Tidak ada dokumen faktur ber-PPN pada masa ini untuk diekspor.")
      return
    }
    const bom = "\uFEFF"
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)

    showSuccess(
      `CSV Replace diunduh (${rowCount} baris). Tie-out Keluaran DPP ${formatCurrencyExact(outputDpp)} / PPN Neto ${formatCurrencyExact(outputNetVat)}, Masukan DPP ${formatCurrencyExact(inputDpp)} / PPN ${formatCurrencyExact(inputVat)}, Posisi Neto ${formatCurrencyExact(netVat)}.`,
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 sm:min-h-9 gap-1.5 print:hidden"
      title={eligible ? "Unduh paket CSV pembetulan SPT skema replace (PER-12/PJ/2026)" : eligibilityReason}
      onClick={handleDownload}
    >
      <FileDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span>Ekspor CSV Replace</span>
    </Button>
  )
}
