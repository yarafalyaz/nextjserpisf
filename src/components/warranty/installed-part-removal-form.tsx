"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { recordInstalledPartRemovalAction } from "@/actions/warranty.actions"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { showError, showSuccess } from "@/lib/utils/toast"

/**
 * Form catat-lepas part terpasang (F-2026-10-22-072-S).
 *
 * Form singkat per baris registri: qty dilepas + alasan wajib + part
 * pengganti opsional (baris lain kendaraan sama). Semua validasi bisnis
 * (qty melebihi sisa, pengganti kendaraan lain) diputus server lewat
 * `recordInstalledPartRemovalAction`; error server tampil verbatim.
 * Tidak ada jalur edit/hapus baris registri (AC-IP-8).
 */
export function InstalledPartRemovalForm({
  installedPartId,
  qtyRemaining,
  replacementOptions,
  onDone,
}: {
  installedPartId: number
  qtyRemaining: number
  replacementOptions: { id: number; itemName: string; serialNumber: string | null }[]
  onDone: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [replacementId, setReplacementId] = useState<string | null>(null)

  const qtyId = `qty-removed-${installedPartId}`
  const reasonId = `removal-reason-${installedPartId}`
  const replacementFieldId = `replacement-${installedPartId}`

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await recordInstalledPartRemovalAction(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal mencatat lepas part terpasang")
          return
        }
        showSuccess("Lepas part terpasang berhasil dicatat")
        onDone()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mencatat lepas part terpasang")
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label="Formulir catat lepas part terpasang"
      className="mt-4 flex flex-col gap-4 rounded-lg border border-default bg-surface-secondary p-4"
    >
      <input type="hidden" name="installedPartId" value={installedPartId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={qtyId}>
          Jumlah Dilepas <span className="text-destructive" aria-hidden="true">*</span>
        </Label>
        <input
          id={qtyId}
          name="qtyRemoved"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          max={qtyRemaining}
          defaultValue={qtyRemaining}
          required
          disabled={isPending}
          className="min-h-11 w-full rounded-lg border border-default bg-surface px-3 py-2.5 text-sm text-foreground"
        />
        <p className="text-xs text-muted-foreground">Sisa terpasang: {qtyRemaining}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId}>
          Alasan Lepas <span className="text-destructive" aria-hidden="true">*</span>
        </Label>
        <textarea
          id={reasonId}
          name="removalReason"
          rows={3}
          required
          disabled={isPending}
          placeholder="Contoh: diganti part baru, rusak, ditarik dari kendaraan"
          className="w-full rounded-lg border border-default bg-surface px-3 py-2.5 text-sm text-foreground"
        />
      </div>
      {replacementOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={replacementFieldId}>Part Pengganti (opsional)</Label>
          <FormSelect
            id={replacementFieldId}
            name="replacedByInstalledPartId"
            value={replacementId}
            onValueChange={(v) => setReplacementId(v || null)}
            placeholder="-- Tanpa pengganti --"
            disabled={isPending}
            options={replacementOptions.map((o) => ({
              value: String(o.id),
              label: o.serialNumber?.trim()
                ? `${o.itemName} · ${o.serialNumber}`
                : o.itemName,
            }))}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menyimpan…" : "Simpan Catatan Lepas"}
        </Button>
        <Button type="button" variant="outline" isDisabled={isPending} onClick={onDone}>
          Batal
        </Button>
      </div>
    </form>
  )
}
