"use client"

import { Download } from "lucide-react"
import { buttonVariants } from "@/components/ui/shadcn/button"
import { cn } from "@/lib/utils"

/**
 * Unduh CSV antrean penawaran (F-2026-10-22-091-S). Isi CSV dibangun
 * server dari builder ekspor tanpa kolom kontak (Q-QF-4); komponen ini
 * hanya memicu unduhan berkas.
 */
export function QuotationFollowUpExportButton({
  csv,
  disabled,
}: Readonly<{ csv: string; disabled?: boolean }>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Ekspor antrean penawaran ke CSV"
      className={cn(buttonVariants({ variant: "secondary" }), "gap-1.5")}
      onClick={() => {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "Antrean-Penawaran-Belum-Dijawab.csv"
        link.click()
        URL.revokeObjectURL(url)
      }}
    >
      <Download size={14} aria-hidden="true" /> Ekspor CSV
    </button>
  )
}
