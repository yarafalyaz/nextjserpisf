"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { upsertAssetUsageRecord } from "@/actions/asset.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { showSuccess, showError } from "@/lib/utils/toast"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

/** Form dokumen unit aktual UOP — nilai diteruskan apa adanya, server yang validasi. */
export function AssetUsageRecordForm({ assetId, defaultYear, defaultMonth }: { assetId: number; defaultYear: number; defaultMonth: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const res = await upsertAssetUsageRecord(formData)
        if (res?.success) { showSuccess("Dokumen unit aktual tersimpan"); setOpen(false); router.refresh() }
        else showError(res?.error || "Gagal menyimpan dokumen unit aktual")
      } catch (err) { showError(err instanceof Error ? err.message : "Gagal menyimpan dokumen unit aktual") }
    })
  }

  if (!open) return <Button type="button" variant="secondary" onPress={() => setOpen(true)}>Catat Unit Aktual</Button>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-default bg-surface p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usage-periodYear">Tahun Masa</Label>
          <Input id="usage-periodYear" name="periodYear" type="number" required defaultValue={defaultYear} min={2000} max={2100} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usage-periodMonth">Bulan Masa</Label>
          <select id="usage-periodMonth" name="periodMonth" defaultValue={defaultMonth} className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usage-actualUnits">Unit Aktual *</Label>
          <Input id="usage-actualUnits" name="actualUnits" type="number" step="any" min={0} required placeholder="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usage-sourceRef">Referensi Dokumen</Label>
          <Input id="usage-sourceRef" name="sourceRef" placeholder="Nomor dokumen" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="usage-sourceName">Nama Dokumen Sumber *</Label>
        <Input id="usage-sourceName" name="sourceName" required placeholder="cth. Laporan Produksi" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : "Simpan Unit Aktual"}</Button>
        <Button type="button" variant="secondary" isDisabled={isPending} onPress={() => setOpen(false)}>Batal</Button>
      </div>
    </form>
  )
}
