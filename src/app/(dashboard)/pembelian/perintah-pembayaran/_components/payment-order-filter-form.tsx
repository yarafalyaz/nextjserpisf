"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"

/**
 * Filter perintah pembayaran: pemasok dan batas jatuh tempo sama-sama
 * hidup di PATH (`/pemasok/<slug>`, `/sampai/2026-09-30`, pola kunci/nilai
 * yang sama dengan filter absensi).
 */
export function PaymentOrderFilterForm({
  vendors,
  vendorSegment,
  sampaiTanggal,
}: {
  vendors: { value: string; label: string }[]
  vendorSegment?: string
  sampaiTanggal: string
}) {
  const router = useRouter()
  const [vendorValue, setVendorValue] = useState(vendorSegment ?? "")
  const [dateValue, setDateValue] = useState(sampaiTanggal)

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const path = [
      "/pembelian/perintah-pembayaran",
      ...(dateValue ? [`sampai/${dateValue}`] : []),
      ...(vendorValue ? [`pemasok/${vendorValue}`] : []),
    ].join("/")
    router.push(path)
  }

  return (
    <form onSubmit={onSubmit} className="mb-2 flex items-end gap-4 flex-wrap print:hidden" aria-label="Filter perintah pembayaran">
      <div className="flex flex-col gap-1.5 w-full sm:w-[260px]">
        <Label htmlFor="vendorId">Pemasok</Label>
        <FormSelect
          id="vendorId"
          name="vendorId"
          value={vendorValue}
          onValueChange={setVendorValue}
          placeholder="Semua Pemasok"
          options={vendors}
        />
      </div>
      <AppDatePicker
        label="Jatuh Tempo s/d"
        name="sampaiTanggal"
        value={dateValue}
        onChange={setDateValue}
        className="w-full sm:w-[200px]"
      />
      <Button type="submit" variant="primary" size="sm">
        Tampilkan
      </Button>
    </form>
  )
}
