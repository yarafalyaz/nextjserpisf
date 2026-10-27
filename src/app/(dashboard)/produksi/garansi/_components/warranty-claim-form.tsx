"use client"

import { useState } from "react"

import { createWarrantyClaimAction } from "@/actions/warranty.actions"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { useWarrantySubmit } from "./warranty-submit"

export interface WarrantyCoverageOption {
  value: string
  label: string
}

/**
 * Form intake klaim garansi (F-2026-10-21-021 tahap UI).
 *
 * Memanggil `createWarrantyClaimAction` existing apa adanya; galat service
 * tampil verbatim. UI TIDAK menilai eligibility dan TIDAK memutuskan apa
 * pun — klaim selalu lahir status `intake` di service, lalu pejabat yang
 * memutuskan manual. `termsSnapshot` tidak disunting dari form ini.
 */
export function WarrantyClaimForm({
  coverages,
  defaultCoverageId,
}: {
  coverages: WarrantyCoverageOption[]
  defaultCoverageId?: string
}) {
  const { isPending, idempotencyKeyRef, run } = useWarrantySubmit(
    "Klaim garansi dibuat",
    "Gagal membuat klaim garansi",
  )
  const [coverageId, setCoverageId] = useState(defaultCoverageId ?? "")
  const [reportedDate, setReportedDate] = useState(toLocalDateOnly(new Date()))

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    formData.set("coverageId", coverageId)
    formData.set("reportedAt", reportedDate)
    run(createWarrantyClaimAction, formData, "/produksi/garansi")
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir klaim garansi baru"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="coverageId">Cakupan Garansi</Label>
          <FormSelect
            id="coverageId"
            aria-label="Cakupan garansi"
            value={coverageId}
            onValueChange={setCoverageId}
            options={coverages}
            placeholder="Pilih cakupan garansi kendaraan"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reportedAt">Tanggal Lapor</Label>
          <AppDatePicker
            name="reportedAt"
            value={reportedDate}
            onChange={setReportedDate}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="odometerKm">Odometer Saat Lapor (km, opsional)</Label>
          <Input
            id="odometerKm"
            name="odometerKm"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Contoh: 45200"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="complaint">Keluhan</Label>
          <Textarea
            id="complaint"
            name="complaint"
            rows={4}
            required
            placeholder="Jelaskan keluhan pelanggan apa adanya"
          />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Buat Klaim"}
        </Button>
      </div>
    </form>
  )
}
