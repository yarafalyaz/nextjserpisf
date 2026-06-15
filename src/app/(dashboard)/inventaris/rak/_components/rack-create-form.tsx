"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createRack } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface Warehouse {
  id: number
  name: string
}

interface RackCreateFormProps {
  enableAutoCode: boolean
  warehouses: Warehouse[]
  generatedCode?: string
}

export function RackCreateForm({ enableAutoCode, warehouses, generatedCode }: RackCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("warehouseId", warehouseId)
    startTransition(async () => {
      try {
        const result = await createRack(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess("Data berhasil ditambahkan")
        router.push("/inventaris/rak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Rak {enableAutoCode ? "" : "*"}</Label>
          <Input
            id="code"
            name="code"
            readOnly={enableAutoCode}
            defaultValue={enableAutoCode ? generatedCode : undefined}
            className={enableAutoCode ? "bg-muted font-mono" : undefined}
            placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"}
            required={!enableAutoCode}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Rak *</Label>
          <Input id="name" name="name" placeholder="Nama rak" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warehouseIdSelect">Gudang *</Label>
          <Combobox
            id="warehouseIdSelect"
            value={warehouseId || null}
            onChange={(key) => setWarehouseId(key ?? "")}
            placeholder="Cari gudang..."
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-rack">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
