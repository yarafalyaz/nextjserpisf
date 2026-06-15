"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { updateRack } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

interface Props {
  id: number
  code: string
  name: string
  warehouseId: number
  warehouses: { id: number; name: string }[]
}

export function RackEditForm({ id, code, name, warehouseId, warehouses }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [whId, setWhId] = useState(String(warehouseId))

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("warehouseId", whId)
    startTransition(async () => {
      const res = await updateRack(id, formData)
      if (res && !res.success) { showError(res.error || "Gagal menyimpan data"); return }
      showSuccess("Data berhasil diperbarui")
      router.push("/inventaris/rak")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <input type="hidden" name="warehouseId" value={whId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Rak *</Label>
          <Input id="code" name="code" required defaultValue={code} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Rak *</Label>
          <Input id="name" name="name" required defaultValue={name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warehouseIdSelect">Gudang *</Label>
          <Combobox
            id="warehouseIdSelect"
            value={whId || null}
            onChange={(key) => setWhId(key ?? "")}
            placeholder="Cari gudang..."
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
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
