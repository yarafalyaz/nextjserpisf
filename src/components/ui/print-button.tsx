"use client"

import { Printer } from "lucide-react"

interface PrintButtonProps {
  title?: string
}

export function PrintButton({ title = "Cetak" }: PrintButtonProps) {
  function handlePrint() {
    window.print()
  }

  return (
    <button
      onClick={handlePrint}
      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"
    >
      <Printer size={14} />
      {title}
    </button>
  )
}
