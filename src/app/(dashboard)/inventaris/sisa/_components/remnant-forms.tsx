"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"
import { createRemnant, consumeRemnant, scrapRemnant } from "@/actions/inventory.actions"

/** Form catat sisa baru. */
export function RemnantForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      className="flex flex-col gap-3 p-4 px-5 border-b border-default sm:flex-row sm:items-end"
      aria-label="Catat sisa material"
    >
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
        <Label htmlFor="rmnDim">Dimensi</Label>
        <Input id="rmnDim" name="dimensions" placeholder="2000×150×3" maxLength={255} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="rmnCost">Biaya/satuan</Label>
        <Input id="rmnCost" name="unitCost" type="number" step="any" min={0} />
      </div>
      <Button type="submit" isDisabled={isPending}>
        {isPending ? "Menyimpan..." : "Catat"}
      </Button>
    </form>
  )
}

/** Pakai remnant untuk kebutuhan berikut. */
export function ConsumeRemnantForm({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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

/** Tandai scrap (wajib alasan). */
export function ScrapRemnantForm({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      <Button type="submit" isDisabled={isPending} variant="danger-soft" size="sm">
        Scrap
      </Button>
    </form>
  )
}
