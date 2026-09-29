"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { useState } from "react"

interface FilterBarProps {
  costCenters: { id: number; code: string; name: string }[]
}

export function FilterBar({ costCenters }: FilterBarProps) {
  const router = useRouter()
  const sp = useSearchParams()
  const [ccId, setCcId] = useState(sp.get("costCenterId") || "")
  const [startDate, setStartDate] = useState(sp.get("tanggalMulai") || "")
  const [endDate, setEndDate] = useState(sp.get("tanggalSelesai") || "")

  function apply() {
    const p = new URLSearchParams()
    if (ccId) p.set("costCenterId", ccId)
    if (startDate) p.set("tanggalMulai", startDate)
    if (endDate) p.set("tanggalSelesai", endDate)
    router.push(`?${p.toString()}`)
  }

  return (
    <div className="flex items-end gap-3 flex-wrap print:hidden">
      <AppDatePicker label="Dari" name="tanggalMulai" value={startDate} onChange={setStartDate} className="w-[180px]" />
      <AppDatePicker label="Sampai" name="tanggalSelesai" value={endDate} onChange={setEndDate} className="w-[180px]" />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Pusat Biaya</label>
        <Combobox
          options={costCenters.map((cc) => ({ value: String(cc.id), label: `${cc.code} — ${cc.name}` }))}
          value={ccId || null}
          onChange={(v) => setCcId(v || "")}
          placeholder="Pilih pusat biaya..."
        />
      </div>
      <Button variant="primary" onPress={apply}>Tampilkan</Button>
    </div>
  )
}
