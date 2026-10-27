"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { generateAssetFiscalYearRows } from "@/actions/asset.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { showSuccess, showError } from "@/lib/utils/toast"

/**
 * Bekukan baris tahun saldo fiskal aset (F-2026-10-23-109-V).
 * UI hanya meneruskan isian apa adanya — hitung, clamp, dan alasan
 * belum-dihitung milik builder/server; error server tampil verbatim.
 * Saldo pembuka rekonstruksi aset lama wajib berpasangan dengan tahun
 * pembuka (server menolak pasangan tak lengkap).
 */
export function AssetFiscalYearFreezeForm({ assetId, defaultThroughYear }: { assetId: number; defaultThroughYear: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const res = await generateAssetFiscalYearRows(formData)
        if (res?.success) {
          showSuccess(`Tahun fiskal terbekukan: ${res.created} baris baru, ${res.existing} baris sudah ada`)
          setOpen(false)
          router.refresh()
        } else showError(res?.error || "Gagal membekukan tahun fiskal")
      } catch (err) { showError(err instanceof Error ? err.message : "Gagal membekukan tahun fiskal") }
    })
  }

  if (!open) return <Button type="button" variant="secondary" onPress={() => setOpen(true)}>Bekukan Tahun Fiskal</Button>

  return (
    <form onSubmit={onSubmit} aria-label="Formulir bekukan tahun fiskal" className="flex flex-col gap-3 rounded-lg border border-default bg-surface p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <p className="text-xs text-muted-foreground">
        Baris tahun yang sudah terbekukan dipakai apa adanya dan tidak ditulis ulang.
        Tanpa saldo pembuka, baris dibangun dari harga perolehan sejak tahun perolehan.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fiscal-throughYear">Bekukan Sampai Tahun *</Label>
          <Input id="fiscal-throughYear" name="throughYear" type="number" required defaultValue={defaultThroughYear} min={1900} max={2100} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fiscal-openingBalance">Saldo Pembuka (Rp)</Label>
          <Input id="fiscal-openingBalance" name="openingBalance" type="number" step="0.01" min={0} placeholder="Kosongkan bila tidak ada" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fiscal-openingYear">Tahun Pembuka</Label>
          <Input id="fiscal-openingYear" name="openingYear" type="number" min={1900} max={2100} placeholder="Wajib berpasangan saldo" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Membekukan..." : "Bekukan Tahun Fiskal"}</Button>
        <Button type="button" variant="secondary" isDisabled={isPending} onPress={() => setOpen(false)}>Batal</Button>
      </div>
    </form>
  )
}
