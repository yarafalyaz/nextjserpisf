"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { formatDate, formatPercentage } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export interface CommissionRateRow {
  id: number
  commissionPercent: number
  /** ISO date string (server). */
  effectiveFrom: string
  /** ISO date string (server); null = masih berlaku. */
  effectiveTo: string | null
}

interface CustomerCommissionRatesProps {
  customerCategoryId: number
  rates: CommissionRateRow[]
  canCreate: boolean
  canEdit: boolean
}

/**
 * F-2026-10-25-036-S (UI): histori tarif komisi per kategori pelanggan.
 *
 * Lapisan informatif murni: persen + masa berlaku tampil verbatim dari
 * loader server (`getCustomerCommissionRates`). Simpan selalu MENAMBAH
 * baris histori lewat `createCustomerCommissionRate` — baris lama tidak
 * ditimpa dari UI. Tutup masa memakai `updateCustomerCommissionRate`
 * dengan persen/tanggal mulai baris itu sendiri (server menolak ubah
 * persen/mulai pada baris yang sudah jadi sumber snapshot faktur);
 * semua pesan error server ditempel apa adanya. UI tidak menghitung
 * tarif/komisi/DPP apa pun.
 */
export function CustomerCommissionRates({
  customerCategoryId,
  rates,
  canCreate,
  canEdit,
}: Readonly<CustomerCommissionRatesProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingDelete, setPendingDelete] = useState<CommissionRateRow | null>(null)
  const [closeUntil, setCloseUntil] = useState<Record<number, string>>({})

  function run(action: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action()
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan tarif komisi")
          return
        }
        showSuccess(successMessage)
        setPendingDelete(null)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan tarif komisi")
      }
    })
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("customerCategoryId", String(customerCategoryId))
    run(
      async () => (await import("@/actions/master.actions")).createCustomerCommissionRate(formData),
      "Baris tarif komisi ditambahkan ke histori",
    )
  }

  function onClosePeriod(rate: CommissionRateRow) {
    const until = closeUntil[rate.id]
    if (!until) {
      showError("Tanggal berakhir masa tarif wajib diisi untuk menutup masa")
      return
    }
    const formData = new FormData()
    formData.set("customerCategoryId", String(customerCategoryId))
    formData.set("commissionPercent", String(rate.commissionPercent))
    formData.set("effectiveFrom", toLocalDateOnly(new Date(rate.effectiveFrom)))
    formData.set("effectiveTo", until)
    run(
      async () => (await import("@/actions/master.actions")).updateCustomerCommissionRate(rate.id, formData),
      "Masa tarif komisi ditutup",
    )
  }

  function onDelete() {
    if (!pendingDelete) return
    const id = pendingDelete.id
    run(
      async () => (await import("@/actions/master.actions")).deleteCustomerCommissionRate(id),
      "Baris tarif komisi dihapus",
    )
  }

  return (
    <section aria-label="Histori tarif komisi kategori pelanggan" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Tarif Komisi per Kategori Pelanggan</h2>
        <p className="text-sm text-muted-foreground">
          Histori bertanggal tampil apa adanya dari server. Menambah tarif membuat baris histori baru —
          baris lama tidak ditimpa. Tarif yang sudah menjadi sumber snapshot faktur tidak dapat diubah
          atau dihapus (server menolak); masa berlakunya masih dapat ditutup.
        </p>
      </div>

      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada tarif komisi tercatat untuk kategori ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Daftar histori tarif komisi">
            <thead>
              <tr className="border-b border-default text-left">
                <th scope="col" className="py-2 pr-4 font-medium">Tarif Komisi (%)</th>
                <th scope="col" className="py-2 pr-4 font-medium">Berlaku Mulai</th>
                <th scope="col" className="py-2 pr-4 font-medium">Berlaku Sampai</th>
                {canEdit ? <th scope="col" className="py-2 font-medium">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={rate.id} className="border-b border-default">
                  <td className="py-2 pr-4">{formatPercentage(rate.commissionPercent, 2)}</td>
                  <td className="py-2 pr-4">{formatDate(rate.effectiveFrom)}</td>
                  <td className="py-2 pr-4">
                    {rate.effectiveTo ? formatDate(rate.effectiveTo) : "Masih berlaku"}
                  </td>
                  {canEdit ? (
                    <td className="py-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`commission-close-${rate.id}`}>Tutup masa sampai</Label>
                          <Input
                            id={`commission-close-${rate.id}`}
                            type="date"
                            value={closeUntil[rate.id] ?? ""}
                            onChange={(e) =>
                              setCloseUntil((prev) => ({ ...prev, [rate.id]: e.target.value }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={isPending}
                          onClick={() => onClosePeriod(rate)}
                        >
                          Tutup Masa
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="min-h-11"
                          disabled={isPending}
                          aria-label={`Hapus tarif komisi berlaku mulai ${formatDate(rate.effectiveFrom)}`}
                          onClick={() => setPendingDelete(rate)}
                        >
                          Hapus
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreate ? (
        <form
          onSubmit={onAdd}
          aria-busy={isPending}
          aria-label="Formulir tambah tarif komisi kategori pelanggan"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commissionPercent">
              Tarif Komisi (%) <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="commissionPercent"
              name="commissionPercent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="effectiveFrom">
              Berlaku Mulai <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input id="effectiveFrom" name="effectiveFrom" type="date" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="effectiveTo">Berlaku Sampai (opsional)</Label>
            <Input id="effectiveTo" name="effectiveTo" type="date" />
          </div>
          <Button type="submit" className="min-h-11" disabled={isPending}>
            {isPending ? "Menyimpan..." : "Tambah Baris Histori"}
          </Button>
        </form>
      ) : null}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Hapus baris tarif komisi ini?"
        body={
          pendingDelete
            ? `Tarif ${formatPercentage(pendingDelete.commissionPercent, 2)} berlaku mulai ${formatDate(pendingDelete.effectiveFrom)} akan dihapus dari histori. Server menolak bila baris ini sudah menjadi sumber snapshot faktur.`
            : undefined
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={onDelete}
      />
    </section>
  )
}
