"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@heroui/react"

interface ReportDateFilterProps {
  defaultStartDate: string
  defaultEndDate: string
  /** Extra search params to preserve */
  extraParams?: Record<string, string>
}

export function ReportDateFilter({ defaultStartDate, defaultEndDate, extraParams }: ReportDateFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [startDate, setStartDate] = useState(searchParams.get("tanggalMulai") || defaultStartDate)
  const [endDate, setEndDate] = useState(searchParams.get("tanggalSelesai") || defaultEndDate)

  function handleGenerate() {
    const params = new URLSearchParams()
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => { if (v) params.set(k, v) })
    }
    // Preserve other existing params
    searchParams.forEach((v, k) => {
      if (!params.has(k) && k !== "startDate" && k !== "endDate") params.set(k, v)
    })
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-end gap-4 flex-wrap print:hidden">
      <AppDatePicker label="Dari" name="startDate" value={startDate} onChange={setStartDate} className="w-[180px]" />
      <AppDatePicker label="Sampai" name="endDate" value={endDate} onChange={setEndDate} className="w-[180px]" />
      <Button variant="primary" size="sm" onPress={handleGenerate}>Generate</Button>
    </div>
  )
}

interface ReportSingleDateFilterProps {
  defaultDate: string
  paramName?: string
}

export function ReportSingleDateFilter({ defaultDate, paramName = "date" }: ReportSingleDateFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [date, setDate] = useState(searchParams.get(paramName) || defaultDate)

  function handleGenerate() {
    const params = new URLSearchParams(searchParams.toString())
    if (date) params.set(paramName, date)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-end gap-4 flex-wrap print:hidden">
      <AppDatePicker label="Tanggal" name={paramName} value={date} onChange={setDate} className="w-[180px]" />
      <Button variant="primary" size="sm" onPress={handleGenerate}>Generate</Button>
    </div>
  )
}
