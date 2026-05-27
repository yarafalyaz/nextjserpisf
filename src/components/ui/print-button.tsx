"use client"

import { Button } from "@/components/ui/page-header"


import { Printer } from "lucide-react"

interface PrintButtonProps {
  title?: string
}

export function PrintButton({ title = "Cetak" }: PrintButtonProps) {
  function handlePrint() {
    window.print()
  }

  return (
    <Button
      onClick={handlePrint}
      
    >
      <Printer size={14} />
      {title}
    </Button>
  )
}
