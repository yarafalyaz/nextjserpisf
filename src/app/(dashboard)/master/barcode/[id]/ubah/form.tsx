"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateBarcode } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/page-header"

export function BarcodeEditForm({ id, barcode, itemId, type }: { id: number; barcode: string; itemId: number; type: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateBarcode(id, formData)
      if (res && !res.success) { showError(res.error || "Gagal menyimpan data"); return }
      showSuccess("Data berhasil diperbarui")
      router.push("/master/barcode")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="barcode">Barcode *</Label>
          <Input id="barcode" name="barcode" placeholder="Kode barcode" required defaultValue={barcode} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">ID Barang *</Label>
          <Input id="itemId" name="itemId" type="number" placeholder="ID barang" required defaultValue={itemId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipe</Label>
          <FormSelect
            id="type"
            name="type"
            defaultValue={type}
            options={[
              { value: "EAN13", label: "EAN13" },
              { value: "EAN8", label: "EAN8" },
              { value: "UPC", label: "UPC" },
              { value: "CODE128", label: "CODE128" },
              { value: "CODE39", label: "CODE39" },
              { value: "QR", label: "QR" },
            ]}
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : "Perbarui"}</Button>
      </div>
    </form>
  )
}
