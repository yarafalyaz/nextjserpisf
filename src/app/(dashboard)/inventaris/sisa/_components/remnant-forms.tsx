"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { createRemnant, consumeRemnant, scrapRemnant } from "@/actions/inventory.actions"

/** Opsi tautan sumber remnant usable (kontrak backend F-2026-10-24-098-S). */
export const REMNANT_SOURCE_OPTIONS = [
  { value: "material_issue_item", label: "Baris Material Issue" },
  { value: "production_order_material", label: "Baris Material Perintah Produksi" },
] as const

/** Form catat sisa baru. Usable wajib dimensi + ukuran terukur + tautan baris issue asal (server menegakkan ambang kategori). */
export function RemnantForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await createRemnant(new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal mencatat sisa")
        return
      }
      showSuccess("Sisa dicatat")
      form.reset()
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label="Catat sisa material"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnItem">ID Item *</Label>
          <Input id="rmnItem" name="itemId" type="number" min={1} required />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnWh">ID Gudang *</Label>
          <Input id="rmnWh" name="warehouseId" type="number" min={1} required />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnQty">Qty *</Label>
          <Input id="rmnQty" name="qty" type="number" step="any" min={0.01} required />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnDim">Dimensi *</Label>
          <Input id="rmnDim" name="dimensions" placeholder="2000×150×3" maxLength={255} required aria-required="true" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnMeasured">Ukuran Terukur *</Label>
          <Input id="rmnMeasured" name="measuredSize" type="number" step="any" min={0.01} required aria-required="true" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnCost">Biaya/satuan</Label>
          <Input id="rmnCost" name="unitCost" type="number" step="any" min={0} />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnSourceType">Sumber Baris Issue *</Label>
          <FormSelect
            id="rmnSourceType"
            name="sourceType"
            required
            aria-label="Sumber baris issue"
            placeholder="-- Pilih sumber baris issue --"
            options={[...REMNANT_SOURCE_OPTIONS]}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rmnSourceId">ID Baris Issue Asal *</Label>
          <Input id="rmnSourceId" name="sourceId" type="number" min={1} required aria-required="true" />
        </div>
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Catat"}
        </Button>
      </div>
      <p role="note" className="text-xs text-muted-foreground">
        Sisa usable wajib dimensi, ukuran terukur, dan tautan baris issue asal; kategori item harus
        sudah punya ambang minimum usable dari kepala bengkel — server menolak bila belum ditetapkan.
      </p>
    </form>
  )
}

/** Pakai remnant untuk kebutuhan berikut. */
export function ConsumeRemnantForm({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await consumeRemnant(id, new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal memakai sisa")
        return
      }
      showSuccess("Sisa dipakai")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2" aria-label={`Pakai sisa ${id}`}>
      <Input name="consumedBy" placeholder="Dipakai untuk…" required maxLength={128} className="w-36" aria-label="Tujuan pemakaian" />
      <Button type="submit" isDisabled={isPending} variant="secondary" size="sm">
        Pakai
      </Button>
    </form>
  )
}

/** Tandai scrap (wajib alasan + berat besi tua kg). */
export function ScrapRemnantForm({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await scrapRemnant(id, new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal scrap")
        return
      }
      showSuccess("Sisa di-scrap")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2" aria-label={`Scrap sisa ${id}`}>
      <Input name="scrapReason" placeholder="Alasan scrap…" required maxLength={500} className="w-36" aria-label="Alasan scrap" />
      <Input
        name="scrapWeightKg"
        type="number"
        step="any"
        min={0.01}
        required
        aria-required="true"
        placeholder="Kg besi tua…"
        className="w-28"
        aria-label="Berat besi tua (kg)"
      />
      <Button type="submit" isDisabled={isPending} variant="danger-soft" size="sm">
        Scrap
      </Button>
    </form>
  )
}
