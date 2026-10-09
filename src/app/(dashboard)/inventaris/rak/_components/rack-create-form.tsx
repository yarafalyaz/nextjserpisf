"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition, useEffect } from "react"
import { createRack, getNextRackCode } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface Warehouse {
  id: number
  name: string
}

interface RackCreateFormProps {
  enableAutoCode: boolean
  warehouses: Warehouse[]
}

export function RackCreateForm({ enableAutoCode, warehouses }: RackCreateFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState(searchParams.get("warehouseId") || "")
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses)
  const [autoCode, setAutoCode] = useState("")

  // Fetch next code when warehouse changes
  useEffect(() => {
    if (!enableAutoCode || !warehouseId) return
    getNextRackCode(Number(warehouseId)).then((res) => {
      setAutoCode(res.code)
    })
  }, [warehouseId, enableAutoCode])

  function handleWarehouseChange(key: string | null) {
    setAutoCode("")
    setWarehouseId(key ?? "")
  }

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
            value={enableAutoCode ? autoCode : undefined}
            onChange={() => {}}
            className={enableAutoCode ? "bg-muted font-mono" : undefined}
            placeholder={enableAutoCode ? "Pilih gudang dulu..." : "Masukkan kode manual"}
            required={!enableAutoCode}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Rak *</Label>
          <Input id="name" name="name" placeholder="Nama rak" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warehouseIdSelect">Gudang *</Label>
          <QuickAddSelect
            id="warehouseIdSelect"
            value={warehouseId || null}
            onChange={handleWarehouseChange}
            placeholder="Cari gudang..."
            options={warehouseOptions.map((w) => ({ value: String(w.id), label: w.name }))}
            title={QUICK_ADD.warehouse.title}
            fields={QUICK_ADD.warehouse.fields}
            action={QUICK_ADD.warehouse.action}
            onCreated={(created) => {
              setWarehouseOptions((prev) => [...prev, { id: created.id, name: created.label }])
              setAutoCode("")
              setWarehouseId(String(created.id))
            }}
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
