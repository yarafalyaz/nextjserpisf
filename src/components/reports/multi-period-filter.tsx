"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { buildReportHref } from "@/lib/reports/report-href"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"

interface MultiPeriodFilterProps {
  /** Basis rute, mis. "/laporan/multi-periode". */
  basePath: string
  /** Slug periode yang sedang dibuka (tanggal jangkar). */
  periodSlug: string
  statement: "laba-rugi" | "neraca"
  mode: "bulan" | "kuartal" | "tahun"
  count: number
}

export function MultiPeriodFilter({ basePath, periodSlug, statement, mode, count }: MultiPeriodFilterProps) {
  const router = useRouter()
  const [jenis, setJenis] = useState(statement)
  const [periode, setPeriode] = useState(mode)
  const [jumlah, setJumlah] = useState(String(count))

  function handleGenerate() {
    // Opsi laporan ikut masuk path, bukan query string.
    router.push(buildReportHref(basePath, periodSlug, { jenis, mode: periode, jumlah }))
  }

  return (
    <div role="search" aria-label="Filter multi periode" className="flex items-end gap-4 flex-wrap print:hidden">
      <div className="flex flex-col gap-1.5 w-full sm:w-[180px]">
        <span className="text-sm font-medium text-foreground">Jenis Laporan</span>
        <Select value={jenis} onValueChange={(value) => setJenis(value as "laba-rugi" | "neraca")}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Jenis laporan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="laba-rugi">Laba Rugi</SelectItem>
            <SelectItem value="neraca">Neraca</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 w-full sm:w-[160px]">
        <span className="text-sm font-medium text-foreground">Interval</span>
        <Select value={periode} onValueChange={(value) => setPeriode(value as "bulan" | "kuartal" | "tahun")}>
          <SelectTrigger className="w-full sm:w-[160px]" aria-label="Interval periode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bulan">Bulanan</SelectItem>
            <SelectItem value="kuartal">Kuartalan</SelectItem>
            <SelectItem value="tahun">Tahunan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 w-full sm:w-[150px]">
        <span className="text-sm font-medium text-foreground">Jumlah Periode</span>
        <Select value={jumlah} onValueChange={setJumlah}>
          <SelectTrigger className="w-full sm:w-[150px]" aria-label="Jumlah periode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 periode</SelectItem>
            <SelectItem value="6">6 periode</SelectItem>
            <SelectItem value="12">12 periode</SelectItem>
            <SelectItem value="24">24 periode</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button variant="primary" size="sm" onPress={handleGenerate}>Tampilkan</Button>
    </div>
  )
}
